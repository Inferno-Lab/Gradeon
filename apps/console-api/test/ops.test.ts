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
  await h.invite(t, { name: 'Second Admin', email: 'second@gradeon.app', roles: ['super_admin'] }, 'another-long-pass');
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
    // A cell on AWS names the School databases connection that makes its schools' databases (no server variable).
    const bare = await h.c('POST', '/console/v1/cells', { token: t, body: { key: 'mumbai-1', target: 'aws-cell', region: 'ap-south-1', maxSchools: 100 } });
    expect(bare.status).toBe(400);
    const conn = await h.c('POST', '/console/v1/integrations/connections', { token: t, body: { provider: 'postgres-server', name: 'Mumbai databases', scope: 'platform', settings: {}, secrets: { adminUrl: h.server.url } } });
    expect(conn.status).toBe(200);
    const aws = await h.c('POST', '/console/v1/cells', { token: t, body: { key: 'mumbai-1', target: 'aws-cell', region: 'ap-south-1', maxSchools: 100, connectionId: conn.json.id } });
    expect(aws.status).toBe(200);
    expect((await h.c('GET', '/console/v1/cells', { token: t })).json.find((c: any) => c.key === 'mumbai-1').connectionName).toBe('Mumbai databases');
    expect((await h.c('PUT', '/console/v1/cells/local-2', { token: t, body: { maxSchools: 5, region: 'laptop' } })).status).toBe(200);
    const list = (await h.c('GET', '/console/v1/cells', { token: t })).json;
    expect(list.find((c: any) => c.key === 'local-2')).toMatchObject({ maxSchools: 5, region: 'laptop', accepting: true, schools: 0 });
    expect((await h.c('PUT', '/console/v1/cells/nope', { token: t, body: { maxSchools: 4 } })).status).toBe(404);
  });
  it('only people who may change policy can create cells', async () => {
    await h.invite(t, { name: 'Sam Support', email: 'sam@gradeon.app', roles: ['support'] }, 'long-enough-pass');
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
    // A cell on another database connection gets a real copy: closed for writes, backed up, copied, every table checked, switched.
    const before = (await h.s('GET', '/v1/brand', { school: 'moveme' })).json;
    const aws = await h.c('POST', `/console/v1/actions/${toAws.json.id}/approve`, { token: second });
    expect(aws.json).toMatchObject({ status: 'done' });
    expect(aws.json.summary).toMatch(/copied to school_moveme_\w+ and every table checked/);
    expect((await h.c('GET', '/console/v1/schools/moveme', { token: t })).json).toMatchObject({ cell: 'mumbai-1', status: 'live' });
    expect((await h.s('GET', '/v1/brand', { school: 'moveme' })).json).toEqual(before);
    expect((await h.c('GET', `/console/v1/schools/${school.id}/backups`, { token: t })).json.some((b: any) => /before moving/.test(b.takenBy))).toBe(true);
  }, 120_000);
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
    const signed = await h.c('PUT', `/console/v1/compliance/${made.json.id}`, { token: t, body: { status: 'signed', signedOn: '2026-01-02', signedBy: 'The principal', file: { name: 'dpa.pdf', data: Buffer.from('%PDF-1.4').toString('base64') } } });
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
    // Who else handles the data is every live connection, not a list kept by hand.
    const live = (await h.registry.query("select count(*)::int n from integration_connections where state = 'live' and provider <> 'sandbox'")).rows[0].n;
    expect(list.subprocessors).toHaveLength(live);
  });
  it('lets only the compliance and super admin roles write', async () => {
    await h.invite(t, { name: 'Aud Itor', email: 'aud@gradeon.app', roles: ['auditor'] }, 'long-enough-pass');
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

describe('one pass: plans, go-live, starting roles, invoices, flags, errors, approvals, compliance', () => {
  it('keeps plans as data: added, priced, refused removal while a school is on it, then removed', async () => {
    const made = await h.c('POST', '/console/v1/plans', { token: t, body: { key: 'e2e-plan', name: 'E2E plan', perStudentYear: 100, modules: ['attendance'], limits: { students: 50, storageGb: 1, smsPerMonth: 0 } } });
    expect(made.status).toBe(200);
    expect(made.json.find((p: any) => p.key === 'e2e-plan')).toMatchObject({ name: 'E2E plan', perStudentYear: 100, schools: 0 });
    expect((await h.c('PUT', '/console/v1/plans/e2e-plan', { token: t, body: { key: 'e2e-plan', name: 'E2E plan', perStudentYear: 120, modules: ['attendance'], limits: { students: 50, storageGb: 1, smsPerMonth: 0 } } })).json.find((p: any) => p.key === 'e2e-plan').perStudentYear).toBe(120);
    const busy = (await h.c('GET', '/console/v1/plans', { token: t })).json.find((p: any) => p.schools > 0);
    expect((await h.c('DELETE', `/console/v1/plans/${busy.key}`, { token: t })).status).toBe(409);
    expect((await h.c('DELETE', '/console/v1/plans/e2e-plan', { token: t })).status).toBe(200);
  });
  it('goes live only with a green checklist, and keeps moving in apart from running', async () => {
    const s = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    expect(s).toMatchObject({ status: 'live', wentLiveAt: null });
    const r = await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'school.golive', schoolId: s.id, params: {} } });
    expect(r.json).toMatchObject({ status: 'failed' });
    expect(r.json.summary).toMatch(/^Not ready/);
  });
  it('keeps the starting roles as data; the built-in ones cannot be removed', async () => {
    const roles = (await h.c('GET', '/console/v1/role-templates', { token: t })).json;
    expect(roles.map((r: any) => r.key)).toEqual(expect.arrayContaining(['principal', 'teacher']));
    expect((await h.c('PUT', '/console/v1/role-templates', { token: t, body: roles.filter((r: any) => r.key !== 'teacher') })).status).toBe(400);
    const renamed = roles.map((r: any) => (r.key === 'teacher' ? { ...r, name: 'Class teacher' } : r));
    expect((await h.c('PUT', '/console/v1/role-templates', { token: t, body: renamed })).json.find((r: any) => r.key === 'teacher').name).toBe('Class teacher');
  });
  it('marks an invoice paid with a day and a reference, undoes it, and works out overdue', async () => {
    const s = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    await h.registry.query("insert into invoices (id, school_id, school_name, period, amount, status, lines, sent_at) values ('inv_e2e', $1, 'moveme School', '2020-01', 1000, 'sent', '[]', now())", [s.id]);
    const one = () => h.c('GET', '/console/v1/billing/invoices', { token: t }).then((r) => r.json.find((i: any) => i.id === 'inv_e2e'));
    expect(await one()).toMatchObject({ status: 'overdue', dueOn: '2020-02-15' });
    expect((await h.c('POST', '/console/v1/billing/invoices/inv_e2e/paid', { token: t, body: { paidOn: '2020-02-01', reference: '' } })).status).toBe(400);
    expect((await h.c('POST', '/console/v1/billing/invoices/inv_e2e/paid', { token: t, body: { paidOn: '2020-02-01', reference: 'BANK-123' } })).status).toBe(204);
    expect(await one()).toMatchObject({ status: 'paid', paidOn: '2020-02-01', paidRef: 'BANK-123' });
    expect((await h.c('DELETE', '/console/v1/billing/invoices/inv_e2e/paid', { token: t })).status).toBe(204);
    expect(await one()).toMatchObject({ status: 'overdue', paidOn: null });
  });
  it('deletes a flag, hides a handled error until it happens again, and wants a reason to reject', async () => {
    await h.c('PUT', '/console/v1/flags/e2e.gone', { token: t, body: { enabled: true, label: 'Gone soon' } });
    expect((await h.c('DELETE', '/console/v1/flags/e2e.gone', { token: t })).status).toBe(204);
    expect((await h.c('GET', '/console/v1/flags', { token: t })).json.some((f: any) => f.key === 'e2e.gone')).toBe(false);
    await h.registry.query("insert into error_reports (fingerprint, source, message) values ('fp_e2e', 'api', 'E2E error') on conflict do nothing");
    const listed = async (handled = false) => (await h.c('GET', `/console/v1/errors?days=7${handled ? '&handled=true' : ''}`, { token: t })).json.some((e: any) => e.fingerprint === 'fp_e2e');
    expect(await listed()).toBe(true);
    expect((await h.c('POST', '/console/v1/errors/fp_e2e/handled', { token: t })).status).toBe(204);
    expect(await listed()).toBe(false);
    expect(await listed(true)).toBe(true);
    const s = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    const asked = (await h.c('POST', '/console/v1/actions', { token: t, body: { action: 'backup.restore', schoolId: s.id, params: { backupId: 'nope' } } })).json;
    expect(asked.status).toBe('pending_approval');
    expect((await h.c('POST', `/console/v1/actions/${asked.id}/reject`, { token: second, body: {} })).status).toBe(400);
    const no = (await h.c('POST', `/console/v1/actions/${asked.id}/reject`, { token: second, body: { note: 'Not during exams week' } })).json;
    expect(no).toMatchObject({ status: 'rejected', decisionNote: 'Not during exams week', approvedBy: 'second@gradeon.app' });
    expect((await h.c('GET', `/console/v1/audit?school=${s.id}&action=action.`, { token: t })).json.every((a: any) => a.action.startsWith('action.'))).toBe(true);
  });
  it('signs an agreement only with its file, day and signer', async () => {
    const s = (await h.c('GET', '/console/v1/schools/moveme', { token: t })).json;
    const dpa = (await h.c('POST', '/console/v1/compliance', { token: t, body: { schoolId: s.id, kind: 'dpa', title: 'Data processing agreement', note: '' } })).json;
    expect((await h.c('PUT', `/console/v1/compliance/${dpa.id}`, { token: t, body: { status: 'signed' } })).status).toBe(400);
    const signed = await h.c('PUT', `/console/v1/compliance/${dpa.id}`, { token: t, body: { status: 'signed', signedOn: '2026-01-02', signedBy: 'Ana Silva, principal', file: { name: 'dpa.pdf', data: Buffer.from('%PDF-1.4 signed').toString('base64') } } });
    expect(signed.json).toMatchObject({ status: 'signed', signedBy: 'Ana Silva, principal', fileName: 'dpa.pdf' });
  });
});
