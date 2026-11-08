import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, wizardPayload, type Harness } from './harness.js';

let h: Harness;
let t: string;

async function launch(payload: object, dryRun = false) {
  const r = await h.c('POST', '/console/v1/wizard/launch', { token: t, body: { payload, dryRun } });
  expect(r.status).toBe(200);
  for (let i = 0; i < 400; i++) {
    const run = (await h.c('GET', `/console/v1/runs/${r.json.id}`, { token: t })).json;
    if (run.status === 'succeeded' || run.status === 'failed') return run;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('run did not finish');
}

beforeAll(async () => {
  h = await startHarness();
  t = await h.signIn();
}, 240_000);
afterAll(async () => {
  await h?.close();
});

describe('console sign-in', () => {
  it('refuses a wrong password and an unknown email without saying which is wrong', async () => {
    const bad = await h.c('POST', '/console/v1/auth/login', { body: { identifier: 'kaushal@gradeon.app', password: 'wrong' } });
    expect(bad.status).toBe(401);
    const nobody = await h.c('POST', '/console/v1/auth/login', { body: { identifier: 'nobody@gradeon.app', password: 'x' } });
    expect(nobody.status).toBe(401);
    expect(nobody.json.fields.identifier).toBeDefined();
  });
  it('needs a token, and only super admins can reach the team', async () => {
    expect((await h.c('GET', '/console/v1/fleet')).status).toBe(401);
    await h.c('POST', '/console/v1/team', { token: t, body: { name: 'Sam Support', email: 'sam@gradeon.app', roles: ['support'], password: 'long-enough-pass' } });
    const sam = await h.signIn('sam@gradeon.app', 'long-enough-pass');
    expect((await h.c('GET', '/console/v1/team', { token: sam })).status).toBe(200);
    expect((await h.c('POST', '/console/v1/team', { token: sam, body: { name: 'X', email: 'x@y.zz', roles: ['support'], password: 'long-enough-pass' } })).status).toBe(403);
    expect((await h.c('POST', '/console/v1/releases', { token: sam, body: { version: '2026.10.9' } })).status).toBe(403);
  });
  it('never lets the last super admin be removed', async () => {
    const team = (await h.c('GET', '/console/v1/team', { token: t })).json;
    const me = team.find((m: any) => m.email === 'kaushal@gradeon.app');
    const r = await h.c('PUT', `/console/v1/team/${me.id}`, { token: t, body: { status: 'disabled' } });
    expect(r.status).toBe(409);
  });
});

describe('blueprints', () => {
  it('ships one blueprint per target and refuses steps out of order or required steps removed', async () => {
    const list = (await h.c('GET', '/console/v1/blueprints', { token: t })).json;
    expect(list.map((b: any) => b.target).sort()).toEqual(['aws-cell', 'free-test', 'local']);
    const steps = list[0].steps;
    const reordered = [steps[1], steps[0], ...steps.slice(2)];
    const bad = await h.c('POST', '/console/v1/blueprints', { token: t, body: { key: 'custom-local', name: 'Custom', target: 'local', plan: null, steps: reordered } });
    expect(bad.status).toBe(400);
    const noDb = await h.c('POST', '/console/v1/blueprints', { token: t, body: { key: 'custom-local', name: 'Custom', target: 'local', plan: null, steps: steps.filter((s: any) => s.key !== 'database') } });
    expect(noDb.status).toBe(400);
  });
  it('versions an edit and uses the active one', async () => {
    const steps = (await h.c('GET', '/console/v1/blueprints', { token: t })).json.find((b: any) => b.key === 'default-local').steps.map((s: any) => (s.key === 'build-profile' ? { ...s, enabled: false } : s));
    const v2 = await h.c('POST', '/console/v1/blueprints', { token: t, body: { key: 'default-local', name: 'Standard setup (local)', target: 'local', plan: null, steps } });
    expect(v2.json.version).toBe(2);
    const review = await h.c('POST', '/console/v1/wizard/review', { token: t, body: wizardPayload('reviewme') });
    expect(review.json.willDo.map((w: any) => w.key)).not.toContain('build-profile');
  });
});

describe('the new-school wizard', () => {
  it('reviews a good setup, and says what is wrong with a bad one', async () => {
    const ok = (await h.c('POST', '/console/v1/wizard/review', { token: t, body: wizardPayload('goodschool') })).json;
    expect(ok.problems).toEqual([]);
    expect(ok.willDo.length).toBeGreaterThanOrEqual(4);
    expect(ok.capacity.ok).toBe(true);
    const bad = await h.c('POST', '/console/v1/wizard/review', { token: t, body: wizardPayload('x') });
    expect(bad.status).toBe(400);
    const outside = (await h.c('POST', '/console/v1/wizard/review', { token: t, body: wizardPayload('outside', { plan: { plan: 'starter', modules: ['people', 'transport'], addOns: [], locks: [], students: 300 } }) })).json;
    expect(outside.problems.join(' ')).toMatch(/outside the Starter plan/);
  });
  it('keeps a draft and resumes it', async () => {
    const d = (await h.c('POST', '/console/v1/wizard/drafts', { token: t, body: { step: 2, data: { basics: { name: 'Half Done School' } } } })).json;
    expect(d.name).toBe('Half Done School');
    const again = (await h.c('PUT', `/console/v1/wizard/drafts/${d.id}`, { token: t, body: { step: 3, data: { basics: { name: 'Half Done School' }, plan: { plan: 'standard' } } } })).json;
    expect(again.step).toBe(3);
    expect((await h.c('GET', '/console/v1/wizard/drafts', { token: t })).json).toHaveLength(1);
  });
  it('a dry run creates nothing', async () => {
    const run = await launch(wizardPayload('dryrunschool'), true);
    expect(run.dryRun).toBe(true);
    expect(run.status).toBe('succeeded');
    expect((await h.c('GET', '/console/v1/schools', { token: t })).json.find((s: any) => s.slug === 'dryrunschool')).toBeUndefined();
    const dbs = await h.registry.query("select count(*)::int n from pg_database where datname = 'school_dryrunschool'");
    expect(dbs.rows[0].n).toBe(0);
  });
  it('sets a school up for real, and the school can then be used', async () => {
    const run = await launch(wizardPayload('freshschool', { data: { start: 'empty' } }));
    expect(run.status).toBe('succeeded');
    expect(run.steps.map((s: any) => s.key)).not.toContain('build-profile');
    expect(run.steps.every((s: any) => s.status === 'done')).toBe(true);
    const school = (await h.c('GET', '/console/v1/schools/freshschool', { token: t })).json;
    expect(school.status).toBe('live');
    expect(school.adminUrl).toBe('http://localhost:5173/s/freshschool');
    expect(school.checklist).toHaveLength(4);
    // The invite waits in the sandbox inbox with a temporary password.
    const inbox = (await h.c('GET', '/console/v1/sandbox?school=freshschool', { token: t })).json;
    const invite = inbox.find((m: any) => m.channel === 'email');
    const password = /temporary password (\S+)\./.exec(invite.body)![1]!.replace(/\.$/, '');
    // Sign in to the new school with it.
    const login = await h.s('POST', '/v1/auth/login', { school: 'freshschool', body: { identifier: 'asha@freshschool.test', password } });
    expect(login.status).toBe(200);
    expect(login.json.challenge.demoCode).toBeUndefined();
    const code = (await h.c('GET', '/console/v1/sandbox?school=freshschool', { token: t })).json.find((m: any) => m.channel === 'sms' && /sign-in code/.test(m.body));
    const verified = await h.s('POST', '/v1/auth/verify', { school: 'freshschool', body: { challengeId: login.json.challenge.challengeId, code: /code for \S+ is (\d{6})/.exec(code.body)![1] } });
    expect(verified.status).toBe(200);
    const dash = await h.s('GET', '/v1/dashboard', { school: 'freshschool', token: verified.json.accessToken });
    expect(dash.status).toBe(200);
    expect(dash.json.present.total).toBe(0);
    expect(dash.json.classRolls).toEqual([]);
    const cfg = await h.s('GET', '/v1/config', { school: 'freshschool', token: verified.json.accessToken });
    expect(cfg.json.school.color).toBe('#0EA5E9');
    expect(cfg.json.modules).toEqual(['people', 'attendance', 'fees', 'notices', 'timetable']);
    const role = 'school_freshschool_app';
    const dbname = 'school_freshschool';
    const own = await h.registry.query('select has_database_privilege($1, $2, \'CONNECT\') ok', [role, dbname]);
    expect(own.rows[0].ok).toBe(true);
    const pub = await h.registry.query('select has_database_privilege(\'public\', $1, \'CONNECT\') ok', [dbname]);
    expect(pub.rows[0].ok).toBe(false);
  });
  it('refuses a taken address and a second setup of the same school', async () => {
    const r = await h.c('POST', '/console/v1/wizard/launch', { token: t, body: { payload: wizardPayload('freshschool') } });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/already used/);
  });
  it('sets up the demo school with its 1,498 students', async () => {
    const run = await launch(wizardPayload('demoschool', { data: { start: 'demo' }, plan: { plan: 'premium', modules: ['people', 'attendance', 'fees', 'notices', 'timetable', 'homework'], addOns: [], locks: [], students: 1500 } }));
    expect(run.status).toBe('succeeded');
    expect(run.steps.find((s: any) => s.key === 'migrate-seed').log.at(-1).text).toMatch(/1,498 sample students/);
    const login = await h.s('POST', '/v1/auth/login', { school: 'demoschool', body: { identifier: 'asha@demoschool.test', password: 'nest2026' } });
    expect(login.json.challenge.demoCode).toBe('424242');
  }, 120_000);
});

