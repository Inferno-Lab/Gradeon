import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import net from 'node:net';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);

export interface DevPostgres {
  /** Connection string for the maintenance database ("postgres"). */
  url: string;
  port: number;
  stop: () => Promise<void>;
}

/** Asks the system for a port nobody is using. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** Finds the PostgreSQL binaries that the `embedded-postgres` package ships for this platform. */
function binDir(): string {
  const base = createRequire(
    createRequire(import.meta.url).resolve('embedded-postgres'),
  );
  const plat = process.platform === 'win32' ? 'windows' : process.platform;
  let dir = path.dirname(base.resolve(`@embedded-postgres/${plat}-${process.arch}`) as string);
  while (!fs.existsSync(path.join(dir, 'native', 'bin'))) {
    const up = path.dirname(dir);
    if (up === dir) throw new Error('The embedded PostgreSQL binaries were not found. Run pnpm install.');
    dir = up;
  }
  return path.join(dir, 'native', 'bin');
}

/**
 * Starts a throwaway PostgreSQL from npm binaries, so tests and local development need no Docker.
 * It is started with `pg_ctl`, which drops administrator rights on Windows (PostgreSQL refuses to run with them).
 */
export async function startDevPostgres(opts: { dataDir: string; port?: number; fresh?: boolean }): Promise<DevPostgres> {
  const port = opts.port ?? (await freePort());
  const dataDir = path.resolve(opts.dataDir);
  const bin = binDir();
  const exe = (n: string) => path.join(bin, process.platform === 'win32' ? `${n}.exe` : n);
  if (opts.fresh && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  await mkdir(path.dirname(dataDir), { recursive: true });
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    const pwFile = path.join(path.dirname(dataDir), `${path.basename(dataDir)}.pw`);
    fs.writeFileSync(pwFile, 'gradeon');
    try {
      await run(exe('initdb'), ['-D', dataDir, '-U', 'gradeon', '--pwfile', pwFile, '-A', 'scram-sha-256', '-E', 'UTF8']);
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
  }
  const log = path.join(path.dirname(dataDir), `${path.basename(dataDir)}.log`);
  // spawn with ignored stdio: the postgres child would otherwise keep pg_ctl's pipes open and the call would never return
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(exe('pg_ctl'), ['-D', dataDir, '-l', log, '-w', '-t', '60', '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off`, 'start'], { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) {
    const tail = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-600) : '';
    throw new Error(`PostgreSQL did not start (exit ${code}).
${tail}`);
  }
  return {
    url: `postgres://gradeon:gradeon@127.0.0.1:${port}/postgres`,
    port,
    stop: async () => {
      await new Promise<void>((resolve) => {
        const child = spawn(exe('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore', windowsHide: true });
        child.on('error', () => resolve());
        child.on('exit', () => resolve());
      });
    },
  };
}

/** Creates `name` if it does not exist and returns its connection string. */
export async function ensureDatabase(adminUrl: string, name: string): Promise<string> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    const { rowCount } = await pool.query('select 1 from pg_database where datname = $1', [name]);
    if (!rowCount) await pool.query(`create database ${name}`);
  } finally {
    await pool.end();
  }
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  return u.toString();
}
