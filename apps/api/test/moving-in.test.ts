import { pg } from '@gradeon/db';
import { ensureDatabase } from '@gradeon/db/dev';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

let h: Harness;
let token: string;
let db: pg.Pool;
beforeAll(async () => {
  h = await startHarness();
  token = await h.login();
  db = new pg.Pool({ connectionString: await ensureDatabase(h.server.url, 'school_greenfield'), max: 2 });
}, 240_000);
afterAll(async () => {
  await db?.end();
  await h?.close();
});

const get = (url: string) => h.call('GET', url, { token });
const send = (method: string, url: string, body?: unknown) => h.call(method, url, { token, body });
const section = (all: any[], kind: string) => all.find((s) => s.kind === kind);

describe('classes and calendar', () => {
  it('lists every part of setup in the import columns, and saves a typed row through the same checks', async () => {
    const all = (await get('/v1/setup')).json;
    expect(all.map((s: any) => s.kind)).toEqual(['years', 'terms', 'holidays', 'classes', 'subjects', 'periods', 'fee_structures']);
    expect(section(all, 'classes').rows.find((r: any) => r.class === '8 A')).toMatchObject({ id: 'cls_8a', grade: '8', section: 'A' });
    const bad = await send('PUT', '/v1/setup/periods', { row: { number: '9', label: 'Period 9', starts_at: '15:00', ends_at: '14:00' } });
    expect(bad.status).toBe(400);
    expect(bad.json.message).toMatch(/ends before it starts/);
    const added = await send('PUT', '/v1/setup/subjects', { row: { name: 'Sanskrit', per_week: '3' } });
    expect(added.status).toBe(200);
    expect(section(added.json, 'subjects').rows.find((r: any) => r.name === 'Sanskrit')).toMatchObject({ per_week: '3' });
    const changed = await send('PUT', '/v1/setup/subjects', { row: { name: 'sanskrit', per_week: '4' } });
    expect(section(changed.json, 'subjects').rows.filter((r: any) => r.name.toLowerCase() === 'sanskrit')).toEqual([expect.objectContaining({ per_week: '4' })]);
    const id = section(changed.json, 'subjects').rows.find((r: any) => r.name === 'Sanskrit').id;
    expect((await send('DELETE', `/v1/setup/subjects/${id}`)).status).toBe(200);
  }, 30_000);

  it('refuses to remove what is still in use, and stops edits while the console locks them', async () => {
    const inUse = await send('DELETE', '/v1/setup/classes/cls_8a');
    expect(inUse.status).toBe(409);
    expect(inUse.json.message).toMatch(/Students are still in this class/);
    await h.setSettings({ 'calendar.schoolEdits': false });
    const locked = await send('PUT', '/v1/setup/holidays', { row: { name: 'Founders day', starts_on: '2027-01-12', ends_on: '' } });
    expect(locked.status).toBe(403);
    expect(locked.json.message).toMatch(/Ask Gradeon/);
    expect(section((await get('/v1/setup')).json, 'holidays').locked).toBe(true);
    await h.setSettings({ 'calendar.schoolEdits': true });
    expect((await send('PUT', '/v1/setup/holidays', { row: { name: 'Founders day', starts_on: '12/01/2027', ends_on: '' } })).status).toBe(200);
  }, 30_000);

  it('bills a fee structure to its grade once', async () => {
    const all = (await send('PUT', '/v1/setup/fee_structures', { row: { grade: '8', head: 'activities', title: 'Science fair', amount: '750', due_on: '2026-12-15' } })).json;
    const fee = section(all, 'fee_structures').rows.find((r: any) => r.title === 'Science fair');
    const grade8 = Number((await db.query("select count(*) n from students s join classes c on c.id = s.class_id where c.grade = 8 and s.status = 'active'")).rows[0].n);
    const first = await send('POST', `/v1/setup/fee_structures/${fee.id}/apply`);
    expect(first.json.created).toBe(grade8);
    expect((await send('POST', `/v1/setup/fee_structures/${fee.id}/apply`)).json.created).toBe(0);
  }, 30_000);

  it('keeps the school’s own setup apart from a teacher, who can only read it', async () => {
    const tt = await h.login('sunita.desai@greenfield.edu.in');
    expect((await h.call('GET', '/v1/setup', { token: tt })).status).toBe(200);
    expect((await h.call('PUT', '/v1/setup/subjects', { token: tt, body: { row: { name: 'Art' } } })).status).toBe(403);
  });
});

