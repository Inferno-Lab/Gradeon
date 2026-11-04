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
export const DEMO_CODE = '424242';

const LIFE = {
  web: { maxDays: 7, idleDays: 7 },
  mobile: { maxDays: 30, idleDays: 14 },
} as const;

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

function sessionExpiry(created: Date, client: ClientKind): Date {
  const life = LIFE[client];
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

  /** Step one: check the password. Returns a code challenge, or tokens when the school has two-step sign-in off. */
  async login(t: TenantCtx, body: LoginRequest, userAgent?: string, reply?: FastifyReply): Promise<LoginResponse> {
    const ident = body.identifier.trim();
    const byEmail = ident.includes('@');
    const digits = ident.replace(/\D/g, '');
    const { rows } = await t.pool.query<UserRow>(
      byEmail
        ? 'select id, name, email, phone, password_hash, status, failed_logins, locked_until, token_version from users where lower(email) = $1 limit 1'
        : "select id, name, email, phone, password_hash, status, failed_logins, locked_until, token_version from users where right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = right($1, 10) and length($1) >= 8 limit 1",
      [byEmail ? ident.toLowerCase() : digits],
    );
    const user = rows[0];
    if (user?.locked_until && user.locked_until > new Date()) {
      const retryAfter = Math.ceil((user.locked_until.getTime() - Date.now()) / 1000);
      throw new ApiError('locked', `Too many wrong attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes, or reset your password by SMS.`, { retryAfter });
    }
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
    if (passwordNeedsRehash(user.password_hash)) {
      await t.pool.query('update users set password_hash = $2 where id = $1', [user.id, await hashPassword(body.password)]);
    }

    const doc = await this.settings.doc(t);
    if (doc.values['security.twoFactor'] === false) {
      return { step: 'done', tokens: await this.issue(t, user.id, userAgent, clientOf(body.client), reply) };
    }
    const demo = doc.values['demo.mode'] === true;
    const code = demo ? DEMO_CODE : randomCode(6);
    const id = newId('otp');
    const channel: 'sms' | 'email' = user.phone ? 'sms' : 'email';
    await t.pool.query('insert into otp_challenges (id, user_id, code_hash, channel, expires_at) values ($1,$2,$3,$4,$5)', [id, user.id, sha256(`${id}:${code}`), channel, new Date(Date.now() + OTP_MINUTES * 60_000)]);
    await this.messenger.send(t, {
      channel, to: (channel === 'sms' ? user.phone : user.email) ?? '', subject: channel === 'email' ? 'Your Gradeon sign-in code' : undefined,
      body: `Your Gradeon sign-in code for ${t.info.shortName} is ${code}. It expires in ${OTP_MINUTES} minutes.`,
    });
    const challenge: LoginChallenge = {
      challengeId: id, channel, maskedTo: channel === 'sms' ? maskPhone(user.phone!) : maskEmail(user.email!),
      expiresInSeconds: OTP_MINUTES * 60, ...(demo ? { demoCode: DEMO_CODE } : {}),
    };
    return { step: 'otp', challenge };
  }

  async verify(t: TenantCtx, challengeId: string, code: string, userAgent?: string, client?: ClientKind, reply?: FastifyReply): Promise<TokenPair> {
    const { rows } = await t.pool.query<{ id: string; user_id: string; code_hash: string; attempts: number; expires_at: Date; used_at: Date | null }>(
      'select id, user_id, code_hash, attempts, expires_at, used_at from otp_challenges where id = $1', [challengeId]);
    const row = rows[0];
    if (!row || row.used_at || row.expires_at < new Date()) throw new ApiError('unauthenticated', 'That code has expired. Go back and sign in again.', { fields: { code: 'That code has expired.' } });
    if (row.attempts >= OTP_TRIES) throw new ApiError('locked', 'Too many wrong codes. Go back and sign in again to get a new one.');
    if (!constantTimeEqual(sha256(`${challengeId}:${code}`), row.code_hash)) {
      await t.pool.query('update otp_challenges set attempts = attempts + 1 where id = $1', [challengeId]);
      throw new ApiError('unauthenticated', 'That code isn’t right.', { attemptsLeft: OTP_TRIES - row.attempts - 1, fields: { code: 'That code isn’t right.' } });
    }
    await t.pool.query('update otp_challenges set used_at = now() where id = $1', [challengeId]);
    return this.issue(t, row.user_id, userAgent, clientOf(client), reply);
  }

  async refresh(t: TenantCtx, refreshToken: string | undefined, req: FastifyRequest, reply?: FastifyReply, client?: ClientKind): Promise<TokenPair> {
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
    const maxEnd = s.created_at.getTime() + LIFE[kind].maxDays * 86_400_000;
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
    const expires = sessionExpiry(s.created_at, kind);
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
      [sid, userId, sha256(secret), userAgent?.slice(0, 200) ?? null, client, sessionExpiry(created, client)],
    );
    await t.pool.query('update users set last_login_at = now() where id = $1', [userId]);
    const pair = await this.tokens(t, userId, sid, `${sid}.${secret}`, client, reply);
    await this.audit.record(t, { actorId: userId, actorName: pair.user.name, action: 'auth.signed_in', entity: 'user', entityId: userId });
    return pair;
  }

  private async tokens(t: TenantCtx, userId: string, sid: string, refreshToken: string, client: ClientKind, reply?: FastifyReply): Promise<TokenPair> {
    const user = await this.sessionUser(t, userId);
    const { rows } = await t.pool.query<{ token_version: number }>('select token_version from users where id = $1', [userId]);
    const ver = rows[0]?.token_version ?? 0;
    const accessToken = signJwt(
      { sub: userId, aud: t.info.slug, sid, name: user.name, perms: user.permissions, ver },
      this.env.JWT_SECRET,
      ACCESS_SECONDS,
    );
    const maxAge = Math.max(60, Math.floor((sessionExpiry(new Date(), client).getTime() - Date.now()) / 1000));
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
