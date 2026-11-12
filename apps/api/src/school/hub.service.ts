import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { istToday } from '@gradeon/contracts';
import { enqueue, scheduleJob, work, type Job } from '@gradeon/db';
import { Hub } from '@gradeon/integrations';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import type { Pool } from 'pg';
import { ENV, type Env } from '../env.js';
import { POOLS, REGISTRY } from '../tenancy/tenant.js';

/** The Integrations Hub for the school API: messages, files, payments and maps all go through it. */
@Injectable()
export class HubService implements OnModuleInit, OnApplicationShutdown {
  readonly hub: Hub;
  private readonly log = new Logger('Worker');
  private timer?: NodeJS.Timeout;
  private busy = false;
  /** Job handlers by kind, registered by the services that own them (fees, files, payments, year-end). */
  private readonly handlers = new Map<string, (job: Job) => Promise<string | void>>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
  ) {
    this.hub = new Hub({
      pool: registry.pool, secretsKey: env.SECRETS_KEY, baseUrl: env.API_BASE_URL.replace(/\/$/, ''),
      pushTokens: (slug, to) => this.tokens(slug, to),
      forgetTokens: (slug, tokens) => this.forget(slug, tokens),
    });
  }

  handle(kind: string, fn: (job: Job) => Promise<string | void>): void {
    this.handlers.set(kind, fn);
  }

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    // Every 20 seconds: due messages, then due jobs. Both claim with SKIP LOCKED, so any number of servers can run this.
    this.timer = setInterval(() => void this.tick(), 20_000);
    this.timer.unref();
    // Once an hour (on one server): today's per-school jobs, queued once per school and day however often this runs.
    scheduleJob(this.registry.pool as never, 'school-daily-jobs', 60 * 60_000, () => this.queueDaily(), () => undefined);
  }

  /** Reminders, late fines and reconciliation for every live school, run from 09:00 India time. */
  async queueDaily(today = istToday()): Promise<number> {
    const runAt = new Date(Math.max(Date.now(), Date.parse(`${today}T09:00:00+05:30`)));
    let n = 0;
    for (const id of await this.liveSchools()) {
      for (const kind of ['fees.reminders', 'fees.lateFines', 'payments.reconcile'] as const) {
        if (await enqueue(this.registry.pool as never, kind, id, { day: today }, runAt)) n++;
      }
    }
    return n;
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.hub.dispatch();
      await work(this.registry.pool as never, (job) => this.run(job));
    } catch (e) {
      this.log.error(`worker: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async run(job: Job): Promise<string | void> {
    const fn = this.handlers.get(job.kind);
    if (!fn) throw new Error(`Nothing handles ${job.kind} jobs.`);
    return fn(job);
  }

  /** A school's database, for work that runs outside a request. */
  async schoolPool(slugOrId: string): Promise<{ pool: Pool; slug: string; id: string } | null> {
    const { rows } = await this.registry.pool.query<{ slug: string; id: string }>('select slug, id from schools where (id = $1 or slug = $1) and deleted_at is null', [slugOrId]);
    if (!rows[0]) return null;
    const info = await this.registry.school(rows[0].slug);
    return info ? { pool: this.pools.get(info.slug, info.dbUrl), slug: info.slug, id: info.id } : null;
  }

  async liveSchools(): Promise<string[]> {
    const { rows } = await this.registry.pool.query<{ id: string }>("select id from schools where deleted_at is null and status = 'live'");
    return rows.map((r) => r.id);
  }

  private async tokens(slug: string, to: string): Promise<string[]> {
    const s = await this.schoolPool(slug);
    if (!s) return [];
    const { rows } = await s.pool.query<{ token: string }>(
      "select d.token from devices d join users u on u.id = d.user_id where right(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g'), 10) = right(regexp_replace($1, '\\D', '', 'g'), 10) or lower(u.email) = lower($1)",
      [to]);
    return rows.map((r) => r.token);
  }

  private async forget(slug: string, tokens: string[]): Promise<void> {
    const s = await this.schoolPool(slug);
    await s?.pool.query('delete from devices where token = any($1)', [tokens]);
  }
}
