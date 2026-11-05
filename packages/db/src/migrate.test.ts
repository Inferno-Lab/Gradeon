import { gzipSync } from 'node:zlib';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureDatabase, startDevPostgres, type DevPostgres } from './dev.js';
import { loadMigrations, migrate, pendingMigrations } from './migrate.js';
import { backupDatabase, restoreDatabase } from './backup.js';
import { runIfDue } from './jobs.js';

let server: DevPostgres;
beforeAll(async () => {
  server = await startDevPostgres({ dataDir: path.join(mkdtempSync(path.join(tmpdir(), 'gradeon-pg-')), 'data'), fresh: true });
}, 120_000);
afterAll(async () => { await server?.stop(); });

describe('migrations', () => {
  it('every migration file declares its kind', async () => {
    for (const set of ['school', 'registry'] as const) {
      const files = await loadMigrations(set);
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) expect(['expand', 'backfill', 'contract']).toContain(f.kind);
    }
  });

  it('applies the school set once and is a no-op the second time', async () => {
    const url = await ensureDatabase(server.url, 'school_test_a');
    const pool = new pg.Pool({ connectionString: url, max: 2 });
    try {
      const first = await migrate(pool, 'school');
      expect(first.length).toBeGreaterThan(0);
      expect(await migrate(pool, 'school')).toEqual([]);
      expect(await pendingMigrations(pool, 'school')).toEqual([]);
      const { rows } = await pool.query("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('students','payments','settings')");
      expect(rows[0].n).toBe(3);
    } finally { await pool.end(); }
  });

  it('applies the registry set', async () => {
    const url = await ensureDatabase(server.url, 'registry_test');
    const pool = new pg.Pool({ connectionString: url, max: 2 });
    try {
      await migrate(pool, 'registry');
      const { rows } = await pool.query("select count(*)::int as n from information_schema.tables where table_name='schools'");
      expect(rows[0].n).toBe(1);
      // Two servers checking the same job at once: exactly one runs it, and nobody runs it again until it is due.
      let runs = 0;
      const job = () => runIfDue(pool, 'backups', 60_000, async () => { runs++; });
      expect((await Promise.all([job(), job()])).filter(Boolean)).toHaveLength(1);
      expect(await job()).toBe(false);
      await pool.query("update jobs set last_run_at = now() - interval '2 minutes'");
      expect(await job()).toBe(true);
      expect(runs).toBe(2);
    } finally { await pool.end(); }
  });

  it('refuses a database name that is not safe', async () => {
    await expect(ensureDatabase(server.url, 'x; drop database postgres')).rejects.toThrow(/Unsafe/);
  });
});

describe('backups', () => {
  it('puts a school back exactly as it was, dates and JSON included', async () => {
    const pool = new pg.Pool({ connectionString: await ensureDatabase(server.url, 'school_backup'), max: 2 });
    try {
      await migrate(pool, 'school');
      await pool.query("insert into academic_years (id, label, starts_on, ends_on, current) values ('ay1', '2026-27', '2026-04-01', '2027-03-31', true)");
      await pool.query("insert into classes (id, year_id, name, grade, section) values ('c8a', 'ay1', 'Class 8 A', 8, 'A')");
      await pool.query("insert into students (id, admission_no, name, class_id, dob) values ('s1', '2026/0501', 'Tara Joshi', 'c8a', '2013-05-02'), ('s2', '2026/0502', 'Vir Joshi', 'c8a', '2015-01-31')");
      await pool.query(`insert into settings (key, value) values ('notify.rules', '{"fees.reminder":{"sms":true}}')`);
      const snap = async () => (await pool.query("select (select json_agg(s order by id) from students s) st, (select json_agg(c) from classes c) cl, (select json_agg(a) from academic_years a) ay, (select value from settings where key = 'notify.rules') rules")).rows[0];
      const before = await snap();
      const gz = await backupDatabase(pool);
      await pool.query("delete from students where id = 's2'");
      await pool.query("update classes set name = 'Renamed'");
      await pool.query("delete from settings");
      expect((await snap()).st).toHaveLength(1);
      const r = await restoreDatabase(pool, gz);
      expect(r.rows).toBeGreaterThanOrEqual(5);
      expect(await snap()).toEqual(before);
      // Backups taken before the streaming format still come back.
      const migrations = (await pool.query('select tag from schema_migrations order by tag')).rows.map((m) => m.tag);
      const v1 = gzipSync(JSON.stringify({ version: 1, migrations, tables: { academic_years: before.ay, classes: before.cl, students: before.st } }));
      await pool.query("delete from students where id = 's2'");
      await restoreDatabase(pool, v1);
      expect((await snap()).st).toEqual(before.st);
    } finally {
      await pool.end();
    }
  });
});