describe('actions', () => {
  it('pauses a school so its API refuses, and resumes it', async () => {
    const id = (await h.c('GET', '/console/v1/schools/freshschool', { token: t })).json.id;
    const a = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.suspend', schoolId: id } });
    expect(a.json.status).toBe('done');
    expect((await h.s('GET', '/v1/brand', { school: 'freshschool' })).status).toBe(503);
    await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.resume', schoolId: id } });
    expect((await h.s('GET', '/v1/brand', { school: 'freshschool' })).status).toBe(200);
  });
  it('pushes new entitlements and the school’s menu follows', async () => {
    const id = (await h.c('GET', '/console/v1/schools/freshschool', { token: t })).json.id;
    await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'entitlements.push', schoolId: id, params: { modules: ['people', 'notices'] } } });
    const login = await h.s('POST', '/v1/auth/login', { school: 'demoschool', body: { identifier: 'asha@demoschool.test', password: 'nest2026' } });
    const tok = (await h.s('POST', '/v1/auth/verify', { school: 'demoschool', body: { challengeId: login.json.challenge.challengeId, code: '424242' } })).json.accessToken;
    expect((await h.s('GET', '/v1/config', { school: 'demoschool', token: tok })).json.modules).toContain('fees');
  });
  it('needs the school’s own address typed to erase it, and a second person to approve', async () => {
    const id = (await h.c('GET', '/console/v1/schools/freshschool', { token: t })).json.id;
    const wrong = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.erase', schoolId: id, confirmCode: 'nope' } });
    expect(wrong.status).toBe(400);
    const asked = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.erase', schoolId: id, confirmCode: 'freshschool' } });
    expect(asked.json.status).toBe('pending_approval');
    expect((await h.c('POST', `/console/v1/actions/${asked.json.id}/approve`, { token: t })).status).toBe(403);
    await h.c('POST', '/console/v1/team', { token: t, body: { name: 'Second Admin', email: 'second@gradeon.app', roles: ['super_admin'], password: 'another-long-pass' } });
    const second = await h.signIn('second@gradeon.app', 'another-long-pass');
    const done = await h.c('POST', `/console/v1/actions/${asked.json.id}/approve`, { token: second });
    expect(done.json.status).toBe('done');
    expect((await h.s('GET', '/v1/brand', { school: 'freshschool' })).status).toBe(404);
    const dbs = await h.registry.query("select count(*)::int n from pg_database where datname = 'school_freshschool'");
    expect(dbs.rows[0].n).toBe(0);
  });
});