describe('receipts after moving in', () => {
  it('continues after the highest receipt number brought from the old system', async () => {
    const year = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 4);
    const inv = (await get('/v1/fees/invoices?studentId=stu_aarav')).json.find((i: any) => i.status !== 'paid');
    await db.query("insert into payments (id, invoice_id, amount, method, receipt_no, paid_on) values ('pay_old_1', $1, 1, 'cash', $2, current_date)", [inv.id, `RCPT-${year}-41230`]);
    const paid = await send('POST', '/v1/fees/payments', { studentId: 'stu_aarav', invoiceId: inv.id, amount: 1, method: 'cash' });
    expect(paid.json.receiptNo).toBe(`RCPT-${year}-41231`);
  });
});

describe('going live', () => {
  it('keeps the files the school sends, counting the rows it can read', async () => {
    const list = await send('POST', '/v1/moving-in/uploads', { fileName: 'fees.csv', note: 'Fees for 2026', content: 'admission_no,amount\n1,2\n3,4\n' });
    expect(list.status).toBe(201);
    expect(list.json[0]).toMatchObject({ fileName: 'fees.csv', rows: 2, status: 'new', uploadedBy: 'Neha Menon' });
    const pdf = await send('POST', '/v1/moving-in/uploads', { fileName: 'register.pdf', note: '', content: 'data:application/pdf;base64,JVBERi0xLjQK' });
    expect(pdf.json[0]).toMatchObject({ fileName: 'register.pdf', rows: 0 });
  });

  it('invites families class by class, once each, and counts who signed in', async () => {
    const before = (await get('/v1/moving-in/activation')).json;
    const c8 = before.classes.find((c: any) => c.className === '8 A');
    expect(c8.families).toBeGreaterThan(0);
    const sent = (await send('POST', '/v1/moving-in/families/invite', { classId: 'cls_8a' })).json.sent;
    expect(sent).toBe(c8.families - c8.invited);
    expect((await send('POST', '/v1/moving-in/families/invite', { classId: 'cls_8a' })).json.sent).toBe(0);
    const after = (await get('/v1/moving-in/activation')).json;
    expect(after.classes.find((c: any) => c.className === '8 A').invited).toBe(c8.families);
    expect((await send('POST', '/v1/moving-in/families/invite', { classId: 'cls_8a', remind: true })).json.sent).toBe(c8.families - c8.signedIn);
    const letters = await get('/v1/moving-in/letters.pdf?classId=cls_8a&role=family');
    expect(letters.status).toBe(200);
    expect(letters.headers['content-type']).toContain('application/pdf');
  });

  it('gives staff brought in without a password their first one, and they can sign in', async () => {
    await db.query("insert into users (id, kind, name, email, phone) values ('usr_moved', 'staff', 'Moved Teacher', 'moved.teacher@greenfield.edu.in', '+91 90000 77777')");
    await db.query("insert into staff (user_id, designation) values ('usr_moved', 'Teacher')");
    const r = await send('POST', '/v1/moving-in/staff/invite');
    expect(r.json.sent).toBe(1);
    const mail = await h.registry.query("select body from sandbox_messages where to_addr = 'moved.teacher@greenfield.edu.in' order by created_at desc limit 1");
    const password = /temporary password (\S+?),/.exec(mail.rows[0].body)![1]!;
    expect(await h.login('moved.teacher@greenfield.edu.in', password)).toBeTruthy();
    expect((await send('POST', '/v1/moving-in/staff/invite')).json.sent).toBe(0);
  }, 30_000);

  it('exports everything as a ZIP of the import templates', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/v1/moving-in/export', headers: { 'x-school': 'greenfield', authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(r.rawPayload.toString('latin1')).toContain('08-students.csv');
  }, 30_000);
});
