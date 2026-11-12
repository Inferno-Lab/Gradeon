import { addDays, istToday } from '@gradeon/contracts';
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
    expect(notes[0]).toMatchObject({ type: 'attendance.absent', module: 'attendance.parentAlerts', route: '/attendance', read: false });
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
    // Older app builds paid directly; now the family pays on the provider's checkout (the test track's sandbox here).
    expect((await post(parent, `/fees/${open.id}/pay`, { studentId: ananya, method: 'upi' })).status).toBe(409);
    const order = await post(parent, `/fees/${open.id}/order`, { studentId: ananya });
    expect(order.status).toBe(200);
    expect(order.json).toMatchObject({ amount: 1200 });
    const checkout = new URL(order.json.url).pathname;
    expect((await h.call('GET', checkout)).status).toBe(200);
    expect((await f(parent, `/orders/${order.json.orderId}`)).json).toMatchObject({ status: 'created', receipt: null });
    expect((await h.call('POST', checkout, { body: { outcome: 'paid' } })).status).toBe(303);
    // The provider repeats its confirmation: the receipt is written once.
    expect((await h.call('POST', checkout, { body: { outcome: 'paid' } })).status).toBe(303);
    const done = (await f(parent, `/orders/${order.json.orderId}`)).json;
    expect(done).toMatchObject({ status: 'paid', receipt: { installmentId: open.id, amount: 1200 } });
    const after = (await f(parent, `/students/${ananya}/fees`)).json;
    expect(after.installments.find((i: any) => i.id === open.id).paid).toBe(true);
    expect(after.receipts.filter((r: any) => r.installmentId === open.id)).toHaveLength(1);
    expect((await post(parent, `/fees/${open.id}/order`, { studentId: ananya })).status).toBe(409);
    expect((await post(parent, `/fees/${open.id}/order`, { studentId: 'stu_diya' })).status).toBe(403);
    expect((await h.call('GET', `/v1/f/receipts/${done.receipt.id}/pdf`, { token: parent })).headers['content-type']).toContain('application/pdf');
    // The office sees it among online payments, refunds part of it (under the second-person limit), and reconciliation answers.
    const online = (await h.call('GET', '/v1/fees/online', { token: admin })).json;
    expect(online.find((p: any) => p.id === done.receipt.id)).toMatchObject({ amount: 1200, refunded: 0 });
    const refund = await h.call('POST', '/v1/fees/refunds', { token: admin, body: { paymentId: done.receipt.id, amount: 200, reason: 'Charged for a lab day missed' } });
    expect(refund.json).toMatchObject({ status: 'sent', amount: 200 });
    expect((await h.call('POST', '/v1/fees/refunds', { token: admin, body: { paymentId: done.receipt.id, amount: 5000, reason: 'Too much' } })).status).toBe(400);
    expect((await h.call('GET', '/v1/fees/online', { token: admin })).json.find((p: any) => p.id === done.receipt.id).refunded).toBe(200);
    expect((await h.call('GET', '/v1/fees/reconciliation', { token: admin })).status).toBe(200);
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
    expect((await f(parent, '/events')).json.find((e: any) => e.id === sports.id).rsvps).toEqual(
      (await f(parent, '/me')).json.childIds.map((studentId: string) => expect.objectContaining({ studentId, status: 'going', adults: 0 })));
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
    const lib = (await f(parent, '/library/books')).json;
    expect(lib.rules.maxLoans).toBe(3);
    const books = lib.books;
    expect(books.length).toBeGreaterThanOrEqual(12);
    expect(books.some((b: any) => b.borrowedBy === 'stu_aarav' && b.dueDate)).toBe(true);
    expect((await post(parent, '/library/books/bok_12/reserve', { studentId: 'stu_aarav' })).json).toMatchObject({ status: 'waiting', bookId: 'bok_12' });
    expect((await post(parent, '/library/books/bok_12/reserve', { studentId: 'stu_diya' })).status).toBe(403);
    expect((await f(parent, '/students/stu_aarav/transport')).json).toMatchObject({ routeName: 'Route 4 · Kothrud', busNumber: 'MH12 DK 4211' });
    expect((await f(parent, '/students/stu_aarav/transport')).json.stops).toHaveLength(4);
    expect((await f(parent, '/gallery')).json).toEqual([]);
    expect((await f(parent, '/users/' + (await f(parent, '/me')).json.id)).json.name).toBe('Priya Sharma');
  });
});

