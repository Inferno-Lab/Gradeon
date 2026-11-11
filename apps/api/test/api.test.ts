import { istToday } from '@gradeon/contracts';
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

describe('sign-in', () => {
  it('refuses a wrong password and says how many tries are left', async () => {
    const r = await h.call('POST', '/v1/auth/login', { body: { identifier: 'neha.menon@greenfield.edu.in', password: 'nope' } });
    expect(r.status).toBe(401);
    expect(r.json).toMatchObject({ code: 'unauthenticated', attemptsLeft: 4, fields: { password: expect.any(String) } });
  });
  it('locks the account after five wrong passwords', async () => {
    let last: { status: number; json: any } | undefined;
    for (let i = 0; i < 5; i++) last = await h.call('POST', '/v1/auth/login', { body: { identifier: 'kavita.iyer@greenfield.edu.in', password: 'wrong' } });
    expect(last!.status).toBe(423);
    expect(last!.json.code).toBe('locked');
    const again = await h.call('POST', '/v1/auth/login', { body: { identifier: 'kavita.iyer@greenfield.edu.in', password: 'nest2026' } });
    expect(again.status).toBe(423);
  });
  it('does not reveal whether an account exists', async () => {
    const r = await h.call('POST', '/v1/auth/login', { body: { identifier: 'nobody@nowhere.test', password: 'x' } });
    expect(r.status).toBe(401);
    expect(r.json.fields.identifier).toBeDefined();
  });
  it('takes the demo code in demo mode and refuses a wrong one', async () => {
    const step1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' } });
    expect(step1.json.step).toBe('otp');
    expect(step1.json.challenge.demoCode).toBe('424242');
    const bad = await h.call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '111111' } });
    expect(bad.status).toBe(401);
    expect(bad.json.attemptsLeft).toBe(2);
    const ok = await h.call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '424242' } });
    expect(ok.status).toBe(200);
    expect(ok.json.user.roles).toContain('principal');
  });
  it('rotates refresh tokens and ends every session when an old one is replayed', async () => {
    const step1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'sunita.desai@greenfield.edu.in', password: 'nest2026' } });
    const t1 = (await h.call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '424242' } })).json;
    const t2 = (await h.call('POST', '/v1/auth/refresh', { body: { refreshToken: t1.refreshToken } })).json;
    expect(t2.refreshToken).not.toBe(t1.refreshToken);
    const replay = await h.call('POST', '/v1/auth/refresh', { body: { refreshToken: t1.refreshToken } });
    expect(replay.status).toBe(401);
    const afterReplay = await h.call('POST', '/v1/auth/refresh', { body: { refreshToken: t2.refreshToken } });
    expect(afterReplay.status).toBe(401);
    const audit = (await h.call('GET', '/v1/settings/audit', { token })).json as { action: string }[];
    expect(audit.some((a) => a.action === 'auth.refresh_replayed')).toBe(true);
  });
  it('keeps the web refresh token in an httpOnly cookie and checks CSRF', async () => {
    const step1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026', client: 'web' } });
    const verified = await h.call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '424242', client: 'web' } });
    expect(verified.status).toBe(200);
    expect(verified.json.refreshToken).toBeUndefined();
    expect(verified.cookies.gd_rt_greenfield).toBeTruthy();
    expect(verified.cookies.gd_csrf).toBeTruthy();
    const noCsrf = await h.call('POST', '/v1/auth/refresh', {
      body: { client: 'web' },
      cookies: { gd_rt_greenfield: verified.cookies.gd_rt_greenfield, gd_csrf: verified.cookies.gd_csrf },
    });
    expect(noCsrf.status).toBe(401);
    const ok = await h.call('POST', '/v1/auth/refresh', {
      body: { client: 'web' },
      cookies: { gd_rt_greenfield: verified.cookies.gd_rt_greenfield, gd_csrf: verified.cookies.gd_csrf },
      headers: { 'x-csrf': verified.cookies.gd_csrf, origin: 'http://localhost:5173' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.accessToken).toBeTruthy();
    expect(ok.json.refreshToken).toBeUndefined();
  });
  it('stops using an access token once the session is revoked', async () => {
    const step1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'meera.nair@greenfield.edu.in', password: 'nest2026' } });
    const pair = (await h.call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '424242' } })).json;
    expect((await h.call('GET', '/v1/me', { token: pair.accessToken })).status).toBe(200);
    expect((await h.call('POST', '/v1/auth/logout', { token: pair.accessToken })).status).toBe(204);
    expect((await h.call('GET', '/v1/me', { token: pair.accessToken })).status).toBe(401);
  });
  it('logout-all ends every session for that person', async () => {
    const a1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'meera.nair@greenfield.edu.in', password: 'nest2026' } });
    const t1 = (await h.call('POST', '/v1/auth/verify', { body: { challengeId: a1.json.challenge.challengeId, code: '424242' } })).json.accessToken as string;
    const a2 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'meera.nair@greenfield.edu.in', password: 'nest2026' } });
    const t2 = (await h.call('POST', '/v1/auth/verify', { body: { challengeId: a2.json.challenge.challengeId, code: '424242' } })).json.accessToken as string;
    expect((await h.call('POST', '/v1/auth/logout-all', { token: t1 })).status).toBe(204);
    expect((await h.call('GET', '/v1/me', { token: t1 })).status).toBe(401);
    expect((await h.call('GET', '/v1/me', { token: t2 })).status).toBe(401);
  });
  it('a role change ends that person’s access token', async () => {
    const step1 = await h.call('POST', '/v1/auth/login', { body: { identifier: 'sunita.desai@greenfield.edu.in', password: 'nest2026' } });
    const teacherTok = (await h.call('POST', '/v1/auth/verify', { body: { challengeId: step1.json.challenge.challengeId, code: '424242' } })).json.accessToken as string;
    expect((await h.call('GET', '/v1/me', { token: teacherTok })).status).toBe(200);
    const staff = (await h.call('GET', '/v1/staff?query=Sunita', { token })).json as { id: string; name: string; roles: { id: string }[] }[];
    const person = staff.find((s) => s.name === 'Sunita Desai' && s.roles.length);
    expect(person).toBeTruthy();
    const patched = await h.call('PATCH', `/v1/staff/${person!.id}`, { token, body: { roleId: person!.roles[0]!.id } });
    expect(patched.status).toBe(200);
    expect((await h.call('GET', '/v1/me', { token: teacherTok })).status).toBe(401);
  });
  it('sends security headers', async () => {
    const r = await h.call('GET', '/v1/brand');
    expect(r.status).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(String(r.headers['content-security-policy'] ?? '')).toMatch(/frame-ancestors 'none'/);
    expect(String(r.headers['permissions-policy'] ?? '')).toMatch(/camera=\(\)/);
  });
  it('needs a known school and a token', async () => {
    expect((await h.call('GET', '/v1/me', { school: 'no-such-school' })).status).toBe(404);
    expect((await h.call('GET', '/v1/me')).status).toBe(401);
    expect((await h.call('GET', '/v1/me', { token: 'garbage' })).status).toBe(401);
  });
});

