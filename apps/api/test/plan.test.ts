import { RequestMethod } from '@nestjs/common';
import { featureByKey, moduleByKey } from '@tangent/config-engine';
import { istToday } from '@tangent/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { startHarness, type Harness } from './harness.js';

type Ctor = { prototype: Record<string, unknown>; name: string };
const meta = (key: string, ...on: object[]) => on.map((o) => Reflect.getMetadata(key, o)).find((v) => v !== undefined);

/** Every route of the school API with the module it declares, read from the same decorators the guard reads. */
const ROUTES = (AppModule.register({} as never, { registry: {} as never, pools: {} as never }).controllers as Ctor[]).flatMap((c) => {
  const prefix = String(Reflect.getMetadata('path', c) ?? '');
  return Object.getOwnPropertyNames(c.prototype).filter((name) => name !== 'constructor').flatMap((name) => {
    const h = c.prototype[name] as object;
    const path = typeof h === 'function' ? Reflect.getMetadata('path', h) : undefined;
    if (path === undefined) return [];
    const url = `/${[prefix, path].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/');
    return [{
      where: `${c.name}.${name}`, method: RequestMethod[Reflect.getMetadata('method', h) as number]!, url,
      module: meta('module', h, c) as string | undefined, open: !!meta('public', h, c) || !!meta('noTenant', h, c),
    }];
  });
});

describe('every route declares its module (default deny)', () => {
  it('finds the routes', () => {
    expect(ROUTES.length).toBeGreaterThan(120);
  });
  it('each school route says which module or feature it belongs to, or that it is core', () => {
    const missing = ROUTES.filter((r) => !r.open && !r.module).map((r) => `${r.method} ${r.url} (${r.where})`);
    expect(missing, 'Add @RequireModule(...) or @Core() to these routes').toEqual([]);
  });
  it('each declared module or feature exists in the catalogue', () => {
    const unknown = ROUTES.filter((r) => r.module && r.module !== 'core' && !moduleByKey(r.module) && !featureByKey(r.module));
    expect(unknown.map((r) => `${r.url}: ${r.module}`)).toEqual([]);
  });
});

describe('a school gets only what it has', () => {
  let h: Harness;
  let token: string;
  beforeAll(async () => {
    h = await startHarness();
    token = await h.login();
  }, 240_000);
  afterAll(async () => { await h?.close(); });

  const call = (r: (typeof ROUTES)[number]) => h.call(r.method, r.url.replace(/:\w+/g, 'x'), { token, body: r.method === 'GET' ? undefined : {} });

  it('with only the core module, every other route answers “not in your plan”', async () => {
    await h.entitle({ modules: ['people'], features: { 'people.admissions': false } });
    const gated = ROUTES.filter((r) => !r.open && r.module && r.module !== 'core' && r.module !== 'people');
    expect(gated.length).toBeGreaterThan(60);
    const leaks: string[] = [];
    for (const r of gated) {
      const res = await call(r);
      if (res.status !== 423 || res.json.code !== 'locked') leaks.push(`${r.method} ${r.url} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
    // Core routes still work, and the admin and app are told what the school has.
    expect((await h.call('GET', '/v1/students', { token })).status).toBe(200);
    const cfg = (await h.call('GET', '/v1/config', { token })).json;
    expect(cfg.modules).toEqual(['school', 'people']);
    expect(cfg.features).toEqual([]);
    const dash = (await h.call('GET', '/v1/dashboard', { token })).json;
    expect(dash.modules).toEqual(['school', 'people']);
    expect(dash.fees.collected).toBe(0);
    expect(dash.timeline).toEqual([]);
    expect(dash.badges.admissions).toBe(0);
  }, 120_000);

  it('a feature can be taken away inside a module the school keeps', async () => {
    await h.entitle({ modules: ['people', 'fees', 'attendance'], features: { 'fees.onlinePayment': false, 'attendance.parentAlerts': false } });
    const pay = await h.call('POST', '/v1/f/fees/x/pay', { token, body: {} });
    expect(pay.status).toBe(423);
    expect((await h.call('GET', '/v1/fees/summary', { token })).status).toBe(200);
    expect((await h.call('GET', '/v1/config', { token })).json.features).toEqual(expect.arrayContaining(['fees.reminders', 'attendance.teacherApp']));
    // A message that belongs to a feature the school does not have is never sent.
    const date = istToday();
    const day = (await h.call('GET', `/v1/attendance/day?classId=cls_7a&date=${date}`, { token })).json;
    const before = (await h.registry.query("select count(*)::int n from sandbox_messages where body like '%marked absent%'")).rows[0].n;
    const marks = day.marks.map((m: { studentId: string }, i: number) => ({ studentId: m.studentId, status: i === 0 ? 'absent' : 'present' }));
    expect((await h.call('PUT', '/v1/attendance/day', { token, body: { classId: 'cls_7a', date, marks } })).status).toBe(200);
    expect((await h.registry.query("select count(*)::int n from sandbox_messages where body like '%marked absent%'")).rows[0].n).toBe(before);
  }, 60_000);

  it('a module outside its dates is off, and comes back with its data when the dates allow', async () => {
    await h.entitle({ modules: ['people', 'fees'], features: {}, dates: { fees: { until: '2020-01-31' } } });
    expect((await h.call('GET', '/v1/fees/summary', { token })).status).toBe(423);
    await h.entitle({ dates: {} });
    const back = await h.call('GET', '/v1/fees/summary', { token });
    expect(back.status).toBe(200);
    expect(back.json.due).toBeGreaterThan(0);
  }, 60_000);
});
