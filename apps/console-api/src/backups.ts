import { Controller, Get, HttpCode, Inject, Injectable, Param, Post, type OnModuleInit } from '@nestjs/common';
import type { BackupRow, RestoreDrillRow } from '@tangent/contracts';
import { backupDatabase, backupMigrations, bringForward, loadMigrations, migrate, newId, pg, restoreDatabase, scheduleJob } from '@tangent/db';
import { ApiError, alert, notFound } from '@tangent/nest-kit';
import { Db, Me, Needs, type ConsoleUser } from './core.js';
import { ENV, type Env } from './env.js';
import { withSchoolDb } from './school-db.js';
import { PlatformHub } from './platform-hub.js';

const KEEP = 14;

/** Every live school is backed up once a day; the console can take one on demand and put one back (with a second approver). */
@Injectable()
export class Backups implements OnModuleInit {
  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly platform: PlatformHub,
  ) {}

  /**
   * Where backups are kept: Tangent's File storage connection (Integrations), so losing the registry does not lose them. On the
   * test track without a bucket that is the registry's own sandbox store.
   */
  private async files() {
    const r = await this.platform.hub.resolve('storage', null, 'tangent');
    if (!r.adapter.storage) throw new Error('The File storage connection cannot keep files.');
    return { storage: r.adapter.storage, ctx: r.ctx };
  }

  /** A backup's data: from storage, or (for backups taken before storage held them) from its row. */
  private async read(b: { data: Buffer | null; storage_key: string | null }): Promise<Buffer> {
    if (!b.storage_key) return b.data!;
    const f = await this.files();
    return f.storage.get(f.ctx, b.storage_key);
  }

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    scheduleJob(this.db.pool, 'backups', 24 * 60 * 60 * 1000, () => this.daily(), () => undefined);
    scheduleJob(this.db.pool, 'restore-drill', 7 * 24 * 60 * 60 * 1000, () => this.drill('weekly drill').then(() => undefined), () => undefined);
  }

  async daily(): Promise<void> {
    const { rows } = await this.db.pool.query<{ id: string; slug: string }>("select id, slug from schools where status = 'live' and deleted_at is null and db_url_sealed is not null");
    for (const s of rows) await this.take(s.id, 'daily', 'system').catch((err: Error) => alert(`${s.slug}: the daily backup failed: ${err.message}`));
  }

  /** An empty database on the schools' server, dropped afterwards. */
  private async scratch<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    const admin = this.env.REGISTRY_DATABASE_URL;
    const name = `tangent_scratch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const run = async (sql: string) => {
      const c = new pg.Client({ connectionString: admin });
      await c.connect();
      try { await c.query(sql); } finally { await c.end().catch(() => undefined); }
    };
    await run(`create database ${name}`);
    const u = new URL(admin);
    u.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    try {
      return await fn(pool);
    } finally {
      await pool.end().catch(() => undefined);
      await run(`drop database if exists ${name} with (force)`).catch((err: Error) => alert(`Could not drop the scratch database ${name}: ${err.message}`));
    }
  }

  /**
   * The restore drill (weekly, and on demand from Health): a fresh backup of one live school, read back from where backups are
   * kept and put into a scratch database. It proves the path a real restore takes, without touching the school.
   */
  async drill(by: string): Promise<RestoreDrillRow> {
    const school = (await this.db.pool.query<{ id: string; name: string }>(
      "select id, name from schools where status = 'live' and deleted_at is null and db_url_sealed is not null order by random() limit 1")).rows[0];
    if (!school) throw new ApiError('conflict', 'There is no live school to run a restore drill on.');
    const started = Date.now();
    let result: { tables: number; rows: number; students: number; error: string | null };
    try {
      const b = await this.take(school.id, 'manual', 'Restore drill');
      const data = await this.read((await this.db.pool.query<{ data: Buffer | null; storage_key: string | null }>('select data, storage_key from school_backups where id = $1', [b.id])).rows[0]!);
      result = await this.scratch(async (pool) => {
        await migrate(pool, 'school');
        const r = await restoreDatabase(pool, data);
        const students = Number((await pool.query<{ n: string }>('select count(*) n from students')).rows[0]?.n ?? 0);
        return { ...r, students, error: null };
      });
    } catch (err) {
      result = { tables: 0, rows: 0, students: 0, error: (err as Error).message.slice(0, 500) };
      alert(`The restore drill on ${school.name} failed: ${result.error}`);
    }
    const id = newId('drl');
    const ms = Date.now() - started;
    await this.db.pool.query('insert into restore_drills (id, school_id, school_name, ok, tables, rows, students, ms, error, by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, school.id, school.name, !result.error, result.tables, result.rows, result.students, ms, result.error, by]);
    return { id, schoolName: school.name, ok: !result.error, ...result, ms, by, at: new Date().toISOString() };
  }

  async drills(): Promise<RestoreDrillRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; school_name: string; ok: boolean; tables: number; rows: number; students: number; ms: number; error: string | null; by: string; at: Date }>(
      'select * from restore_drills order by at desc limit 10');
    return rows.map((r) => ({ id: r.id, schoolName: r.school_name, ok: r.ok, tables: r.tables, rows: r.rows, students: r.students, ms: r.ms, error: r.error, by: r.by, at: r.at.toISOString() }));
  }

  private withPool<T>(schoolId: string, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    return withSchoolDb(this.db, this.env.SECRETS_KEY, schoolId, fn);
  }

  async take(schoolId: string, kind: 'daily' | 'manual', by: string): Promise<BackupRow> {
    const data = await this.withPool(schoolId, backupDatabase);
    const id = newId('bak');
    const key = `backups/${schoolId}/${id}.jsonl.gz`;
    const f = await this.files();
    await f.storage.put(f.ctx, key, data, 'application/gzip');
    await this.db.pool.query('insert into school_backups (id, school_id, kind, taken_by, bytes, data, storage_key) values ($1,$2,$3,$4,$5,null,$6)', [id, schoolId, kind, by, data.length, key]);
    const old = await this.db.pool.query<{ id: string; storage_key: string | null }>(
      'delete from school_backups where school_id = $1 and id not in (select id from school_backups where school_id = $1 order by taken_at desc limit $2) returning id, storage_key', [schoolId, KEEP]);
    for (const o of old.rows) if (o.storage_key) await f.storage.remove(f.ctx, o.storage_key).catch(() => undefined);
    return (await this.list(schoolId)).find((b) => b.id === id)!;
  }

  async list(schoolId: string): Promise<BackupRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; kind: BackupRow['kind']; taken_by: string; bytes: number; taken_at: Date }>(
      'select id, kind, taken_by, bytes, taken_at from school_backups where school_id = $1 order by taken_at desc', [schoolId]);
    return rows.map((r) => ({ id: r.id, kind: r.kind, takenBy: r.taken_by, bytes: r.bytes, takenAt: r.taken_at.toISOString() }));
  }

  /** Takes a fresh backup first, so even a restore can be undone. */
  async restore(schoolId: string, backupId: string, by: string): Promise<string> {
    const b = (await this.db.pool.query<{ data: Buffer | null; storage_key: string | null; taken_at: Date }>('select data, storage_key, taken_at from school_backups where id = $1 and school_id = $2', [backupId, schoolId])).rows[0];
    if (!b) throw notFound('That backup');
    const raw = await this.read(b);
    // A backup from before the last deploy that added a migration is brought forward first.
    const current = (await loadMigrations('school')).map((m) => m.tag);
    const data = (await backupMigrations(raw)).join() === current.join() ? raw : await this.scratch((pool) => bringForward(raw, pool, current));
    await this.take(schoolId, 'manual', `${by} (before restoring)`);
    const r = await this.withPool(schoolId, (pool) => restoreDatabase(pool, data));
    return `Restored ${r.rows} rows in ${r.tables} tables from the backup of ${b.taken_at.toISOString().slice(0, 16).replace('T', ' ')} UTC. A backup of the data just before is kept.`;
  }
}

@Controller('console/v1/schools')
export class BackupsController {
  constructor(private readonly backups: Backups) {}

  @Get(':id/backups') @Needs('schools.read')
  list(@Param('id') id: string): Promise<BackupRow[]> {
    return this.backups.list(id);
  }
}

@Controller('console/v1/health/restore-drills')
export class DrillsController {
  constructor(private readonly backups: Backups) {}

  @Get() @Needs('schools.read')
  list(): Promise<RestoreDrillRow[]> {
    return this.backups.drills();
  }

  @Post() @HttpCode(200) @Needs('schools.write')
  run(@Me() user: ConsoleUser): Promise<RestoreDrillRow> {
    return this.backups.drill(user.email);
  }
}
