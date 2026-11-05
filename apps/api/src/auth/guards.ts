import { Inject, Injectable, SetMetadata, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyJwt } from '@gradeon/security';
import { MODULES, closeModules } from '@gradeon/config-engine';
import type { AccessClaims, Permission } from '@gradeon/contracts';
import type { FastifyRequest } from 'fastify';
import { ENV, type Env } from '../env.js';
import { ApiError } from '@gradeon/nest-kit';
import type { AuthedUser } from '../tenancy/tenant.js';
import { AuthService } from './auth.service.js';

/** The route needs no sign-in. */
export const Public = () => SetMetadata('public', true);
/** The route needs every one of these permissions. */
export const Require = (...perms: Permission[]) => SetMetadata('perms', perms);
/** The route belongs to a module the school must have switched on. */
export const RequireModule = (key: string) => SetMetadata('module', key);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedUser => ctx.switchToHttp().getRequest<FastifyRequest>().user!);

const KNOWN_MODULES = new Set(MODULES.map((m) => m.key));
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
      throw new ApiError('forbidden', 'This part of Gradeon is for school staff.');
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
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const needed = this.reflector.getAllAndOverride<Permission[] | undefined>('perms', targets);
    const mod = this.reflector.getAllAndOverride<string | undefined>('module', targets);
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.url.startsWith('/console/')) return true;
    if (mod) {
      if (!KNOWN_MODULES.has(mod)) throw new Error(`Unknown module ${mod}`);
      const entitled = closeModules(req.tenant!.info.entitlement.modules);
      if (!entitled.includes(mod)) throw new ApiError('locked', 'This feature is not part of your school’s plan.');
      if (req.tenant!.info.flags[`kill.${mod}`] === true) throw new ApiError('locked', 'Gradeon has paused this feature for now. It will be back shortly.');
    }
    if (needed?.length) {
      const have = req.user?.permissions ?? [];
      if (!needed.every((p) => have.includes(p))) throw new ApiError('forbidden', 'You do not have access to this. Ask your principal to change your role.');
    }
    return true;
  }
}
