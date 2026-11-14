import { Body, Controller, Get, HttpCode, Inject, Injectable, Post, Req, Res, type OnModuleInit } from '@nestjs/common';
import { LoginRequest, PasswordChange, RefreshRequest, ResetFinish, ResetStart, VerifyRequest, consolePermissions, initials, type ClientKind, type ConsoleLoginResponse, type ConsoleRole, type ConsoleTokens } from '@tangent/contracts';
import { newId, scheduleJob } from '@tangent/db';
import { ApiError, Limiter, ZodPipe } from '@tangent/nest-kit';
import { constantTimeEqual, hashPassword, maskEmail, newTotpSecret, passwordNeedsRehash, randomToken, seal, sha256, signJwt, totpUri, unseal, verifyPassword, verifyTotp } from '@tangent/security';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkCookieCsrf, clearConsoleRefreshCookie, consoleCookieToken, setConsoleRefreshCookie } from '@tangent/nest-kit';
import { Db, Me, Public, type ConsoleUser } from './core.js';
import { ENV, demosAllowed, type Env } from './env.js';
import { Sandbox } from './sandbox.js';
import { PlatformHub } from './platform-hub.js';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

const ACCESS_SECONDS = 15 * 60;
const WEB_DAYS = 7;
const MOBILE_DAYS = 14;
let dummy: Promise<string> | undefined;
const limiter = new Limiter(process.env.NODE_ENV === 'test' ? 10_000 : 30, 60_000);

function clientOf(value: ClientKind | undefined): ClientKind {
  return value === 'web' ? 'web' : 'mobile';
}

@Injectable()
export class ConsoleAuth implements OnModuleInit {
  private readonly live = new Map<string, { at: number; ok: boolean }>();

  constructor(
    private readonly db: Db,
    private readonly sandbox: Sandbox,
    @Inject(ENV) private readonly env: Env,
    private readonly platform: PlatformHub,
  ) {}

  private get production(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    scheduleJob(this.db.pool, 'console-sweep', 24 * 60 * 60 * 1000, () => this.sweep(), () => undefined);
  }

