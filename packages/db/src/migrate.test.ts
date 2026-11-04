import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureDatabase, startDevPostgres, type DevPostgres } from './dev.js';
import { loadMigrations, migrate, pendingMigrations } from './migrate.js';

let server: DevPostgres;
beforeAll(async () => {
  server = await startDevPostgres({ dataDir: path.join(mkdtempSync(path.join(tmpdir(), 'gradeon-pg-')), 'data'), port: 54401, fresh: true });
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
    } finally { await pool.end(); }
  });

  it('refuses a database name that is not safe', async () => {
    await expect(ensureDatabase(server.url, 'x; drop database postgres')).rejects.toThrow(/Unsafe/);
  });
});