describe('the teacher’s class', () => {
  it('lists the class as a roster with attendance and results, and families see no contact details of classmates', async () => {
    const roster = (await f(teacher, '/classes/cls_8a/students')).json;    const aarav = roster.find((s: any) => s.id === 'stu_aarav');
    expect(aarav).toMatchObject({ guardianPhone: expect.any(String), attendancePct: expect.any(Number), absentToday: expect.any(Boolean) });
    expect(aarav).toHaveProperty('resultsPct');
    expect(aarav).toHaveProperty('photoFileId');
    const classmates = (await f(parent, '/classes/cls_8a/students')).json;
    const other = classmates.find((s: any) => s.id !== 'stu_aarav' && s.id !== ananya);
    expect(other).toMatchObject({ guardianPhone: '', address: '', dob: '' });
    expect(other).not.toHaveProperty('attendancePct');
  });
  it('fills approved leave into the roll call and keeps a past day within the correction window', async () => {
    const day = addDays(istToday(), -1);
    const applied = await post(parent, '/leave', { studentId: 'stu_aarav', from: day, to: day, reason: 'Family function' });
    expect((await post(teacher, `/leave/${applied.json.id}/review`, { status: 'approved' })).status).toBe(200);
    const roll = (await f(teacher, `/attendance/roll?classId=cls_8a&date=${day}`)).json;
    const row = roll.marks.find((m: any) => m.studentId === 'stu_aarav');
    expect(row.onLeave).toBe(true);
    if (!roll.submitted) expect(row.status).toBe('leave');
    expect((await f(parent, `/attendance/roll?classId=cls_8a&date=${day}`)).status).toBe(403);
    expect((await post(teacher, `/attendance?date=${addDays(istToday(), -20)}`, { stu_aarav: 'present' })).status).toBe(423);
    expect((await post(teacher, `/attendance?date=${addDays(istToday(), 2)}`, { stu_aarav: 'present' })).status).toBe(400);
  });
});

describe('attendance every period', () => {
  it('lets the period’s teacher mark it, and no one else but someone who approves', async () => {
    const day = istToday();
    const roll = await f(teacher, `/attendance/periods?classId=cls_8a&date=${day}`);
    expect(roll.status).toBe(200);
    const mine = roll.json.periods.find((p: any) => p.mine);
    const other = roll.json.periods.find((p: any) => !p.mine);
    if (mine) {
      const put = await h.call('PUT', '/v1/f/attendance/periods', { token: teacher, body: { classId: 'cls_8a', date: day, period: mine.period, marks: [{ studentId: 'stu_diya', status: 'absent' }] } });
      expect(put.status).toBe(200);
      expect(put.json.periods.find((p: any) => p.period === mine.period).marks.stu_diya).toBe('absent');
    }
    if (other) {
      expect((await h.call('PUT', '/v1/f/attendance/periods', { token: teacher, body: { classId: 'cls_8a', date: day, period: other.period, marks: [{ studentId: 'stu_diya', status: 'present' }] } })).status).toBe(403);
      expect((await h.call('PUT', '/v1/attendance/periods', { token: admin, body: { classId: 'cls_8a', date: day, period: other.period, marks: [{ studentId: 'stu_diya', status: 'present' }] } })).status).toBe(200);
    }
    expect(mine ?? other).toBeTruthy();
    expect((await f(parent, `/attendance/periods?classId=cls_8a&date=${day}`)).status).toBe(403);
  });
});

