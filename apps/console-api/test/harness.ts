import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, loadEnv as loadApiEnv } from '@gradeon/api';
import { ensureDatabase, startDevPostgres, type DevPostgres } from '@gradeon/db/dev';
import { pg } from '@gradeon/db';
import { PoolManager, Registry } from '@gradeon/tenancy';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createConsoleApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

export interface Harness {
  console: NestFastifyApplication;
  api: NestFastifyApplication;
  server: DevPostgres;
  registry: pg.Pool;
  c: (method: string, url: string, opts?: { token?: string; body?: unknown }) => Promise<{ status: number; json: any }>;
  s: (method: string, url: string, opts?: { token?: string; body?: unknown; school: string }) => Promise<{ status: number; json: any }>;
  signIn: (email?: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function startHarness(extra: Record<string, string> = {}): Promise<Harness> {
  const server = await startDevPostgres({ dataDir: path.join(mkdtempSync(path.join(tmpdir(), 'gradeon-console-')), 'data'), fresh: true });
  const regUrl = await ensureDatabase(server.url, 'registry');
  const base = { NODE_ENV: 'test', REGISTRY_DATABASE_URL: regUrl, SECRETS_KEY: 'test-secret-key-for-sealing-0123456789', JWT_SECRET: 'jwt-secret-for-tests-0123456789abcd', PORT: '0' };
  const env = loadEnv({ ...base, DEMO_CODE: '424242', STEP_PAUSE_MS: '0', PROBE_SECONDS: '0', ADMIN_BASE_URL: 'http://localhost:5173', ...extra });
  const registry = new Registry({ url: regUrl, secret: env.SECRETS_KEY });
  const pools = new PoolManager();
  const console_ = await createConsoleApp(env, { registry, pools });
  await console_.init();
  await console_.getHttpAdapter().getInstance().ready();
  const api = await createApp(loadApiEnv(base), { registry, pools });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  const pool = new pg.Pool({ connectionString: regUrl, max: 4 });

  const call = (app: NestFastifyApplication) => async (method: string, url: string, opts: { token?: string; body?: unknown; school?: string } = {}) => {
    const res = await app.inject({
      method: method as 'GET', url,
      headers: { ...(opts.school ? { 'x-school': opts.school } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body ? { 'content-type': 'application/json' } : {}) },
      payload: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json: any = null;
    try { json = JSON.parse(res.body); } catch { json = res.body; }
    return { status: res.statusCode, json };
  };
  const c = call(console_) as Harness['c'];
  const s = call(api) as Harness['s'];
  const signIn = async (email = 'kaushal@gradeon.app', password = 'nest2026') => {
    const a = await c('POST', '/console/v1/auth/login', { body: { identifier: email, password } });
    const b = await c('POST', '/console/v1/auth/verify', { body: { challengeId: a.json.challenge.challengeId, code: '424242' } });
    return b.json.accessToken as string;
  };
  return {
    console: console_, api, server, registry: pool, c, s, signIn,
    close: async () => { await pool.end(); await console_.close(); await api.close(); await registry.close(); await pools.closeAll(); await server.stop(); },
  };
}

export const wizardPayload = (slug: string, over: Record<string, unknown> = {}) => ({
  basics: { name: `${slug} School`, shortName: slug.slice(0, 8), slug, board: 'CBSE', address: '1 Main Road', city: 'Pune', contactName: 'Asha Rao', contactPhone: '+91 90000 11111', contactEmail: `office@${slug}.test`, gstin: '', language: 'en' },
  plan: { plan: 'standard', modules: ['people', 'attendance', 'fees', 'notices', 'timetable'], addOns: [], locks: [], students: 300 },
  branding: { color: '#0EA5E9', logoText: slug.slice(0, 1).toUpperCase(), appName: `${slug} App`, tagline: 'Learning together' },
  placement: { target: 'local', cell: 'local-1', addressing: 'path', customDomain: '' },
  admin: { name: 'Asha Rao', email: `asha@${slug}.test`, phone: '+91 90000 22222', invite: 'both', roles: ['principal'] },
  data: { start: 'empty' },
  ...over,
});
