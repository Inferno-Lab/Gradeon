import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import {
  addDays, dayLabel, initials, istToday, latestSchoolDay, schoolDaysEnding,
  type AssignFee, type AttendanceStatus, type ContactReveal, type FeeStatus, type ImportResult, type MessageRequest,
  type Paged, type StudentCreate, type StudentDetail, type StudentQuery, type StudentRow, type StudentSummary, type StudentViews,
} from '@gradeon/contracts';
import { maskPhone } from '@gradeon/security';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';

const OFF_DAYS = [0];
const FEE_HORIZON_DAYS = 30;
const LOW_ATTENDANCE = 0.88;

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
  private days(n = 10): { last: string; days: string[]; today: string } {
    const today = istToday();
    return { today, last: latestSchoolDay(today, OFF_DAYS), days: schoolDaysEnding(today, n, OFF_DAYS) };
  }

  private baseSql(): string {
    return `
      with paid as (select invoice_id, sum(amount) p from payments group by invoice_id),
      fee as (
        select i.student_id,
          coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p, 0), 0)) filter (where i.due_on < $1::date), 0) overdue,
          coalesce(sum(greatest(i.amount - i.waived_amount - coalesce(paid.p, 0), 0)) filter (where i.due_on >= $1::date and i.due_on <= $2::date), 0) due
        from fee_invoices i left join paid on paid.invoice_id = i.id group by i.student_id),
      att as (
        select m.student_id, avg(case when m.status in ('present','late') then 1.0 else 0.0 end) pct
        from attendance_marks m join attendance_sessions s on s.id = m.session_id group by m.student_id)
      select s.id, s.admission_no, s.name, s.class_id, c.name class_name, s.roll_no, s.house, s.status, g.name guardian_name,
        coalesce(fee.overdue, 0) overdue, coalesce(fee.due, 0) due, att.pct, count(*) over() total
      from students s join classes c on c.id = s.class_id
        left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id
        left join fee on fee.student_id = s.id left join att on att.student_id = s.id`;
  }

  async list(t: TenantCtx, q: StudentQuery): Promise<Paged<StudentRow>> {
    const { today, days } = this.days();
    const where: string[] = [];
    const params: unknown[] = [today, addDays(today, FEE_HORIZON_DAYS)];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
    if (q.query) where.push(`(s.name ilike ${add(`%${esc(q.query)}%`)} or s.admission_no ilike ${add(`%${esc(q.query)}%`)})`);
    if (q.classId) where.push(`s.class_id = ${add(q.classId)}`);
    if (q.house) where.push(`s.house = ${add(q.house)}`);
    if (q.feeStatus === 'overdue') where.push('coalesce(fee.overdue, 0) > 0');
    else if (q.feeStatus === 'due') where.push('coalesce(fee.overdue, 0) = 0 and coalesce(fee.due, 0) > 0');
    else if (q.feeStatus === 'paid') where.push('coalesce(fee.overdue, 0) = 0 and coalesce(fee.due, 0) = 0');
    if (q.attendance === 'low') where.push(`coalesce(att.pct, 1) < ${LOW_ATTENDANCE}`);
    if (q.attendance === 'perfect') where.push('coalesce(att.pct, 0) >= 0.999');
    if (q.newThisYear) where.push(`s.admitted_on >= (select starts_on from academic_years where current limit 1)`);
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
      items: rows.map((r) => this.row(r, ticks.get(r.id) ?? days.map(() => null))),
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
    const { today, last } = this.days();
    const params: unknown[] = [today, last];
    const where: string[] = [];
    if (q.classId) { params.push(q.classId); where.push(`s.class_id = $${params.length}`); }
    if (q.house) { params.push(q.house); where.push(`s.house = $${params.length}`); }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const split = addDays(last, -12);
    const { rows } = await t.pool.query<{ in_view: string; present: string; marked: string; since: string; overdue_amt: string; overdue_fam: string; a_now: number | null; a_prev: number | null }>(
      `with paid as (select invoice_id, sum(amount) p from payments group by invoice_id),
       od as (select i.student_id, sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) amt from fee_invoices i left join paid on paid.invoice_id=i.id where i.due_on < $1::date group by i.student_id having sum(greatest(i.amount - i.waived_amount - coalesce(paid.p,0),0)) > 0)
       select count(*) in_view,
         count(*) filter (where td.status in ('present','late')) present, count(td.status) marked,
         count(*) filter (where td.status in ('present','late') and td.submitted_at >= ($2::date + time '03:30' )::timestamptz) since,
         coalesce(sum(od.amt),0) overdue_amt, count(od.student_id) overdue_fam,
         avg(a.now_pct) a_now, avg(a.prev_pct) a_prev
       from students s
       left join od on od.student_id = s.id
       left join lateral (select m.status, ses.submitted_at from attendance_marks m join attendance_sessions ses on ses.id = m.session_id where m.student_id = s.id and ses.date = $2::date) td on true
       left join lateral (select
          avg(case when ses.date > '${split}' then (case when m.status in ('present','late') then 1.0 else 0.0 end) end) now_pct,
          avg(case when ses.date <= '${split}' then (case when m.status in ('present','late') then 1.0 else 0.0 end) end) prev_pct
          from attendance_marks m join attendance_sessions ses on ses.id = m.session_id where m.student_id = s.id) a on true
       ${w}`, params);
    const r = rows[0]!;
    const total = Number((await t.pool.query<{ n: string }>('select count(*) n from students')).rows[0]!.n);
    const now = r.a_now ?? 1;
    const prev = r.a_prev ?? now;
    return {
      inView: Number(r.in_view), total, presentToday: Number(r.present), markedToday: Number(r.marked), presentSince: Number(r.since),
      overdueAmount: Number(r.overdue_amt), overdueFamilies: Number(r.overdue_fam), avgAttendance: Math.round(now * 1000) / 10,
      avgDelta: Math.round((now - prev) * 1000) / 10, dayLabel: dayLabel(last),
    };
  }

  async views(t: TenantCtx): Promise<StudentViews> {
    const { today } = this.days();
    const pinnedId = await this.settings.value<string | null>(t, 'students.pinnedClass', null);
    const [counts, pinned] = await Promise.all([
      t.pool.query<{ all: string; overdue: string; fresh: string }>(
        `with paid as (select invoice_id, sum(amount) p from payments group by invoice_id),
         od as (select distinct i.student_id from fee_invoices i left join paid on paid.invoice_id=i.id where i.due_on < $1::date and i.amount - i.waived_amount - coalesce(paid.p,0) > 0)
         select (select count(*) from students) "all", (select count(*) from od) overdue,
           (select count(*) from students where admitted_on >= (select starts_on from academic_years where current limit 1)) fresh`, [today]),
      t.pool.query<{ id: string; name: string; n: string }>(
        `select c.id, c.name, (select count(*) from students s where s.class_id = c.id) n from classes c
         where ($1::text is null or c.id = $1) order by c.grade, c.section limit 1`, [pinnedId]),
    ]);
    const c = counts.rows[0]!;
    const p = pinned.rows[0];
    return { all: Number(c.all), pinned: p ? { classId: p.id, name: p.name, count: Number(p.n) } : null, overdue: Number(c.overdue), newThisYear: Number(c.fresh) };
  }

  async detail(t: TenantCtx, id: string): Promise<StudentDetail> {
    const { today, last, days } = this.days();
    const params = [today, addDays(today, FEE_HORIZON_DAYS)];
    const { rows } = await t.pool.query<ListRow & { dob: string; blood_group: string | null; house: string | null; address: string | null; admitted_on: string | null; g_phone: string | null; g_email: string | null }>(
      `${this.baseSql().replace('s.status, g.name guardian_name,', "s.status, to_char(s.dob,'YYYY-MM-DD') dob, s.blood_group, s.address, to_char(s.admitted_on,'YYYY-MM-DD') admitted_on, g.phone g_phone, g.email g_email, g.name guardian_name,")} where s.id = $3`, [...params, id]);
    const r = rows[0];
    if (!r) throw notFound('That student');
    const roll24 = await this.rollWindow(t, id, schoolDaysEnding(last, 24, OFF_DAYS));
    const ticks = await this.ticks(t, [id], days);
    const [exam, hw, lib, route, acts] = await Promise.all([
      t.pool.query<{ exam: string; grade: string; pct: number }>('select exam, grade, pct from exam_results where student_id = $1 order by exam desc limit 1', [id]),
      t.pool.query<{ on_time: string; total: string }>('select count(*) filter (where on_time) on_time, count(*) total from homework_submissions where student_id = $1', [id]),
      t.pool.query<{ n: string }>('select count(*) n from library_loans where student_id = $1 and returned_on is null', [id]),
      t.pool.query<{ route: string }>('select route from transport_assignments where student_id = $1', [id]),
      this.activity(t, id),
    ]);
    const base = this.row(r, ticks.get(id)!);
    return {
      ...base, dob: r.dob, bloodGroup: r.blood_group, house: r.house, address: r.address, admittedOn: r.admitted_on,
      guardianPhone: r.g_phone ? maskPhone(r.g_phone) : null, guardianEmail: r.g_email, routeName: route.rows[0]?.route ?? null,
      facts: {
        attendancePct: base.attendancePct, exam: exam.rows[0] ? { name: exam.rows[0].exam, grade: exam.rows[0].grade, pct: exam.rows[0].pct } : null,
        homework: { onTime: Number(hw.rows[0]!.on_time), total: Number(hw.rows[0]!.total) }, libraryOut: Number(lib.rows[0]!.n),
      },
      chips: { house: r.house }, recentActivity: acts, roll24,
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

  async create(t: TenantCtx, body: StudentCreate, user: { id: string; name: string }): Promise<StudentDetail> {
    const cls = await t.pool.query<{ id: string; grade: number }>('select id, grade from classes where id = $1', [body.classId]);
    if (!cls.rows[0]) throw new ApiError('validation', 'Choose a class from the list.', { fields: { classId: 'Choose a class from the list.' } });
    const limit = t.info.entitlement.limits.students;
    const count = Number((await t.pool.query<{ n: string }>('select count(*) n from students')).rows[0]!.n);
    if (count >= limit) throw new ApiError('locked', `Your plan allows ${limit} students. Ask Gradeon to raise the limit.`);
    const year = new Date().getUTCFullYear();
    const seq = Number((await t.pool.query<{ n: string }>("select count(*) n from students where admission_no like $1", [`${year}/%`])).rows[0]!.n) + 501;
    const id = newId('stu');
    const gid = newId('gdn');
    const roll = body.rollNo || String(Number((await t.pool.query<{ n: string }>('select count(*) n from students where class_id = $1', [body.classId])).rows[0]!.n) + 1).padStart(2, '0');
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      await client.query('insert into students (id, admission_no, name, class_id, roll_no, dob, blood_group, address, admitted_on) values ($1,$2,$3,$4,$5,$6,$7,$8, current_date)', [id, `${year}/${String(seq).padStart(4, '0')}`, body.name, body.classId, roll, body.dob, body.bloodGroup ?? null, body.address ?? null]);
      await client.query("insert into guardians (id, name, phone, relation) values ($1,$2,$3,'Parent')", [gid, body.guardianName, body.guardianPhone]);
      await client.query('insert into student_guardians (student_id, guardian_id, is_primary) values ($1,$2,true)', [id, gid]);
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

  async importCsv(t: TenantCtx, csv: string, user: { id: string; name: string }): Promise<ImportResult> {
    const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    const header = (lines.shift() ?? '').split(',').map((h) => h.trim().toLowerCase());
    const col = (n: string) => header.indexOf(n);
    for (const need of ['name', 'class', 'dob', 'guardian', 'phone']) {
      if (col(need) < 0) throw new ApiError('validation', `The first row must name the columns: name, class, dob, guardian, phone. “${need}” is missing.`);
    }
    const classes = await t.pool.query<{ id: string; name: string }>('select id, name from classes');
    const byName = new Map(classes.rows.map((c) => [c.name.replace(/\s+/g, '').toLowerCase(), c.id]));
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i]!.split(',').map((c) => c.trim());
      const classId = byName.get((cells[col('class')] ?? '').replace(/\s+/g, '').toLowerCase());
      const dob = cells[col('dob')] ?? '';
      const name = cells[col('name')] ?? '';
      const problem = !name ? 'Name is empty.' : !classId ? `Class “${cells[col('class')] ?? ''}” does not exist.` : !/^\d{4}-\d{2}-\d{2}$/.test(dob) ? 'Date of birth should look like 2012-04-18.' : null;
      if (problem) { result.skipped++; result.errors.push({ line: i + 2, message: problem }); continue; }
      try {
        await this.create(t, { name, classId: classId!, dob, guardianName: cells[col('guardian')] || 'Parent or guardian', guardianPhone: cells[col('phone')] || '+91 90000 00000', rollNo: col('roll') >= 0 ? cells[col('roll')] : undefined }, user);
        result.created++;
      } catch (err) {
        result.skipped++;
        result.errors.push({ line: i + 2, message: err instanceof ApiError ? err.message : 'Could not be added.' });
        if (err instanceof ApiError && (err.getResponse() as { code?: string }).code === 'locked') break;
      }
    }
    return result;
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
    await this.messenger.sendMany(t, targets.map((r) => ({ channel: body.channel, to: r.phone!, body: body.body })));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'message.sent', entity: 'student', detail: { count: targets.length, channel: body.channel } });
    return { sent: targets.length };
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
