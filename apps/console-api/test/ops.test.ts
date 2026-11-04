import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, wizardPayload, type Harness } from './harness.js';

let h: Harness;
let t: string;
let second: string;

async function launch(slug: string) {
  const r = await h.c('POST', '/console/v1/wizard/launch', { token: t, body: { payload: wizardPayload(slug) } });
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
  await h.c('POST', '/console/v1/team', { token: t, body: { name: 'Second Admin', email: 'second@gradeon.app', roles: ['super_admin'], password: 'another-long-pass' } });
  second = await h.signIn('second@gradeon.app', 'another-long-pass');
  expect((await launch('moveme')).status).toBe('succeeded');
}, 240_000);
afterAll(async () => {
  await h?.close();
});

describe('cells', () => {
  it('creates a cell, refuses a duplicate or a bad name, and edits its limits', async () => {
    const made = await h.c('POST', '/console/v1/cells', { token: t, body: { key: 'local-2', target: 'local', region: 'this computer', maxSchools: 3 } });
    expect(made.status).toBe(200);
    expect((await h.c('POST', '/console/v1/cells', { token: t, body: { key: 'local-2', target: 'local', region: 'x1', maxSchools: 3 } })).status).toBe(400);
    expect((await h.c('POST', '/console/v1/cells', { token: t, body: { key: 'Bad Name', target: 'local', region: 'x1', maxSchools: 3 } })).status).toBe(400);
    const aws = await h.c('POST', '/console/v1/cells', { token: t, body: { key: 'mumbai-1', target: 'aws-cell', region: 'ap-south-1', maxSchools: 100 } });
    expect(aws.json.note).toMatch(/CELL_MUMBAI_1_ADMIN_URL/);
    expect((await h.c('PUT', '/console/v1/cells/local-2', { token: t, body: { maxSchools: 5, region: 'laptop' } })).status).toBe(200);
    const list = (await h.c('GET', '/console/v1/cells', { token: t })).json;
    expect(list.find((c: any) => c.key === 'local-2')).toMatchObject({ maxSchools: 5, region: 'laptop', accepting: true, schools: 0 });
    expect((await h.c('PUT', '/console/v1/cells/nope', { token: t, body: { maxSchools: 4 } })).status).toBe(404);
  });
  it('only people who may change policy can create cells', async () => {
    await h.c('POST', '/console/v1/team', { token: t, body: { name: 'Sam Support', email: 'sam@gradeon.app', roles: ['support'], password: 'long-enough-pass' } });
    const sam = await h.signIn('sam@gradeon.app', 'long-enough-pass');
    expect((await h.c('POST', '/console/v1/cells', { token: sam, body: { key: 'sneaky', target: 'local', region: 'x1', maxSchools: 3 } })).status).toBe(403);
  });
  it('moves a school to another cell of the same kind after a second person approves, and refuses closed or different cells', async () => {
    const school = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    const ask = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.move', schoolId: school.id, params: { cell: 'local-2' } } });
    expect(ask.json.status).toBe('pending_approval');
    const ok = await h.c('POST', `/console/v1/actions/${ask.json.id}/approve`, { token: second });
    expect(ok.json).toMatchObject({ status: 'done' });
    expect((await h.c('GET', '/console/v1/schools/moveme', { token: t })).json.cell).toBe('local-2');
    expect((await h.s('GET', '/v1/brand', { school: 'moveme' })).status).toBe(200);

    await h.c('PUT', '/console/v1/cells/local-1', { token: t, body: { accepting: false } });
    const toClosed = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.move', schoolId: school.id, params: { cell: 'local-1' } } });
    const closed = await h.c('POST', `/console/v1/actions/${toClosed.json.id}/approve`, { token: second });
    expect(closed.json.status).toBe('failed');
    expect(closed.json.summary).toMatch(/closed to new schools/);
    const toAws = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.move', schoolId: school.id, params: { cell: 'mumbai-1' } } });
    const aws = await h.c('POST', `/console/v1/actions/${toAws.json.id}/approve`, { token: second });
    expect(aws.json.status).toBe('failed');
    expect(aws.json.summary).toMatch(/database copy/);
  });
  it('keeps a closed cell out of the new-school wizard', async () => {
    const review = await h.c('POST', '/console/v1/wizard/review', { token: t, body: wizardPayload('nextschool', { placement: { target: 'local', cell: 'local-1', addressing: 'path', customDomain: '' } }) });
    expect(review.json.problems.join(' ')).toMatch(/closed to new schools/);
    await h.c('PUT', '/console/v1/cells/local-1', { token: t, body: { accepting: true } });
  });
  it('records the server version on a school at setup', async () => {
    const school = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    expect(school.versions.api).not.toBe('0.0.0');
  });
});

