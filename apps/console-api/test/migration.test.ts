import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, wizardPayload, type Harness } from './harness.js';

// A school moves in through the console: files in, checked, imported as batches that add up, undone when wrong.
let h: Harness;
let t: string;
let id: string;
let school: string;

beforeAll(async () => {
  h = await startHarness();
  t = await h.signIn();
  const r = await h.c('POST', '/console/v1/wizard/launch', { token: t, body: { payload: wizardPayload('moveschool') } });
  for (let i = 0; i < 400; i++) {
    const run = (await h.c('GET', `/console/v1/runs/${r.json.id}`, { token: t })).json;
    if (run.status === 'succeeded') break;
    if (run.status === 'failed') throw new Error('launch failed');
    await new Promise((ok) => setTimeout(ok, 100));
  }
  id = (await h.c('GET', '/console/v1/schools', { token: t })).json.find((s: { slug: string }) => s.slug === 'moveschool').id;
  // An empty school is not a demo: the admin's password and sign-in code arrive in the sandbox inbox.
  const inbox = async (to: string, re: RegExp) => re.exec((await h.registry.query("select body from sandbox_messages where school_slug = 'moveschool' and to_addr = $1 order by created_at desc limit 1", [to])).rows[0].body)![1]!;
  const password = await inbox('asha@moveschool.test', /temporary password (\S+)\./);
  const a = await h.s('POST', '/v1/auth/login', { school: 'moveschool', body: { identifier: 'asha@moveschool.test', password } });
  school = (await h.s('POST', '/v1/auth/verify', { school: 'moveschool', body: { challengeId: a.json.challenge.challengeId, code: await inbox('+91 90000 22222', /(\d{6})/) } })).json.accessToken;
}, 240_000);
afterAll(async () => {
  await h?.close();
});

const view = async () => (await h.c('GET', `/console/v1/schools/${id}/import`, { token: t })).json;
const post = (path: string, body?: unknown) => h.c('POST', `/console/v1/schools/${id}/import${path}`, { token: t, body: body ?? {} });

