import { Inject, Injectable, SetMetadata, createParamDecorator, type CanActivate, type ExecutionContext, type OnApplicationShutdown } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as reg from '@tangent/db/registry';
import { newId, pg } from '@tangent/db';
import { consolePermissions, type ConsolePermission, type ConsoleRole } from '@tangent/contracts';
import { ApiError } from '@tangent/nest-kit';
import { verifyJwt } from '@tangent/security';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyRequest } from 'fastify';
import { ENV, type Env } from './env.js';

export type RegistryDb = NodePgDatabase<typeof reg>;
export { reg };

export interface ConsoleUser {
  id: string;
  name: string;
  email: string;
  roles: ConsoleRole[];
  permissions: ConsolePermission[];
  sid: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    cuser?: ConsoleUser;
  }
}

/** The registry database, with full rights. The school API only reads it. */
@Injectable()
export class Db implements OnApplicationShutdown {
  readonly pool: pg.Pool;
  readonly db: RegistryDb;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new pg.Pool({
      connectionString: env.REGISTRY_DATABASE_URL,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'tangent-console',
      options: '-c statement_timeout=15000 -c idle_in_transaction_session_timeout=10000',
    });
    this.pool.on('error', () => undefined);
    this.db = drizzle(this.pool, { schema: reg });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  /** Runs a query and turns snake_case column names into camelCase, so rows match the Drizzle table types. */
  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const res = await this.pool.query(text, params);
    const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    return { rows: res.rows.map((r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]))) as T[], rowCount: res.rowCount ?? 0 };
  }

  /** Writes a line to the console's audit log. */
  async audit(actor: string, action: string, entity: string, entityId?: string | null, detail: Record<string, unknown> = {}): Promise<void> {
    await this.pool.query('insert into console_audit (id, actor, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)', [newId('cau'), actor, action, entity, entityId ?? null, JSON.stringify(detail)]);
  }
}

export const Public = () => SetMetadata('public', true);
export const Needs = (...perms: ConsolePermission[]) => SetMetadata('cperms', perms);
export const Me = createParamDecorator((_: unknown, ctx: ExecutionContext): ConsoleUser => ctx.switchToHttp().getRequest<FastifyRequest>().cuser!);

@Injectable()
export class ConsoleAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
    private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.url.startsWith('/console/') || this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query as { access_token?: string } | undefined)?.access_token;
    if (!token) throw new ApiError('unauthenticated', 'Sign in to continue.');
    const claims = verifyJwt<{ sub: string; aud: string; sid: string; name: string; email: string; roles: ConsoleRole[]; ver?: number }>(token, this.env.JWT_SECRET, this.env.JWT_SECRET_PREVIOUS);
    if (!claims || claims.aud !== 'console') throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    if (claims.sid !== 'system') {
      const { rows } = await this.db.pool.query<{ revoked_at: Date | null; token_version: number; status: string }>(
        'select s.revoked_at, u.token_version, u.status from console_sessions s join console_users u on u.id = s.user_id where s.id = $1 and u.id = $2',
        [claims.sid, claims.sub],
      );
      const row = rows[0];
      if (!row || row.revoked_at || row.status !== 'active' || row.token_version !== (claims.ver ?? 0)) {
        throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
      }
    }
    req.cuser = { id: claims.sub, name: claims.name, email: claims.email, roles: claims.roles, permissions: consolePermissions(claims.roles), sid: claims.sid };
    const needed = this.reflector.getAllAndOverride<ConsolePermission[] | undefined>('cperms', targets);
    if (needed?.length && !needed.every((p) => req.cuser!.permissions.includes(p))) {
      throw new ApiError('forbidden', 'Your console role does not allow this. Ask a super admin.');
    }
    return true;
  }
}