  async login(body: LoginRequest): Promise<ConsoleLoginResponse> {
    const { rows } = await this.db.pool.query<{ id: string; name: string; email: string; password_hash: string | null; status: string; roles: ConsoleRole[]; totp_secret: string | null; failed_logins: number; locked_until: Date | null }>(
      'select id, name, email, password_hash, status, roles, totp_secret, failed_logins, locked_until from console_users where lower(email) = $1', [body.identifier.trim().toLowerCase()]);
    const u = rows[0];
    if (u?.locked_until && u.locked_until > new Date()) {
      throw new ApiError('locked', `Too many wrong passwords. Try again in ${Math.ceil((u.locked_until.getTime() - Date.now()) / 60_000)} minutes.`);
    }
    dummy ??= hashPassword('not-a-real-password');
    const ok = await verifyPassword(body.password, u?.password_hash ?? (await dummy));
    if (!u || !ok || u.status !== 'active') {
      if (u) {
        const lock = u.failed_logins + 1 >= 5;
        await this.db.pool.query('update console_users set failed_logins = $2, locked_until = $3 where id = $1', [u.id, lock ? 0 : u.failed_logins + 1, lock ? new Date(Date.now() + 15 * 60_000) : null]);
        if (lock) throw new ApiError('locked', 'Too many wrong passwords. Try again in 15 minutes.');
      }
      throw new ApiError('unauthenticated', u ? 'That password isn’t right. Check it, or ask a super admin to reset it.' : 'We couldn’t find a console account with that email.', {
        fields: u ? { password: 'That password isn’t right.' } : { identifier: 'We couldn’t find a console account with that email.' },
      });
    }
    await this.db.pool.query('update console_users set failed_logins = 0, locked_until = null where id = $1', [u.id]);
    if (passwordNeedsRehash(u.password_hash)) {
      await this.db.pool.query('update console_users set password_hash = $2 where id = $1', [u.id, await hashPassword(body.password)]);
    }
    const id = newId('cot');
    const expires = new Date(Date.now() + 10 * 60_000);
    // An authenticator app is the second step whenever the person has one: no SMS or email provider is involved.
    if (u.totp_secret) {
      await this.db.pool.query("insert into console_otp (id, user_id, code_hash, method, expires_at) values ($1,$2,'',$3,$4)", [id, u.id, 'app', expires]);
      return { step: 'otp', challenge: { challengeId: id, channel: 'app', maskedTo: 'your authenticator app', expiresInSeconds: 600 } };
    }
    // The test track has no email service either: its fixed DEMO_CODE stands in for the emailed code.
    if (this.env.DEMO_CODE) {
      const code = this.env.DEMO_CODE;
      await this.db.pool.query('insert into console_otp (id, user_id, code_hash, expires_at) values ($1,$2,$3,$4)', [id, u.id, sha256(`${id}:${code}`), expires]);
      await this.sandbox.put({ schoolSlug: 'console', channel: 'email', to: u.email, subject: 'Your Tangent console code', body: `Your sign-in code is ${code}. It expires in 10 minutes.` });
      return { step: 'otp', challenge: { challengeId: id, channel: 'email', maskedTo: maskEmail(u.email), expiresInSeconds: 600, // The code is only handed back in development, so a hosted test track keeps it as a second step the password alone cannot skip.
        ...(this.env.NODE_ENV !== 'production' ? { demoCode: code } : {}) } };
    }
    // First sign-in: the person adds a new key to their authenticator, and its first code proves it works.
    const secret = newTotpSecret();
    await this.db.pool.query("insert into console_otp (id, user_id, code_hash, method, pending_secret, expires_at) values ($1,$2,'','enroll',$3,$4)", [id, u.id, seal(secret, this.env.SECRETS_KEY), expires]);
    return { step: 'otp', challenge: { challengeId: id, channel: 'app', maskedTo: 'your authenticator app', expiresInSeconds: 600, enroll: { secret, uri: totpUri(secret, u.email) } } };
  }

  /**
   * "Forgot it?": a code to the person's email (through Tangent's email connection; on the test track the fixed demo code)
   * lets them choose a new password. The authenticator is still asked at the next sign-in, so a mailbox alone opens nothing.
   */
  async resetStart(email: string): Promise<{ challengeId: string; channel: 'email'; maskedTo: string; expiresInSeconds: number; demoCode?: string }> {
    const u = (await this.db.pool.query<{ id: string; email: string }>("select id, email from console_users where lower(email) = $1 and status = 'active'", [email.trim().toLowerCase()])).rows[0];
    const id = newId('cot');
    // An unknown address gets the same answer, so the form does not say who has an account.
    if (!u) return { challengeId: id, channel: 'email', maskedTo: maskEmail(email.trim()), expiresInSeconds: 600 };
    const code = this.env.DEMO_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.pool.query("insert into console_otp (id, user_id, code_hash, method, expires_at) values ($1,$2,$3,'reset',$4)", [id, u.id, sha256(`${id}:${code}`), new Date(Date.now() + 10 * 60_000)]);
    if (!this.env.DEMO_CODE) {
      await this.platform.hub.send({ schoolId: null, schoolSlug: 'console', channel: 'email', to: u.email, subject: 'Your Tangent console code', body: `Your code to choose a new console password is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`, now: true });
    }
    return { challengeId: id, channel: 'email', maskedTo: maskEmail(u.email), expiresInSeconds: 600, ...(this.env.DEMO_CODE && !this.production ? { demoCode: code } : {}) };
  }

