import { Inject, Injectable, SetMetadata, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyJwt } from '@tangent/security';
import { featureByKey, moduleByKey } from '@tangent/config-engine';
import type { AccessClaims, Permission } from '@tangent/contracts';
import type { FastifyRequest } from 'fastify';
import { ENV, type Env } from '../env.js';
import { ApiError } from '@tangent/nest-kit';
import type { AuthedUser } from '../tenancy/tenant.js';
import { SettingsService } from '../school/support.js';
import { AuthService } from './auth.service.js';

/** The route needs no sign-in. */
export const Public = () => SetMetadata('public', true);
/** The route needs every one of these permissions. */
export const Require = (...perms: Permission[]) => SetMetadata('perms', perms);
/**
 * The module (`fees`) or the feature inside a module (`fees.onlinePayment`) the route belongs to. Every school route declares one,
 * or says it is `@Core()`: a route without either is refused (default deny), and an API test fails on it.
 */
export const RequireModule = (key: string) => SetMetadata('module', key);
/** The route is part of every school, whatever its plan: sign-in, the menu, settings, people. */
export const Core = () => SetMetadata('module', 'core');
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedUser => ctx.switchToHttp().getRequest<FastifyRequest>().user!);

const FAMILY_PATHS = /^\/v1\/(f\/|auth\/|me(\?|$)|config(\?|$)|brand(\?|$)|errors(\?|$))/;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.url.startsWith('/console/') || this.reflector.getAllAndOverride<boolean>('public', targets) || this.reflector.getAllAndOverride<boolean>('noTenant', targets)) return true;
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError('unauthenticated', 'Sign in to continue.');
    const claims = verifyJwt<AccessClaims & Record<string, unknown>>(token, this.env.JWT_SECRET, this.env.JWT_SECRET_PREVIOUS);
    if (!claims || claims.aud !== req.tenant?.info.slug) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    // A support session opened from the console can look but never change anything.
    if (claims.support && req.method !== 'GET' && req.method !== 'HEAD') {
      throw new ApiError('forbidden', 'This is a read-only support session. Nothing can be changed from here.');
    }
    // Families use the app's routes only: the admin API (dashboard, search, reports...) is for staff.
    if (claims.kind && claims.kind !== 'staff' && !FAMILY_PATHS.test(req.url)) {
      throw new ApiError('forbidden', 'This part of Tangent is for school staff.');
    }
    if (!claims.support && req.tenant) {
      await this.auth.assertSession(req.tenant, claims.sid, claims.ver, claims.sub);
    }
    req.user = { id: claims.sub, sid: claims.sid, name: claims.name, permissions: claims.perms };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const needed = this.reflector.getAllAndOverride<Permission[] | undefined>('perms', targets);
    const mod = this.reflector.getAllAndOverride<string | undefined>('module', targets);
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.url.startsWith('/console/') || !req.tenant) return true;
    if (!mod && this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    if (!mod) throw new Error(`${req.method} ${req.routeOptions.url} does not say which module it belongs to. Add @RequireModule or @Core.`);
    if (mod !== 'core') {
      const feature = featureByKey(mod);
      const module = feature?.module ?? mod;
      if (!feature && !moduleByKey(mod)) throw new Error(`Unknown module or feature ${mod}`);
      // The same resolved configuration the admin and the app read: plan, dates, the console's choice and kill switches.
      const cfg = await this.settings.effective(req.tenant);
      if (req.tenant.info.flags[`kill.${module}`] === true) throw new ApiError('locked', 'Tangent has paused this feature for now. It will be back shortly.');
      if (!cfg.modules.includes(module) || (feature && !cfg.features.includes(mod))) throw new ApiError('locked', 'This feature is not part of your school’s plan.');
    }
    if (needed?.length) {
      const have = req.user?.permissions ?? [];
      if (!needed.every((p) => have.includes(p))) throw new ApiError('forbidden', 'You do not have access to this. Ask your principal to change your role.');
    }
    return true;
  }
}
