import { addDays, istToday } from '@gradeon/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

let h: Harness;
let token: string;
beforeAll(async () => {
  h = await startHarness();
  token = await h.login();
}, 240_000);
afterAll(async () => {
  await h?.close();
});

const get = (url: string) => h.call('GET', url, { token });
const send = (method: string, url: string, body?: unknown) => h.call(method, url, { token, body });

describe('homework', () => {
  it('sets homework for a class, records hand-ins and checks marks against the maximum', async () => {
    const due = addDays(istToday(), 3);
    const made = await send('POST', '/v1/homework', { classId: 'cls_8a', subjectId: 'sub_maths', title: 'Quadratic practice', dueOn: due, maxMarks: 10 });
    expect(made.status).toBe(201);
    expect(made.json.total).toBe(36);
    expect(made.json.handedIn).toBe(0);
    const first = made.json.students[0].studentId;
    const marked = await send('PUT', `/v1/homework/${made.json.id}/marks`, { marks: [{ studentId: first, handed: true, score: 9, feedback: 'Neat work' }] });
    expect(marked.status).toBe(200);
    expect(marked.json.handedIn).toBe(1);
    expect(marked.json.onTime).toBe(1);
    expect(marked.json.students.find((s: any) => s.studentId === first)).toMatchObject({ score: 9, feedback: 'Neat work' });
    const tooHigh = await send('PUT', `/v1/homework/${made.json.id}/marks`, { marks: [{ studentId: first, handed: true, score: 11 }] });
    expect(tooHigh.status).toBe(400);
    const undo = await send('PUT', `/v1/homework/${made.json.id}/marks`, { marks: [{ studentId: first, handed: false }] });
    expect(undo.json.handedIn).toBe(0);
    expect((await send('POST', '/v1/homework', { classId: 'cls_8a', subjectId: 'sub_maths', title: 'Late one', dueOn: addDays(istToday(), -1) })).status).toBe(400);
    expect((await get('/v1/homework?classId=cls_8a')).json.some((x: any) => x.id === made.json.id)).toBe(true);
    expect((await send('DELETE', `/v1/homework/${made.json.id}`)).status).toBe(204);
  });
  it('is refused for a role without the permission', async () => {
    const teacher = await h.login('kavita.iyer@greenfield.edu.in');
    expect((await h.call('POST', '/v1/admissions', { token: teacher, body: { childName: 'Nope Nope', gradeSought: 2, guardianName: 'Nope', phone: '+91 98000 00000' } })).status).toBe(403);
    expect((await h.call('GET', '/v1/homework', { token: teacher })).status).toBe(200);
  });
});