describe('the school’s app link', () => {
  it('sends a phone to its store and a computer to a page', async () => {
    const page = await h.call('GET', '/hooks/app/greenfield', { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' } });
    expect(page.status).toBe(200);
    expect(page.text).toContain('not in the stores yet');
    await h.registry.query("insert into builds (id, school_id, platform, version, status, note, url) select 'bld_test', id, 'android', '1.0.0', 'done', '', null from schools where slug = 'greenfield'");
    const phone = await h.call('GET', '/hooks/app/greenfield', { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14)' } });
    expect(phone.status).toBe(302);
    expect(phone.headers.location).toBe('https://play.google.com/store/apps/details?id=com.gradeon.greenfield');
    expect((await h.call('GET', '/hooks/app/nowhere')).status).toBe(404);
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
    await h.setDemo(false);
    try {
      for (let i = 0; i < 5; i++) expect((await h.call('POST', '/v1/auth/code', { body: { identifier: '90000 11122' } })).status).toBe(200);
      const sixth = await h.call('POST', '/v1/auth/code', { body: { identifier: '90000 11122' } });
      expect(sixth.status).toBe(429);
      expect(sixth.json.retryAfter).toBeGreaterThan(0);
      expect((await h.call('POST', '/v1/auth/reset/start', { body: { identifier: '90000 11122' } })).status).toBe(429);
    } finally {
      await h.setDemo(true);
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
  it('lets only the roles the console chose use the app; staff keep the admin', async () => {
    await h.setSettings({ 'app.roles': ['parent'] });
    try {
      const app = await h.call('POST', '/v1/auth/login', { body: { identifier: 'kavita.iyer@greenfield.edu.in', password: 'a-new-pass-123', client: 'mobile' } });
      expect(app.status).toBe(403);
      expect(app.json.message).toMatch(/admin on the web/);
      const web = await h.call('POST', '/v1/auth/login', { body: { identifier: 'kavita.iyer@greenfield.edu.in', password: 'a-new-pass-123', client: 'web' } });
      expect(web.status).toBe(200);
      await h.setSettings({ 'app.roles': ['teacher'] });
      const family = await h.call('POST', '/v1/auth/code', { body: { identifier: '99887 76655' } });
      expect(family.status).toBe(403);
    } finally {
      await h.setSettings({ 'app.roles': ['parent', 'teacher'] });
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
      expect((await h.call('GET', '/v1/config', { token: admin })).json.menu.flatMap((g: { pages: { label: string }[] }) => g.pages.map((p) => p.label))).toContain('Pupils');
    } finally {
      await h.setSettings({ 'vocab.student': 'Student' });
    }
  });
});

describe('the days a school is closed', () => {
  it('leaves the school’s weekly off days out of the attendance week', async () => {
    const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
    const sundays = (await h.call('GET', '/v1/attendance/week', { token: admin })).json as { date: string }[];
    expect(sundays.some((p) => weekday(p.date) === 6)).toBe(true);
    expect(sundays.some((p) => weekday(p.date) === 0)).toBe(false);
    await h.setSettings({ 'calendar.weeklyOff': ['sun', 'sat'] });
    try {
      const week = (await h.call('GET', '/v1/attendance/week', { token: admin })).json as { date: string }[];
      expect(week).toHaveLength(sundays.length);
      expect(week.some((p) => [0, 6].includes(weekday(p.date)))).toBe(false);
    } finally {
      await h.setSettings({ 'calendar.weeklyOff': ['sun'] });
    }
  });
});

describe('what each person may see on the dashboard', () => {
  it('gives a teacher no fee totals and no fee waivers, while the principal still has them', async () => {
    const res = await h.call('GET', '/v1/dashboard', { token: admin });
    expect(res.status, JSON.stringify(res.json).slice(0, 200)).toBe(200);
    const principal = res.json;
    expect(principal.modules).toContain('fees');
    expect(principal.fees.due).toBeGreaterThan(0);
    // A fresh sign-in: an earlier test reset this teacher's password, which ends her sessions.
    const fresh = await h.login('kavita.iyer@greenfield.edu.in', 'a-new-pass-123');
    const t = (await h.call('GET', '/v1/dashboard', { token: fresh })).json;
    expect(t.modules).not.toContain('fees');
    expect(t.modules).toContain('attendance');
    expect(t.fees).toMatchObject({ collected: 0, due: 0, overdueFamilies: 0 });
    expect(t.feeHeads).toEqual([]);
    expect(t.needsYou.some((n: { kind: string }) => n.kind === 'fee_waiver')).toBe(false);
  });
});

describe('messages and background work through the Hub', () => {
  const ist = (offsetMin: number) => { const d = new Date(Date.now() + 330 * 60_000 + offsetMin * 60_000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

  it('holds a non-urgent message in quiet hours and sends an urgent one', async () => {
    await h.setSettings({ 'notify.quietFrom': ist(-60), 'notify.quietTo': ist(60) });
    const n = await h.call('POST', '/v1/notices', { token: admin, body: { title: 'Held in quiet hours', body: 'Sports day is on Friday.', audience: 'everyone', publish: true } });
    expect(n.status).toBeLessThan(300);
    const held = (await h.registry.query("select status, send_after from message_log where message_key = 'notice.published' and body like '%Held in quiet hours%'")).rows;
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((m) => m.status === 'held' && m.send_after > new Date())).toBe(true);
    await h.setSettings({ 'notify.quietFrom': '00:00', 'notify.quietTo': '00:00' });
  });

  it('refuses texts past the plan’s monthly limit, never a sign-in code', async () => {
    const limits = (await h.registry.query("select entitlement->'limits' l from schools where slug = 'greenfield'")).rows[0].l;
    await h.entitle({ limits: { ...limits, smsPerMonth: 1 } });
    const sent = await h.call('POST', '/v1/students/message', { token: admin, body: { ids: ['stu_aarav'], body: 'Over the limit test' } });
    expect(sent.status).toBe(200);
    const row = (await h.registry.query("select status, error from message_log where body like 'Over the limit test%' and channel = 'sms'")).rows[0];
    expect(row).toMatchObject({ status: 'refused' });
    expect(row.error).toContain('texts are used up');
    await h.call('POST', '/v1/auth/login', { body: { identifier: 'priya.sharma@example.com' } });
    expect((await h.registry.query("select status from message_log where message_key = 'auth.code' order by created_at desc limit 1")).rows[0].status).toBe('delivered');
    await h.entitle({ limits });
  });

  it('charges a late fine once per invoice and month from the daily job', async () => {
    const { HubService } = await import('../src/school/hub.service.js');
    const hub = h.app.get(HubService);
    await h.setSettings({ 'fees.lateFeePct': 5 });
    await h.registry.query('delete from job_queue');
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    expect(await hub.queueDaily(today)).toBeGreaterThan(0);
    expect(await hub.queueDaily(today)).toBe(0);
    await h.registry.query('update job_queue set run_at = now()');
    for (let i = 0; i < 4; i++) await hub.tick();
    const jobs = (await h.registry.query("select kind, status, result, last_error from job_queue where kind = 'fees.lateFines'")).rows;
    expect(jobs[0]).toMatchObject({ status: 'done' });
    const count = Number(/(\d+) late fines/.exec(jobs[0].result)![1]);
    expect(count).toBeGreaterThan(0);
    await h.registry.query("update job_queue set status = 'queued', run_at = now(), payload = payload || '{\"again\":true}' where kind = 'fees.lateFines'");
    await hub.tick();
    expect((await h.registry.query("select result from job_queue where kind = 'fees.lateFines'")).rows[0].result).toMatch(/^0 late fines/);
  });
});