describe('students', () => {
  it('lists with fees, ticks and paging', async () => {
    const r = await h.call('GET', '/v1/students?classId=cls_8a&limit=10', { token });
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(36);
    expect(r.json.items).toHaveLength(10);
    expect(r.json.items[0].attendance10).toHaveLength(10);
  });
  it('filters by fee status and by search', async () => {
    const over = await h.call('GET', '/v1/students?classId=cls_8a&feeStatus=overdue', { token });
    expect(over.json.items.map((s: any) => s.name).sort()).toEqual(['Ishaan Gupta', 'Kabir Singh']);
    expect(over.json.items.find((s: any) => s.name === 'Kabir Singh').amountDue).toBe(24950);
    const found = await h.call('GET', '/v1/students?query=2019/0412', { token });
    expect(found.json.items.map((s: any) => s.name)).toEqual(['Aarav Sharma']);
    const none = await h.call('GET', '/v1/students?query=zzzzqq', { token });
    expect(none.json.total).toBe(0);
  });
  it('treats search text as text, not as SQL or wildcards', async () => {
    const r = await h.call('GET', "/v1/students?query=%25' or 1=1 --", { token });
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(0);
  });
  it('summarises a class', async () => {
    const s = (await h.call('GET', '/v1/students/summary?classId=cls_8a', { token })).json;
    expect(s).toMatchObject({ inView: 36, total: 1498, overdueAmount: 43450, overdueFamilies: 2 });
    expect(s.presentToday).toBeLessThanOrEqual(36);
  });
  it('hides the guardian number until it is revealed, and logs the reveal', async () => {
    const d = (await h.call('GET', '/v1/students/stu_aarav', { token })).json;
    expect(d.guardianPhone).toContain('•');
    const rev = (await h.call('POST', '/v1/students/stu_aarav/reveal', { token })).json;
    expect(rev.phone).not.toContain('•');
    const audit = (await h.call('GET', '/v1/settings/audit', { token })).json;
    expect(audit.some((a: any) => a.action === 'contact.revealed')).toBe(true);
    expect(d.facts.homework.total).toBeGreaterThan(0);
    expect(d.routeName).toBe('Route 4 · Kothrud');
  });
  it('adds a student and refuses a bad class', async () => {
    const bad = await h.call('POST', '/v1/students', { token, body: { name: 'Test Child', classId: 'nope', dob: '2014-01-02', guardianName: 'Parent One', guardianPhone: '+91 99999 11111' } });
    expect(bad.status).toBe(400);
    const ok = await h.call('POST', '/v1/students', { token, body: { name: 'Test Child', classId: 'cls_8a', dob: '2014-01-02', guardianName: 'Parent One', guardianPhone: '+91 99999 11111' } });
    expect(ok.status).toBe(201);
    expect(ok.json.admissionNo).toMatch(/^\d{4}\/\d{4}$/);
  });
  it('imports a CSV and reports bad lines instead of failing the lot', async () => {
    const csv = 'name,class,dob,guardian,phone\nImport One,8 A,2013-02-03,Guardian A,+91 98888 00001\n,8 A,2013-02-03,G,+91 98888 00002\nImport Two,99 Z,2013-02-03,G,+91 98888 00003';
    const r = (await h.call('POST', '/v1/students/import', { token, body: { csv } })).json;
    expect(r.created).toBe(1);
    expect(r.errors.map((e: any) => e.line)).toEqual([3, 4]);
  });
  it('exports the chosen students as CSV', async () => {
    const r = await h.call('GET', '/v1/students/export?ids=stu_aarav,stu_diya', { token });
    expect(r.text.split('\n')).toHaveLength(3);
    expect(r.text).toContain('Aarav Sharma');
  });
});

