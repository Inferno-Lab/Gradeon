import { Injectable } from '@nestjs/common';
import { commitImport, newId, previewImport } from '@gradeon/db';
import {
  addDays, dayLabel, initials, istToday, latestSchoolDay, schoolDaysEnding,
  type AssignFee, type AttendanceStatus, type ContactReveal, type FeeStatus, type ImportResult, type MessageRequest,
  type GuardianRow, type GuardiansPut, type Paged, type StudentCreate, type StudentDetail, type StudentPatch, type StudentQuery, type StudentRow, type StudentSummary, type StudentViews,
} from '@gradeon/contracts';
import { maskPhone } from '@gradeon/security';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';

const FEE_HORIZON_DAYS = 30;

interface ListRow {
  id: string; admission_no: string; name: string; class_id: string; class_name: string; roll_no: string; house: string | null; status: string;
  guardian_name: string | null; overdue: string; due: string; pct: number | null; total: string;
}

const esc = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class StudentsService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
  ) {}

  /** The latest school day and the ten before it, for the tick marks. */
  private days(OFF_DAYS: readonly number[], n = 10): { last: string; days: string[]; today: string } {
    const today = istToday();
    return { today, last: latestSchoolDay(today, OFF_DAYS), days: schoolDaysEnding(today, n, OFF_DAYS) };
  }

  private baseSql(): string {
    return `
      with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id),
      fee as (
        select i.student_id,
          coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p, 0), 0)) filter (where i.due_on < $1::date), 0) overdue,
          coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p, 0), 0)) filter (where i.due_on >= $1::date and i.due_on <= $2::date), 0) due
        from fee_invoices i left join paid on paid.invoice_id = i.id group by i.student_id),
      att as (
        select m.student_id, avg(case when m.status in ('present','late','half_day') then 1.0 else 0.0 end) pct
        from attendance_marks m join attendance_sessions s on s.id = m.session_id group by m.student_id)
      select s.id, s.admission_no, s.name, s.class_id, c.name class_name, s.roll_no, s.house, s.status, g.name guardian_name,
        coalesce(fee.overdue, 0) overdue, coalesce(fee.due, 0) due, att.pct, count(*) over() total
      from students s join classes c on c.id = s.class_id
        left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id
        left join fee on fee.student_id = s.id left join att on att.student_id = s.id`;
  }