describe('the Migration workspace', () => {
  it('offers only what the plan includes, with a template for each', async () => {
    const v = await view();
    const kinds = v.kinds.map((k: any) => k.key);
    expect(kinds).toContain('fee_dues');
    expect(kinds).not.toContain('marks');
    expect(v.readiness.find((r: any) => r.key === 'structure').done).toBe(false);
    const tpl = await h.c('GET', `/console/v1/schools/${id}/import/template/students`, { token: t });
    // An .xlsx (a ZIP) with the columns by name; the admin offers the same sheet.
    expect(String(tpl.json).startsWith('PK')).toBe(true);
    expect(String(tpl.json)).toContain('Admission number');
    const fromAdmin = await h.s('GET', '/v1/moving-in/template/contacts', { school: 'moveschool', token: school });
    expect(fromAdmin.status).toBe(200);
    expect(String(fromAdmin.json)).toContain('Family phone numbers');
    expect((await post('/preview', { kind: 'marks', csv: 'a\n1' })).status).toBe(400);
  });

  it('loads a realistic test school through the importer, and it adds up', async () => {
    const r = await post('/sample', { students: 120 });
    expect(r.status).toBe(200);
    expect(r.json.some((b: any) => b.kind === 'students' && b.created === 120)).toBe(true);
    const v = await view();
    expect(v.students).toBe(120);
    expect(v.readiness.find((r: any) => r.key === 'structure').done).toBe(true);
    expect(v.readiness.find((r: any) => r.key === 'students').done).toBe(true);
    expect((await post('/sample', { students: 50 })).status).toBe(409);
  }, 120_000);

  it('imports a file the school sent, after showing what is wrong with it, and undoes it', async () => {
    const subjects = 'Subject,Periods\nArt,2\nMusic,x\n';
    const up = await h.s('POST', '/v1/moving-in/uploads', { school: 'moveschool', token: school, body: { fileName: 'subjects.csv', note: '', content: subjects } });
    expect(up.status).toBe(201);
    const v = await view();
    const file = v.uploads.find((u: any) => u.fileName === 'subjects.csv');
    expect(file).toMatchObject({ rows: 2, status: 'new' });
    const got = (await h.c('GET', `/console/v1/schools/${id}/import/uploads/${file.id}`, { token: t })).json;
    const p = (await post('/preview', { kind: 'subjects', csv: got.content, fileName: got.fileName, uploadId: file.id })).json;
    expect(p.mapping).toMatchObject({ Subject: 'name', Periods: 'per_week' });
    expect(p.rows[1].errors).toEqual(['Periods a week is a whole number.']);
    const b = (await post('/commit', { kind: 'subjects', csv: got.content, fileName: got.fileName, uploadId: file.id })).json;
    expect(b).toMatchObject({ created: 1, skipped: 1, canUndo: true });
    expect((await view()).uploads.find((u: any) => u.id === file.id).status).toBe('imported');
    // The school sees the same batch and its totals on its Moving in page.
    const seen = (await h.s('GET', '/v1/moving-in/batches', { school: 'moveschool', token: school })).json;
    expect(seen[0]).toMatchObject({ id: b.id, kind: 'subjects', created: 1 });
    const older = (await view()).batches.find((x: any) => x.kind === 'students');
    const refused = await post(`/batches/${older.id}/undo`);
    expect(refused.status).toBe(400);
    expect(refused.json.message).toMatch(/Only the newest/);
    expect((await post(`/batches/${b.id}/undo`)).status).toBe(200);
    expect((await view()).uploads.find((u: any) => u.id === file.id).status).toBe('new');
  }, 60_000);

  it('refuses to take a school past its plan’s student limit', async () => {
    const { students, studentLimit } = await view();
    const rows = Array.from({ length: studentLimit - students + 1 }, (_, i) => `X/${i},Child ${i},1 A,2019-01-01,Parent ${i},9876${String(i).padStart(6, '0')}`).join('\n');
    const r = await post('/commit', { kind: 'students', csv: `admission_no,name,class,dob,guardian_name,guardian_phone\n${rows}\n` });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(new RegExp(`plan allows ${studentLimit}`));
  }, 60_000);

  it('shows go-live as the school invites staff and families', async () => {
    expect((await h.s('POST', '/v1/moving-in/staff/invite', { school: 'moveschool', token: school })).json.sent).toBeGreaterThan(0);
    expect((await h.s('POST', '/v1/moving-in/families/invite', { school: 'moveschool', token: school, body: {} })).json.sent).toBeGreaterThan(0);
    const v = await view();
    expect(v.readiness.find((r: any) => r.key === 'staff_invited').done).toBe(true);
    expect(v.readiness.find((r: any) => r.key === 'families_invited').done).toBe(true);
    const zip = await h.c('GET', `/console/v1/schools/${id}/import/export`, { token: t });
    expect(zip.status).toBe(200);
  }, 60_000);

  it('reconciles the dues against the old system’s total, and takes the team’s ticks', async () => {
    const mark = (body: unknown) => h.c('PATCH', `/console/v1/schools/${id}/import/readiness`, { token: t, body });
    const before = await view();
    const fees = () => before.readiness.find((r: any) => r.key === 'fees');
    expect(fees().done).toBe(false);
    expect(fees().detail).toContain('type the old system');
    const off = (await mark({ key: 'old_dues', amount: before.dues.outstanding + 1 })).json;
    expect(off.readiness.find((r: any) => r.key === 'fees').done).toBe(false);
    const same = (await mark({ key: 'old_dues', amount: before.dues.outstanding })).json;
    expect(same.readiness.find((r: any) => r.key === 'fees')).toMatchObject({ done: true });
    expect(same.readiness.find((r: any) => r.key === 'timetable').done).toBe(true);
    const ticked = (await mark({ key: 'config_reviewed', done: true })).json;
    expect(ticked.readiness.find((r: any) => r.key === 'config_reviewed')).toMatchObject({ done: true, manual: true });
    expect((await mark({ key: 'something', done: true })).status).toBe(400);
  });
});
