import { Body, Controller, Get, HttpCode, Post, Put, Req, Res } from '@nestjs/common';
import { CodeRequest, DEFAULT_BRAND, appTokens, hueOf, LoginRequest, PasswordChange, USER_PREFS, UserPrefPut, RefreshRequest, ResetFinish, ResetStart, VerifyRequest, type EffectiveConfig, type LoginChallenge, type SchoolBrand, type LoginResponse, type SessionUser, type TokenPair } from '@tangent/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError, Limiter, ZodPipe } from '@tangent/nest-kit';
import type { z } from 'zod';
import { FilesService } from '../school/files.service.js';
import { SettingsService } from '../school/support.js';
import { Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { AuthService } from './auth.service.js';
import { Core, CurrentUser, Public } from './guards.js';

const loginLimit = new Limiter(process.env.NODE_ENV === 'test' ? 10_000 : 30, 60_000);

@Controller('v1/auth')
@Core()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login') @HttpCode(200)
  login(
    @Tenant() t: TenantCtx,
    @Body(new ZodPipe(LoginRequest)) body: LoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    loginLimit.check(`${t.info.slug}|${req.ip}`);
    return this.auth.login(t, body, req.headers['user-agent'], reply);
  }

  @Public() @Post('verify') @HttpCode(200)
  verify(
    @Tenant() t: TenantCtx,
    @Body(new ZodPipe(VerifyRequest)) body: VerifyRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TokenPair> {
    loginLimit.check(`${t.info.slug}|${req.ip}|v`);
    return this.auth.verify(t, body.challengeId, body.code, req.headers['user-agent'], body.client, reply);
  }

  @Public() @Post('code') @HttpCode(200)
  code(@Tenant() t: TenantCtx, @Body(new ZodPipe(CodeRequest)) body: CodeRequest, @Req() req: FastifyRequest): Promise<LoginChallenge> {
    loginLimit.check(`${t.info.slug}|${req.ip}|c`);
    return this.auth.requestCode(t, body.identifier);
  }

  @Public() @Post('reset/start') @HttpCode(200)
  resetStart(@Tenant() t: TenantCtx, @Body(new ZodPipe(ResetStart)) body: ResetStart, @Req() req: FastifyRequest): Promise<LoginChallenge> {
    loginLimit.check(`${t.info.slug}|${req.ip}|rs`);
    return this.auth.resetStart(t, body.identifier);
  }

  @Public() @Post('reset/finish') @HttpCode(204)
  async resetFinish(@Tenant() t: TenantCtx, @Body(new ZodPipe(ResetFinish)) body: ResetFinish, @Req() req: FastifyRequest): Promise<void> {
    loginLimit.check(`${t.info.slug}|${req.ip}|rf`);
    await this.auth.resetFinish(t, body.challengeId, body.code, body.password);
  }

  @Public() @Post('refresh') @HttpCode(200)
  refresh(
    @Tenant() t: TenantCtx,
    @Body(new ZodPipe(RefreshRequest)) body: RefreshRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TokenPair> {
    loginLimit.check(`${t.info.slug}|${req.ip}|r`);
    return this.auth.refresh(t, body.refreshToken, req, reply);
  }

  @Post('password') @HttpCode(204)
  async password(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(PasswordChange)) body: PasswordChange, @Req() req: FastifyRequest): Promise<void> {
    loginLimit.check(`${t.info.slug}|${req.ip}|pw`);
    await this.auth.changePassword(t, u, body.current, body.next);
  }

  @Post('logout') @HttpCode(204)
  async logout(
    @Tenant() t: TenantCtx,
    @CurrentUser() u: AuthedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(t, u.sid, req, reply);
  }

  @Post('logout-all') @HttpCode(204)
  async logoutAll(
    @Tenant() t: TenantCtx,
    @CurrentUser() u: AuthedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logoutAll(t, u.id, req, reply);
  }
}

@Controller('v1')
@Core()
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
  ) {}

  @Get('me')
  async me(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<SessionUser> {
    // A console support session has no account in the school: describe it as what it is.
    if (u.id.startsWith('support:')) return { id: u.id, name: u.name, email: null, phone: null, initials: 'GS', roles: ['support'], roleNames: ['Tangent support'], permissions: u.permissions as SessionUser['permissions'] };
    return this.auth.me(t, u.id);
  }

  /** The person's own choices, saved to their account. */
  @Get('me/prefs')
  async prefs(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<Record<string, unknown>> {
    const { rows } = await t.pool.query<{ key: string; value: unknown }>('select key, value from user_prefs where user_id = $1', [u.id]);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  @Put('me/prefs') @HttpCode(204)
  async setPref(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(UserPrefPut)) b: z.infer<typeof UserPrefPut>): Promise<void> {
    if (u.id.startsWith('support:')) throw new ApiError('forbidden', 'A support session cannot change a person’s choices.');
    const parsed = USER_PREFS[b.key].safeParse(b.value);
    if (!parsed.success) throw new ApiError('validation', parsed.error.issues[0]?.message ?? 'That value is not allowed.');
    await t.pool.query('insert into user_prefs (user_id, key, value, updated_at) values ($1,$2,$3,now()) on conflict (user_id, key) do update set value = excluded.value, updated_at = now()', [u.id, b.key, JSON.stringify(parsed.data)]);
  }

  /** The settings the apps and admin start from: platform defaults, plan, locks and school choices, cut to this user. */
  @Get('config')
  config(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<EffectiveConfig> {
    return this.settings.effective(t, u.permissions);
  }

  /** Branding for the sign-in page, before anyone has signed in. */
  @Public() @Get('brand')
  async brand(@Tenant() t: TenantCtx): Promise<SchoolBrand> {
    const cfg = await this.settings.effective(t);
    const hue = hueOf(cfg.school.color || DEFAULT_BRAND);
    return {
      ...cfg.school, logoUrl: await this.files.logoUrl(t), demoMode: t.info.demo, hue, palette: { light: appTokens(hue, 'light'), dark: appTokens(hue, 'dark'), amoled: appTokens(hue, 'amoled') },
      privacy: cfg.privacy,
    };
  }
}
