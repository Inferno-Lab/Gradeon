import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

let h: Harness;
let parent: string;
let teacher: string;
let admin: string;
let ananya: string;

const f = (token: string, url: string) => h.call('GET', `/v1/f${url}`, { token });
const post = (token: string, url: string, body?: unknown) => h.call('POST', `/v1/f${url}`, { token, body: body ?? {} });

beforeAll(async () => {
  h = await startHarness();
  parent = await h.login('priya.sharma@example.com');
  teacher = await h.login('kavita.iyer@greenfield.edu.in');
  admin = await h.login();
  ananya = (await f(parent, '/me')).json.childIds.find((c: string) => c !== 'stu_aarav');
}, 240_000);
afterAll(async () => {
  await h?.close();
});

describe('who is signed in', () => {
  it('tells the app who the person is, in the app’s own shape', async () => {
    expect((await f(parent, '/me')).json).toMatchObject({ role: 'parent', name: 'Priya Sharma', childIds: expect.arrayContaining(['stu_aarav']) });
    expect((await f(parent, '/me')).json.childIds).toHaveLength(2);
    expect((await f(teacher, '/me')).json).toMatchObject({ role: 'teacher', name: 'Kavita Iyer' });
    const blocked = await h.call('POST', '/v1/auth/login', { body: { identifier: 'aarav.sharma@gradeon.app', password: 'nest2026' } });
    expect(blocked.status === 401 || blocked.status === 403).toBe(true);
    expect(blocked.json?.step).toBeUndefined();
    expect((await h.call('GET', '/v1/f/me')).status).toBe(401);
  });
  it('keeps families out of the staff API', async () => {
    for (const url of ['/v1/dashboard', '/v1/search?q=a', '/v1/shell', '/v1/students', '/v1/reports']) expect((await h.call('GET', url, { token: parent })).status).toBe(403);
    expect((await h.call('GET', '/v1/me', { token: parent })).status).toBe(200);
    expect((await h.call('GET', '/v1/config', { token: parent })).status).toBe(200);
    expect((await h.call('GET', '/v1/dashboard', { token: admin })).status).toBe(200);
  });
  it('keeps each family to its own children', async () => {
    expect((await f(parent, '/students/stu_aarav')).status).toBe(200);
    expect((await f(parent, '/students/stu_diya')).status).toBe(403);
    expect((await f(parent, '/students/stu_diya/fees')).status).toBe(403);
    expect((await f(parent, '/classes/cls_9a/timetable')).status).toBe(403);
    expect((await f(teacher, '/students/stu_diya')).status).toBe(200);
  });
  it('lists the classes and teachers the way the app expects', async () => {
    const cls = (await f(parent, '/classes/cls_8a')).json;
    expect(cls).toMatchObject({ name: 'Class 8', section: 'A' });
    expect(cls.studentIds.length).toBeGreaterThan(30);
    const mine = (await f(teacher, '/teachers/' + (await f(teacher, '/me')).json.id + '/classes')).json;
    expect(mine.map((c: any) => c.id)).toContain('cls_8a');
    expect((await f(parent, '/teachers')).json.some((t: any) => t.name === 'Kavita Iyer' && t.subject === 'maths')).toBe(true);
  });
});

