import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import type pg from 'pg';
import { migrate } from './migrate.js';

// A school's whole database as gzipped JSON, readable by any PostgreSQL: Postgres itself turns each row into JSON and back,
// so dates, numbers and JSON columns survive exactly. Provider snapshots (point-in-time recovery) come on top of this, not instead.

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

/**
 * Format 2: gzipped JSON lines. A header line, then for each table (parents first) a `#table` line and one line per row.
 * Rows go through a cursor straight into gzip, so even a school with a million rows never sits in memory whole.
 */
export async function backupDatabase(pool: pg.Pool): Promise<Buffer> {
  const client = await pool.connect();
  const gzip = createGzip();
  const out: Buffer[] = [];
  gzip.on('data', (c: Buffer) => out.push(c));
  const ended = once(gzip, 'end');
  const write = async (text: string) => { if (!gzip.write(text)) await once(gzip, 'drain'); };
  try {
    // One consistent snapshot of every table.
    await client.query('begin isolation level repeatable read read only');
    await client.query('set local statement_timeout = 0');
    await write(`${JSON.stringify({ version: 2, takenAt: new Date().toISOString(), migrations: await migrationTags(client) })}\n`);
    for (const t of await parentsFirst(client, await tables(client))) {
      await write(`#${t}\n`);
      await client.query(`declare rows no scroll cursor for select row_to_json(x)::text j from "${t}" x`);
      for (;;) {
        const { rows } = await client.query<{ j: string }>('fetch 5000 from rows');
        if (!rows.length) break;
        await write(`${rows.map((r) => r.j).join('\n')}\n`);
      }
      await client.query('close rows');
    }
    await client.query('commit');
    gzip.end();
    await ended;
    return Buffer.concat(out);
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    gzip.destroy();
    throw err;
  } finally {
    client.release();
  }
}

/** Puts a backup back over the school's current data, in one transaction: all of it or none of it. Streams, like the backup. */
export async function restoreDatabase(pool: pg.Pool, gz: Buffer): Promise<{ tables: number; rows: number }> {
  const lines = createInterface({ input: Readable.from([gz]).pipe(createGunzip()), crlfDelay: Infinity });
  const client = await pool.connect();
  let names: string[] = [];
  let table = '';
  let batch: string[] = [];
  let rows = 0;
  const flush = async () => {
    if (!batch.length) return;
    await client.query(`insert into "${table}" select * from json_populate_recordset(null::"${table}", $1::json)`, [`[${batch.join(',')}]`]);
    rows += batch.length;
    batch = [];
  };
  try {
    for await (const line of lines) {
      if (!names.length) {
        const head = JSON.parse(line) as { version: 1 | 2; migrations: string[]; tables?: Record<string, unknown[]> };
        if ((await migrationTags(client)).join() !== head.migrations.join()) throw new Error('This backup was taken on a different version of the database. Run the same migrations first.');
        await client.query('begin');
        await client.query('set local statement_timeout = 0');
        names = await tables(client);
        await client.query(`truncate ${names.map((t) => `"${t}"`).join(', ')} cascade`);
        if (head.version === 1) {
          // Format 1 (the first backups) is one JSON object holding every table.
          for (table of await parentsFirst(client, names)) {
            for (const r of head.tables?.[table] ?? []) { batch.push(JSON.stringify(r)); if (batch.length === 5000) await flush(); }
            await flush();
          }
          await flush();
          break;
        }
        continue;
      }
      if (line.startsWith('#')) {
        await flush();
        table = line.slice(1);
        if (!names.includes(table)) throw new Error(`This backup has a table the database does not: ${table}.`);
        continue;
      }
      if (line) batch.push(line);
      if (batch.length === 5000) await flush();
    }
    await flush();
    await client.query('commit');
    return { tables: names.length, rows };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    lines.close();
    client.release();
  }
}

/** The migrations a backup was taken at, from its first line. */
export async function backupMigrations(gz: Buffer): Promise<string[]> {
  const lines = createInterface({ input: Readable.from([gz]).pipe(createGunzip()), crlfDelay: Infinity });
  try {
    for await (const line of lines) return (JSON.parse(line) as { migrations: string[] }).migrations;
  } finally {
    lines.close();
  }
  throw new Error('This backup is empty.');
}

/**
 * A backup taken before later migrations, brought up to today's database version in `scratch` (an empty database): migrate it to
 * the backup's version, put the backup in, run the rest of the migrations (backfills included), and back it up again.
 * Without this, every backup older than the last deploy that added a migration could not be restored.
 */
export async function bringForward(gz: Buffer, scratch: pg.Pool, current: string[]): Promise<Buffer> {
  const tags = await backupMigrations(gz);
  if (tags.join() === current.join()) return gz;
  if (tags.length > current.length || tags.some((t, i) => current[i] !== t)) {
    throw new Error('This backup was taken on a newer or different version of the database and cannot be put back here.');
  }
  await migrate(scratch, 'school', tags.length ? { upTo: tags.at(-1) } : {});
  await restoreDatabase(scratch, gz);
  await migrate(scratch, 'school');
  return backupDatabase(scratch);
}
