import { Body, Controller, Get, HttpCode, Inject, Injectable, Logger, Param, Post, type OnApplicationBootstrap } from '@nestjs/common';
import { POOLS, REGISTRY } from './tokens.js';
import type { MigrationRow, PolicyDoc, ReleaseRow } from '@gradeon/contracts';
import { loadMigrations, migrate, newId, pg } from '@gradeon/db';
import { ApiError, notFound } from '@gradeon/nest-kit';
import { unseal } from '@gradeon/security';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import { Actions } from './actions.js';
import { Db, Me, Needs, type ConsoleUser, type reg } from './core.js';
import { ENV, type Env } from './env.js';
import { Policy } from './policy.js';

type ReleaseRecord = typeof reg.releases.$inferSelect;
type SchoolRecord = typeof reg.schools.$inferSelect;
type Wave = ReleaseRow['waves'][number];

@Injectable()
export class Releases implements OnApplicationBootstrap {
  private readonly log = new Logger('Releases');
  private readonly running = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly policy: Policy,
    private readonly actions: Actions,
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** A release that was rolling when the server stopped carries on from where it was. */
  async onApplicationBootstrap(): Promise<void> {
    const { rows } = await this.db.pool.query<{ id: string }>("select id from releases where status = 'rolling'");
    for (const r of rows) void this.drive(r.id);
  }

