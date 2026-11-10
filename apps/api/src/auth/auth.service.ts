import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { initials, type ClientKind, type LoginChallenge, type LoginRequest, type LoginResponse, type Permission, type SessionUser, type TokenPair } from '@gradeon/contracts';
import { hashPassword, maskEmail, maskPhone, passwordNeedsRehash, randomCode, randomToken, sha256, signJwt, verifyPassword, constantTimeEqual } from '@gradeon/security';
import { ENV, type Env } from '../env.js';
import { ApiError } from '@gradeon/nest-kit';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuditService, Messenger, SettingsService } from '../school/support.js';
import type { TenantCtx } from '../tenancy/tenant.js';
import { checkCookieCsrf, clearSchoolRefreshCookie, schoolCookieToken, setSchoolRefreshCookie } from './session-cookies.js';

const ACCESS_SECONDS = 15 * 60;
const MAX_PASSWORD_TRIES = 5;
const LOCK_MINUTES = 15;
const OTP_TRIES = 3;
const OTP_MINUTES = 10;
// Each code has OTP_TRIES guesses, so the number of codes is what bounds guessing (and the SMS bill).
const OTP_SENDS = 5;
const OTP_WINDOW_MINUTES = 15;
export const DEMO_CODE = '424242';


interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  status: string;
  failed_logins: number;
  locked_until: Date | null;
  token_version: number;
}

let dummyHash: Promise<string> | undefined;

function clientOf(value: ClientKind | undefined): ClientKind {
  return value === 'web' ? 'web' : 'mobile';
}

interface Life { maxDays: number; idleDays: number }

function sessionExpiry(created: Date, life: Life): Date {
  return new Date(Math.min(Date.now() + life.idleDays * 86_400_000, created.getTime() + life.maxDays * 86_400_000));
}

