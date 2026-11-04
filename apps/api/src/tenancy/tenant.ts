import { Inject, Injectable, SetMetadata, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as schema from '@gradeon/db/school';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PoolManager, Registry, type TenantInfo } from '@gradeon/tenancy';
import type { Pool } from 'pg';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '@gradeon/nest-kit';

export type SchoolDb = NodePgDatabase<typeof schema>;

export interface TenantCtx {
  info: TenantInfo;
  pool: Pool;
  db: SchoolDb;
}

export interface AuthedUser {
  id: string;
  sid: string;
  name: string;
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantCtx;
    user?: AuthedUser;
  }
}

export const REGISTRY = Symbol('REGISTRY');
export const POOLS = Symbol('POOLS');

/** Marks a route that does not belong to one school (health checks). */
export const NoTenant = () => SetMetadata('noTenant', true);
export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantCtx => ctx.switchToHttp().getRequest<FastifyRequest>().tenant!);

@Injectable()
export class TenantService {
  private readonly dbs = new WeakMap<Pool, SchoolDb>();

  constructor(
    @Inject(REGISTRY) readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
  ) {}

  async resolve(slug: string): Promise<TenantCtx> {
    const info = await this.registry.school(slug);
    if (!info) throw new ApiError('not_found', 'We could not find that school. Check the address and try again.');
    if (info.status !== 'live') {
      const msg = info.status === 'suspended' ? 'This school’s account is paused. Please contact Gradeon support.' : 'This school is still being set up. Try again in a few minutes.';
      throw new ApiError('school_unavailable', msg);
    }
    const pool = this.pools.get(slug, info.dbUrl);
    let db = this.dbs.get(pool);
    if (!db) {
      db = drizzle(pool, { schema });
      this.dbs.set(pool, db);
    }
    return { info, pool, db };
  }
}

const SLUG = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

/** Reads the school from the `X-School` header and attaches its database to the request. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.url.startsWith('/console/') || this.reflector.getAllAndOverride<boolean>('noTenant', [ctx.getHandler(), ctx.getClass()])) return true;
    const raw = req.headers['x-school'];
    const slug = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
    if (!slug) throw new ApiError('validation', 'Say which school this is for, with the X-School header.');
    if (!SLUG.test(slug)) throw new ApiError('not_found', 'We could not find that school. Check the address and try again.');
    req.tenant = await this.tenants.resolve(slug);
    return true;
  }
}
