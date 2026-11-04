import type { EntitlementDoc } from '@gradeon/contracts';
import { pg } from '@gradeon/db';
import { schools } from '@gradeon/db/registry';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { unseal } from '@gradeon/security';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  status: string;
  plan: string;
  cell: string;
  target: string;
  dbUrl: string;
  entitlement: EntitlementDoc;
  configVersion: number;
  apiVersion: string;
  /** Console flags that apply to this school (its own value beats the fleet-wide one). */
  flags: Record<string, boolean>;
}

export interface RegistryOptions {
  url: string;
  /** Key that seals school connection strings at rest. */
  secret: string;
  max?: number;
}

const POSITIVE_TTL_MS = 15_000;
const NEGATIVE_TTL_MS = 5_000;

/** Read access to the school registry for the school API. The console API uses the same database with full rights. */
const PG_OPTIONS = '-c statement_timeout=15000 -c idle_in_transaction_session_timeout=10000';

export class Registry {
  readonly pool: pg.Pool;
  readonly db;
  private readonly cache = new Map<string, { at: number; value: TenantInfo | null }>();

  constructor(private readonly opts: RegistryOptions) {
    this.pool = new pg.Pool({
      connectionString: opts.url,
      max: opts.max ?? 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'gradeon-registry',
      options: PG_OPTIONS,
    });
    this.db = drizzle(this.pool);
  }

  async school(slug: string): Promise<TenantInfo | null> {
    const hit = this.cache.get(slug);
    const now = Date.now();
    if (hit && now - hit.at < (hit.value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS)) return hit.value;
    const [row] = await this.db.select().from(schools).where(and(eq(schools.slug, slug), isNull(schools.deletedAt))).limit(1);
    let value: TenantInfo | null = null;
    if (row?.dbUrlSealed) {
      const fl = await this.pool.query<{ key: string; enabled: boolean }>("select key, enabled from flags where school_id in ('*', $1) order by (school_id = '*') desc", [row.id]).catch(() => ({ rows: [] as { key: string; enabled: boolean }[] }));
      value = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        shortName: row.shortName,
        status: row.status,
        plan: row.plan,
        cell: row.cell,
        target: row.target,
        dbUrl: unseal(row.dbUrlSealed, this.opts.secret),
        entitlement: { plan: row.plan, ...row.entitlement },
        configVersion: row.configVersion,
        apiVersion: row.apiVersion,
        flags: Object.fromEntries(fl.rows.map((f) => [f.key, f.enabled])),
      };
    }
    this.cache.set(slug, { at: now, value });
    return value;
  }

  invalidate(slug?: string): void {
    if (slug) this.cache.delete(slug);
    else this.cache.clear();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface Entry {
  pool: pg.Pool;
  lastUsed: number;
  url: string;
}

/**
 * Keeps a bounded set of pools, one per school database, closing the least recently used.
 * Hundreds of schools share a few connections: each pool is small and idle pools are dropped.
 */
/** 40 schools × 5 connections = 200, plus the registry pool. Stay under the server's max_connections. */
export function poolManagerFromEnv(source: NodeJS.ProcessEnv = process.env): PoolManager {
  const maxPools = Number(source.TENANT_MAX_POOLS) || 40;
  const perPool = Number(source.TENANT_PER_POOL) || 5;
  return new PoolManager({ maxPools, perPool });
}

export class PoolManager {
  private readonly pools = new Map<string, Entry>();
  private sweeper: NodeJS.Timeout | undefined;

  constructor(private readonly opts: { maxPools?: number; perPool?: number; idleMs?: number } = {}) {
    this.sweeper = setInterval(() => void this.sweep(), 30_000);
    this.sweeper.unref();
  }

  get(slug: string, url: string): pg.Pool {
    const hit = this.pools.get(slug);
    if (hit && hit.url === url) {
      hit.lastUsed = Date.now();
      return hit.pool;
    }
    if (hit) void hit.pool.end().catch(() => undefined);
    const pool = new pg.Pool({
      connectionString: url,
      max: this.opts.perPool ?? 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
      application_name: `gradeon-${slug}`.slice(0, 63),
      options: PG_OPTIONS,
    });
    pool.on('error', () => undefined); // a dropped idle connection must not crash the process
    this.pools.set(slug, { pool, lastUsed: Date.now(), url });
    this.evictOverflow();
    return pool;
  }

  evict(slug: string): void {
    const hit = this.pools.get(slug);
    if (hit) void hit.pool.end().catch(() => undefined);
    this.pools.delete(slug);
  }

  size(): number {
    return this.pools.size;
  }

  private evictOverflow(): void {
    const max = this.opts.maxPools ?? 40;
    while (this.pools.size > max) {
      const oldest = [...this.pools.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (!oldest) break;
      this.evict(oldest[0]);
    }
  }

  private async sweep(): Promise<void> {
    const idle = this.opts.idleMs ?? 5 * 60_000;
    const now = Date.now();
    for (const [slug, e] of this.pools) if (now - e.lastUsed > idle) this.evict(slug);
  }

  async closeAll(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    await Promise.all([...this.pools.values()].map((e) => e.pool.end().catch(() => undefined)));
    this.pools.clear();
  }
}