describe('a student’s record', () => {
  it('edits a student, moves them to a class, and keeps every guardian with who may collect', async () => {
    const made = await h.call('POST', '/v1/students', { token, body: { name: 'Record Test', classId: 'cls_8a', dob: '2013-02-01', guardianName: 'Pat Test', guardianPhone: '9822099001', gender: 'female' } });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ gender: 'female', guardians: [expect.objectContaining({ name: 'Pat Test', isPrimary: true, canCollect: true })] });
    const moved = await h.call('PATCH', `/v1/students/${made.json.id}`, { token, body: { classId: 'cls_8b', house: '', bloodGroup: 'O+' } });
    expect(moved.status).toBe(200);
    expect(moved.json).toMatchObject({ bloodGroup: 'O+' });
    expect(moved.json.className).toMatch(/8 B/);
    const first = moved.json.guardians[0];
    const g = await h.call('PUT', `/v1/students/${made.json.id}/guardians`, { token, body: { guardians: [
      { id: first.id, name: 'Pat Test', phone: first.phone, email: '', relation: 'Mother', canCollect: true, isPrimary: false },
      { name: 'Sam Test', phone: '9822099002', email: 'sam@example.com', relation: 'Father', canCollect: false, isPrimary: true },
    ] } });
    expect(g.status).toBe(200);
    expect(g.json).toEqual([expect.objectContaining({ name: 'Sam Test', isPrimary: true, canCollect: false }), expect.objectContaining({ name: 'Pat Test', relation: 'Mother', isPrimary: false })]);
    expect((await h.call('PUT', `/v1/students/${made.json.id}/guardians`, { token, body: { guardians: [{ name: 'No One', phone: '9822099003', relation: 'Aunt', canCollect: true, isPrimary: false }] } })).status).toBe(400);
    await h.setSettings({ 'students.required': ['address'] });
    expect((await h.call('PATCH', `/v1/students/${made.json.id}`, { token, body: { address: '' } })).status).toBe(400);
    await h.setSettings({ 'students.required': [] });
  });
});