  async resetFinish(challengeId: string, code: string, password: string): Promise<void> {
    const r = (await this.db.pool.query<{ id: string; user_id: string; code_hash: string; method: string; attempts: number; expires_at: Date; used_at: Date | null }>('select * from console_otp where id = $1', [challengeId])).rows[0];
    if (!r || r.method !== 'reset' || r.used_at || r.expires_at < new Date()) throw new ApiError('unauthenticated', 'That code has expired. Ask for a new one.', { fields: { code: 'That code has expired.' } });
    if (r.attempts >= 3) throw new ApiError('locked', 'Too many wrong codes. Ask for a new one.');
    if (!constantTimeEqual(sha256(`${challengeId}:${code}`), r.code_hash)) {
      await this.db.pool.query('update console_otp set attempts = attempts + 1 where id = $1', [r.id]);
      throw new ApiError('unauthenticated', 'That code isn’t right.', { attemptsLeft: 2 - r.attempts, fields: { code: 'That code isn’t right.' } });
    }
    if (password.length < 10) throw new ApiError('validation', 'Use at least 10 characters.', { fields: { password: 'Use at least 10 characters.' } });
    await this.db.pool.query('update console_otp set used_at = now() where id = $1', [r.id]);
    // Every session ends: whoever had the old password is signed out.
    await this.db.pool.query('update console_users set password_hash = $2, failed_logins = 0, locked_until = null, token_version = token_version + 1 where id = $1', [r.user_id, await hashPassword(password)]);
    await this.db.audit(r.user_id, 'auth.password_reset', 'user', r.user_id);
  }

  /** Which console this is, said by the server: a guess from the address could call production "Test". */
  about(): { environment: 'Production' | 'Test track' | 'Local'; version: string; demos: boolean } {
    const environment = this.env.NODE_ENV !== 'production' ? 'Local' : this.env.DEMO_CODE || this.env.ALLOW_DEMO === 'true' ? 'Test track' : 'Production';
    return { environment, version: this.env.APP_VERSION, demos: demosAllowed(this.env) };
  }

  /** An invitation link: the person chooses their password; their authenticator is added at their first sign-in. */
  async join(token: string, password: string): Promise<{ email: string }> {
    const u = (await this.db.pool.query<{ id: string; email: string; invite_expires: Date | null }>("select id, email, invite_expires from console_users where invite_hash = $1 and status = 'invited'", [sha256(token)])).rows[0];
    if (!u || !u.invite_expires || u.invite_expires < new Date()) throw new ApiError('unauthenticated', 'This invitation has expired or was used. Ask for a new one.');
    if (password.length < 10) throw new ApiError('validation', 'Use at least 10 characters.', { fields: { password: 'Use at least 10 characters.' } });
    await this.db.pool.query("update console_users set password_hash = $2, status = 'active', invite_hash = null, invite_expires = null where id = $1", [u.id, await hashPassword(password)]);
    await this.db.audit(u.email, 'team.joined', 'user', u.id);
    return { email: u.email };
  }

  /** My account: a new password needs the current one; every other session of mine ends. */
  async changePassword(me: ConsoleUser, body: PasswordChange): Promise<void> {
    const u = (await this.db.pool.query<{ password_hash: string | null }>('select password_hash from console_users where id = $1', [me.id])).rows[0];
    if (!u?.password_hash || !(await verifyPassword(body.current, u.password_hash))) throw new ApiError('validation', 'That is not your current password.', { fields: { current: 'That is not your current password.' } });
    if (body.next.length < 10) throw new ApiError('validation', 'Use at least 10 characters.', { fields: { next: 'Use at least 10 characters.' } });
    await this.db.pool.query('update console_users set password_hash = $2 where id = $1', [me.id, await hashPassword(body.next)]);
    await this.db.pool.query('update console_sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null', [me.id, me.sid]);
    await this.db.audit(me.email, 'auth.password_changed', 'user', me.id);
  }

