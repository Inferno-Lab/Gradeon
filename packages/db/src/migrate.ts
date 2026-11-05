import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

export type MigrationSet = 'school' | 'registry';
export type MigrationKind = 'expand' | 'backfill' | 'contract';

export interface MigrationFile {
  tag: string;
  kind: MigrationKind;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  tag: string;
  kind: MigrationKind;
  ms: number;
}

const DIRS: Record<MigrationSet, URL> = {
  school: new URL('../migrations/school/', import.meta.url),
  registry: new URL('../migrations/registry/', import.meta.url),
};

/** Reads the reviewed SQL files. The first line must say `-- kind: expand|backfill|contract` (section 12.5). */
export async function loadMigrations(set: MigrationSet): Promise<MigrationFile[]> {
  const dir = fileURLToPath(DIRS[set]);
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const name of names) {
    const sql = await readFile(dir + name, 'utf8');
    const m = /^-- kind: (expand|backfill|contract)\s*$/m.exec(sql.split('\n', 3).join('\n'));
    if (!m) throw new Error(`Migration ${name} has no “-- kind:” header.`);
    out.push({
      tag: name.replace(/\.sql$/, ''),
      kind: m[1] as MigrationKind,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16),
    });
  }
  return out;
}

// One lock per database, taken inside each migration's transaction (works through a transaction pooler), so two runners never migrate a school together.
const LOCK_KEY = 727_001;

async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(`create table if not exists schema_migrations (
    tag text primary key, kind text not null, checksum text not null, applied_at timestamptz not null default now(), ms integer not null default 0)`);
}

export async function appliedTags(pool: Pool): Promise<Set<string>> {
  await ensureTable(pool);
  const { rows } = await pool.query<{ tag: string }>('select tag from schema_migrations');
  return new Set(rows.map((r) => r.tag));
}

export async function pendingMigrations(pool: Pool, set: MigrationSet): Promise<MigrationFile[]> {
  const done = await appliedTags(pool);
  return (await loadMigrations(set)).filter((m) => !done.has(m.tag));
}

/**
 * Applies every pending migration in order, each in its own transaction. A failure stops the run and leaves
 * earlier migrations applied. Returns what ran. `only` limits the run to migrations up to and including a tag.
 */
export async function migrate(pool: Pool, set: MigrationSet, opts: { upTo?: string } = {}): Promise<AppliedMigration[]> {
  await ensureTable(pool);
  const client = await pool.connect();
  const applied: AppliedMigration[] = [];
  try {
    for (const m of await loadMigrations(set)) {
      const started = Date.now();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
        // Read under the lock: another runner may have just applied it.
        const was = (await client.query<{ checksum: string }>('select checksum from schema_migrations where tag = $1', [m.tag])).rows[0]?.checksum;
        if (was !== undefined) {
          await client.query('commit');
          if (was !== m.checksum) throw new Error(`Migration ${m.tag} was changed after it ran. Add a new migration instead.`);
          if (opts.upTo === m.tag) break;
          continue;
        }
        // Databases default to a 15 s statement limit (0007); a migration may legitimately take longer.
        await client.query('set local statement_timeout = 0');
        await client.query(m.sql);
        const ms = Date.now() - started;
        await client.query('insert into schema_migrations (tag, kind, checksum, ms) values ($1,$2,$3,$4)', [m.tag, m.kind, m.checksum, ms]);
        await client.query('commit');
        applied.push({ tag: m.tag, kind: m.kind, ms });
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        if ((err as Error).message.includes('was changed after it ran')) throw err;
        throw new Error(`Migration ${m.tag} failed: ${(err as Error).message}`);
      }
      if (opts.upTo === m.tag) break;
    }
  } finally {
    client.release();
  }
  return applied;
}