describe('access', () => {
  it('stops a teacher from opening fees or settings', async () => {
    const tt = await h.login('sunita.desai@greenfield.edu.in');
    expect((await h.call('GET', '/v1/fees/summary', { token: tt })).status).toBe(403);
    expect((await h.call('PATCH', '/v1/settings', { token: tt, body: { changes: { 'school.name': 'Hacked school' } } })).status).toBe(404);
    expect((await h.call('GET', '/v1/students?limit=2', { token: tt })).status).toBe(200);
  });
  it('closes modules the plan does not include', async () => {
    await h.addSchool('starter-school', { plan: 'starter', data: 'demo' });
    const s1 = await h.call('POST', '/v1/auth/login', { school: 'starter-school', body: { identifier: 'neha.menon@greenfield.edu.in', password: 'nest2026' } });
    const t = (await h.call('POST', '/v1/auth/verify', { school: 'starter-school', body: { challengeId: s1.json.challenge.challengeId, code: '424242' } })).json.accessToken as string;
    const r = await h.call('GET', '/v1/fees/summary', { school: 'starter-school', token: t });
    expect(r.status).toBe(423);
    expect(r.json.code).toBe('locked');
    expect((await h.call('GET', '/v1/config', { school: 'starter-school', token: t })).json.modules).not.toContain('fees');
  });
  it('does not accept one school’s token at another school', async () => {
    const r = await h.call('GET', '/v1/me', { school: 'starter-school', token });
    expect(r.status).toBe(401);
  });
  it('blocks a school that is not live', async () => {
    await h.addSchool('paused-school', { plan: 'standard', data: 'empty', status: 'suspended' });
    const r = await h.call('GET', '/v1/brand', { school: 'paused-school' });
    expect(r.status).toBe(503);
  });
});

