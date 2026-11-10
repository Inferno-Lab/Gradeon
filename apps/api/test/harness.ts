import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_PLANS } from '@gradeon/config-engine';
import { migrate, newId, pg } from '@gradeon/db';
import { ensureDatabase, startDevPostgres, type DevPostgres } from '@gradeon/db/dev';
import { seedSchool } from '@gradeon/db/seed';
import { hashPassword, seal } from '@gradeon/security';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { REGISTRY } from '../src/tenancy/tenant.js';

export const SECRET = 'test-secret-key-for-sealing-0123456789';

export interface Harness {
  app: NestFastifyApplication;
  server: DevPostgres;
  registry: pg.Pool;
  slug: string;
  call: (method: string, url: string, opts?: { token?: string; body?: unknown; school?: string; headers?: Record<string, string>; cookies?: Record<string, string> }) => Promise<{ status: number; json: any; text: string; cookies: Record<string, string>; headers: Record<string, string | string[] | undefined> }>;
  login: (identifier?: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
  /** Writes a school's settings straight into its database, as the console does (schools cannot). */
  setSettings: (changes: Record<string, unknown>, slug?: string) => Promise<void>;
  addSchool: (slug: string, o: { plan: string; data: 'demo' | 'empty'; demoMode?: boolean; status?: string }) => Promise<void>;
  /** Changes a school's entitlement in the registry as the console does (fields given replace the stored ones) and drops the API's cached copy. */
  entitle: (patch: Record<string, unknown>, slug?: string) => Promise<void>;
}

export async function startHarness(port?: number): Promise<Harness> {
  const server = await startDevPostgres({ dataDir: path.join(mkdtempSync(path.join(tmpdir(), 'gradeon-api-')), 'data'), port, fresh: true });
  const regUrl = await ensureDatabase(server.url, 'registry');
  const registry = new pg.Pool({ connectionString: regUrl, max: 4 });
  await migrate(registry, 'registry');
  await registry.query("insert into cells (key, target, region, max_schools) values ('local-1','local','local',50)");
  for (const p of DEFAULT_PLANS) await registry.query('insert into plans (key, name, per_student_year, modules, limits) values ($1,$2,$3,$4,$5)', [p.key, p.name, p.perStudentYear, JSON.stringify(p.modules), JSON.stringify(p.limits)]);
  const demoHash = await hashPassword('nest2026');

  const addSchool = async (slug: string, o: { plan: string; data: 'demo' | 'empty'; demoMode?: boolean; status?: string }) => {
    const dbName = `school_${slug.replace(/-/g, '_')}`;
    const url = await ensureDatabase(server.url, dbName);
    const pool = new pg.Pool({ connectionString: url, max: 4 });
    await migrate(pool, 'school');
    const plan = DEFAULT_PLANS.find((p) => p.key === o.plan)!;
    await seedSchool(pool, {
      school: { name: 'Greenfield International School', shortName: 'Greenfield', tagline: 'Curiosity first.', phone: '', email: '', address: '', color: '#6A4CF5', logoText: 'G', language: 'en' },
      admin: { name: 'Neha Menon', email: 'neha.menon@greenfield.edu.in', phone: '+91 98220 41200', passwordHash: demoHash },
      modules: plan.modules, demoMode: o.demoMode ?? true, data: o.data, demoPasswordHash: demoHash,
    });
    // No quiet hours unless a test sets them: messages are held in quiet hours, so results would depend on the clock.
    await pool.query("insert into settings (key, value) values ('notify.quietFrom', '\"00:00\"'), ('notify.quietTo', '\"00:00\"') on conflict (key) do update set value = excluded.value");
    await pool.end();
    await registry.query(
      `insert into schools (id, slug, name, short_name, color, logo_text, status, plan, cell, target, region, db_url_sealed, db_name, entitlement, contact)
       values ($1,$2,'Greenfield International School','Greenfield','#6A4CF5','G',$3,$4,'local-1','local','local',$5,$6,$7,$8)`,
      [newId('sch'), slug, o.status ?? 'live', o.plan, seal(url, SECRET), dbName, JSON.stringify({ modules: plan.modules, limits: plan.limits, locks: [], overrides: {}, version: 1 }), JSON.stringify({ name: 'Neha', phone: '1', email: 'a@b.c' })]);
  };

  const env = loadEnv({ NODE_ENV: 'test', REGISTRY_DATABASE_URL: regUrl, SECRETS_KEY: SECRET, JWT_SECRET: 'jwt-secret-for-tests-0123456789abcd', PORT: '0' });
  const app = await createApp(env);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const slug = 'greenfield';
  await addSchool(slug, { plan: 'premium', data: 'demo' });

  const call: Harness['call'] = async (method, url, opts = {}) => {
    const res = await app.inject({
      method: method as 'GET', url,
      headers: {
        'x-school': opts.school ?? slug,
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      cookies: opts.cookies,
      payload: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json: any = null;
    try { json = JSON.parse(res.body); } catch { /* not json */ }
    const cookies: Record<string, string> = {};
    for (const c of res.cookies ?? []) cookies[c.name] = c.value;
    const setCookie = res.headers['set-cookie'];
    for (const line of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0 && !cookies[pair.slice(0, eq)]) cookies[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
    }
    return { status: res.statusCode, json, text: res.body, cookies, headers: res.headers as Record<string, string | string[] | undefined> };
  };
  const login = async (identifier = 'neha.menon@greenfield.edu.in', password = 'nest2026') => {
    const step1 = await call('POST', '/v1/auth/login', { body: { identifier, password } });
    if (step1.json.step === 'done') return step1.json.tokens.accessToken as string;
    const step2 = await call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '424242' } });
    return step2.json.accessToken as string;
  };
  const setSettings: Harness['setSettings'] = async (changes, school = slug) => {
    const dbName = (await registry.query<{ db_name: string }>('select db_name from schools where slug = $1', [school])).rows[0]!.db_name;
    const pool = new pg.Pool({ connectionString: await ensureDatabase(server.url, dbName), max: 1 });
    for (const [k, v] of Object.entries(changes)) {
      await pool.query('insert into settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value', [k, JSON.stringify(v)]);
    }
    await pool.query("update meta set value = to_jsonb((value)::int + 1) where key = 'settings.version'");
    await pool.end();
    await new Promise((r) => setTimeout(r, 5_100)); // the API caches a school's settings for five seconds
  };
  const entitle: Harness['entitle'] = async (patch, school = slug) => {
    await registry.query('update schools set entitlement = entitlement || $2::jsonb where slug = $1', [school, JSON.stringify(patch)]);
    app.get<{ invalidate: (s?: string) => void }>(REGISTRY).invalidate(school);
  };
  return {
    app, server, registry, slug, call, login, addSchool, setSettings, entitle,
    close: async () => { await app.close(); await registry.end(); await server.stop(); },
  };
}
