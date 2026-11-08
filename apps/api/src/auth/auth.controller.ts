import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { CodeRequest, LoginRequest, RefreshRequest, ResetFinish, ResetStart, VerifyRequest, type EffectiveConfig, type LoginChallenge, type SchoolBrand, type LoginResponse, type SessionUser, type TokenPair } from '@gradeon/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Limiter, ZodPipe } from '@gradeon/nest-kit';
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
  ) {}

  @Get('me')
  async me(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<SessionUser> {
    // A console support session has no account in the school: describe it as what it is.
    if (u.id.startsWith('support:')) return { id: u.id, name: u.name, email: null, phone: null, initials: 'GS', roles: ['support'], roleNames: ['Gradeon support'], permissions: u.permissions as SessionUser['permissions'] };
    return this.auth.me(t, u.id);
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
    const s = (k: string) => (typeof cfg.settings[k] === 'string' ? (cfg.settings[k] as string) : '');
    return {
      ...cfg.school, demoMode: cfg.settings['demo.mode'] === true, theme: (cfg.settings['theme.colors'] ?? {}) as SchoolBrand['theme'],
      privacy: { notice: s('privacy.notice'), officerName: s('privacy.officerName'), officerEmail: s('privacy.officerEmail'), officerPhone: s('privacy.officerPhone') },
    };
  }
}
