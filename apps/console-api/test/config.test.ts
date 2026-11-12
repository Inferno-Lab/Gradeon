import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, wizardPayload, type Harness } from './harness.js';

// Configuration belongs to Gradeon: changed in the console, followed by the school's own API, never changed by the school.
let h: Harness;
let t: string;
let second: string;
let id: string;
let school: string;

async function launch(slug: string) {
  const r = await h.c('POST', '/console/v1/wizard/launch', { token: t, body: { payload: wizardPayload(slug, { data: { start: 'demo' } }) } });
  for (let i = 0; i < 400; i++) {
    const run = (await h.c('GET', `/console/v1/runs/${r.json.id}`, { token: t })).json;
    if (run.status === 'succeeded' || run.status === 'failed') return run;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('run did not finish');
}

const cfg = () => h.c('GET', `/console/v1/schools/${id}/config`, { token: t });
const patch = (body: object, token = t) => h.c('PATCH', `/console/v1/schools/${id}/config`, { token, body });
const wait = () => new Promise((r) => setTimeout(r, 5_100)); // the school API caches settings for five seconds

beforeAll(async () => {
  h = await startHarness();
  t = await h.signIn();
  await h.invite(t, { name: 'Second Admin', email: 'second@gradeon.app', roles: ['super_admin'] }, 'another-long-pass');
  second = await h.signIn('second@gradeon.app', 'another-long-pass');
  expect((await launch('cfgschool')).status).toBe('succeeded');
  id = (await h.c('GET', '/console/v1/schools', { token: t })).json.find((s: { slug: string }) => s.slug === 'cfgschool').id;
  const a = await h.s('POST', '/v1/auth/login', { school: 'cfgschool', body: { identifier: 'asha@cfgschool.test', password: 'nest2026' } });
  school = (await h.s('POST', '/v1/auth/verify', { school: 'cfgschool', body: { challengeId: a.json.challenge.challengeId, code: '424242' } })).json.accessToken;
}, 240_000);
afterAll(async () => {
  await h?.close();
});

describe('configuration from the console', () => {
  it('changes settings the school then follows, refuses a stale version, and keeps a history', async () => {
    const before = (await cfg()).json;
    const r = await patch({ expectedVersion: before.version, changes: { 'brand.color': '#0E7490', 'app.layout': { parent: { dock: ['home', 'fees'], home: [], quick: [] }, student: { dock: [], home: [], quick: [] }, teacher: { dock: [], home: [], quick: [] }, driver: { dock: [], home: [], quick: [] } }, 'fees.receiptPrefix': 'GF/{year}/' }, note: 'Brand refresh' });
    expect(r.status).toBe(200);
    expect(r.json.version).toBe(before.version + 1);
    expect(r.json.versions[0]).toMatchObject({ note: 'Brand refresh', by: 'kaushal@gradeon.app' });
    expect((await patch({ expectedVersion: before.version, changes: { 'brand.color': '#1F2937' } })).status).toBe(409);
    // Any colour is allowed (text on it is white or ink, whichever reads); something that is not a colour is not.
    expect((await patch({ expectedVersion: r.json.version, changes: { 'brand.color': 'teal' } })).status).toBe(400);
    expect((await patch({ expectedVersion: r.json.version, changes: { 'modules.enabled': ['people', 'gallery'] } })).status).toBe(400);
    await wait();
    const seen = (await h.s('GET', '/v1/config', { school: 'cfgschool', token: school })).json;
    expect(seen.school.color).toBe('#0E7490');
    expect(seen.app.layout.parent.dock).toEqual(['home', 'fees']);
  });

  it('rolls back to an earlier version', async () => {
    const now = (await cfg()).json;
    const first = now.versions[now.versions.length - 1];
    await patch({ expectedVersion: now.version, changes: { 'school.tagline': 'A new tagline' } });
    const back = await h.c('POST', `/console/v1/schools/${id}/config/rollback`, { token: t, body: { versionId: first.id } });
    expect(back.status).toBe(200);
    expect(back.json.values['school.tagline']).not.toBe('A new tagline');
    expect(back.json.versions[0].note).toBe(`Rolled back to version ${first.version}`);
  });

  it('sends a risky change to a second person, and applies it when they approve', async () => {
    const now = (await cfg()).json;
    const r = await patch({ expectedVersion: now.version, changes: { 'security.twoFactor': false } });
    expect(r.json).toMatchObject({ pending: true });
    expect((await cfg()).json.values['security.twoFactor']).not.toBe(false);
    expect((await h.c('POST', `/console/v1/actions/${r.json.actionId}/approve`, { token: second })).status).toBe(200);
    for (let i = 0; i < 50 && (await cfg()).json.values['security.twoFactor'] !== false; i++) await new Promise((ok) => setTimeout(ok, 100));
    expect((await cfg()).json.values['security.twoFactor']).toBe(false);
    await h.c('POST', `/console/v1/actions/${(await patch({ expectedVersion: (await cfg()).json.version, changes: { 'security.twoFactor': true } })).json.actionId}/approve`, { token: second });
  });

  it('makes roles, decides who holds them, and the school follows', async () => {
    const roles = (await h.c('POST', `/console/v1/schools/${id}/roles`, { token: t, body: { name: 'Fee desk', description: 'Collects fees', permissions: ['fees.read', 'fees.collect', 'students.read'] } })).json;
    const exam = roles.find((r: { key: string }) => r.key === 'custom_fee_desk');
    expect(exam).toMatchObject({ people: 0, locked: false });
    expect((await h.c('POST', `/console/v1/schools/${id}/roles`, { token: t, body: { name: 'Bad', permissions: ['settings.write'] } })).status).toBe(400);
    const principal = roles.find((r: { key: string }) => r.key === 'principal');
    expect((await h.c('PUT', `/console/v1/schools/${id}/roles/${principal.id}`, { token: t, body: { name: 'Principal', permissions: [] } })).status).toBe(409);
    const staff = (await cfg()).json.staff.find((s: { designation: string }) => s.designation !== 'Principal');
    expect((await h.c('PUT', `/console/v1/schools/${id}/staff/${staff.id}/role`, { token: t, body: { roleId: exam.id } })).status).toBe(204);
    expect((await cfg()).json.staff.find((s: { id: string }) => s.id === staff.id).roleId).toBe(exam.id);
    expect((await h.s('GET', '/v1/roles', { school: 'cfgschool', token: school })).json.some((r: { key: string }) => r.key === 'custom_fee_desk')).toBe(true);
    const preview = (await h.c('GET', `/console/v1/schools/${id}/config/preview?roleId=${exam.id}`, { token: t })).json;
    const labels = preview.menu.flatMap((g: { pages: { label: string }[] }) => g.pages.map((p) => p.label));
    expect(labels).toContain('Fees');
    expect(labels).not.toContain('Timetable');
  });

  it('saves a setup as a template and applies it to another school, but never who the school is', async () => {
    const saved = (await h.c('POST', '/console/v1/config-templates', { token: t, body: { schoolId: id, name: 'Cfg standard' } })).json;
    const tpl = saved.find((x: { name: string }) => x.name === 'Cfg standard');
    expect(tpl.roles).toBeGreaterThan(0);
    expect((await launch('cfgtwo')).status).toBe('succeeded');
    const two = (await h.c('GET', '/console/v1/schools', { token: t })).json.find((s: { slug: string }) => s.slug === 'cfgtwo').id;
    expect((await h.c('POST', `/console/v1/config-templates/${tpl.id}/apply`, { token: t, body: { schoolIds: [two] } })).json.applied).toBe(1);
    const after = (await h.c('GET', `/console/v1/schools/${two}/config`, { token: t })).json;
    expect(after.values['fees.receiptPrefix']).toBe('GF/{year}/');
    expect(after.values['school.name']).not.toBe((await cfg()).json.values['school.name']);
    expect(after.roles.some((r: { key: string }) => r.key === 'custom_fee_desk')).toBe(true);
  });

  it('answers what a school asks for, and keeps configuration away from support and the school', async () => {
    await h.s('POST', '/v1/change-requests', { school: 'cfgschool', token: school, body: { area: 'App layout', message: 'Please add Events to the bottom tabs.' } });
    const open = (await h.c('GET', '/console/v1/change-requests', { token: t })).json;
    const req = open.find((x: { schoolSlug: string }) => x.schoolSlug === 'cfgschool');
    expect(req).toMatchObject({ area: 'App layout', status: 'open' });
    expect((await h.c('POST', `/console/v1/change-requests/${req.id}/answer`, { token: t, body: { status: 'done', answer: 'Added Events to the tabs.' } })).status).toBe(204);
    expect((await h.s('GET', '/v1/change-requests', { school: 'cfgschool', token: school })).json[0]).toMatchObject({ status: 'done', answer: 'Added Events to the tabs.' });
    await h.invite(t, { name: 'Sam Support', email: 'sam@gradeon.app', roles: ['support'] }, 'long-enough-pass');
    const sam = await h.signIn('sam@gradeon.app', 'long-enough-pass');
    expect((await patch({ expectedVersion: 1, changes: { 'school.tagline': 'x' } }, sam)).status).toBe(403);
    await h.invite(t, { name: 'Ira Implement', email: 'ira@gradeon.app', roles: ['implementation'] }, 'long-enough-pass');
    const ira = await h.signIn('ira@gradeon.app', 'long-enough-pass');
    expect((await patch({ expectedVersion: (await cfg()).json.version, changes: { 'school.tagline': 'Set by implementation' } }, ira)).status).toBe(200);
    expect((await h.s('PATCH', '/v1/settings', { school: 'cfgschool', token: school, body: { changes: { 'school.tagline': 'x' } } })).status).toBe(404);
  });
});

describe('modules per school', () => {
  const push = (params: object) => h.c('POST', '/console/v1/actions', { token: t, body: { action: 'entitlements.push', schoolId: id, params } });
  const row = async () => (await h.c('GET', '/console/v1/entitlements', { token: t })).json.find((r: { id: string }) => r.id === id);

  it('gives a module at once, and takes anything away only after a second person approves', async () => {
    const before = await row();
    expect(before.active).not.toContain('library');
    const give = await push({ modules: [...before.modules, 'library'], dates: { library: { until: '2099-12-31' } } });
    expect(give.json.status).toBe('done');
    expect(give.json.summary).toMatch(/added Library/);
    const take = await push({ features: { 'fees.onlinePayment': false } });
    expect(take.json.status).toBe('pending_approval');
    expect(take.json.summary).toMatch(/takes away Fees: Families pay in the app/);
    expect((await h.c('POST', `/console/v1/actions/${take.json.id}/approve`, { token: t })).status).toBe(403);
    expect((await h.c('POST', `/console/v1/actions/${take.json.id}/approve`, { token: second })).json.status).toBe('done');
    const after = (await h.c('GET', `/console/v1/schools/${id}`, { token: t })).json.entitlement;
    expect(after.active).toContain('library');
    expect(after.features).toEqual({ 'fees.onlinePayment': false });
    expect(after.dates.library).toEqual({ until: '2099-12-31' });
    // The school's own API follows: paying in the app is refused, the rest of Fees still works.
    const paid = await h.s('POST', '/v1/f/fees/x/pay', { school: 'cfgschool', token: school, body: {} });
    expect(paid.status).toBe(423);
    expect((await h.s('GET', '/v1/fees/summary', { school: 'cfgschool', token: school })).status).toBe(200);
  }, 60_000);

  it('refuses a module that is not built yet, before anyone approves anything', async () => {
    const r = await push({ modules: ['people', 'fees', 'hostel'] });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/not built yet/);
  });

  it('bills the plan plus each module added on top of it, and nothing during a trial', async () => {
    await h.c('POST', '/console/v1/billing/generate', { token: t, body: { period: '2030-01' } });
    const inv = (await h.c('GET', '/console/v1/billing/invoices', { token: t })).json.find((i: { schoolId: string; period: string }) => i.schoolId === id && i.period === '2030-01');
    expect(inv.lines.map((l: { label: string }) => l.label)).toEqual([expect.stringMatching(/plan/), 'Library (added)']);
    expect(inv.amount).toBe(inv.lines.reduce((a: number, l: { amount: number }) => a + l.amount, 0));
    expect((await push({ trialUntil: '2031-12-31' })).json.status).toBe('done');
    await h.c('POST', '/console/v1/billing/generate', { token: t, body: { period: '2031-06' } });
    const none = (await h.c('GET', '/console/v1/billing/invoices', { token: t })).json.filter((i: { schoolId: string; period: string }) => i.schoolId === id && i.period === '2031-06');
    expect(none).toEqual([]);
  }, 60_000);
});