describe('dashboard and approvals', () => {
  it('builds the dashboard from real data', async () => {
    const d = (await h.call('GET', '/v1/dashboard', { token })).json;
    expect(d.greetingName).toBe('Neha Menon');
    expect(d.present.total).toBeGreaterThanOrEqual(1498);
    expect(d.charts.attendance.points).toHaveLength(6);
    expect(d.classRolls).toHaveLength(6);
    expect(d.feeHeads.map((x: any) => x.head)).toEqual(['tuition', 'transport', 'activities', 'lab']);
    expect(d.needsYou.map((n: any) => n.kind)).toEqual(['leave', 'fee_waiver', 'attendance', 'notice']);
    expect(d.timeline.length).toBeGreaterThan(3);
  });
  it('approves, then undoes, a concession and applies it to the invoice', async () => {
    const kabir = (await h.call('GET', '/v1/students?query=Kabir Singh', { token })).json.items[0].id;
    const before = (await h.call('GET', '/v1/fees/invoices?studentId=' + kabir, { token })).json;
    const ok = await h.call('POST', '/v1/approvals/apr_waiver_kabir/decision', { token, body: { decision: 'approve' } });
    expect(ok.status).toBe(200);
    const after = (await h.call('GET', '/v1/fees/invoices?studentId=' + kabir, { token })).json;
    const total = (list: any[]) => list.reduce((a, i) => a + i.amount, 0);
    expect(total(after)).toBe(total(before) - 4625);
    expect((await h.call('POST', '/v1/approvals/apr_waiver_kabir/decision', { token, body: { decision: 'approve' } })).status).toBe(409);
    await h.call('POST', '/v1/approvals/apr_waiver_kabir/decision', { token, body: { decision: 'undo' } });
    const back = (await h.call('GET', '/v1/fees/invoices?studentId=' + kabir, { token })).json;
    expect(back.map((i: any) => i.amount)).toEqual(before.map((i: any) => i.amount));
  });
  it('publishes a notice when its approval is accepted and takes it back on undo', async () => {
    await h.call('POST', '/v1/approvals/apr_notice_ptm/decision', { token, body: { decision: 'approve' } });
    let notices = (await h.call('GET', '/v1/notices', { token })).json;
    expect(notices.find((n: any) => n.id === 'ntc_ptm').status).toBe('published');
    await h.call('POST', '/v1/approvals/apr_notice_ptm/decision', { token, body: { decision: 'undo' } });
    notices = (await h.call('GET', '/v1/notices', { token })).json;
    expect(notices.find((n: any) => n.id === 'ntc_ptm').status).toBe('pending');
  });
});

describe('attendance and fees', () => {
  it('marks a class, refuses the future, and notifies guardians of absences', async () => {
    const date = istToday();
    const day = (await h.call('GET', `/v1/attendance/day?classId=cls_6a&date=${date}`, { token })).json;
    expect(day.marks.length).toBeGreaterThan(30);
    const marks = day.marks.map((m: any, i: number) => ({ studentId: m.studentId, status: i === 0 ? 'absent' : 'present' }));
    const put = await h.call('PUT', '/v1/attendance/day', { token, body: { classId: 'cls_6a', date, marks } });
    expect(put.status).toBe(200);
    expect(put.json.marks.filter((m: any) => m.status === 'absent')).toHaveLength(1);
    const future = await h.call('PUT', '/v1/attendance/day', { token, body: { classId: 'cls_6a', date: '2099-01-01', marks } });
    expect(future.status).toBe(400);
    const msgs = await h.registry.query("select count(distinct to_addr)::int n from sandbox_messages where body like '%marked absent%'");
    expect(msgs.rows[0].n).toBe(1);
  });
  it('records a payment once and refuses more than is due', async () => {
    const sid = 'stu_diya';
    const inv = (await h.call('GET', '/v1/fees/invoices?studentId=' + sid, { token })).json.find((i: any) => i.status === 'due');
    const tooMuch = await h.call('POST', '/v1/fees/payments', { token, body: { studentId: sid, invoiceId: inv.id, amount: inv.amount + 1, method: 'upi' } });
    expect(tooMuch.status).toBe(400);
    const ok = await h.call('POST', '/v1/fees/payments', { token, body: { studentId: sid, invoiceId: inv.id, amount: inv.amount, method: 'cash' } });
    expect(ok.status).toBe(200);
    expect(ok.json.receiptNo).toMatch(/^RCPT-/);
    const again = await h.call('POST', '/v1/fees/payments', { token, body: { studentId: sid, invoiceId: inv.id, amount: 1, method: 'cash' } });
    expect(again.status).toBe(409);
  });
});