  /** A new phone: the old authenticator key is dropped and the next sign-in adds a new one. The password proves it is me. */
  async resetAuthenticator(me: ConsoleUser, password: string): Promise<void> {
    const u = (await this.db.pool.query<{ password_hash: string | null }>('select password_hash from console_users where id = $1', [me.id])).rows[0];
    if (!u?.password_hash || !(await verifyPassword(password, u.password_hash))) throw new ApiError('validation', 'That is not your current password.', { fields: { password: 'That is not your current password.' } });
    await this.db.pool.query('update console_users set totp_secret = null, totp_last = null where id = $1', [me.id]);
    await this.db.audit(me.email, 'auth.authenticator_reset', 'user', me.id);
  }

  async verify(body: VerifyRequest, reply?: FastifyReply): Promise<ConsoleTokens> {
    const { rows } = await this.db.pool.query<{ id: string; user_id: string; code_hash: string; method: string; pending_secret: string | null; attempts: number; expires_at: Date; used_at: Date | null; totp_secret: string | null; totp_last: string | null }>(
      'select o.*, u.totp_secret, u.totp_last from console_otp o join console_users u on u.id = o.user_id where o.id = $1', [body.challengeId]);
    const r = rows[0];
    if (!r || r.used_at || r.expires_at < new Date()) throw new ApiError('unauthenticated', 'That code has expired. Go back and sign in again.', { fields: { code: 'That code has expired.' } });
    if (r.attempts >= 3) throw new ApiError('locked', 'Too many wrong codes. Go back and sign in again.');
    const secret = r.method === 'enroll' ? r.pending_secret : r.method === 'app' ? r.totp_secret : null;
    // An authenticator code is valid for about 90 seconds; one already used in that time is refused, so it cannot be replayed.
    const [lastCode, lastAt] = (r.totp_last ?? '').split('@');
    const replay = r.method === 'app' && lastCode === body.code.trim() && Date.now() / 1000 - Number(lastAt) < 120;
    const good = !replay && (secret ? verifyTotp(unseal(secret, this.env.SECRETS_KEY), body.code) : constantTimeEqual(sha256(`${body.challengeId}:${body.code}`), r.code_hash));
    if (!good) {
      await this.db.pool.query('update console_otp set attempts = attempts + 1 where id = $1', [r.id]);
      throw new ApiError('unauthenticated', 'That code isn’t right.', { attemptsLeft: 2 - r.attempts, fields: { code: 'That code isn’t right.' } });
    }
    await this.db.pool.query('update console_otp set used_at = now() where id = $1', [r.id]);
    if (r.method === 'app' || r.method === 'enroll') await this.db.pool.query('update console_users set totp_last = $2 where id = $1', [r.user_id, `${body.code.trim()}@${Math.floor(Date.now() / 1000)}`]);
    if (r.method === 'enroll') {
      await this.db.pool.query('update console_users set totp_secret = $2 where id = $1', [r.user_id, r.pending_secret]);
      await this.db.audit(r.user_id, 'auth.authenticator_added', 'user', r.user_id);
    }
    return this.issue(r.user_id, clientOf(body.client), reply);
  }