  private row(r: ReleaseRecord): ReleaseRow {
    return { id: r.id, version: r.version, notes: r.notes, status: r.status as ReleaseRow['status'], createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), waves: r.waves as Wave[], haltReason: r.haltReason };
  }

  async list(): Promise<ReleaseRow[]> {
    const { rows } = await this.db.query<ReleaseRecord>('select * from releases order by created_at desc limit 20');
    return rows.map((r) => this.row(r));
  }

  async current(): Promise<ReleaseRow | null> {
    const { rows } = await this.db.query<ReleaseRecord>("select * from releases where status in ('rolling','paused','halted') order by created_at desc limit 1");
    return rows[0] ? this.row(rows[0]) : null;
  }

  /** What the fleet board shows: the release in flight, or else the last one that was started. */
  async latest(): Promise<ReleaseRow | null> {
    const { rows } = await this.db.query<ReleaseRecord>("select * from releases where status <> 'draft' order by (status in ('rolling','paused','halted')) desc, created_at desc limit 1");
    return rows[0] ? this.row(rows[0]) : null;
  }

  async get(id: string): Promise<ReleaseRow> {
    const { rows } = await this.db.query<ReleaseRecord>('select * from releases where id = $1', [id]);
    if (!rows[0]) throw notFound('That release');
    return this.row(rows[0]);
  }

  async create(user: string, version: string, notes: string): Promise<ReleaseRow> {
    if (!/^\d{4}\.\d{1,2}\.\d{1,3}$/.test(version)) throw new ApiError('validation', 'Name the release like 2026.10.3.', { fields: { version: 'Use year.month.number, like 2026.10.3.' } });
    const dupe = await this.db.pool.query('select 1 from releases where version = $1', [version]);
    if (dupe.rowCount) throw new ApiError('conflict', `Release ${version} already exists.`);
    const id = newId('rel');
    await this.db.pool.query("insert into releases (id, version, notes, status, waves, created_by) values ($1,$2,$3,'draft','[]',$4)", [id, version, notes, user]);
    await this.db.audit(user, 'release.created', 'release', id, { version });
    return this.get(id);
  }

  /** Splits the live schools into waves by the policy: internal, then pilot, then everyone else in batches. */
  private plan(schools: SchoolRecord[], pol: PolicyDoc): Wave[] {
    const waves: Wave[] = [];
    for (const w of pol.waves) {
      const pool = schools.filter((s) => s.ring === w.matches);
      if (!pool.length) continue;
      for (let i = 0; i < pool.length; i += w.batch) {
        const part = pool.slice(i, i + w.batch);
        waves.push({ name: pool.length > w.batch ? `${w.name} ${i / w.batch + 1}` : w.name, status: 'pending', schools: part.map((s) => ({ id: s.id, name: s.name, state: 'pending' as const, prev: s.apiVersion })) });
      }
    }
    return waves;
  }

  async start(user: string, id: string): Promise<ReleaseRow> {
    const rel = await this.get(id);
    if (rel.status !== 'draft') throw new ApiError('conflict', 'This release has already been started.');
    const pol = await this.policy.get();
    if (pol.freeze) throw new ApiError('locked', 'Changes are frozen. A super admin can lift the freeze under Policy.');
    const other = await this.current();
    if (other) throw new ApiError('conflict', `Release ${other.version} is still ${other.status}. Finish or roll it back first.`);
    const { rows } = await this.db.query<SchoolRecord>("select * from schools where status = 'live' and deleted_at is null order by created_at");
    const waves = this.plan(rows, pol);
    if (!waves.length) throw new ApiError('conflict', 'There are no live schools to release to.');
    await this.db.pool.query("update releases set status = 'rolling', waves = $2 where id = $1", [id, JSON.stringify(waves)]);
    await this.db.audit(user, 'release.started', 'release', id, { version: rel.version, waves: waves.length });
    void this.drive(id);
    return this.get(id);
  }

  async pause(user: string, id: string, paused: boolean): Promise<ReleaseRow> {
    const rel = await this.get(id);
    if (paused && rel.status !== 'rolling') throw new ApiError('conflict', 'Only a rolling release can be paused.');
    if (!paused && rel.status !== 'paused') throw new ApiError('conflict', 'This release is not paused.');
    await this.db.pool.query('update releases set status = $2 where id = $1', [id, paused ? 'paused' : 'rolling']);
    await this.db.audit(user, paused ? 'release.paused' : 'release.resumed', 'release', id);
    if (!paused) void this.drive(id);
    return this.get(id);
  }

  async rollback(user: string, id: string): Promise<ReleaseRow> {
    const rel = await this.get(id);
    if (!['rolling', 'paused', 'halted', 'done'].includes(rel.status)) throw new ApiError('conflict', 'There is nothing to roll back.');
    await this.db.pool.query("update releases set status = 'paused' where id = $1 and status = 'rolling'", [id]);
    for (const w of rel.waves) for (const s of w.schools) if (s.state === 'done' || s.state === 'rolling') await this.revert(s.id, s.prev ?? '0.0.0');
    const waves = rel.waves.map((w) => ({ ...w, status: w.status === 'pending' ? 'pending' : 'halted', schools: w.schools.map((s) => (s.state === 'done' || s.state === 'rolling' ? { ...s, state: 'rolled_back' as const } : s)) }));
    await this.db.pool.query("update releases set status = 'rolled_back', waves = $2 where id = $1", [id, JSON.stringify(waves)]);
    await this.db.audit(user, 'release.rolled_back', 'release', id, { version: rel.version });
    return this.get(id);
  }

  private async revert(schoolId: string, prev: string): Promise<void> {
    await this.db.pool.query('update schools set api_version = $2, admin_version = $2 where id = $1', [schoolId, prev]);
  }

  /** Moves the release along one school at a time, saving after each, and stops by itself if a gate fails. */
  private async drive(id: string): Promise<void> {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      for (;;) {
        const rel = await this.get(id);
        if (rel.status !== 'rolling') return;
        const wave = rel.waves.find((w) => w.status !== 'done');
        if (!wave) {
          await this.db.pool.query("update releases set status = 'done' where id = $1", [id]);
          await this.db.audit('system', 'release.done', 'release', id, { version: rel.version });
          return;
        }
        wave.status = 'rolling';
        const next = wave.schools.find((s) => s.state === 'pending' || s.state === 'rolling');
        if (!next) {
          wave.status = 'done';
          await this.save(id, rel.waves);
          continue;
        }
        next.state = 'rolling';
        await this.save(id, rel.waves);
        const problem = await this.apply(next.id, rel.version);
        const fresh = await this.get(id);
        if (fresh.status !== 'rolling') return; // paused or rolled back while we worked
        const w2 = fresh.waves.find((w) => w.name === wave.name)!;
        const s2 = w2.schools.find((s) => s.id === next.id)!;
        if (problem) {
          s2.state = 'failed';
          w2.status = 'halted';
          await this.revertWave(w2);
          await this.db.pool.query("update releases set status = 'halted', halt_reason = $2, waves = $3 where id = $1", [id, `${s2.name}: ${problem}. Wave “${w2.name}” was rolled back.`, JSON.stringify(fresh.waves)]);
          await this.db.audit('system', 'release.halted', 'release', id, { school: s2.name, problem });
          return;
        }
        s2.state = 'done';
        if (w2.schools.every((s) => s.state === 'done')) w2.status = 'done';
        await this.save(id, fresh.waves);
        if (this.env.STEP_PAUSE_MS) await new Promise((ok) => setTimeout(ok, this.env.STEP_PAUSE_MS));
      }
    } catch (err) {
      // Anything unexpected stops the release visibly instead of leaving it "rolling" forever.
      this.log.error(`release ${id}: ${(err as Error).message}`);
      await this.db.pool.query("update releases set status = 'halted', halt_reason = $2 where id = $1 and status = 'rolling'", [id, `Stopped by an unexpected error: ${(err as Error).message.slice(0, 160)}`]);
    } finally {
      this.running.delete(id);
    }
  }

  private async revertWave(w: Wave): Promise<void> {
    for (const s of w.schools) {
      if (s.state === 'done' || s.state === 'rolling' || s.state === 'failed') {
        await this.revert(s.id, s.prev ?? '0.0.0');
        if (s.state !== 'failed') s.state = 'rolled_back';
      }
    }
  }

  private async save(id: string, waves: Wave[]): Promise<void> {
    await this.db.pool.query('update releases set waves = $2 where id = $1', [id, JSON.stringify(waves)]);
  }

  /** Migrates the school, moves its version, then checks it is healthy. Returns what went wrong, or null. */
  private async apply(schoolId: string, version: string): Promise<string | null> {
    const { rows } = await this.db.query<SchoolRecord>('select * from schools where id = $1', [schoolId]);
    const s = rows[0];
    if (!s?.dbUrlSealed) return 'it has no database';
    let url: string;
    try {
      url = unseal(s.dbUrlSealed, this.env.SECRETS_KEY);
    } catch {
      return 'its database connection cannot be read';
    }
    const pool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 10_000 });
    try {
      const started = Date.now();
      try {
        const applied = await migrate(pool, 'school');
        for (const m of applied) await this.actions.recordMigration(m.tag, m.kind, s.id, 'applied', m.ms, null);
      } catch (err) {
        const msg = (err as Error).message;
        await this.actions.recordMigration('release', 'expand', s.id, 'failed', Date.now() - started, msg);
        return `the migration failed (${msg.slice(0, 120)})`;
      }
      await this.db.pool.query('update schools set api_version = $2, admin_version = $2, config_version = config_version + 1 where id = $1', [s.id, version]);
      this.registry.invalidate(s.slug);
      const t = Date.now();
      await pool.query('select 1');
      const ms = Date.now() - t;
      const pol = await this.policy.get();
      if (ms > pol.halt.p95Ms) return `the health check took ${ms} ms, over the ${pol.halt.p95Ms} ms limit`;
      const m = await this.db.pool.query<{ requests: string; errors: string }>("select coalesce(sum(requests),0) requests, coalesce(sum(errors),0) errors from metrics_minute where school_slug = $1 and at >= now() - interval '5 minutes'", [s.slug]);
      const req = Number(m.rows[0]!.requests);
      if (req >= 20 && (Number(m.rows[0]!.errors) / req) * 100 > pol.halt.errorRatePct) return `its error rate is above ${pol.halt.errorRatePct}%`;
      return null;
    } catch (err) {
      return (err as Error).message.slice(0, 160);
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  /** For each migration: which schools have it, which do not, and how long it took where it ran. */
  async migrations(): Promise<MigrationRow[]> {
    const files = await loadMigrations('school');
    const { rows: schools } = await this.db.query<SchoolRecord>("select * from schools where deleted_at is null and db_url_sealed is not null and status <> 'onboarding' order by name");
    const history = await this.db.pool.query<{ tag: string; school_id: string; state: string; ms: number | null; error: string | null }>('select tag, school_id, state, ms, error from migration_runs');
    const applied = new Map<string, Map<string, number>>();
    await Promise.all(schools.map(async (s) => {
      try {
        const pool = this.pools.get(s.slug, unseal(s.dbUrlSealed!, this.env.SECRETS_KEY));
        const { rows } = await pool.query<{ tag: string; ms: number }>('select tag, ms from schema_migrations');
        applied.set(s.id, new Map(rows.map((r) => [r.tag, r.ms])));
      } catch { applied.set(s.id, new Map()); }
    }));
    return files.map((f) => ({
      tag: f.tag, kind: f.kind,
      schools: schools.map((s) => {
        const ms = applied.get(s.id)?.get(f.tag);
        const failed = history.rows.find((h) => h.tag === f.tag && h.school_id === s.id && h.state === 'failed');
        return { id: s.id, name: s.name, state: ms !== undefined ? ('applied' as const) : failed ? ('failed' as const) : ('pending' as const), ms: ms ?? failed?.ms ?? null, error: ms !== undefined ? null : (failed?.error ?? null) };
      }),
    }));
  }
}

