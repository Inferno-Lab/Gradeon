import { gunzipSync, gzipSync } from 'node:zlib';
import type pg from 'pg';

// A school's whole database as gzipped JSON, readable by any PostgreSQL: Postgres itself turns each row into JSON and back,
// so dates, numbers and JSON columns survive exactly. Provider snapshots (point-in-time recovery) come on top of this, not instead.

interface Dump { version: 1; takenAt: string; migrations: string[]; tables: Record<string, unknown[]> }

async function tables(pool: pg.Pool | pg.PoolClient): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations' order by table_name");
  return rows.map((r) => r.table_name);
}

/** Parents before children, so every row's foreign keys already exist when it is put back. */
async function parentsFirst(client: pg.PoolClient, names: string[]): Promise<string[]> {
  const { rows } = await client.query<{ child: string; parent: string }>(
    "select conrelid::regclass::text child, confrelid::regclass::text parent from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace");
  const out: string[] = [];
  const visit = (t: string, path: Set<string>) => {
    if (out.includes(t) || path.has(t)) return;
    path.add(t);
    for (const r of rows) if (r.child.replace(/"/g, '') === t && r.parent.replace(/"/g, '') !== t) visit(r.parent.replace(/"/g, ''), path);
    out.push(t);
  };
  for (const t of names) visit(t, new Set());
  return out.filter((t) => names.includes(t));
}

async function migrationTags(pool: pg.Pool | pg.PoolClient): Promise<string[]> {
  return (await pool.query<{ tag: string }>('select tag from schema_migrations order by tag')).rows.map((r) => r.tag);
}

export async function backupDatabase(pool: pg.Pool): Promise<Buffer> {
  const client = await pool.connect();
  try {
    // One consistent snapshot of every table.
    await client.query('begin isolation level repeatable read read only');
    const dump: Dump = { version: 1, takenAt: new Date().toISOString(), migrations: await migrationTags(client), tables: {} };
    for (const t of await tables(client)) {
      dump.tables[t] = (await client.query<{ j: unknown }>(`select row_to_json(x) j from "${t}" x`)).rows.map((r) => r.j);
    }
    await client.query('commit');
    return gzipSync(JSON.stringify(dump));
  } finally {
    client.release();
  }
}

/** Puts a backup back over the school's current data, in one transaction: all of it or none of it. */
export async function restoreDatabase(pool: pg.Pool, gz: Buffer): Promise<{ tables: number; rows: number }> {
  const dump = JSON.parse(gunzipSync(gz).toString('utf8')) as Dump;
  const client = await pool.connect();
  try {
    const now = await migrationTags(client);
    if (now.join() !== dump.migrations.join()) throw new Error('This backup was taken on a different version of the database. Run the same migrations first.');
    await client.query('begin');
    const names = await tables(client);
    await client.query(`truncate ${names.map((t) => `"${t}"`).join(', ')} cascade`);
    let rows = 0;
    for (const t of await parentsFirst(client, names)) {
      const all = dump.tables[t] ?? [];
      for (let i = 0; i < all.length; i += 5000) {
        await client.query(`insert into "${t}" select * from json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(all.slice(i, i + 5000))]);
      }
      rows += all.length;
    }
    await client.query('commit');
    return { tables: names.length, rows };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