describe('exams', () => {
  it('goes from schedule to marks to published results with ranks', async () => {
    const day = addDays(istToday(), -1);
    const made = await send('POST', '/v1/exams', { name: 'Class test', classId: 'cls_8a', startsOn: day, endsOn: day, subjects: [{ subjectId: 'sub_maths', onDate: day, maxMarks: 50 }, { subjectId: 'sub_english', maxMarks: 50 }] });
    expect(made.status).toBe(201);
    expect(made.json.expected).toBe(72);
    const id = made.json.id;
    const view = (await get(`/v1/exams/${id}/marks`)).json;
    expect(view.students).toHaveLength(36);
    expect((await send('POST', `/v1/exams/${id}/publish`)).status).toBe(409);
    const marks = view.students.flatMap((s: any, i: number) => [
      { studentId: s.studentId, subjectId: 'sub_maths', score: i === 0 ? 50 : 20 + (i % 20), absent: false },
      { studentId: s.studentId, subjectId: 'sub_english', score: i === 1 ? null : 30, absent: i === 1 },
    ]);
    const put = await send('PUT', `/v1/exams/${id}/marks`, { marks });
    expect(put.status).toBe(200);
    expect(put.json.exam.status).toBe('marking');
    expect((await send('PUT', `/v1/exams/${id}/marks`, { marks: [{ studentId: view.students[0].studentId, subjectId: 'sub_maths', score: 51, absent: false }] })).status).toBe(400);
    const res = (await get(`/v1/exams/${id}/results`)).json;
    expect(res.rows[0]).toMatchObject({ studentId: view.students[0].studentId, total: 80, max: 100, pct: 80, rank: 1 });
    expect(res.rows.length).toBe(36);
    const pub = await send('POST', `/v1/exams/${id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.json.exam.status).toBe('published');
    const detail = (await get(`/v1/students/${view.students[0].studentId}`)).json;
    expect(detail.id).toBe(view.students[0].studentId);
    expect((await send('DELETE', `/v1/exams/${id}`)).status).toBe(409);
    // Editing a mark after publishing sends the exam back to marking, so families never see a number that was changed behind their back.
    const edit = await send('PUT', `/v1/exams/${id}/marks`, { marks: [{ studentId: view.students[2].studentId, subjectId: 'sub_maths', score: 10, absent: false }] });
    expect(edit.json.exam.status).toBe('marking');
  });
  it('rejects an exam that ends before it starts or names an unknown subject', async () => {
    const d = istToday();
    expect((await send('POST', '/v1/exams', { name: 'Odd exam', classId: 'cls_8a', startsOn: d, endsOn: addDays(d, -2), subjects: [{ subjectId: 'sub_maths', maxMarks: 20 }] })).status).toBe(400);
    expect((await send('POST', '/v1/exams', { name: 'Odd exam', classId: 'cls_8a', startsOn: d, endsOn: d, subjects: [{ subjectId: 'sub_nope', maxMarks: 20 }] })).status).toBe(400);
  });
  it('has sample exams on the demo school', async () => {
    const list = (await get('/v1/exams?classId=cls_8a')).json;
    expect(list.map((e: any) => e.status).sort()).toEqual(expect.arrayContaining(['published', 'upcoming']));
    const ut = list.find((e: any) => e.name === 'Unit test 1');
    const res = (await get(`/v1/exams/${ut.id}/results`)).json;
    expect(res.rows.find((r: any) => r.name === 'Aarav Sharma').pct).toBe(91);
  });
});

describe('staff and roles', () => {
  it('adds a teacher, sends the invite to the sandbox and lets them sign in with the temporary password', async () => {
    const made = await send('POST', '/v1/staff', { name: 'Pooja Rane', email: 'pooja.rane@greenfield.edu.in', phone: '+91 98765 43210', designation: 'Teacher', subjectIds: ['sub_maths'], roleId: 'role_teacher' });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ name: 'Pooja Rane', subjects: [{ id: 'sub_maths' }], roles: [{ id: 'role_teacher' }] });
    const dup = await send('POST', '/v1/staff', { name: 'Pooja Rane', email: 'POOJA.RANE@greenfield.edu.in', phone: '+91 98765 43211', roleId: 'role_teacher' });
    expect(dup.status).toBe(400);
    const inbox = await h.registry.query("select body from sandbox_messages where school_slug = 'greenfield' and channel = 'email' and subject = 'Staff invite' order by created_at desc limit 1");
    const temp = /password (\S+?)(?:,| then)/.exec(inbox.rows[0].body)?.[1];
    expect(temp).toBeTruthy();
    const step1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'pooja.rane@greenfield.edu.in', password: temp } });
    expect(step1.status).toBe(200);
  });
  it('lets the principal change a role but never their own, and switches a person off', async () => {
    const me = (await get('/v1/me')).json;
    expect((await send('PATCH', `/v1/staff/${me.id}`, { roleId: 'role_teacher' })).status).toBe(403);
    const list = (await get('/v1/staff?query=Pooja')).json;
    const pooja = list[0];
    const off = await send('PATCH', `/v1/staff/${pooja.id}`, { status: 'inactive', designation: 'Maths teacher' });
    expect(off.json).toMatchObject({ status: 'inactive', designation: 'Maths teacher' });
  });
  it('creates a custom role, refuses to give away what the author lacks, and protects the built-in roles', async () => {
    const made = await send('POST', '/v1/roles', { name: 'Exam cell', description: 'Marks and results', permissions: ['exams.read', 'exams.write', 'students.read'] });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ key: 'custom_exam_cell', locked: false, people: 0 });
    expect((await send('POST', '/v1/roles', { name: 'Exam cell', permissions: [] })).status).toBe(400);
    const principal = (await get('/v1/roles')).json.find((r: any) => r.key === 'principal');
    expect(principal.locked).toBe(true);
    expect((await send('PUT', `/v1/roles/${principal.id}`, { name: 'Principal', permissions: [] })).status).toBe(409);
    expect((await send('DELETE', '/v1/roles/role_teacher')).status).toBe(409);
    // A teacher cannot read or create roles that carry permissions they do not hold.
    const teacher = await h.login('kavita.iyer@greenfield.edu.in');
    expect((await h.call('POST', '/v1/roles', { token: teacher, body: { name: 'Sneaky', permissions: ['fees.waive'] } })).status).toBe(403);
    expect((await send('DELETE', `/v1/roles/${made.json.id}`)).status).toBe(204);
  }, 30_000);
});

describe('admissions', () => {
  it('moves an application through the stages and enrols the child as a student', async () => {
    const list = (await get('/v1/admissions')).json;
    expect(list.length).toBeGreaterThanOrEqual(6);
    const made = await send('POST', '/v1/admissions', { childName: 'Anvi Kulkarni', gradeSought: 4, guardianName: 'Rohit Kulkarni', phone: '+91 98220 11111', source: 'walk-in' });
    expect(made.status).toBe(201);
    expect(made.json.stage).toBe('enquiry');
    expect((await send('PATCH', `/v1/admissions/${made.json.id}`, { stage: 'test' })).status).toBe(400);
    const test = await send('PATCH', `/v1/admissions/${made.json.id}`, { stage: 'test', testOn: addDays(istToday(), 4) });
    expect(test.json).toMatchObject({ stage: 'test', testOn: addDays(istToday(), 4) });
    const offer = await send('PATCH', `/v1/admissions/${made.json.id}`, { stage: 'offer' });
    expect(offer.json.stage).toBe('offer');
    expect((await send('PATCH', `/v1/admissions/${made.json.id}`, { stage: 'enrolled' })).status).toBe(400);
    const before = (await get('/v1/students/summary')).json.total;
    const enrolled = await send('POST', `/v1/admissions/${made.json.id}/enrol`, { classId: 'cls_4a', dob: '2016-05-12' });
    expect(enrolled.status).toBe(200);
    expect(enrolled.json.name).toBe('Anvi Kulkarni');
    expect((await get('/v1/students/summary')).json.total).toBe(before + 1);
    expect((await get('/v1/admissions')).json.find((e: any) => e.id === made.json.id)).toMatchObject({ stage: 'enrolled', studentId: enrolled.json.id });
    expect((await send('POST', `/v1/admissions/${made.json.id}/enrol`, { classId: 'cls_4a', dob: '2016-05-12' })).status).toBe(409);
  });
  it('shows the number waiting on the menu', async () => {
    const shell = (await get('/v1/shell')).json;
    expect(shell.badges.admissions).toBeGreaterThan(0);
  });
});

describe('money lists and reports', () => {
  it('lists invoices by status and totals them, and lists receipts', async () => {
    const overdue = (await get('/v1/fees/invoice-list?status=overdue&limit=5')).json;
    expect(overdue.items.length).toBe(5);
    expect(overdue.items.every((i: any) => i.status === 'overdue' && i.outstanding > 0)).toBe(true);
    expect(overdue.summary.outstanding).toBeGreaterThan(0);
    const paid = (await get('/v1/fees/invoice-list?status=paid&head=tuition&limit=3')).json;
    expect(paid.items.every((i: any) => i.status === 'paid' && i.outstanding === 0)).toBe(true);
    const search = (await get('/v1/fees/invoice-list?query=Aarav')).json;
    expect(search.items.every((i: any) => i.studentName.includes('Aarav'))).toBe(true);
    const receipts = (await get('/v1/fees/receipts?query=Aarav')).json;
    expect(receipts.some((r: any) => r.receiptNo === 'RCPT-2026-08812')).toBe(true);
  });
  it('builds every report and exports it as a CSV', async () => {
    const list = (await get('/v1/reports')).json;
    expect(list.length).toBeGreaterThanOrEqual(7);
    for (const r of list) {
      const data = await get(`/v1/reports/${r.id}`);
      expect(data.status).toBe(200);
      expect(data.json.columns.length).toBeGreaterThan(1);
      const csv = await get(`/v1/reports/${r.id}/csv`);
      expect(csv.text.split('\n')[0]).toContain(data.json.columns[0].label);
    }
    const strength = (await get('/v1/reports/strength')).json;
    expect(strength.rows).toHaveLength(42);
    expect((await get('/v1/reports/nope')).status).toBe(404);
  });
});

describe('messages', () => {
  it('lists conversations, marks them read when opened and lets staff reply', async () => {
    const list = (await get('/v1/messages')).json;
    expect(list.length).toBeGreaterThanOrEqual(8);
    const unread = list.find((t: any) => t.unread > 0);
    expect(unread).toBeTruthy();
    const opened = (await get(`/v1/messages/${unread.id}`)).json;
    expect(opened.messages.length).toBeGreaterThan(0);
    expect((await get('/v1/messages')).json.find((t: any) => t.id === unread.id).unread).toBe(0);
    const replied = await send('POST', `/v1/messages/${unread.id}/reply`, { body: 'Thanks, we will sort this out today.' });
    expect(replied.json.messages.at(-1)).toMatchObject({ from: 'staff', body: 'Thanks, we will sort this out today.' });
    expect((await send('POST', `/v1/messages/${unread.id}/reply`, { body: '   ' })).status).toBe(400);
    const closed = await send('PATCH', `/v1/messages/${unread.id}`, { status: 'closed' });
    expect(closed.json.status).toBe('closed');
  });
  it('starts a conversation with a family', async () => {
    const stu = (await get('/v1/students?query=Aarav%20Sharma&limit=1')).json.items[0];
    const made = await send('POST', '/v1/messages', { studentId: stu.id, subject: 'Parent meeting', body: 'Could you come on Friday at 3?' });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ subject: 'Parent meeting', studentName: 'Aarav Sharma', status: 'open' });
  });
});

describe('events', () => {
  it('adds, changes and removes an event, and counts replies', async () => {
    const at = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const made = await send('POST', '/v1/events', { title: 'Book fair', startsAt: at, kind: 'event', venue: 'Library', audience: 'everyone' });
    expect(made.status).toBe(201);
    const edit = await send('PUT', `/v1/events/${made.json.id}`, { title: 'Book fair, day 1', startsAt: at, kind: 'event', venue: 'Library hall', audience: 'parents' });
    expect(edit.json).toMatchObject({ title: 'Book fair, day 1', venue: 'Library hall', audience: 'parents' });
    expect((await send('PUT', `/v1/events/${made.json.id}`, { title: 'Backwards', startsAt: at, endsAt: new Date(Date.now()).toISOString(), kind: 'event' })).status).toBe(400);
    expect((await get('/v1/events')).json.find((e: any) => e.title === 'Sports day').going).toBeGreaterThan(0);
    expect((await send('DELETE', `/v1/events/${made.json.id}`)).status).toBe(204);
    expect((await send('DELETE', '/v1/events/evt_assembly')).status).toBe(404);
  });
});

describe('privacy and templates', () => {
  it('keeps data requests and closes them once', async () => {
    const made = await send('POST', '/v1/privacy/requests', { kind: 'erasure', subjectName: 'Test Child', requestedBy: 'Parent', note: 'Moved schools' });
    expect(made.status).toBe(201);
    const done = await send('POST', `/v1/privacy/requests/${made.json.id}/decision`, { status: 'done', note: 'Erased' });
    expect(done.json).toMatchObject({ status: 'done', note: 'Erased' });
    expect((await send('POST', `/v1/privacy/requests/${made.json.id}/decision`, { status: 'declined' })).status).toBe(409);
  });
  it('sends school messages with the wording and channels the school chose', async () => {
    const stu = (await get('/v1/students?query=Anika%20Rao&limit=1')).json.items[0];
    const patched = await send('PATCH', '/v1/settings', { changes: {
      'templates.messages': { 'fees.reminder': 'Hello! {student} has a fee waiting. Please pay soon. {school}' },
      'notify.rules': { 'fees.reminder': { push: false, sms: true, email: false } },
    } });
    expect(patched.status).toBe(200);
    const before = Number((await h.registry.query("select count(*) n from sandbox_messages where school_slug = 'greenfield'")).rows[0].n);
    const r = await send('POST', '/v1/fees/reminders', { ids: [stu.id] });
    expect(r.json.sent).toBe(1);
    const rows = (await h.registry.query("select channel, body from sandbox_messages where school_slug = 'greenfield' order by created_at desc limit 1")).rows;
    expect(rows[0]).toMatchObject({ channel: 'sms', body: 'Hello! Anika Rao has a fee waiting. Please pay soon. Greenfield' });
    expect(Number((await h.registry.query("select count(*) n from sandbox_messages where school_slug = 'greenfield'")).rows[0].n)).toBe(before + 1);
    expect((await send('PATCH', '/v1/settings', { changes: { 'notify.quietFrom': '9pm' } })).status).toBe(400);
  });
  it('puts the app layout and console flags into the config the apps fetch', async () => {
    await send('PATCH', '/v1/settings', { changes: { 'app.dock': ['home', 'fees', 'nonsense'], 'app.quick': ['payFees'] } });
    const cfg = (await get('/v1/config')).json;
    expect(cfg.app.dock).toEqual(['home', 'fees']);
    expect(cfg.app.quick).toEqual(['payFees']);
    expect(cfg.flags).toBeTypeOf('object');
  });
});