  async refresh(token: string | undefined, req: FastifyRequest, reply?: FastifyReply): Promise<ConsoleTokens> {
    const cookie = consoleCookieToken(req, this.production);
    const raw = token || cookie;
    if (cookie && !token) checkCookieCsrf(req, this.env.CORS_ORIGINS);
    if (!raw) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    const [sid, secret] = raw.split('.');
    const { rows } = await this.db.pool.query<{ id: string; user_id: string; refresh_hash: string; expires_at: Date; revoked_at: Date | null; created_at: Date; client: string }>('select id, user_id, refresh_hash, expires_at, revoked_at, created_at, client from console_sessions where id = $1', [sid ?? '']);
    const s = rows[0];
    if (!s || !secret || s.revoked_at || s.expires_at < new Date()) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    const days = s.client === 'mobile' ? MOBILE_DAYS : WEB_DAYS;
    if (Date.now() > s.created_at.getTime() + days * 86_400_000) {
      await this.db.pool.query('update console_sessions set revoked_at = now() where id = $1', [s.id]);
      throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    }
    if (!constantTimeEqual(sha256(secret), s.refresh_hash)) {
      await this.db.pool.query('update console_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [s.user_id]);
      await this.db.pool.query('update console_users set token_version = token_version + 1 where id = $1', [s.user_id]);
      await this.db.audit('session', 'auth.refresh_replayed', 'user', s.user_id);
      throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    }
    const next = randomToken(32);
    const kind = (s.client === 'mobile' ? 'mobile' : 'web') as ClientKind;
    await this.db.pool.query('update console_sessions set refresh_hash = $2, expires_at = $3 where id = $1', [s.id, sha256(next), new Date(Date.now() + days * 86_400_000)]);
    return this.tokens(s.user_id, s.id, `${s.id}.${next}`, kind, reply);
  }

  async logout(sid: string, req?: FastifyRequest, reply?: FastifyReply): Promise<void> {
    if (req && consoleCookieToken(req, this.production)) checkCookieCsrf(req, this.env.CORS_ORIGINS);
    await this.db.pool.query('update console_sessions set revoked_at = now() where id = $1', [sid]);
    this.dropLive(sid);
    if (reply) clearConsoleRefreshCookie(reply, this.production);
  }

  async logoutAll(userId: string, req?: FastifyRequest, reply?: FastifyReply): Promise<void> {
    if (req && consoleCookieToken(req, this.production)) checkCookieCsrf(req, this.env.CORS_ORIGINS);
    await this.db.pool.query('update console_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
    await this.db.pool.query('update console_users set token_version = token_version + 1 where id = $1', [userId]);
    this.live.clear();
    if (reply) clearConsoleRefreshCookie(reply, this.production);
  }

  async assertSession(sid: string, ver: number | undefined, userId: string): Promise<void> {
    const key = `${sid}:${ver ?? 0}`;
    const hit = this.live.get(key);
    if (hit && Date.now() - hit.at < 30_000) {
      if (!hit.ok) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
      return;
    }
    const { rows } = await this.db.pool.query<{ revoked_at: Date | null; token_version: number; status: string }>(
      'select s.revoked_at, u.token_version, u.status from console_sessions s join console_users u on u.id = s.user_id where s.id = $1 and u.id = $2',
      [sid, userId],
    );
    const row = rows[0];
    const ok = !!row && !row.revoked_at && row.status === 'active' && row.token_version === (ver ?? 0);
    this.live.set(key, { at: Date.now(), ok });
    if (!ok) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
  }

  async sweep(): Promise<void> {
    await this.db.pool.query("delete from console_otp where used_at is not null or expires_at < now() - interval '1 day'");
    await this.db.pool.query("delete from console_sessions where expires_at < now() or (revoked_at is not null and revoked_at < now() - interval '30 days')");
  }

  private dropLive(sid: string): void {
    for (const k of [...this.live.keys()]) if (k.startsWith(`${sid}:`)) this.live.delete(k);
  }

  private async issue(userId: string, client: ClientKind, reply?: FastifyReply): Promise<ConsoleTokens> {
    const sid = newId('cse');
    const secret = randomToken(32);
    const days = client === 'mobile' ? MOBILE_DAYS : WEB_DAYS;
    await this.db.pool.query('insert into console_sessions (id, user_id, refresh_hash, client, expires_at) values ($1,$2,$3,$4,$5)', [sid, userId, sha256(secret), client, new Date(Date.now() + days * 86_400_000)]);
    await this.db.pool.query('update console_users set last_seen_at = now() where id = $1', [userId]);
    return this.tokens(userId, sid, `${sid}.${secret}`, client, reply);
  }

  private async tokens(userId: string, sid: string, refreshToken: string, client: ClientKind, reply?: FastifyReply): Promise<ConsoleTokens> {
    const { rows } = await this.db.pool.query<{ id: string; name: string; email: string; roles: ConsoleRole[]; token_version: number }>('select id, name, email, roles, token_version from console_users where id = $1', [userId]);
    const u = rows[0];
    if (!u) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    const accessToken = signJwt({ sub: u.id, aud: 'console', sid, name: u.name, email: u.email, roles: u.roles, ver: u.token_version }, this.env.JWT_SECRET, ACCESS_SECONDS);
    const days = client === 'mobile' ? MOBILE_DAYS : WEB_DAYS;
    if (client === 'web' && reply) {
      setConsoleRefreshCookie(reply, { production: this.production, token: refreshToken, maxAge: days * 86_400 });
      return { accessToken, expiresInSeconds: ACCESS_SECONDS, user: { id: u.id, name: u.name, email: u.email, initials: initials(u.name), roles: u.roles, permissions: consolePermissions(u.roles) } };
    }
    return { accessToken, refreshToken, expiresInSeconds: ACCESS_SECONDS, user: { id: u.id, name: u.name, email: u.email, initials: initials(u.name), roles: u.roles, permissions: consolePermissions(u.roles) } };
  }
}

@Controller('console/v1/auth')
export class AuthController {
  constructor(private readonly auth: ConsoleAuth) {}

  @Public() @Post('login') @HttpCode(200)
  login(@Body(new ZodPipe(LoginRequest)) body: LoginRequest, @Req() req: FastifyRequest): Promise<ConsoleLoginResponse> {
    limiter.check(`l|${req.ip}`);
    return this.auth.login(body);
  }

  @Public() @Post('reset/start') @HttpCode(200)
  resetStart(@Body(new ZodPipe(ResetStart)) body: ResetStart, @Req() req: FastifyRequest) {
    limiter.check(`r|${req.ip}`);
    return this.auth.resetStart(body.identifier);
  }

  @Public() @Post('reset/finish') @HttpCode(204)
  async resetFinish(@Body(new ZodPipe(ResetFinish)) body: ResetFinish, @Req() req: FastifyRequest): Promise<void> {
    limiter.check(`r|${req.ip}`);
    await this.auth.resetFinish(body.challengeId, body.code, body.password);
  }

  @Public() @Post('verify') @HttpCode(200)
  verify(
    @Body(new ZodPipe(VerifyRequest)) body: VerifyRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ConsoleTokens> {
    limiter.check(`v|${req.ip}`);
    return this.auth.verify(body, reply);
  }

  @Public() @Post('refresh') @HttpCode(200)
  refresh(
    @Body(new ZodPipe(RefreshRequest)) body: RefreshRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ConsoleTokens> {
    limiter.check(`r|${req.ip}`);
    return this.auth.refresh(body.refreshToken, req, reply);
  }

  @Post('logout') @HttpCode(204)
  async logout(@Me() me: ConsoleUser, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.auth.logout(me.sid, req, reply);
  }

  @Post('logout-all') @HttpCode(204)
  async logoutAll(@Me() me: ConsoleUser, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.auth.logoutAll(me.id, req, reply);
  }

  @Get('me')
  me(@Me() me: ConsoleUser): ConsoleUser {
    return me;
  }

  @Public() @Post('join') @HttpCode(200)
  join(@Body(new ZodPipe(z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }))) body: { token: string; password: string }, @Req() req: FastifyRequest): Promise<{ email: string }> {
    limiter.check(`j|${req.ip}`);
    return this.auth.join(body.token, body.password);
  }

  @Public() @Get('about')
  about(): { environment: string; version: string; demos: boolean } {
    return this.auth.about();
  }

  @Post('password') @HttpCode(204)
  async password(@Me() me: ConsoleUser, @Body(new ZodPipe(PasswordChange)) body: PasswordChange): Promise<void> {
    await this.auth.changePassword(me, body);
  }

  @Post('authenticator/reset') @HttpCode(204)
  async authenticator(@Me() me: ConsoleUser, @Body(new ZodPipe(z.object({ password: z.string().min(1, 'Type your password').max(200) }))) body: { password: string }): Promise<void> {
    await this.auth.resetAuthenticator(me, body.password);
  }
}