describe('timetable', () => {
  it('shows the clash, fixes it with a cover, then publishes', async () => {
    const v = (await h.call('GET', '/v1/timetable?classId=cls_8a', { token })).json;
    expect(v.clashes).toHaveLength(1);
    expect(v.clashes[0]).toMatchObject({ teacherName: 'Kavita Iyer', day: 3, period: 3 });
    expect(v.clashes[0].suggestion.teacherName).toBe('Rahul Verma');
    const blocked = await h.call('POST', '/v1/timetable/publish', { token });
    expect(blocked.status).toBe(409);
    const slot = v.slots.find((s: any) => s.day === 3 && s.period === 3);
    const fix = await h.call('POST', '/v1/timetable/cover', { token, body: { slotId: slot.id, teacherId: v.clashes[0].suggestion.teacherId } });
    expect(fix.status).toBe(204);
    const after = (await h.call('GET', '/v1/timetable?classId=cls_8a', { token })).json;
    expect(after.clashes).toHaveLength(0);
    expect(after.draftChanges).toBe(1);
    const pub = await h.call('POST', '/v1/timetable/publish', { token });
    expect(pub.status).toBe(200);
    expect(pub.json.families).toBeGreaterThan(30);
    expect((await h.call('GET', '/v1/timetable?classId=cls_8a', { token })).json.draftChanges).toBe(0);
  });
  it('will not double-book a cover', async () => {
    const v = (await h.call('GET', '/v1/timetable?classId=cls_8b', { token })).json;
    const slot = v.slots.find((s: any) => s.day === 1 && s.period === 0);
    const other = (await h.call('GET', '/v1/timetable?classId=cls_8a', { token })).json.slots.find((s: any) => s.day === 1 && s.period === 0);
    const r = await h.call('POST', '/v1/timetable/cover', { token, body: { slotId: slot.id, teacherId: other.teacherId } });
    expect(r.status).toBe(409);
  });
});

describe('settings', () => {
  it('shows the school its setup, and gives the school no way to change it (only the console can)', async () => {
    const before = (await h.call('GET', '/v1/settings', { token })).json;
    expect(before.usage.students).toBeGreaterThan(0);
    expect(before.usage.studentLimit).toBeGreaterThanOrEqual(before.usage.students);
    expect((await h.call('PATCH', '/v1/settings', { token, body: { changes: { 'school.name': 'Changed by the school' } } })).status).toBe(404);
    expect((await h.call('POST', '/v1/roles', { token, body: { name: 'Mine', permissions: [] } })).status).toBe(404);
    expect((await h.call('PUT', '/v1/roles/role_teacher', { token, body: { name: 'Mine', permissions: [] } })).status).toBe(404);
    expect((await h.call('GET', '/v1/me', { token })).json.permissions).not.toContain('settings.write');
  });
  it('follows what the console sets: colour, and the modules of the plan (the only place modules are chosen)', async () => {
    const was = (await h.registry.query("select entitlement->'modules' m from schools where slug = 'greenfield'")).rows[0].m;
    await h.setSettings({ 'brand.color': '#0E7490' });
    await h.entitle({ modules: ['people', 'attendance'] });
    try {
      const cfg = (await h.call('GET', '/v1/config', { token })).json;
      expect(cfg.school.color).toBe('#0E7490');
      expect(cfg.modules).toEqual(['school', 'people', 'attendance']);
      const labels = cfg.menu.flatMap((g: any) => g.pages.map((p: any) => p.label));
      expect(labels).toContain('Attendance');
      expect(labels).not.toContain('Fees');
    } finally {
      await h.entitle({ modules: was });
    }
  }, 30_000);
  it('lets the school ask Gradeon for a change', async () => {
    const r = await h.call('POST', '/v1/change-requests', { token, body: { area: 'App layout', message: 'Please put Fees in the bottom tabs.' } });
    expect(r.status).toBe(201);
    expect(r.json[0]).toMatchObject({ area: 'App layout', status: 'open', requestedBy: 'Neha Menon' });
    expect((await h.call('POST', '/v1/change-requests', { token, body: { area: 'x', message: 'no' } })).status).toBe(400);
  });
});