describe('learning', () => {
  it('serves the timetable with breaks, homework with submissions and published results', async () => {
    const tt = (await f(parent, '/classes/cls_8a/timetable')).json;
    expect(tt.map((d: any) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(tt[0].periods.filter((p: any) => p.kind === 'class').length).toBe(8);
    expect(tt[0].periods.some((p: any) => p.kind === 'break')).toBe(true);
    const hw = (await f(parent, '/classes/cls_8a/homework')).json;
    expect(hw.length).toBeGreaterThan(0);
    expect(hw[0].submissions.find((s: any) => s.studentId === 'stu_aarav')).toBeTruthy();
    const exams = (await f(parent, '/classes/cls_8a/exams')).json;
    const ut = exams.find((e: any) => e.name === 'Unit test 1');
    expect(ut).toMatchObject({ status: 'completed', subjects: expect.arrayContaining(['maths']) });
    const res = (await f(parent, `/results/${ut.id}/stu_aarav`)).json;
    expect(res).toMatchObject({ overallPercent: 91, grade: 'A1', rank: expect.any(Number) });
    expect(res.subjects.length).toBe(5);
    expect((await f(parent, '/students/stu_aarav/results')).json.length).toBeGreaterThan(0);
    const mid = exams.find((e: any) => e.name === 'Mid-term exams');
    expect((await f(parent, `/results/${mid.id}/stu_aarav`)).status).toBe(404);
  });
  it('lets a parent hand homework in and a teacher grade it', async () => {
    const assigned = await post(teacher, '/homework', { classId: 'cls_8a', subject: 'maths', title: 'From the app', dueOn: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    expect(assigned.status).toBe(200);
    const hw = (await f(parent, '/classes/cls_8a/homework')).json.find((x: any) => x.id === assigned.json.id);
    expect(hw.submissions.find((s: any) => s.studentId === 'stu_aarav').status).toBe('pending');
    expect((await post(parent, `/homework/${hw.id}/submissions`, { studentId: 'stu_aarav', fileName: 'work.pdf' })).status).toBe(200);
    expect((await f(parent, `/homework/${hw.id}`)).json.submissions.find((s: any) => s.studentId === 'stu_aarav').status).toBe('submitted');
    expect((await post(parent, `/homework/${hw.id}/grades`, { studentId: 'stu_aarav', marks: 15 })).status).toBe(403);
    expect((await post(teacher, `/homework/${hw.id}/grades`, { studentId: 'stu_aarav', marks: 15, feedback: 'Well done' })).status).toBe(200);
    expect((await f(parent, `/homework/${hw.id}`)).json.submissions.find((s: any) => s.studentId === 'stu_aarav')).toMatchObject({ status: 'graded', marks: 15, feedback: 'Well done' });
    expect((await post(parent, '/homework', { classId: 'cls_8a', subject: 'maths', title: 'Not a teacher', dueOn: '2099-01-01' })).status).toBe(403);
  });
  it('lets a teacher mark attendance, and the family sees it and is told', async () => {
    const marked = await post(teacher, '/attendance', { stu_aarav: 'absent' });
    expect(marked.status).toBe(200);
    const today = (await f(teacher, '/attendance/today?students=stu_aarav,stu_diya')).json;
    expect(today.stu_aarav).toBe('absent');
    const days = (await f(parent, '/students/stu_aarav/attendance')).json;
    expect(days.at(-1)).toMatchObject({ studentId: 'stu_aarav', status: 'absent' });
    expect((await post(parent, '/attendance', { stu_aarav: 'present' })).status).toBe(403);
    const notes = (await f(parent, '/users/x/notifications')).json;
    expect(notes[0]).toMatchObject({ type: 'attendance', read: false });
    expect((await post(parent, `/notifications/${notes[0].id}/dismiss`)).status).toBe(200);
    expect((await f(parent, '/users/x/notifications')).json.find((n: any) => n.id === notes[0].id)).toBeUndefined();
  });
  it('lets a teacher enter marks for the open exam', async () => {
    const mid = (await f(teacher, '/classes/cls_8a/exams')).json.find((e: any) => e.name === 'Mid-term exams');
    expect(mid).toBeTruthy();
    expect((await post(teacher, '/classes/cls_8a/marks', { subject: 'maths', values: { stu_aarav: 44, stu_diya: 38 } })).status).toBe(200);
    const draft = (await f(teacher, '/classes/cls_8a/marks?subject=maths')).json;
    expect(draft).toMatchObject({ stu_aarav: 44, stu_diya: 38 });
    expect((await post(teacher, '/classes/cls_8a/marks', { subject: 'pe', values: { stu_aarav: 10 } })).status).toBe(409);
    expect((await post(parent, '/classes/cls_8a/marks', { subject: 'maths', values: { stu_aarav: 1 } })).status).toBe(403);
  });
});

describe('money, notices, events', () => {
  it('shows fees and takes a payment that the school sees', async () => {
    const assign = await h.call('POST', '/v1/students/assign-fee', { token: admin, body: { ids: [ananya], head: 'lab', title: 'Lab fee for the app', amount: 1200, dueOn: '2099-01-01' } });
    expect(assign.status).toBe(200);
    const acct = (await f(parent, `/students/${ananya}/fees`)).json;
    const open = acct.installments.find((i: any) => i.title === 'Lab fee for the app');
    expect(open).toMatchObject({ amount: 1200, paid: false });
    const paid = await post(parent, `/fees/${open.id}/pay`, { studentId: ananya, method: 'upi' });
    expect(paid.status).toBe(200);
    expect(paid.json).toMatchObject({ installmentId: open.id, amount: 1200, method: 'upi' });
    const after = (await f(parent, `/students/${ananya}/fees`)).json;
    expect(after.installments.find((i: any) => i.id === open.id).paid).toBe(true);
    expect(after.receipts.some((r: any) => r.installmentId === open.id)).toBe(true);
    expect((await post(parent, `/fees/${open.id}/pay`, { studentId: ananya, method: 'upi' })).status).toBe(409);
    expect((await post(parent, `/fees/${open.id}/pay`, { studentId: 'stu_diya', method: 'upi' })).status).toBe(403);
    expect((await f(parent, '/students/stu_aarav/fees')).json.installments.length).toBeGreaterThan(0);
  });
  it('lists published notices for the right people, and events with a reply', async () => {
    const notices = (await f(parent, '/notices')).json;
    expect(notices.some((n: any) => n.title.startsWith('Sports day'))).toBe(true);
    expect(notices.some((n: any) => /PTM notice/.test(n.title))).toBe(false);
    const events = (await f(parent, '/events')).json;
    const sports = events.find((e: any) => e.title === 'Sports day');
    expect(sports).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), time: expect.stringMatching(/^\d{2}:\d{2}$/) });
    expect((await post(parent, `/events/${sports.id}/rsvp`, { status: 'going' })).status).toBe(200);
    expect((await f(parent, '/events')).json.find((e: any) => e.id === sports.id).rsvps).toEqual([{ userId: (await f(parent, '/me')).json.id, status: 'going' }]);
    expect(events.some((e: any) => e.title === 'Staff meeting')).toBe(false);
    expect((await post(parent, `/events/${sports.id}/rsvp`, { status: 'sure' })).status).toBe(400);
    expect((await post(parent, '/notices', { title: 'Not allowed', body: 'A parent cannot post.' })).status).toBe(403);
    const posted = await post(admin, '/notices', { title: 'Posted from the app', body: 'Bring your books on Monday.' });
    expect(posted.status).toBe(200);
  });
});

describe('chat, leave and the rest', () => {
  it('reads and answers a conversation with the school', async () => {
    const me = (await f(parent, '/me')).json;
    const threads = (await f(parent, `/users/${me.id}/threads`)).json;
    expect(threads.length).toBeGreaterThan(0);
    const msgs = (await f(parent, `/threads/${threads[0].id}/messages`)).json;
    expect(msgs[0]).toMatchObject({ threadId: threads[0].id, senderId: me.id, read: expect.any(Boolean) });
    expect((await post(parent, `/threads/${threads[0].id}/messages`, { senderId: me.id, text: 'Thank you.' })).status).toBe(200);
    expect((await f(parent, `/threads/${threads[0].id}/messages`)).json.at(-1)).toMatchObject({ text: 'Thank you.', senderId: me.id });
    expect((await f(parent, `/users/${me.id}/messages`)).json.length).toBeGreaterThan(0);
    expect((await f(parent, '/threads/th_missing/messages')).status).toBe(404);
    const kav = (await f(teacher, '/me')).json.id;
    const started = await post(parent, '/threads', { userId: me.id, teacherId: kav });
    expect(started.status).toBe(200);
    expect((await post(parent, '/threads', { userId: me.id, teacherId: kav })).json.id).toBe(started.json.id);
  });
  it('takes a leave request, shows it to the school and carries the class teacher’s answer back', async () => {
    const applied = await post(parent, '/leave', { studentId: 'stu_aarav', from: '2099-02-01T00:00:00.000', to: '2099-02-02', reason: 'Family function' });
    expect(applied.status).toBe(200);
    const mine = (await f(parent, '/students/stu_aarav/leave')).json;
    expect(mine[0]).toMatchObject({ id: applied.json.id, status: 'pending', from: '2099-02-01', to: '2099-02-02', reason: 'Family function' });
    const adminView = (await h.call('GET', '/v1/approvals?status=pending&kind=leave', { token: admin })).json;
    expect(adminView.some((a: any) => a.title === 'Leave for Aarav Sharma')).toBe(true);
    expect((await post(parent, `/leave/${applied.json.id}/review`, { status: 'approved' })).status).toBe(403);
    expect((await post(teacher, `/leave/${applied.json.id}/review`, { status: 'approved', note: 'Approved. Collect the notes.' })).status).toBe(200);
    expect((await f(parent, '/students/stu_aarav/leave')).json[0]).toMatchObject({ status: 'approved', reviewNote: 'Approved. Collect the notes.' });
    expect((await post(parent, '/leave', { studentId: 'stu_diya', from: '2099-02-01', to: '2099-02-02', reason: 'Not mine' })).status).toBe(403);
  });
  it('answers the school, library, transport and gallery screens honestly', async () => {
    expect((await f(parent, '/school')).json).toMatchObject({ name: 'Greenfield International School' });
    expect((await f(parent, '/library/books')).json.every((b: any) => b.available === false && b.borrowedBy)).toBe(true);
    expect((await post(parent, '/library/books/x/reserve')).status).toBe(409);
    expect((await f(parent, '/students/stu_aarav/transport')).json).toMatchObject({ routeName: 'Route 4', stops: [] });
    expect((await f(parent, '/gallery')).json).toEqual([]);
    expect((await f(parent, '/users/' + (await f(parent, '/me')).json.id)).json.name).toBe('Priya Sharma');
  });
});

describe('family accounts', () => {
  const codeFor = async (identifier: string) => (await h.call('POST', '/v1/auth/code', { body: { identifier } })).json;
  it('gives a new student’s family an account that signs in with a code, and puts brothers and sisters under it', async () => {
    const add = (name: string) => h.call('POST', '/v1/students', { token: admin, body: { name, classId: 'cls_8a', dob: '2013-05-02', guardianName: 'Meera Joshi', guardianPhone: '+91 99887 76655' } });
    expect((await add('Tara Joshi')).status).toBe(201);
    expect((await add('Vir Joshi')).status).toBe(201);
    const challenge = await codeFor('99887 76655');
    expect(challenge.maskedTo).toBeTruthy();
    const tokens = (await h.call('POST', '/v1/auth/verify', { body: { challengeId: challenge.challengeId, code: '424242', client: 'mobile' } })).json;
    const me = (await h.call('GET', '/v1/f/me', { token: tokens.accessToken })).json;
    expect(me).toMatchObject({ role: 'parent', name: 'Meera Joshi' });
    expect(me.childIds).toHaveLength(2);
    expect((await h.call('POST', '/v1/auth/login', { body: { identifier: '9988776655', password: 'anything' } })).status).toBe(400);
  });
  it('keeps staff on their password, and a reset code only resets', async () => {
    expect((await h.call('POST', '/v1/auth/code', { body: { identifier: 'kavita.iyer@greenfield.edu.in' } })).status).toBe(400);
    const reset = (await h.call('POST', '/v1/auth/reset/start', { body: { identifier: 'kavita.iyer@greenfield.edu.in' } })).json;
    expect((await h.call('POST', '/v1/auth/verify', { body: { challengeId: reset.challengeId, code: '424242' } })).status).toBe(401);
    const again = (await h.call('POST', '/v1/auth/reset/start', { body: { identifier: 'kavita.iyer@greenfield.edu.in' } })).json;
    expect((await h.call('POST', '/v1/auth/reset/finish', { body: { challengeId: again.challengeId, code: '424242', password: 'a-new-pass-123' } })).status).toBe(204);
    expect((await h.call('GET', '/v1/f/me', { token: teacher })).status).toBe(401);
    expect(await h.login('kavita.iyer@greenfield.edu.in', 'a-new-pass-123')).toBeTruthy();
  });
  it('sends one account at most five codes in fifteen minutes (outside demo mode)', async () => {
    expect((await h.call('POST', '/v1/students', { token: admin, body: { name: 'Ira Rao', classId: 'cls_8a', dob: '2013-06-02', guardianName: 'Anil Rao', guardianPhone: '+91 90000 11122' } })).status).toBe(201);
    await h.setSettings({ 'demo.mode': false });
    try {
      for (let i = 0; i < 5; i++) expect((await h.call('POST', '/v1/auth/code', { body: { identifier: '90000 11122' } })).status).toBe(200);
      const sixth = await h.call('POST', '/v1/auth/code', { body: { identifier: '90000 11122' } });
      expect(sixth.status).toBe(429);
      expect(sixth.json.retryAfter).toBeGreaterThan(0);
      expect((await h.call('POST', '/v1/auth/reset/start', { body: { identifier: '90000 11122' } })).status).toBe(429);
    } finally {
      await h.setSettings({ 'demo.mode': true });
    }
  });
});

describe('what the console sets reaches families and the office', () => {
  it('records a family’s consent once, with the photo answer, and counts it in Moving in', async () => {
    expect((await f(parent, '/me')).json.consentedAt).toBeNull();
    const c = (await post(parent, '/consent', { photos: false })).json;
    expect(c.photoConsent).toBe(false);
    const again = (await post(parent, '/consent', {})).json;
    expect(again).toEqual(c);
    expect((await f(parent, '/me')).json).toMatchObject({ consentedAt: c.consentedAt, photoConsent: false });
    expect((await h.call('GET', '/v1/moving-in/activation', { token: admin })).json.families.consented).toBeGreaterThan(0);
  });
  it('shows the privacy notice and the grievance officer before sign-in', async () => {
    await h.setSettings({ 'privacy.notice': 'We keep marks for five years.', 'privacy.officerName': 'R. Kulkarni' });
    expect((await h.call('GET', '/v1/brand')).json.privacy).toMatchObject({ notice: 'We keep marks for five years.', officerName: 'R. Kulkarni' });
  });
  it('keeps teachers off the app when the console says so, but not off the admin', async () => {
    await h.setSettings({ 'app.teachers': false });
    try {
      const app = await h.call('POST', '/v1/auth/login', { body: { identifier: 'kavita.iyer@greenfield.edu.in', password: 'a-new-pass-123', client: 'mobile' } });
      expect(app.status).toBe(403);
      const web = await h.call('POST', '/v1/auth/login', { body: { identifier: 'kavita.iyer@greenfield.edu.in', password: 'a-new-pass-123', client: 'web' } });
      expect(web.status).toBe(200);
    } finally {
      await h.setSettings({ 'app.teachers': true });
    }
  });
  it('lets the office record only the ways the school takes money', async () => {
    await h.setSettings({ 'fees.paymentMethods': ['cash'] });
    try {
      // Checked before the invoice is even looked up.
      const r = await h.call('POST', '/v1/fees/payments', { token: admin, body: { studentId: 'stu_aarav', invoiceId: 'inv_any', amount: 1, method: 'upi' } });
      expect(r.status).toBe(400);
      expect(r.json.fields.method).toBeTruthy();
      expect((await h.call('GET', '/v1/shell', { token: admin })).json.school.paymentMethods).toEqual(['cash']);
    } finally {
      await h.setSettings({ 'fees.paymentMethods': ['cash', 'upi', 'card', 'netbanking', 'cheque'] });
    }
  });
  it('names students the school’s way in the admin menu', async () => {
    await h.setSettings({ 'vocab.student': 'Pupil' });
    try {
      expect((await h.call('GET', '/v1/config', { token: admin })).json.nav.map((n: { label: string }) => n.label)).toContain('Pupils');
    } finally {
      await h.setSettings({ 'vocab.student': 'Student' });
    }
  });
});
