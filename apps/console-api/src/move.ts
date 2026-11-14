import { backupDatabase, migrate, pg, restoreDatabase } from '@tangent/db';
import { randomToken, seal, unseal } from '@tangent/security';
import { TENANT_CACHE_MS } from '@tangent/tenancy';
import type { Db } from './core.js';
import type { Env } from './env.js';
import type { PlatformHub } from './platform-hub.js';
import { adminQuery, createOnServer, dbName } from './provisioning/drivers.js';

interface School { id: string; slug: string; name: string; cell: string; target: string; dbUrlSealed: string | null; dbName: string | null }
interface Where { connection_id: string | null }

/** Every table's row count, to check a copy against what it was copied from. */
async function counts(pool: pg.Pool): Promise<Map<string, number>> {
  const t = await pool.query<{ t: string }>("select table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1");
  const m = new Map<string, number>();
  for (const { t: name } of t.rows) m.set(name, Number((await pool.query<{ n: string }>(`select count(*) n from "${name}"`)).rows[0]!.n));
  return m;
}

/** A database on a cell: through the cell's School databases connection, or on the registry's own server for a cell without one. */
async function create(hub: PlatformHub, env: Env, cell: Where, name: string): Promise<{ url: string; name: string }> {
  if (cell.connection_id) {
    const { adapter, ctx } = await hub.hub.use(cell.connection_id);
    const r = await adapter.databases!.create(ctx, name, randomToken(18).replace(/[^a-zA-Z0-9]/g, 'x'));
    return { url: r.url, name: r.dbName };
  }
  return createOnServer(() => undefined, env.REGISTRY_DATABASE_URL, name);
}

async function drop(hub: PlatformHub, env: Env, cell: Where, name: string): Promise<void> {
  if (cell.connection_id) {
    const { adapter, ctx } = await hub.hub.use(cell.connection_id);
    await adapter.databases!.drop(ctx, name);
    return;
  }
  await adminQuery(env.REGISTRY_DATABASE_URL, async (c) => {
    await c.query(`drop database if exists "${name}" with (force)`);
    await c.query(`drop role if exists "${name}_app"`).catch(() => undefined);
  });
}

/**
 * Moves a school to another cell. Cells that reach the same database server (the same School databases connection, or none) only
 * change the record. Otherwise the school's database is copied: the school is closed for writes ("moving"), a backup is taken,
 * a new database is made on the target cell, migrated and filled, every table's row count is checked against the old one, and
 * only then does the school switch to it. A failed check opens the old database again and leaves the school where it was.
 */
export async function moveSchool(o: { db: Db; env: Env; hub: PlatformHub; school: School; to: string; backup: () => Promise<unknown>; log: (text: string) => void }): Promise<string> {
  const { db, env, hub, school, to } = o;
  const cells = (await db.pool.query<Where & { key: string; region: string; target: string }>('select key, connection_id, region, target from cells where key = any($1)', [[school.cell, to]])).rows;
  const from = cells.find((c) => c.key === school.cell) ?? { connection_id: null };
  const target = cells.find((c) => c.key === to)!;
  if ((from.connection_id ?? null) === (target.connection_id ?? null)) {
    await db.pool.query('update schools set cell = $2, region = $3, target = $4, config_version = config_version + 1 where id = $1', [school.id, to, target.region, target.target]);
    return `${school.name} now runs in ${to}. Both cells use the same database server, so its data did not need copying.`;
  }
  if (!school.dbUrlSealed) throw new Error('This school has no database yet.');
  const oldUrl = unseal(school.dbUrlSealed, env.SECRETS_KEY);
  const oldName = school.dbName ?? dbName(school.slug);
  // A new name, so the copy can never be the database it is copied from (two cells may share a physical server).
  const newName = `${dbName(school.slug)}_${Date.now().toString(36)}`.slice(0, 63);
  const old = new pg.Pool({ connectionString: oldUrl, max: 2 });
  let made: { url: string; name: string } | null = null;
  let switched = false;
  const reopen = () => old.query(`alter database "${oldName}" reset default_transaction_read_only`).catch(() => undefined);
  try {
    // Close the school for writes: families and staff see "moving", and sessions already open are ended.
    await db.pool.query("update schools set status = 'moving' where id = $1", [school.id]);
    await old.query(`alter database "${oldName}" set default_transaction_read_only = on`);
    await old.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()').catch(() => undefined);
    o.log('closed for writes');
    await o.backup();
    o.log('backed up');
    const data = await backupDatabase(old);
    made = await create(hub, env, target, newName);
    const fresh = new pg.Pool({ connectionString: made.url, max: 2 });
    try {
      await migrate(fresh, 'school');
      await restoreDatabase(fresh, data);
      const [a, b] = await Promise.all([counts(old), counts(fresh)]);
      const off = [...a].filter(([t, n]) => b.get(t) !== n).map(([t, n]) => `${t} (${n} there, ${b.get(t) ?? 'missing'} here)`);
      if (off.length) throw new Error(`The copy does not match: ${off.slice(0, 5).join(', ')}.`);
      o.log(`copied and checked ${a.size} tables`);
    } finally {
      await fresh.end();
    }
    await db.pool.query("update schools set db_url_sealed = $2, db_name = $3, cell = $4, region = $5, target = $6, status = 'live', config_version = config_version + 1 where id = $1",
      [school.id, seal(made.url, env.SECRETS_KEY), made.name, to, target.region, target.target]);
    switched = true;
  } catch (err) {
    if (!switched) {
      await reopen();
      await db.pool.query("update schools set status = 'live' where id = $1", [school.id]);
      if (made) await drop(hub, env, target, made.name).catch(() => undefined);
    }
    throw err;
  } finally {
    await old.end();
  }
  // Servers keep a school's address for a few seconds; the old database goes once none can still be using it.
  await new Promise((r) => setTimeout(r, TENANT_CACHE_MS + 1000));
  await drop(hub, env, from, oldName).catch((e: Error) => o.log(`the old database could not be removed: ${e.message}`));
  return `${school.name} now runs in ${to}: its data was copied to ${made!.name} and every table checked. The old database was removed after a backup.`;
}
