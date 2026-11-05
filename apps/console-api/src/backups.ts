import { Controller, Get, Inject, Injectable, Param, type OnModuleInit } from '@nestjs/common';
import type { BackupRow } from '@gradeon/contracts';
import { backupDatabase, migrate, newId, pg, restoreDatabase, scheduleJob } from '@gradeon/db';
import { notFound } from '@gradeon/nest-kit';
import { Db, Needs } from './core.js';
import { ENV, type Env } from './env.js';
import { withSchoolDb } from './school-db.js';

const KEEP = 14;

/** Every live school is backed up once a day; the console can take one on demand and put one back (with a second approver). */
@Injectable()
export class Backups implements OnModuleInit {
  /** Where backups are kept: a separate database when BACKUP_DATABASE_URL is set, so losing the registry does not lose them too. */
  private readonly store: pg.Pool;

  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.store = env.BACKUP_DATABASE_URL ? new pg.Pool({ connectionString: env.BACKUP_DATABASE_URL, max: 2 }) : db.pool;
  }

  async onModuleInit(): Promise<void> {
    // ponytail: the backup database takes the whole registry set and uses one table; give it its own set if it grows.
    if (this.store !== this.db.pool) await migrate(this.store, 'registry');
    if (this.env.NODE_ENV === 'test') return;
    scheduleJob(this.db.pool, 'backups', 24 * 60 * 60 * 1000, () => this.daily(), () => undefined);
  }

  async daily(): Promise<void> {
    const { rows } = await this.db.pool.query<{ id: string }>("select id from schools where status = 'live' and deleted_at is null and db_url_sealed is not null");
    for (const s of rows) await this.take(s.id, 'daily', 'system').catch(() => undefined);
  }

  private withPool<T>(schoolId: string, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    return withSchoolDb(this.db, this.env.SECRETS_KEY, schoolId, fn);
  }

  async take(schoolId: string, kind: 'daily' | 'manual', by: string): Promise<BackupRow> {
    const data = await this.withPool(schoolId, backupDatabase);
    const id = newId('bak');
    await this.store.query('insert into school_backups (id, school_id, kind, taken_by, bytes, data) values ($1,$2,$3,$4,$5,$6)', [id, schoolId, kind, by, data.length, data]);
    await this.store.query(
      'delete from school_backups where school_id = $1 and id not in (select id from school_backups where school_id = $1 order by taken_at desc limit $2)', [schoolId, KEEP]);
    return (await this.list(schoolId)).find((b) => b.id === id)!;
  }

  async list(schoolId: string): Promise<BackupRow[]> {
    const { rows } = await this.store.query<{ id: string; kind: BackupRow['kind']; taken_by: string; bytes: number; taken_at: Date }>(
      'select id, kind, taken_by, bytes, taken_at from school_backups where school_id = $1 order by taken_at desc', [schoolId]);
    return rows.map((r) => ({ id: r.id, kind: r.kind, takenBy: r.taken_by, bytes: r.bytes, takenAt: r.taken_at.toISOString() }));
  }

  /** Takes a fresh backup first, so even a restore can be undone. */
  async restore(schoolId: string, backupId: string, by: string): Promise<string> {
    const b = (await this.store.query<{ data: Buffer; taken_at: Date }>('select data, taken_at from school_backups where id = $1 and school_id = $2', [backupId, schoolId])).rows[0];
    if (!b) throw notFound('That backup');
    await this.take(schoolId, 'manual', `${by} (before restoring)`);
    const r = await this.withPool(schoolId, (pool) => restoreDatabase(pool, b.data));
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