/** Which of the modules a student record draws on the school has: the others' numbers are left out of every answer. */
  private async has(t: TenantCtx): Promise<Record<'fees' | 'attendance' | 'exams' | 'homework' | 'library' | 'transport', boolean>> {
    const { modules } = await this.settings.effective(t);
    return { fees: modules.includes('fees'), attendance: modules.includes('attendance'), exams: modules.includes('exams'), homework: modules.includes('homework'), library: modules.includes('library'), transport: modules.includes('transport') };
  }

  private mask<T extends StudentRow>(row: T, has: Awaited<ReturnType<StudentsService['has']>>): T {
    return {
      ...row,
      ...(has.fees ? {} : { feeStatus: 'paid' as const, amountDue: 0 }),
      ...(has.attendance ? {} : { attendance10: row.attendance10.map(() => null), attendancePct: 0 }),
    };
  }

  async list(t: TenantCtx, query: StudentQuery): Promise<Paged<StudentRow>> {
    const has = await this.has(t);
    // Filters and sorts on a module the school does not have are ignored rather than answered.
    const q: StudentQuery = {
      ...query, feeStatus: has.fees ? query.feeStatus : undefined, attendance: has.attendance ? query.attendance : undefined,
      sort: (!has.fees && query.sort === 'due') || (!has.attendance && query.sort === 'attendance') ? 'name' : query.sort,
    };
    const { today, days } = this.days(await this.settings.offDays(t));
    const where: string[] = [];
    const params: unknown[] = [today, addDays(today, FEE_HORIZON_DAYS)];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
    if (q.query) where.push(`(s.name ilike ${add(`%${esc(q.query)}%`)} or s.admission_no ilike ${add(`%${esc(q.query)}%`)})`);
    if (q.classId) where.push(`s.class_id = ${add(q.classId)}`);
    if (q.house) where.push(`s.house = ${add(q.house)}`);
    if (q.feeStatus === 'overdue') where.push('coalesce(fee.overdue, 0) > 0');
    else if (q.feeStatus === 'due') where.push('coalesce(fee.overdue, 0) = 0 and coalesce(fee.due, 0) > 0');
    else if (q.feeStatus === 'paid') where.push('coalesce(fee.overdue, 0) = 0 and coalesce(fee.due, 0) = 0');
    // "Low" is below the school's attendance goal (console: Attendance → goal).
    if (q.attendance === 'low') where.push(`coalesce(att.pct, 1) < ${add((await this.settings.value<number>(t, 'attendance.goalPct', 95)) / 100)}`);
    if (q.attendance === 'perfect') where.push('coalesce(att.pct, 0) >= 0.999');
    if (q.newThisYear) where.push(`s.admitted_on >= (select starts_on from academic_years where current limit 1)`);
    // On the roll, or (the "Left the school" view) those who left; never both mixed.
    where.push(q.left ? "s.status = 'left'" : "s.status = 'active'");
    const dir = q.dir === 'desc' ? 'desc' : 'asc';
    const order = {
      name: `lower(s.name) ${dir}`,
      class: `c.grade ${dir}, c.section ${dir}, s.roll_no ${dir}`,
      attendance: `att.pct ${dir} nulls last`,
      due: `(coalesce(fee.overdue,0) + coalesce(fee.due,0)) ${dir}`,
    }[q.sort];
    const limit = add(q.limit);
    const offset = add((q.page - 1) * q.limit);
    const { rows } = await t.pool.query<ListRow>(
      `${this.baseSql()} ${where.length ? `where ${where.join(' and ')}` : ''} order by ${order}, s.id limit ${limit} offset ${offset}`, params);
    const ticks = await this.ticks(t, rows.map((r) => r.id), days);
    return {
      items: rows.map((r) => this.mask(this.row(r, ticks.get(r.id) ?? days.map(() => null)), has)),
      total: Number(rows[0]?.total ?? 0), page: q.page, limit: q.limit,
    };
  }

  private row(r: ListRow, attendance10: (AttendanceStatus | null)[]): StudentRow {
    const overdue = Number(r.overdue);
    const due = Number(r.due);
    const feeStatus: FeeStatus = overdue > 0 ? 'overdue' : due > 0 ? 'due' : 'paid';
    return {
      id: r.id, admissionNo: r.admission_no, name: r.name, initials: initials(r.name), classId: r.class_id, className: r.class_name,
      rollNo: r.roll_no, house: r.house, guardianName: r.guardian_name ?? '', feeStatus, amountDue: overdue + due, attendance10,
      attendancePct: Math.round((r.pct ?? 1) * 1000) / 10, status: r.status === 'active' ? 'active' : 'inactive',
    };
  }

  private async ticks(t: TenantCtx, ids: string[], days: string[]): Promise<Map<string, (AttendanceStatus | null)[]>> {
    const out = new Map<string, (AttendanceStatus | null)[]>();
    if (!ids.length) return out;
    const { rows } = await t.pool.query<{ student_id: string; date: string; status: AttendanceStatus }>(
      `select m.student_id, to_char(s.date, 'YYYY-MM-DD') date, m.status from attendance_marks m join attendance_sessions s on s.id = m.session_id
       where m.student_id = any($1) and s.date = any($2::date[])`, [ids, days]);
    for (const id of ids) out.set(id, days.map(() => null));
    for (const r of rows) out.get(r.student_id)![days.indexOf(r.date)] = r.status;
    return out;
  }

  async summary(t: TenantCtx, q: Pick<StudentQuery, 'classId' | 'house'>): Promise<StudentSummary> {
    const { today, last } = this.days(await this.settings.offDays(t));
    const params: unknown[] = [today, last];
    const where: string[] = [];
    if (q.classId) { params.push(q.classId); where.push(`s.class_id = $${params.length}`); }
    if (q.house) { params.push(q.house); where.push(`s.house = $${params.length}`); }
    where.push("s.status = 'active'");
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const split = addDays(last, -12);
    const { rows } = await t.pool.query<{ in_view: string; present: string; marked: string; since: string; overdue_amt: string; overdue_fam: string; a_now: number | null; a_prev: number | null }>(
      `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id),
       od as (select i.student_id, sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) amt from fee_invoices i left join paid on paid.invoice_id=i.id where i.due_on < $1::date group by i.student_id having sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) > 0)
       select count(*) in_view,
         count(*) filter (where td.status in ('present','late','half_day')) present, count(td.status) marked,
         count(*) filter (where td.status in ('present','late','half_day') and td.submitted_at >= ($2::date + time '03:30' )::timestamptz) since,
         coalesce(sum(od.amt),0) overdue_amt, count(od.student_id) overdue_fam,
         avg(a.now_pct) a_now, avg(a.prev_pct) a_prev
       from students s
       left join od on od.student_id = s.id
       left join lateral (select m.status, ses.submitted_at from attendance_marks m join attendance_sessions ses on ses.id = m.session_id where m.student_id = s.id and ses.date = $2::date) td on true
       left join lateral (select
          avg(case when ses.date > '${split}' then (case when m.status in ('present','late','half_day') then 1.0 else 0.0 end) end) now_pct,
          avg(case when ses.date <= '${split}' then (case when m.status in ('present','late','half_day') then 1.0 else 0.0 end) end) prev_pct
          from attendance_marks m join attendance_sessions ses on ses.id = m.session_id where m.student_id = s.id) a on true
       ${w}`, params);
    const r = rows[0]!;
    const total = Number((await t.pool.query<{ n: string }>('select count(*) n from students')).rows[0]!.n);
    const now = r.a_now ?? 1;
    const prev = r.a_prev ?? now;
    const out: StudentSummary = {
      inView: Number(r.in_view), total, presentToday: Number(r.present), markedToday: Number(r.marked), presentSince: Number(r.since),
      overdueAmount: Number(r.overdue_amt), overdueFamilies: Number(r.overdue_fam), avgAttendance: Math.round(now * 1000) / 10,
      avgDelta: Math.round((now - prev) * 1000) / 10, dayLabel: dayLabel(last),
    };
    return this.maskSummary(out, await this.has(t));
  }

  private maskSummary(out: StudentSummary, has: Awaited<ReturnType<StudentsService['has']>>): StudentSummary {
    return {
      ...out,
      ...(has.fees ? {} : { overdueAmount: 0, overdueFamilies: 0 }),
      ...(has.attendance ? {} : { presentToday: 0, markedToday: 0, presentSince: 0, avgAttendance: 0, avgDelta: 0 }),
    };
  }

  /** The page's starting views. The pinned class is the person's own (remembered when they pick one), else the class they teach. */
  async views(t: TenantCtx, userId: string): Promise<StudentViews> {
    const { today } = this.days(await this.settings.offDays(t));
    const own = await t.pool.query<{ value: string }>("select value #>> '{}' as value from user_prefs where user_id = $1 and key = 'students.class'", [userId]);
    const taught = own.rows[0] ? null : await t.pool.query<{ id: string }>('select id from classes where class_teacher_id = $1 order by grade, section limit 1', [userId]).catch(() => ({ rows: [] as { id: string }[] }));
    const pinnedId = own.rows[0]?.value ?? taught?.rows[0]?.id ?? null;
    const [counts, pinned] = await Promise.all([
      t.pool.query<{ all: string; overdue: string; fresh: string; left: string }>(
        `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id),
         od as (select distinct i.student_id from fee_invoices i left join paid on paid.invoice_id=i.id where i.due_on < $1::date and i.amount - i.waived_amount - coalesce(paid.p,0) > 0)
         select (select count(*) from students where status = 'active') "all", (select count(*) from od join students s on s.id = od.student_id and s.status = 'active') overdue,
           (select count(*) from students where status = 'active' and admitted_on >= (select starts_on from academic_years where current limit 1)) fresh,
           (select count(*) from students where status = 'left' and erased_at is null) "left"`, [today]),
      t.pool.query<{ id: string; name: string; n: string }>(
        `select c.id, c.name, (select count(*) from students s where s.class_id = c.id) n from classes c
         where ($1::text is null or c.id = $1) order by c.grade, c.section limit 1`, [pinnedId]),
    ]);
    const c = counts.rows[0]!;
    const p = pinned.rows[0];
    return { all: Number(c.all), pinned: p ? { classId: p.id, name: p.name, count: Number(p.n) } : null, overdue: (await this.has(t)).fees ? Number(c.overdue) : 0, newThisYear: Number(c.fresh), left: Number(c.left) };
  }

  async detail(t: TenantCtx, id: string): Promise<StudentDetail> {
    const OFF_DAYS = await this.settings.offDays(t);
    const { today, last, days } = this.days(await this.settings.offDays(t));
    const params = [today, addDays(today, FEE_HORIZON_DAYS)];
    const { rows } = await t.pool.query<ListRow & { dob: string; blood_group: string | null; house: string | null; address: string | null; admitted_on: string | null; g_phone: string | null; g_email: string | null }>(
      `${this.baseSql().replace('s.status, g.name guardian_name,', "s.status, to_char(s.dob,'YYYY-MM-DD') dob, s.blood_group, s.address, to_char(s.admitted_on,'YYYY-MM-DD') admitted_on, g.phone g_phone, g.email g_email, g.name guardian_name,")} where s.id = $3`, [...params, id]);
    const r = rows[0];
    if (!r) throw notFound('That student');
    const roll24 = await this.rollWindow(t, id, schoolDaysEnding(last, 24, OFF_DAYS));
    const ticks = await this.ticks(t, [id], days);
    const [exam, hw, lib, route, acts, account] = await Promise.all([
      t.pool.query<{ exam: string; grade: string; pct: number }>('select exam, grade, pct from exam_results where student_id = $1 order by exam desc limit 1', [id]),
      t.pool.query<{ on_time: string; total: string }>('select count(*) filter (where on_time) on_time, count(*) total from homework_submissions where student_id = $1', [id]),
      t.pool.query<{ n: string }>('select count(*) n from library_loans where student_id = $1 and returned_on is null', [id]),
      t.pool.query<{ route: string }>('select route from transport_assignments where student_id = $1', [id]),
      this.activity(t, id),
      t.pool.query<{ phone: string | null; email: string | null; last_login_at: Date | null }>('select u.phone, u.email, u.last_login_at from students s join users u on u.id = s.user_id where s.id = $1', [id]),
    ]);
    const extra = (await t.pool.query<{ gender: StudentDetail['gender']; status: string; left_on: string | null; reason: string | null }>("select gender, status, left_on::text, leaving_reason reason from students where id = $1", [id])).rows[0];
    const has = await this.has(t);
    const acc = account.rows[0];
    const base = this.mask(this.row(r, ticks.get(id)!), has);
    return {
      ...base, dob: r.dob, bloodGroup: r.blood_group, house: r.house, address: r.address, admittedOn: r.admitted_on,
      guardianPhone: r.g_phone ? maskPhone(r.g_phone) : null, guardianEmail: r.g_email, routeName: has.transport ? route.rows[0]?.route ?? null : null,
      facts: {
        attendancePct: base.attendancePct, exam: has.exams && exam.rows[0] ? { name: exam.rows[0].exam, grade: exam.rows[0].grade, pct: exam.rows[0].pct } : null,
        homework: has.homework ? { onTime: Number(hw.rows[0]!.on_time), total: Number(hw.rows[0]!.total) } : { onTime: 0, total: 0 }, libraryOut: has.library ? Number(lib.rows[0]!.n) : 0,
      },
      chips: { house: r.house }, recentActivity: acts, roll24: has.attendance ? roll24 : roll24.map(() => null),
      gender: extra?.gender ?? null, guardians: await this.guardians(t, id), left: extra?.status === 'left' && extra.left_on ? { on: extra.left_on, reason: extra.reason ?? '' } : null,
      appAccount: acc ? { phone: acc.phone ? maskPhone(acc.phone) : '', email: acc.email ?? '', lastSignIn: acc.last_login_at?.toISOString() ?? null } : null,
    };
  }

  private async rollWindow(t: TenantCtx, id: string, days: string[]): Promise<(AttendanceStatus | null)[]> {
    const m = await this.ticks(t, [id], days);
    return m.get(id)!;
  }

  private async activity(t: TenantCtx, id: string): Promise<StudentDetail['recentActivity']> {
    const [pay, hw, att] = await Promise.all([
      t.pool.query<{ id: string; at: Date; title: string; method: string; receipt_no: string }>(
        `select p.id, p.created_at at, i.title, p.method, p.receipt_no from payments p join fee_invoices i on i.id = p.invoice_id where i.student_id = $1 order by p.paid_on desc, p.created_at desc limit 1`, [id]),
      t.pool.query<{ id: string; at: Date; title: string }>(
        `select h.id, hs.handed_at at, h.title from homework_submissions hs join homework h on h.id = hs.homework_id where hs.student_id = $1 and hs.handed_at is not null order by hs.handed_at desc limit 1`, [id]),
      t.pool.query<{ id: string; date: string; status: string; marker: string | null }>(
        `select s.id, to_char(s.date,'YYYY-MM-DD') date, m.status, u.name marker from attendance_marks m join attendance_sessions s on s.id = m.session_id left join users u on u.id = s.marked_by
         where m.student_id = $1 and m.status in ('late','absent') order by s.date desc limit 1`, [id]),
    ]);
    const out: StudentDetail['recentActivity'] = [];
    const p = pay.rows[0];
    if (p) out.push({ id: p.id, at: p.at.toISOString(), label: `${p.title} paid by ${p.method.toUpperCase()}`, sub: p.receipt_no, tone: 'g' });
    const h = hw.rows[0];
    if (h) out.push({ id: h.id, at: h.at.toISOString(), label: `Handed in “${h.title}”`, sub: '', tone: 'v' });
    const a = att.rows[0];
    if (a) out.push({ id: a.id, at: `${a.date}T08:00:00+05:30`, label: a.status === 'late' ? 'Arrived late' : 'Absent', sub: a.marker ? `marked by ${a.marker}` : '', tone: 'a' });
    return out;
  }

  async reveal(t: TenantCtx, id: string, user: { id: string; name: string }): Promise<ContactReveal> {
    const { rows } = await t.pool.query<{ phone: string | null; email: string | null }>(
      'select g.phone, g.email from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = $1 and sg.is_primary', [id]);
    if (!rows[0]?.phone) throw notFound('A phone number for this student');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'contact.revealed', entity: 'student', entityId: id });
    return { phone: rows[0].phone, email: rows[0].email };
  }

  /** The fields the school requires beyond the always-needed ones (console: students.required), checked on add and edit. */
  private async required(t: TenantCtx, body: StudentPatch): Promise<void> {
    const need = await this.settings.value<string[]>(t, 'students.required', []);
    const missing = need.filter((k) => k in body ? !String((body as Record<string, unknown>)[k] ?? '').trim() : false);
    if (missing.length) throw new ApiError('validation', 'Fill in the fields your school keeps for every student.', { fields: Object.fromEntries(missing.map((k) => [k, 'Your school needs this.'])) });
  }

  async create(t: TenantCtx, body: StudentCreate, user: { id: string; name: string }): Promise<StudentDetail> {
    const need = await this.settings.value<string[]>(t, 'students.required', []);
    await this.required(t, Object.fromEntries(need.map((k) => [k, (body as Record<string, unknown>)[k] ?? ''])) as StudentPatch);
    if (body.admissionNo && (await t.pool.query('select 1 from students where lower(admission_no) = lower($1)', [body.admissionNo])).rowCount) {
      throw new ApiError('validation', 'Another student has that admission number.', { fields: { admissionNo: 'Already used.' } });
    }
    const cls = await t.pool.query<{ id: string; grade: number }>('select id, grade from classes where id = $1', [body.classId]);
    if (!cls.rows[0]) throw new ApiError('validation', 'Choose a class from the list.', { fields: { classId: 'Choose a class from the list.' } });
    const limit = t.info.entitlement.limits.students;
    const count = Number((await t.pool.query<{ n: string }>('select count(*) n from students')).rows[0]!.n);
    if (count >= limit) throw new ApiError('locked', `Your plan allows ${limit} students. Ask Gradeon to raise the limit.`);
    const year = new Date().getUTCFullYear();
    const seq = Number((await t.pool.query<{ n: string }>("select count(*) n from students where admission_no like $1", [`${year}/%`])).rows[0]!.n) + 501;
    const id = newId('stu');
    const roll = body.rollNo || String(Number((await t.pool.query<{ n: string }>('select count(*) n from students where class_id = $1', [body.classId])).rows[0]!.n) + 1).padStart(2, '0');
    const digits = body.guardianPhone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) throw new ApiError('validation', 'Add the guardian’s 10-digit phone number.', { fields: { guardianPhone: 'Use a 10-digit phone number.' } });
    const byPhone = "right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = $1";
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      await client.query('insert into students (id, admission_no, name, class_id, roll_no, dob, blood_group, address, gender, house, admitted_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, current_date)',
        [id, body.admissionNo || `${year}/${String(seq).padStart(4, '0')}`, body.name, body.classId, roll, body.dob, body.bloodGroup ?? null, body.address ?? null, body.gender ?? null, body.house || null]);
      // One family, one guardian: a brother or sister joins the guardian who already has that phone number.
      let g = (await client.query<{ id: string; user_id: string | null }>(`select id, user_id from guardians where ${byPhone} limit 1`, [digits])).rows[0];
      if (!g) {
        g = { id: newId('gdn'), user_id: null };
        await client.query("insert into guardians (id, name, phone, relation) values ($1,$2,$3,'Parent')", [g.id, body.guardianName, body.guardianPhone]);
      }
      await client.query('insert into student_guardians (student_id, guardian_id, is_primary) values ($1,$2,true)', [id, g.id]);
      // The family's app account: signs in with a code to this phone, no password.
      if (!g.user_id) {
        let uid = (await client.query<{ id: string }>(`select id from users where ${byPhone} limit 1`, [digits])).rows[0]?.id;
        if (!uid) {
          uid = newId('usr');
          await client.query("insert into users (id, kind, name, phone) values ($1,'guardian',$2,$3)", [uid, body.guardianName, body.guardianPhone]);
        }
        await client.query('update guardians set user_id = $2 where id = $1', [g.id, uid]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'student.created', entity: 'student', entityId: id, detail: { name: body.name } });
    return this.detail(t, id);
  }

  /** Changes a student's record. A new class keeps their history; the roll number follows if one is given. */
  async update(t: TenantCtx, id: string, b: StudentPatch, user: { id: string; name: string }): Promise<StudentDetail> {
    const was = (await t.pool.query<{ class_id: string }>("select class_id from students where id = $1 and status = 'active'", [id])).rows[0];
    if (!was) throw notFound('That student');
    await this.required(t, b);
    if (b.classId && !(await t.pool.query('select 1 from classes where id = $1', [b.classId])).rowCount) throw new ApiError('validation', 'Choose a class from the list.', { fields: { classId: 'Choose a class from the list.' } });
    if (b.admissionNo && (await t.pool.query('select 1 from students where lower(admission_no) = lower($1) and id <> $2', [b.admissionNo, id])).rowCount) {
      throw new ApiError('validation', 'Another student has that admission number.', { fields: { admissionNo: 'Already used.' } });
    }
    const cols: Record<keyof StudentPatch, string> = { name: 'name', classId: 'class_id', rollNo: 'roll_no', dob: 'dob', gender: 'gender', house: 'house', admissionNo: 'admission_no', bloodGroup: 'blood_group', address: 'address' };
    const set = (Object.keys(cols) as (keyof StudentPatch)[]).filter((k) => b[k] !== undefined);
    if (set.length) {
      await t.pool.query(`update students set ${set.map((k, i) => `${cols[k]} = $${i + 2}`).join(', ')} where id = $1`, [id, ...set.map((k) => (b[k] === '' ? null : b[k]))]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: b.classId && b.classId !== was.class_id ? 'student.moved' : 'student.edited', entity: 'student', entityId: id, detail: { fields: set.join(', ') } });
    return this.detail(t, id);
  }

  async guardians(t: TenantCtx, studentId: string): Promise<GuardianRow[]> {
    const { rows } = await t.pool.query<{ id: string; name: string; phone: string | null; email: string | null; relation: string | null; can_collect: boolean; is_primary: boolean; user_id: string | null; login: Date | null }>(
      `select g.id, g.name, g.phone, g.email, g.relation, sg.can_collect, sg.is_primary, g.user_id, u.last_login_at login from student_guardians sg join guardians g on g.id = sg.guardian_id
       left join users u on u.id = g.user_id where sg.student_id = $1 order by sg.is_primary desc, g.name`, [studentId]);
    return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone ? maskPhone(r.phone) : '', email: r.email ?? '', relation: r.relation ?? 'Parent', canCollect: r.can_collect, isPrimary: r.is_primary, hasApp: !!r.login }));
  }

  /**
   * Sets a student's guardians. A guardian already known by phone (a brother's or sister's) is joined, not made twice; one taken
   * off this student stays for their other children. Each guardian has the family app account of their phone.
   */
  async setGuardians(t: TenantCtx, studentId: string, b: GuardiansPut, user: { id: string; name: string }): Promise<GuardianRow[]> {
    if (!(await t.pool.query('select 1 from students where id = $1', [studentId])).rowCount) throw notFound('That student');
    const byPhone = "right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = $1";
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      const keep: string[] = [];
      for (const g of b.guardians) {
        // An existing guardian keeps their (masked) phone unless a new one is typed in full.
        const known = g.id ? (await client.query<{ id: string; phone: string | null }>('select id, phone from guardians where id = $1', [g.id])).rows[0] : undefined;
        const phone = known && /[^\d\s+()-]/.test(g.phone) ? known.phone ?? '' : g.phone;
        const digits = phone.replace(/\D/g, '').slice(-10);
        if (digits.length < 10) throw new ApiError('validation', `Add ${g.name}’s 10-digit phone number.`, { fields: { phone: 'Use a 10-digit phone number.' } });
        let id = known?.id ?? (await client.query<{ id: string }>(`select id from guardians where ${byPhone} limit 1`, [digits])).rows[0]?.id;
        if (id) await client.query('update guardians set name = $2, phone = $3, email = $4, relation = $5 where id = $1', [id, g.name, phone, g.email || null, g.relation]);
        else {
          id = newId('gdn');
          await client.query('insert into guardians (id, name, phone, email, relation) values ($1,$2,$3,$4,$5)', [id, g.name, phone, g.email || null, g.relation]);
        }
        const d = digits;
        const has = (await client.query<{ user_id: string | null }>('select user_id from guardians where id = $1', [id])).rows[0]?.user_id;
        if (!has) {
          let uid = (await client.query<{ id: string }>(`select id from users where ${byPhone} limit 1`, [d])).rows[0]?.id;
          if (!uid) { uid = newId('usr'); await client.query("insert into users (id, kind, name, phone) values ($1,'guardian',$2,$3)", [uid, g.name, phone]); }
          await client.query('update guardians set user_id = $2 where id = $1', [id, uid]);
        }
        await client.query(`insert into student_guardians (student_id, guardian_id, is_primary, can_collect) values ($1,$2,$3,$4)
          on conflict (student_id, guardian_id) do update set is_primary = excluded.is_primary, can_collect = excluded.can_collect`, [studentId, id, g.isPrimary, g.canCollect]);
        keep.push(id);
      }
      await client.query('delete from student_guardians where student_id = $1 and guardian_id <> all($2)', [studentId, keep]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'student.guardians', entity: 'student', entityId: studentId, detail: { count: b.guardians.length } });
    return this.guardians(t, studentId);
  }

  /** The school's own sheet of students, through the same engine as Migration: bad lines are reported, the rest go in as one batch. */
  async importCsv(t: TenantCtx, csv: string, user: { id: string; name: string }): Promise<ImportResult> {
    const input = { kind: 'students', csv, fileName: 'Students page' };
    const p = await previewImport(t.pool, input);
    if (p.missing.length) throw new ApiError('validation', `The first row must name the columns. Nothing is matched to ${p.missing.join(', ')}.`);
    const limit = t.info.entitlement.limits.students;
    const count = Number((await t.pool.query<{ n: string }>('select count(*) n from students')).rows[0]!.n);
    if (count + p.counts.create > limit) throw new ApiError('locked', `Your plan allows ${limit} students and this sheet would make ${count + p.counts.create}. Ask Gradeon to raise the limit.`);
    const errors = p.rows.filter((r) => r.errors.length).map((r) => ({ line: r.line, message: r.errors.join(' ') }));
    if (p.counts.create + p.counts.update === 0) return { created: 0, updated: 0, skipped: errors.length, errors };
    const batch = await commitImport(t.pool, input, user.name);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'students.imported', entity: 'student', detail: { created: batch.created, updated: batch.updated, skipped: batch.skipped } });
    return { created: batch.created, updated: batch.updated, skipped: errors.length, errors };
  }

  async exportCsv(t: TenantCtx, ids: string[] | null): Promise<string> {
    const { rows } = await t.pool.query<{ admission_no: string; name: string; class_name: string; roll_no: string; dob: string; guardian: string | null; phone: string | null }>(
      `select s.admission_no, s.name, c.name class_name, s.roll_no, to_char(s.dob,'YYYY-MM-DD') dob, g.name guardian, g.phone
       from students s join classes c on c.id = s.class_id left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id
       ${ids ? 'where s.id = any($1)' : ''} order by c.grade, c.section, s.roll_no`, ids ? [ids] : []);
    const q = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
    return ['admission_no,name,class,roll,dob,guardian,phone', ...rows.map((r) => [r.admission_no, r.name, r.class_name, r.roll_no, r.dob, r.guardian, r.phone].map(q).join(','))].join('\n');
  }

  async message(t: TenantCtx, body: MessageRequest, user: { id: string; name: string }): Promise<{ sent: number }> {
    const { rows } = await t.pool.query<{ student_id: string; phone: string | null; name: string }>(
      'select sg.student_id, g.phone, s.name from student_guardians sg join guardians g on g.id = sg.guardian_id join students s on s.id = sg.student_id where sg.student_id = any($1) and sg.is_primary', [body.ids]);
    const targets = rows.filter((r) => r.phone);
    // How it travels (the app, SMS, WhatsApp, email) is the console's rule for "A message from the office", not the sender's pick.
    const sent = await this.messenger.notify(t, 'office.message', targets.map((r) => ({ to: r.phone!, vars: { text: body.body } })));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'message.sent', entity: 'student', detail: { count: sent } });
    return { sent };
  }

  /**
   * Gives a student their own app account (when the school uses the student role): signed in with their own phone or email by a
   * code, seeing only themselves. The student is told how to start.
   */
  async studentAccount(t: TenantCtx, user: { id: string; name: string }, studentId: string, b: { phone?: string; email?: string }): Promise<{ sent: boolean }> {
    const roles = await this.settings.value<string[]>(t, 'app.roles', []);
    if (!roles.includes('student')) throw new ApiError('conflict', 'Your school does not use the app for students. Ask Gradeon to switch it on.');
    const s = (await t.pool.query<{ name: string; user_id: string | null }>("select name, user_id from students where id = $1 and status = 'active'", [studentId])).rows[0];
    if (!s) throw notFound('That student');
    const phone = b.phone?.replace(/[^\d+]/g, '') || null;
    const email = b.email?.trim().toLowerCase() || null;
    if (!phone && !email) throw new ApiError('validation', 'Give the student’s own phone or email.', { fields: { phone: 'Phone or email is needed.' } });
    const taken = (await t.pool.query<{ id: string }>("select id from users where id <> coalesce($3, '') and ((lower(email) = $1 and $1 is not null) or (right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = right($2, 10) and $2 is not null))", [email, phone, s.user_id])).rows[0];
    if (taken) throw new ApiError('conflict', 'That phone or email already signs in to another account. Use the student’s own.');
    let id = s.user_id;
    if (id) await t.pool.query('update users set phone = $2, email = $3 where id = $1', [id, phone, email]);
    else {
      id = newId('usr');
      await t.pool.query("insert into users (id, kind, name, phone, email, status, invited_at) values ($1,'student',$2,$3,$4,'active',now())", [id, s.name, phone, email]);
      await t.pool.query('update students set user_id = $2 where id = $1', [studentId, id]);
    }
    const sent = await this.messenger.notify(t, 'student.invite', [{ to: phone ?? email!, email, vars: { student: s.name.split(' ')[0]! } }]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'student.account', entity: 'student', entityId: studentId });
    return { sent: sent > 0 };
  }

  /** Asks each family (once, however many children are selected) to install the app and sign in with their phone. */
  async invite(t: TenantCtx, ids: string[], user: { id: string; name: string }): Promise<{ sent: number }> {
    const { rows } = await t.pool.query<{ phone: string; name: string }>(
      `select distinct on (g.phone) g.phone, s.name from student_guardians sg join guardians g on g.id = sg.guardian_id join students s on s.id = sg.student_id
       where sg.student_id = any($1) and sg.is_primary and g.phone is not null order by g.phone, s.name`, [ids]);
    const sent = await this.messenger.notify(t, 'family.invite', rows.map((r) => ({ to: r.phone, vars: { student: r.name } })));
    await t.pool.query(`update users set invited_at = coalesce(invited_at, now()) where id in
      (select g.user_id from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = any($1) and sg.is_primary)`, [ids]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'family.invited', entity: 'student', detail: { families: sent } });
    return { sent };
  }

  async assignFee(t: TenantCtx, body: AssignFee, user: { id: string; name: string }): Promise<{ created: number }> {
    const rows = body.ids.map((id) => [newId('inv'), id, body.head, body.title, body.amount, body.dueOn]);
    const params: unknown[] = [];
    const tuples = rows.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`);
    await t.pool.query(`insert into fee_invoices (id, student_id, head, title, amount, due_on) values ${tuples.join(',')}`, params);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'fee.assigned', entity: 'student', detail: { count: rows.length, title: body.title, amount: body.amount } });
    return { created: rows.length };
  }
}