describe('compliance desk', () => {
  it('tracks an agreement until it is signed, once', async () => {
    const school = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    const made = await h.c('POST', '/console/v1/compliance', { token: t, body: { schoolId: school.id, kind: 'dpa', title: 'Data processing agreement 2026' } });
    expect(made.status).toBe(200);
    expect(made.json).toMatchObject({ kind: 'dpa', status: 'open', deadlineAt: null });
    expect((await h.c('POST', '/console/v1/compliance', { token: t, body: { schoolId: school.id, kind: 'dpa', title: 'Another agreement' } })).status).toBe(409);
    const signed = await h.c('PUT', `/console/v1/compliance/${made.json.id}`, { token: t, body: { status: 'signed' } });
    expect(signed.json).toMatchObject({ status: 'signed' });
    expect(signed.json.closedAt).toBeTruthy();
    expect((await h.c('PUT', `/console/v1/compliance/${made.json.id}`, { token: t, body: { status: 'open' } })).status).toBe(409);
  });
  it('gives a breach a 72-hour clock and tells the school when it is notified', async () => {
    const school = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    const made = await h.c('POST', '/console/v1/compliance', { token: t, body: { schoolId: school.id, kind: 'breach', title: 'Export sent to the wrong address', note: 'Found by support' } });
    const hours = (new Date(made.json.deadlineAt).getTime() - new Date(made.json.createdAt).getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(72);
    expect((await h.c('PUT', `/console/v1/compliance/${made.json.id}`, { token: t, body: { status: 'signed' } })).status).toBe(400);
    await h.c('PUT', `/console/v1/compliance/${made.json.id}`, { token: t, body: { status: 'notified', note: 'Contact informed by email' } });
    const inbox = (await h.c('GET', '/console/v1/sandbox?school=moveme', { token: t })).json;
    expect(inbox.find((m: any) => /Security notice/.test(m.subject ?? ''))).toBeTruthy();
    const list = (await h.c('GET', '/console/v1/compliance', { token: t })).json;
    expect(list.items.length).toBeGreaterThanOrEqual(2);
    expect(list.subprocessors.length).toBeGreaterThan(0);
  });
  it('lets only the compliance and super admin roles write', async () => {
    await h.c('POST', '/console/v1/team', { token: t, body: { name: 'Aud Itor', email: 'aud@gradeon.app', roles: ['auditor'], password: 'long-enough-pass' } });
    const aud = await h.signIn('aud@gradeon.app', 'long-enough-pass');
    expect((await h.c('GET', '/console/v1/compliance', { token: aud })).status).toBe(200);
    expect((await h.c('POST', '/console/v1/compliance', { token: aud, body: { schoolId: 'x', kind: 'breach', title: 'Not allowed' } })).status).toBe(403);
  });
});

describe('public status and kill switches', () => {
  it('shows the status without signing in and without any school data', async () => {
    const r = await h.c('GET', '/console/v1/public/status');
    expect(r.status).toBe(200);
    expect(['ok', 'degraded', 'down']).toContain(r.json.state);
    expect(r.json.schools.map((s: any) => s.name)).toContain('moveme School');
    expect(JSON.stringify(r.json)).not.toMatch(/students|password/i);
  });
  it('a kill switch pauses a module in the school API and takes it out of the config', async () => {
    const school = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    const inbox = (await h.c('GET', '/console/v1/sandbox?school=moveme', { token: t })).json;
    const invite = inbox.find((m: any) => m.channel === 'email' && /temporary password/.test(m.body));
    const password = /temporary password (\S+)\./.exec(invite.body)![1]!.replace(/\.$/, '');
    const login = await h.s('POST', '/v1/auth/login', { school: 'moveme', body: { identifier: 'asha@moveme.test', password } });
    const code = (await h.c('GET', '/console/v1/sandbox?school=moveme', { token: t })).json.find((m: any) => m.channel === 'sms' && /sign-in code/.test(m.body));
    const tok = (await h.s('POST', '/v1/auth/verify', { school: 'moveme', body: { challengeId: login.json.challenge.challengeId, code: /code for \S+ is (\d{6})/.exec(code.body)![1] } })).json.accessToken;
    expect((await h.s('GET', '/v1/fees/summary', { school: 'moveme', token: tok })).status).toBe(200);
    await h.c('PUT', '/console/v1/flags/kill.fees', { token: t, body: { enabled: true, schoolId: school.id, label: 'Fees paused' } });
    // The school API caches a school for a few seconds.
    await new Promise((ok) => setTimeout(ok, 16_000));
    const paused = await h.s('GET', '/v1/fees/summary', { school: 'moveme', token: tok });
    expect(paused.status).toBe(423);
    expect(paused.json.message).toMatch(/paused/);
    const cfg = (await h.s('GET', '/v1/config', { school: 'moveme', token: tok })).json;
    expect(cfg.modules).not.toContain('fees');
    expect(cfg.flags['kill.fees']).toBe(true);
  }, 60_000);
});