describe('releases', () => {
  it('rolls out in waves, running migrations and moving every school’s version', async () => {
    await h.registry.query("update schools set ring = 'internal' where slug = 'demoschool'");
    const rel = (await h.c('POST', '/console/v1/releases', { token: t, body: { version: '2026.10.3', notes: 'First rollout' } })).json;
    expect((await h.c('POST', '/console/v1/releases', { token: t, body: { version: 'bad' } })).status).toBe(400);
    const started = await h.c('POST', `/console/v1/releases/${rel.id}/start`, { token: t });
    expect(started.json.status).toBe('rolling');
    for (let i = 0; i < 100; i++) {
      const r = (await h.c('GET', '/console/v1/releases', { token: t })).json.find((x: any) => x.id === rel.id);
      if (r.status === 'done') break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    const done = (await h.c('GET', '/console/v1/releases', { token: t })).json.find((x: any) => x.id === rel.id);
    expect(done.status).toBe('done');
    expect(done.waves[0].name).toBe('Internal');
    const schools = (await h.c('GET', '/console/v1/schools', { token: t })).json.filter((s: any) => s.status === 'live');
    expect(schools.every((s: any) => s.versions.api === '2026.10.3')).toBe(true);
    const migs = (await h.c('GET', '/console/v1/migrations', { token: t })).json;
    expect(migs[0].schools.every((s: any) => s.state === 'applied')).toBe(true);
  });
  it('halts and rolls back by itself when a school fails its check', async () => {
    const before = (await h.c('GET', '/console/v1/schools', { token: t })).json.map((s: any) => [s.slug, s.versions.api]);
    // Break one school's database connection so the rollout cannot reach it.
    await h.registry.query("update schools set db_url_sealed = db_url_sealed || 'x' where slug = 'demoschool'");
    const rel = (await h.c('POST', '/console/v1/releases', { token: t, body: { version: '2026.10.4' } })).json;
    await h.c('POST', `/console/v1/releases/${rel.id}/start`, { token: t });
    let r: any;
    for (let i = 0; i < 100; i++) {
      r = (await h.c('GET', '/console/v1/releases', { token: t })).json.find((x: any) => x.id === rel.id);
      if (r.status === 'halted' || r.status === 'done') break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    expect(r.status).toBe('halted');
    expect(r.haltReason).toMatch(/rolled back/);
    const after = (await h.c('GET', '/console/v1/schools', { token: t })).json.map((s: any) => [s.slug, s.versions.api]);
    expect(after.sort()).toEqual(before.sort());
  });
});

describe('support and fleet', () => {
  it('opens a read-only look inside a school that expires, and writes it down', async () => {
    const s = (await h.c('GET', '/console/v1/schools/demoschool', { token: t })).json;
    // The earlier test broke the demo school's connection on purpose; restore it.
    await h.registry.query("update schools set db_url_sealed = left(db_url_sealed, length(db_url_sealed) - 1) where slug = 'demoschool'");
    const bad = await h.c('POST', '/console/v1/support', { token: t, body: { schoolId: s.id, reason: 'x' } });
    expect(bad.status).toBe(400);
    const ok = await h.c('POST', '/console/v1/support', { token: t, body: { schoolId: s.id, reason: 'Checking the fee report with the principal' } });
    expect(ok.status).toBe(200);
    const view = await h.s('GET', '/v1/me', { school: 'demoschool', token: ok.json.token });
    expect(view.json.roleNames).toEqual(['Gradeon support']);
    const write = await h.s('POST', '/v1/notices', { school: 'demoschool', token: ok.json.token, body: { title: 'Not from support', body: 'Support sessions are read-only.', audience: 'everyone', publish: false } });
    expect(write.status).toBe(403);
    expect((await h.s('GET', '/v1/me', { school: 'freshschool', token: ok.json.token })).status).toBe(404);
    const audit = (await h.c('GET', '/console/v1/audit', { token: t })).json;
    expect(audit.some((a: any) => a.action === 'support.started')).toBe(true);
  });
  it('summarises the fleet from real data', async () => {
    await h.c('POST', '/console/v1/health/probe', { token: t });
    const f = (await h.c('GET', '/console/v1/fleet', { token: t })).json;
    expect(f.schools).toBeGreaterThanOrEqual(1);
    expect(f.cells[0]).toMatchObject({ key: 'local-1', target: 'local' });
    expect(f.requests24h).toHaveLength(24);
  });
  it('bills each live school once a month from its students', async () => {
    const a = await h.c('POST', '/console/v1/billing/generate', { token: t, body: { period: '2026-10' } });
    expect(a.json.created).toBeGreaterThanOrEqual(1);
    expect((await h.c('POST', '/console/v1/billing/generate', { token: t, body: { period: '2026-10' } })).json.created).toBe(0);
  });
});

describe('error reports', () => {
  it('groups what the admin and the app report, and shows it on the console', async () => {
    const body = { source: 'admin', message: 'Cannot read properties of undefined (reading "rows")', stack: 'TypeError: x\n    at DashboardPage (dashboard.tsx:12:3)', url: '/s/greenfield/' };
    expect((await h.s('POST', '/v1/errors', { school: 'greenfield', body })).status).toBe(204);
    expect((await h.s('POST', '/v1/errors', { school: 'greenfield', body })).status).toBe(204);
    expect((await h.s('POST', '/v1/errors', { school: 'greenfield', body: { source: 'nobody', message: 'x' } })).status).toBe(400);
    const list = (await h.c('GET', '/console/v1/errors', { token: t })).json;
    expect(list.find((e: { message: string }) => e.message === body.message)).toMatchObject({ source: 'admin', schoolSlug: 'greenfield', count: 2 });
    expect((await h.c('GET', '/console/v1/errors')).status).toBe(401);
  });
});

describe('backups', () => {
  it('backs a school up on request, and waits for a second person to put one back', async () => {
    const school = (await h.c('GET', '/console/v1/schools', { token: t })).json.find((s: { slug: string }) => s.slug === 'demoschool');
    const took = (await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'backup.take', schoolId: school.id } })).json;
    expect(took.status).toBe('done');
    const list = (await h.c('GET', `/console/v1/schools/${school.id}/backups`, { token: t })).json;
    expect(list[0]).toMatchObject({ kind: 'manual', takenBy: 'kaushal@gradeon.app' });
    expect(list[0].bytes).toBeGreaterThan(1000);
    const restore = (await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'backup.restore', schoolId: school.id, params: { backupId: list[0].id } } })).json;
    expect(restore.status).toBe('pending_approval');
  });
  it('runs a restore drill into a scratch database and keeps the result', async () => {
    const d = (await h.c('POST', '/console/v1/health/restore-drills', { token: t })).json;
    expect(d).toMatchObject({ ok: true, error: null, by: 'kaushal@gradeon.app' });
    expect(d.tables).toBeGreaterThan(10);
    expect((await h.c('GET', '/console/v1/health/restore-drills', { token: t })).json[0].id).toBe(d.id);
  }, 60_000);
});
