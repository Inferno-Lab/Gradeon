import { Body, Controller, Get, HttpCode, Inject, Injectable, Post, Req, Res, type OnModuleInit } from '@nestjs/common';
import { LoginRequest, RefreshRequest, VerifyRequest, consolePermissions, initials, type ClientKind, type ConsoleLoginResponse, type ConsoleRole, type ConsoleTokens } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, Limiter, ZodPipe } from '@gradeon/nest-kit';
import { constantTimeEqual, hashPassword, maskEmail, passwordNeedsRehash, randomCode, randomToken, sha256, signJwt, verifyPassword } from '@gradeon/security';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkCookieCsrf, clearConsoleRefreshCookie, consoleCookieToken, setConsoleRefreshCookie } from '@gradeon/nest-kit';
import { Db, Me, Public, type ConsoleUser } from './core.js';
import { ENV, type Env } from './env.js';
import { Sandbox } from './sandbox.js';

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
  ) {}

  private get production(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    const timer = setInterval(() => void this.sweep(), 24 * 60 * 60 * 1000);
    timer.unref();
    void this.sweep();
  }

  async login(body: LoginRequest): Promise<ConsoleLoginResponse> {
    const { rows } = await this.db.pool.query<{ id: string; name: string; email: string; password_hash: string | null; status: string; roles: ConsoleRole[] }>(
      'select id, name, email, password_hash, status, roles from console_users where lower(email) = $1', [body.identifier.trim().toLowerCase()]);
    const u = rows[0];
    dummy ??= hashPassword('not-a-real-password');
    const ok = await verifyPassword(body.password, u?.password_hash ?? (await dummy));
    if (!u || !ok || u.status !== 'active') {
      throw new ApiError('unauthenticated', u ? 'That password isn’t right. Check it, or ask a super admin to reset it.' : 'We couldn’t find a console account with that email.', {
        fields: u ? { password: 'That password isn’t right.' } : { identifier: 'We couldn’t find a console account with that email.' },
      });
    }
    if (passwordNeedsRehash(u.password_hash)) {
      await this.db.pool.query('update console_users set password_hash = $2 where id = $1', [u.id, await hashPassword(body.password)]);
    }
    const code = this.env.DEMO_CODE ?? randomCode(6);
    const id = newId('cot');
    await this.db.pool.query('insert into console_otp (id, user_id, code_hash, expires_at) values ($1,$2,$3,$4)', [id, u.id, sha256(`${id}:${code}`), new Date(Date.now() + 10 * 60_000)]);
    await this.sandbox.put({ schoolSlug: 'console', channel: 'email', to: u.email, subject: 'Your Gradeon console code', body: `Your sign-in code is ${code}. It expires in 10 minutes.` });
    return { step: 'otp', challenge: { challengeId: id, channel: 'email', maskedTo: maskEmail(u.email), expiresInSeconds: 600, // The code is only handed back in development, so a hosted test track keeps it as a second step the password alone cannot skip.
      ...(this.env.DEMO_CODE && this.env.NODE_ENV !== 'production' ? { demoCode: this.env.DEMO_CODE } : {}) } };
  }

  async verify(body: VerifyRequest, reply?: FastifyReply): Promise<ConsoleTokens> {
    const { rows } = await this.db.pool.query<{ id: string; user_id: string; code_hash: string; attempts: number; expires_at: Date; used_at: Date | null }>('select * from console_otp where id = $1', [body.challengeId]);
    const r = rows[0];
    if (!r || r.used_at || r.expires_at < new Date()) throw new ApiError('unauthenticated', 'That code has expired. Go back and sign in again.', { fields: { code: 'That code has expired.' } });
    if (r.attempts >= 3) throw new ApiError('locked', 'Too many wrong codes. Go back and sign in again.');
    if (!constantTimeEqual(sha256(`${body.challengeId}:${body.code}`), r.code_hash)) {
      await this.db.pool.query('update console_otp set attempts = attempts + 1 where id = $1', [r.id]);
      throw new ApiError('unauthenticated', 'That code isn’t right.', { attemptsLeft: 2 - r.attempts, fields: { code: 'That code isn’t right.' } });
    }
    await this.db.pool.query('update console_otp set used_at = now() where id = $1', [r.id]);
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
}