@Injectable()
export class AuthService {
  private readonly live = new Map<string, { at: number; ok: boolean }>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly settings: SettingsService,
    private readonly messenger: Messenger,
    private readonly audit: AuditService,
  ) {}

  private get production(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** How long a sign-in lasts: set per school from the console (Security). A phone stays signed in while used. */
  private async life(t: TenantCtx, client: ClientKind): Promise<Life> {
    const v = (await this.settings.doc(t)).values;
    if (client === 'web') { const d = Number(v['security.webSessionDays'] ?? 7); return { maxDays: d, idleDays: d }; }
    const d = Number(v['security.appSessionDays'] ?? 30);
    return { maxDays: d, idleDays: Math.min(14, d) };
  }

  /** Step one: check the password. Returns a code challenge, or tokens when the school has two-step sign-in off. */
  async login(t: TenantCtx, body: LoginRequest, userAgent?: string, reply?: FastifyReply): Promise<LoginResponse> {
    const user = await this.findUser(t, body.identifier);
    if (user?.locked_until && user.locked_until > new Date()) {
      const retryAfter = Math.ceil((user.locked_until.getTime() - Date.now()) / 1000);
      throw new ApiError('locked', `Too many wrong attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes, or reset your password by SMS.`, { retryAfter });
    }
    if (user && !user.password_hash) throw new ApiError('validation', 'This account has no password. Sign in with a code sent to your phone instead.', { fields: { password: 'Sign in with a code instead.' } });
    dummyHash ??= hashPassword('not-a-real-password');
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await dummyHash));
    if (!user || !ok || user.status !== 'active') {
      if (user) {
        const failed = user.failed_logins + 1;
        const lock = failed >= MAX_PASSWORD_TRIES;
        await t.pool.query('update users set failed_logins = $2, locked_until = $3 where id = $1', [user.id, lock ? 0 : failed, lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null]);
        if (lock) throw new ApiError('locked', `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes, or reset your password by SMS.`, { retryAfter: LOCK_MINUTES * 60 });
        throw new ApiError('unauthenticated', 'That password isn’t right. Check it, or reset it by SMS.', { attemptsLeft: MAX_PASSWORD_TRIES - failed, fields: { password: 'That password isn’t right.' } });
      }
      throw new ApiError('unauthenticated', 'We couldn’t find an account with those details.', { fields: { identifier: 'We couldn’t find an account with those details.' } });
    }
    await t.pool.query('update users set failed_logins = 0, locked_until = null where id = $1', [user.id]);
    if (clientOf(body.client) === 'mobile' && user.kind === 'staff' && (await this.settings.doc(t)).values['app.teachers'] === false) {
      throw new ApiError('forbidden', 'Your school uses Gradeon on the web for staff. Sign in to the admin instead.');
    }
    if (passwordNeedsRehash(user.password_hash)) {
      await t.pool.query('update users set password_hash = $2 where id = $1', [user.id, await hashPassword(body.password)]);
    }

    const doc = await this.settings.doc(t);
    if (doc.values['security.twoFactor'] === false) {
      return { step: 'done', tokens: await this.issue(t, user.id, userAgent, clientOf(body.client), reply) };
    }
    return { step: 'otp', challenge: await this.sendCode(t, user, 'sign_in') };
  }

  /** Families sign in with a code to their phone (or email). Staff are sent back to their password. */
  async requestCode(t: TenantCtx, identifier: string): Promise<LoginChallenge> {
    const user = await this.findUser(t, identifier);
    if (!user || user.status !== 'active') throw new ApiError('unauthenticated', 'We couldn’t find an account with those details.', { fields: { identifier: 'We couldn’t find an account with those details.' } });
    if (user.kind === 'staff') throw new ApiError('validation', 'Staff sign in with their password, then a code.', { fields: { identifier: 'Staff sign in with their password.' } });
    return this.sendCode(t, user, 'sign_in');
  }

  /** "Forgot it?": a code to the person's phone or email lets them choose a new password. */
  async resetStart(t: TenantCtx, identifier: string): Promise<LoginChallenge> {
    const user = await this.findUser(t, identifier);
    if (!user || user.status !== 'active') throw new ApiError('unauthenticated', 'We couldn’t find an account with those details.', { fields: { identifier: 'We couldn’t find an account with those details.' } });
    return this.sendCode(t, user, 'reset');
  }

  async resetFinish(t: TenantCtx, challengeId: string, code: string, password: string): Promise<void> {
    const min = Number((await this.settings.doc(t)).values['security.passwordMinLength'] ?? 8);
    if (password.length < min) throw new ApiError('validation', `Use at least ${min} characters.`, { fields: { password: `At least ${min} characters.` } });
    const userId = await this.useCode(t, challengeId, code, 'reset');
    await t.pool.query('update users set password_hash = $2, failed_logins = 0, locked_until = null where id = $1', [userId, await hashPassword(password)]);
    // A new password ends every session, on every device.
    await t.pool.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
    await this.bumpVersion(t, userId);
    await this.audit.record(t, { actorId: userId, actorName: 'self', action: 'auth.password_reset', entity: 'user', entityId: userId });
  }

  async verify(t: TenantCtx, challengeId: string, code: string, userAgent?: string, client?: ClientKind, reply?: FastifyReply): Promise<TokenPair> {
    return this.issue(t, await this.useCode(t, challengeId, code, 'sign_in'), userAgent, clientOf(client), reply);
  }

  private async findUser(t: TenantCtx, identifier: string): Promise<(UserRow & { kind: string }) | undefined> {
    const ident = identifier.trim();
    const byEmail = ident.includes('@');
    const digits = ident.replace(/\D/g, '');
    if (!byEmail && digits.length < 8) return undefined;
    const { rows } = await t.pool.query<UserRow & { kind: string }>(
      byEmail
        ? 'select id, name, email, phone, password_hash, status, failed_logins, locked_until, token_version, kind from users where lower(email) = $1 limit 1'
        : "select id, name, email, phone, password_hash, status, failed_logins, locked_until, token_version, kind from users where right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = right($1, 10) limit 1",
      [byEmail ? ident.toLowerCase() : digits],
    );
    return rows[0];
  }

  private async sendCode(t: TenantCtx, user: { id: string; phone: string | null; email: string | null }, purpose: 'sign_in' | 'reset'): Promise<LoginChallenge> {
    const demo = (await this.settings.doc(t)).values['demo.mode'] === true;
    if (!demo) {
      const { rows: [r] } = await t.pool.query<{ n: string; first: Date | null }>(
        `select count(*) n, min(created_at) first from otp_challenges where user_id = $1 and created_at > now() - interval '${OTP_WINDOW_MINUTES} minutes'`, [user.id]);
      if (Number(r!.n) >= OTP_SENDS) {
        const retryAfter = Math.max(60, Math.ceil((r!.first!.getTime() + OTP_WINDOW_MINUTES * 60_000 - Date.now()) / 1000));
        throw new ApiError('rate_limited', `Too many codes sent. Try again in ${Math.ceil(retryAfter / 60)} minutes.`, { retryAfter });
      }
    }
    const code = demo ? DEMO_CODE : randomCode(6);
    const id = newId('otp');
    const channel: 'sms' | 'email' = user.phone ? 'sms' : 'email';
    await t.pool.query('insert into otp_challenges (id, user_id, code_hash, channel, purpose, expires_at) values ($1,$2,$3,$4,$5,$6)', [id, user.id, sha256(`${id}:${code}`), channel, purpose, new Date(Date.now() + OTP_MINUTES * 60_000)]);
    const what = purpose === 'reset' ? 'code to set a new password' : 'sign-in code';
    try {
      // Sent now (never queued or held): the person is waiting on the sign-in screen.
      await this.messenger.send(t, {
        channel, to: (channel === 'sms' ? user.phone : user.email) ?? '', subject: channel === 'email' ? `Your Gradeon ${what}` : undefined,
        body: `Your Gradeon ${what} for ${t.info.shortName} is ${code}. It expires in ${OTP_MINUTES} minutes.`,
        key: purpose === 'reset' ? 'auth.reset' : 'auth.code', vars: { code, school: t.info.shortName, minutes: String(OTP_MINUTES) }, now: true,
      });
    } catch {
      throw new ApiError('school_unavailable', 'We could not send the code just now. Try again in a minute.');
    }
    return {
      challengeId: id, channel, maskedTo: channel === 'sms' ? maskPhone(user.phone!) : maskEmail(user.email!),
      expiresInSeconds: OTP_MINUTES * 60, ...(demo ? { demoCode: DEMO_CODE } : {}),
    };
  }

  /** Checks a code for one purpose and spends it. Returns the user it belongs to. */
  private async useCode(t: TenantCtx, challengeId: string, code: string, purpose: 'sign_in' | 'reset'): Promise<string> {
    const { rows } = await t.pool.query<{ id: string; user_id: string; code_hash: string; attempts: number; expires_at: Date; used_at: Date | null; purpose: string }>(
      'select id, user_id, code_hash, attempts, expires_at, used_at, purpose from otp_challenges where id = $1', [challengeId]);
    const row = rows[0];
    if (!row || row.purpose !== purpose || row.used_at || row.expires_at < new Date()) throw new ApiError('unauthenticated', 'That code has expired. Go back and ask for a new one.', { fields: { code: 'That code has expired.' } });
    if (row.attempts >= OTP_TRIES) throw new ApiError('locked', 'Too many wrong codes. Go back and ask for a new one.');
    if (!constantTimeEqual(sha256(`${challengeId}:${code}`), row.code_hash)) {
      await t.pool.query('update otp_challenges set attempts = attempts + 1 where id = $1', [challengeId]);
      throw new ApiError('unauthenticated', 'That code isn’t right.', { attemptsLeft: OTP_TRIES - row.attempts - 1, fields: { code: 'That code isn’t right.' } });
    }
    await t.pool.query('update otp_challenges set used_at = now() where id = $1', [challengeId]);
    return row.user_id;
  }

  async refresh(t: TenantCtx, refreshToken: string | undefined, req: FastifyRequest, reply?: FastifyReply): Promise<TokenPair> {
    const cookie = schoolCookieToken(req, t.info.slug, this.production);
    const raw = refreshToken || cookie;
    if (cookie && !refreshToken) checkCookieCsrf(req, this.env.CORS_ORIGINS);
    if (!raw) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    const [sid, secret] = raw.split('.');
    const { rows } = await t.pool.query<{ id: string; user_id: string; refresh_hash: string; expires_at: Date; revoked_at: Date | null; created_at: Date; client: string }>(
      'select id, user_id, refresh_hash, expires_at, revoked_at, created_at, client from sessions where id = $1', [sid ?? '']);
    const s = rows[0];
    if (!s || !secret || s.revoked_at || s.expires_at < new Date()) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    const kind = (s.client === 'mobile' ? 'mobile' : 'web') as ClientKind;
    const life = await this.life(t, kind);
    const maxEnd = s.created_at.getTime() + life.maxDays * 86_400_000;
    if (Date.now() > maxEnd) {
      await t.pool.query('update sessions set revoked_at = now() where id = $1', [s.id]);
      throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    }
    if (!constantTimeEqual(sha256(secret), s.refresh_hash)) {
      await t.pool.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [s.user_id]);
      await this.bumpVersion(t, s.user_id);
      await this.audit.record(t, { actorId: s.user_id, actorName: 'session', action: 'auth.refresh_replayed', entity: 'user', entityId: s.user_id });
      throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    }
    const next = randomToken(32);
    const expires = sessionExpiry(s.created_at, life);
    await t.pool.query('update sessions set refresh_hash = $2, expires_at = $3 where id = $1', [s.id, sha256(next), expires]);
    this.dropLive(t.info.slug, s.id);
    return this.tokens(t, s.user_id, s.id, `${s.id}.${next}`, kind, reply);
  }

  async logout(t: TenantCtx, sid: string, req?: FastifyRequest, reply?: FastifyReply): Promise<void> {
    if (req && schoolCookieToken(req, t.info.slug, this.production)) checkCookieCsrf(req, this.env.CORS_ORIGINS);
    await t.pool.query('update sessions set revoked_at = now() where id = $1', [sid]);
    this.dropLive(t.info.slug, sid);
    if (reply) clearSchoolRefreshCookie(reply, this.production, t.info.slug);
  }

  async logoutAll(t: TenantCtx, userId: string, req?: FastifyRequest, reply?: FastifyReply): Promise<void> {
    if (req && schoolCookieToken(req, t.info.slug, this.production)) checkCookieCsrf(req, this.env.CORS_ORIGINS);
    await t.pool.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
    await this.bumpVersion(t, userId);
    if (reply) clearSchoolRefreshCookie(reply, this.production, t.info.slug);
  }

  async me(t: TenantCtx, userId: string): Promise<SessionUser> {
    return this.sessionUser(t, userId);
  }

  async assertSession(t: TenantCtx, sid: string, ver: number | undefined, userId: string): Promise<void> {
    const key = `${t.info.slug}:${sid}:${ver ?? 0}`;
    const hit = this.live.get(key);
    if (hit && Date.now() - hit.at < 30_000) {
      if (!hit.ok) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
      return;
    }
    const { rows } = await t.pool.query<{ revoked_at: Date | null; token_version: number; status: string; user_id: string }>(
      'select s.revoked_at, u.token_version, u.status, u.id as user_id from sessions s join users u on u.id = s.user_id where s.id = $1',
      [sid],
    );
    const row = rows[0];
    const ok = !!row && !row.revoked_at && row.status === 'active' && row.user_id === userId && row.token_version === (ver ?? 0);
    this.live.set(key, { at: Date.now(), ok });
    if (this.live.size > 20_000) for (const [k, v] of this.live) if (Date.now() - v.at > 30_000) this.live.delete(k);
    if (!ok) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
  }

  async bumpVersion(t: TenantCtx, userId: string): Promise<void> {
    await t.pool.query('update users set token_version = token_version + 1 where id = $1', [userId]);
    this.dropLiveUser(t.info.slug, userId);
  }

  async bumpVersionForRole(t: TenantCtx, roleId: string): Promise<void> {
    await t.pool.query(
      'update users set token_version = token_version + 1 where id in (select user_id from user_roles where role_id = $1)',
      [roleId],
    );
    for (const k of [...this.live.keys()]) if (k.startsWith(`${t.info.slug}:`)) this.live.delete(k);
  }

  private dropLive(slug: string, sid: string): void {
    for (const k of [...this.live.keys()]) if (k.startsWith(`${slug}:${sid}:`)) this.live.delete(k);
  }

  private dropLiveUser(slug: string, _userId: string): void {
    for (const k of [...this.live.keys()]) if (k.startsWith(`${slug}:`)) this.live.delete(k);
  }

  private async issue(t: TenantCtx, userId: string, userAgent: string | undefined, client: ClientKind, reply?: FastifyReply): Promise<TokenPair> {
    const sid = newId('ses');
    const secret = randomToken(32);
    const created = new Date();
    await t.pool.query(
      'insert into sessions (id, user_id, refresh_hash, user_agent, client, expires_at) values ($1,$2,$3,$4,$5,$6)',
      [sid, userId, sha256(secret), userAgent?.slice(0, 200) ?? null, client, sessionExpiry(created, await this.life(t, client))],
    );
    await t.pool.query('update users set last_login_at = now() where id = $1', [userId]);
    const pair = await this.tokens(t, userId, sid, `${sid}.${secret}`, client, reply);
    await this.audit.record(t, { actorId: userId, actorName: pair.user.name, action: 'auth.signed_in', entity: 'user', entityId: userId });
    return pair;
  }

  private async tokens(t: TenantCtx, userId: string, sid: string, refreshToken: string, client: ClientKind, reply?: FastifyReply): Promise<TokenPair> {
    const user = await this.sessionUser(t, userId);
    const { rows } = await t.pool.query<{ token_version: number; kind: string }>('select token_version, kind from users where id = $1', [userId]);
    const ver = rows[0]?.token_version ?? 0;
    const accessToken = signJwt(
      { sub: userId, aud: t.info.slug, sid, name: user.name, perms: user.permissions, ver, kind: rows[0]?.kind },
      this.env.JWT_SECRET,
      ACCESS_SECONDS,
    );
    const maxAge = Math.max(60, Math.floor((sessionExpiry(new Date(), await this.life(t, client)).getTime() - Date.now()) / 1000));
    if (client === 'web' && reply) {
      setSchoolRefreshCookie(reply, { production: this.production, slug: t.info.slug, token: refreshToken, maxAge });
      return { accessToken, expiresInSeconds: ACCESS_SECONDS, user };
    }
    return { accessToken, refreshToken, expiresInSeconds: ACCESS_SECONDS, user };
  }

  private async sessionUser(t: TenantCtx, userId: string): Promise<SessionUser> {
    const { rows } = await t.pool.query<{ id: string; name: string; email: string | null; phone: string | null; key: string | null; role_name: string | null; permissions: string[] | null }>(
      `select u.id, u.name, u.email, u.phone, r.key, r.name as role_name, r.permissions
       from users u left join user_roles ur on ur.user_id = u.id left join roles r on r.id = ur.role_id where u.id = $1`, [userId]);
    const first = rows[0];
    if (!first) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    const perms = new Set<string>();
    rows.forEach((r) => r.permissions?.forEach((p) => perms.add(p)));
    return {
      id: first.id, name: first.name, email: first.email, phone: first.phone, initials: initials(first.name),
      roles: rows.map((r) => r.key).filter((x): x is string => !!x), roleNames: rows.map((r) => r.role_name).filter((x): x is string => !!x),
      permissions: [...perms] as Permission[],
    };
  }
}
