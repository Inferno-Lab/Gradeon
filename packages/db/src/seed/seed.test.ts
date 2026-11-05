import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { latestSchoolDay, istToday } from '@gradeon/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureDatabase, startDevPostgres, type DevPostgres } from '../dev.js';
import { migrate } from '../migrate.js';
import { seedSchool } from './greenfield.js';

let server: DevPostgres;
let pool: pg.Pool;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];

beforeAll(async () => {
  server = await startDevPostgres({ dataDir: path.join(mkdtempSync(path.join(tmpdir(), 'gradeon-seed-')), 'data'), fresh: true });
  pool = new pg.Pool({ connectionString: await ensureDatabase(server.url, 'school_seed'), max: 4 });
  await migrate(pool, 'school');
  await seedSchool(pool, {
    school: { name: 'Greenfield International School', shortName: 'Greenfield', tagline: '', phone: '', email: '', address: '', color: '#6A4CF5', logoText: 'G', language: 'en' },
    admin: { name: 'Neha Menon', email: 'neha.menon@greenfield.edu.in', phone: '+91 98220 41200', passwordHash: 'x' },
    modules: ['people', 'attendance', 'fees', 'notices', 'timetable'], demoMode: true, data: 'demo', demoPasswordHash: 'x',
  });
}, 180_000);
afterAll(async () => { await pool?.end(); await server?.stop(); });

describe('Greenfield demo seed', () => {
  it('has the sizes in the approved design', async () => {
    expect((await q<{ n: number }>('select count(*)::int n from students'))[0]!.n).toBe(1498);
    expect((await q<{ n: number }>('select count(*)::int n from classes'))[0]!.n).toBe(42);
    expect((await q<{ n: number }>("select count(*)::int n from students where class_id='cls_8a'"))[0]!.n).toBe(36);
  });
  it('has exactly one teacher clash: Kavita on Wednesday period 4', async () => {
    const clashes = await q<{ teacher_id: string; day: number; period: number; n: number }>(
      'select teacher_id, day, period, count(*)::int n from timetable_slots group by 1,2,3 having count(*) > 1');
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ day: 3, period: 3, n: 2 });
    const who = await q<{ name: string }>('select name from users where id = $1', [clashes[0]!.teacher_id]);
    expect(who[0]!.name).toBe('Kavita Iyer');
  });
  it('leaves four classes unmarked on the latest school day', async () => {
    const last = latestSchoolDay(istToday());
    const unmarked = await q<{ name: string }>(
      'select c.name from classes c where not exists (select 1 from attendance_sessions a where a.class_id=c.id and a.date=$1) order by 1', [last]);
    expect(unmarked.map((u) => u.name)).toEqual(['10 A', '6 A', '7 C', '9 B']);
  });
  it('matches the named fee states of class 8 A', async () => {
    const rows = await q<{ name: string; outstanding: number }>(
      `select s.name, coalesce(sum(i.amount - coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id),0)),0)::int outstanding
       from students s join fee_invoices i on i.student_id=s.id where s.class_id='cls_8a' group by s.name having sum(i.amount - coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id),0)) > 0 order by 1`);
    expect(Object.fromEntries(rows.map((r) => [r.name, r.outstanding]))).toEqual({
      'Anika Rao': 6200, 'Diya Mehta': 18500, 'Ishaan Gupta': 18500, 'Kabir Singh': 24950, 'Kiara Patel': 18500,
    });
  });
  it('gives every login the demo password hash and unique contacts', async () => {
    const dupes = await q('select phone from users where phone is not null group by phone having count(*) > 1');
    expect(dupes).toHaveLength(0);
  });
  it('has the indexes the API lookups need, and uses them', async () => {
    const names = (await q<{ indexname: string }>('select indexname from pg_indexes where schemaname = \'public\'')).map((r) => r.indexname);
    expect(names).toEqual(expect.arrayContaining([
      'otp_challenges_user_idx', 'sessions_user_live_idx', 'student_guardians_guardian_idx', 'guardians_user_idx',
      'students_user_idx', 'user_roles_role_idx', 'homework_class_due_idx', 'notices_status_pub_idx',
      'audit_entity_idx', 'fee_invoices_student_due_idx', 'substitutions_date_idx', 'users_phone_digits_idx',
    ]));
    const plan = async (sql: string) => (await pool.query(`explain ${sql}`)).rows.map((r: Record<string, unknown>) => String(Object.values(r)[0])).join('\n');
    const usesIndex = async (sql: string) => expect(await plan(sql), sql).toMatch(/Index Scan|Bitmap Index Scan|Index Only Scan/);
    await usesIndex("select id from users where right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = '9822011002' and length('9822011002') >= 8");
    await usesIndex("select * from fee_invoices where student_id = 'stu_aarav'");
    await usesIndex("select * from student_guardians where guardian_id = (select id from guardians limit 1)");
    await usesIndex("select * from notices where status = 'published' order by published_at desc");
    await usesIndex("select * from homework where class_id = 'cls_8a'");
  });
  it('seeds an empty school with settings but no people', async () => {
    const url = await ensureDatabase(server.url, 'school_empty');
    const p2 = new pg.Pool({ connectionString: url, max: 2 });
    try {
      await migrate(p2, 'school');
      await seedSchool(p2, {
        school: { name: 'Fresh School', shortName: 'Fresh', tagline: '', phone: '', email: '', address: '', color: '#6A4CF5', logoText: 'F', language: 'en' },
        admin: { name: 'Admin One', email: 'a@fresh.test', phone: '+91 90000 00001', passwordHash: 'x' }, modules: ['people'], demoMode: false, data: 'empty',
      });
      expect((await p2.query('select count(*)::int n from students')).rows[0].n).toBe(0);
      expect((await p2.query('select count(*)::int n from users')).rows[0].n).toBe(1);
      expect((await p2.query("select count(*)::int n from settings where key='school.name'")).rows[0].n).toBe(1);
    } finally { await p2.end(); }
  });
});