@Controller('console/v1')
export class ReleasesController {
  constructor(private readonly releases: Releases) {}

  @Get('releases') @Needs('schools.read')
  list(): Promise<ReleaseRow[]> {
    return this.releases.list();
  }

  @Post('releases') @HttpCode(200) @Needs('releases.write')
  create(@Me() me: ConsoleUser, @Body() body: { version: string; notes?: string }): Promise<ReleaseRow> {
    return this.releases.create(me.email, String(body?.version ?? ''), body?.notes ?? '');
  }

  @Post('releases/:id/start') @HttpCode(200) @Needs('releases.write')
  start(@Me() me: ConsoleUser, @Param('id') id: string): Promise<ReleaseRow> {
    return this.releases.start(me.email, id);
  }

  @Post('releases/:id/pause') @HttpCode(200) @Needs('releases.write')
  pause(@Me() me: ConsoleUser, @Param('id') id: string, @Body() body: { paused?: boolean }): Promise<ReleaseRow> {
    return this.releases.pause(me.email, id, body?.paused !== false);
  }

  @Post('releases/:id/rollback') @HttpCode(200) @Needs('releases.write')
  rollback(@Me() me: ConsoleUser, @Param('id') id: string): Promise<ReleaseRow> {
    return this.releases.rollback(me.email, id);
  }

  @Get('migrations') @Needs('schools.read')
  migrations(): Promise<MigrationRow[]> {
    return this.releases.migrations();
  }
}
