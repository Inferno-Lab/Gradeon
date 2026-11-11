import { Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import {
  addDays, dayMonth, inr, istToday, latestSchoolDay, type DataRequestCreate, type DataRequestDecision, type DataRequestRow, type EventReply, type EventRow, type EventSave, type FeeStatus, type InvoiceListQuery,
  type InvoiceListRow, type InvoiceListSummary, type Paged, type ReceiptRow, type ReportData, type ReportInfo, type ReportQuery, type ThreadCreate, type ThreadDetail, type ThreadPatch, type ThreadReply, type ThreadRow,
} from '@gradeon/contracts';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';
import { ChatService } from './chat.service.js';

type User = { id: string; name: string };
const esc = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);
const money = (n: number) => `₹${inr(Math.round(n))}`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const REPORTS: ReportInfo[] = [
  { id: 'attendance-class', title: 'Attendance by class', blurb: 'Present, late, absent and leave for every class over a period (the last 30 school days unless chosen).', area: 'Attendance', filters: ['dates', 'class'], needs: 'attendance' },
  { id: 'attendance-low', title: 'Low attendance', blurb: 'Students present on fewer days than the school’s attendance goal over a period (this month unless chosen).', area: 'Attendance', filters: ['dates', 'class'], needs: 'attendance' },
  { id: 'fees-collection', title: 'Fees by type', blurb: 'What was billed, collected and is still due for each kind of fee (fees due in the period, if one is chosen).', area: 'Fees', filters: ['dates', 'class'], needs: 'fees' },
  { id: 'fees-defaulters', title: 'Overdue families', blurb: 'Families with an unpaid fee past its due date, largest first.', area: 'Fees', filters: ['class'], needs: 'fees' },
  { id: 'strength', title: 'Class strength', blurb: 'Students in every class, with the class teacher.', area: 'People', filters: [], needs: null },
  { id: 'results', title: 'Exam results by class', blurb: 'Average and pass rate of every published exam.', area: 'Learning', filters: ['class'], needs: 'exams' },
  { id: 'homework', title: 'Homework hand-in', blurb: 'How much homework was set and how much came in on time, by class (homework set in the period, if one is chosen).', area: 'Learning', filters: ['dates', 'class'], needs: 'homework' },
];

/** The office side of the school: invoices and receipts, reports, the family inbox, the calendar and data requests. */
@Injectable()
export class OfficeService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
    private readonly chat: ChatService,
  ) {}

  // Invoices and receipts

  private invoiceBase(): string {
    return `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id),
      inv as (
        select i.id, i.student_id, s.name student_name, c.name class_name, i.head, i.title, i.amount, i.waived_amount waived, coalesce(paid.p, 0)::int paid, i.due_on::text due_on, i.due_on d,
          greatest(i.amount - i.waived_amount - coalesce(paid.p, 0), 0)::int outstanding,
          case when i.amount - i.waived_amount - coalesce(paid.p, 0) <= 0 then 'paid' when i.due_on < $1::date then 'overdue' when coalesce(paid.p, 0) > 0 then 'partial' else 'due' end status
        from fee_invoices i join students s on s.id = i.student_id join classes c on c.id = s.class_id left join paid on paid.invoice_id = i.id)`;
  }

  async invoiceList(t: TenantCtx, q: InvoiceListQuery): Promise<Paged<InvoiceListRow> & { summary: InvoiceListSummary }> {
    const params: unknown[] = [istToday()];
    const where: string[] = [];
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.head) { params.push(q.head); where.push(`head = $${params.length}`); }
    if (q.query) { params.push(`%${esc(q.query)}%`); where.push(`(student_name ilike $${params.length} or title ilike $${params.length})`); }
    const cond = where.length ? `where ${where.join(' and ')}` : '';
    const [page, sum] = await Promise.all([
      t.pool.query<{ id: string; student_id: string; student_name: string; class_name: string; head: string; title: string; amount: number; waived: number; paid: number; outstanding: number; due_on: string; status: FeeStatus }>(
        `${this.invoiceBase()} select * from inv ${cond} order by d desc, student_name limit ${q.limit} offset ${(q.page - 1) * q.limit}`, params),
      t.pool.query<{ n: string; billed: string; collected: string; outstanding: string }>(
        `${this.invoiceBase()} select count(*) n, coalesce(sum(amount - waived), 0) billed, coalesce(sum(paid), 0) collected, coalesce(sum(outstanding), 0) outstanding from inv ${cond}`, params),
    ]);
    const s = sum.rows[0]!;
    return {
      items: page.rows.map((r) => ({ id: r.id, studentId: r.student_id, studentName: r.student_name, className: r.class_name, head: r.head, title: r.title, amount: r.amount, waived: r.waived, paid: r.paid, outstanding: r.outstanding, dueOn: r.due_on, status: r.status })),
      total: Number(s.n), page: q.page, limit: q.limit,
      summary: { count: Number(s.n), billed: Number(s.billed), collected: Number(s.collected), outstanding: Number(s.outstanding) },
    };
  }

  async receipts(t: TenantCtx, query?: string, page = 1, limit = 25): Promise<Paged<ReceiptRow>> {
    const params = [query ? `%${esc(query)}%` : null];
    const where = `where ($1::text is null or s.name ilike $1 or p.receipt_no ilike $1)`;
    const from = 'from payments p join fee_invoices i on i.id = p.invoice_id join students s on s.id = i.student_id join classes c on c.id = s.class_id left join users u on u.id = p.recorded_by';
    const [{ rows }, total] = await Promise.all([
      t.pool.query<{ id: string; receipt_no: string; name: string; class_name: string; title: string; amount: number; method: string; reference: string | null; paid_on: string; by: string | null; invoice_id: string; cancelled_at: Date | null; cancel_reason: string }>(
        `select p.id, p.receipt_no, s.name, c.name class_name, i.title, p.amount, p.method, p.reference, p.paid_on::text, u.name "by", p.invoice_id, p.cancelled_at, p.cancel_reason
         ${from} ${where} order by p.paid_on desc, p.receipt_no desc limit ${limit} offset ${(page - 1) * limit}`, params),
      t.pool.query<{ n: string }>(`select count(*) n ${from} ${where}`, params),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, receiptNo: r.receipt_no, studentName: r.name, className: r.class_name, title: r.title, amount: r.amount, method: r.method, reference: r.reference, paidOn: r.paid_on, recordedBy: r.by ?? 'Online', invoiceId: r.invoice_id, cancelled: !!r.cancelled_at, cancelReason: r.cancel_reason })),
      total: Number(total.rows[0]!.n), page, limit,
    };
  }

  // Reports

  /** The reports the school's modules can fill. */
  async reportList(t: TenantCtx): Promise<ReportInfo[]> {
    const { modules } = await this.settings.effective(t);
    return REPORTS.filter((r) => !r.needs || modules.includes(r.needs));
  }

  async report(t: TenantCtx, id: string, q: ReportQuery = {}): Promise<ReportData> {
    const info = (await this.reportList(t)).find((r) => r.id === id);
    if (!info) throw notFound('That report');
    const today = istToday();
    const last = latestSchoolDay(today, await this.settings.offDays(t));
    const cls = q.classId ? (await t.pool.query<{ name: string }>('select name from classes where id = $1', [q.classId])).rows[0]?.name ?? null : null;
    if (q.classId && !cls) throw notFound('That class');
    const dated = !!(q.from || q.to);
    const period = (dflt: [string, string]): [string, string] => [q.from ?? dflt[0], q.to ?? dflt[1]];
    const scope = (p?: [string, string]) => [cls ? `Class ${cls}` : 'Whole school', p ? `${dayMonth(p[0])} to ${dayMonth(p[1])}` : ''].filter(Boolean).join(', ');
    const base = { id, title: info.title };
    if (id === 'attendance-class') {
      const p = period([addDays(last, -42), last]);
      const { rows } = await t.pool.query<{ name: string; students: string; p: string; l: string; a: string; v: string }>(
        `select c.name, count(distinct s.id) students, count(*) filter (where m.status = 'present') p, count(*) filter (where m.status = 'late') l, count(*) filter (where m.status = 'absent') a, count(*) filter (where m.status = 'leave') v
         from classes c join students s on s.class_id = c.id and s.status = 'active' left join attendance_sessions x on x.class_id = c.id and x.date between $1 and $2 left join attendance_marks m on m.session_id = x.id and m.student_id = s.id
         where ($3::text is null or c.id = $3) group by c.id, c.name, c.grade, c.section order by c.grade, c.section`, [p[0], p[1], q.classId ?? null]);
      const tot = rows.reduce((a, r) => ({ p: a.p + Number(r.p), n: a.n + Number(r.p) + Number(r.l) + Number(r.a) + Number(r.v) }), { p: 0, n: 0 });
      return { ...base, scope: scope(p), summary: [{ label: 'Classes', value: String(rows.length) }, { label: 'Present or late', value: `${pct(tot.p + rows.reduce((a, r) => a + Number(r.l), 0), tot.n)}%` }],
        columns: [{ key: 'class', label: 'Class' }, { key: 'students', label: 'Students', align: 'right' }, { key: 'present', label: 'Present', align: 'right' }, { key: 'late', label: 'Late', align: 'right' }, { key: 'absent', label: 'Absent', align: 'right' }, { key: 'leave', label: 'Leave', align: 'right' }, { key: 'rate', label: 'Rate', align: 'right' }],
        rows: rows.map((r) => { const n = Number(r.p) + Number(r.l) + Number(r.a) + Number(r.v); return { class: r.name, students: Number(r.students), present: Number(r.p), late: Number(r.l), absent: Number(r.a), leave: Number(r.v), rate: `${pct(Number(r.p) + Number(r.l), n)}%` }; }) };
    }
    if (id === 'attendance-low') {
      const p = period([`${last.slice(0, 7)}-01`, last]);
      const goal = await this.settings.value<number>(t, 'attendance.goalPct', 95);
      const { rows } = await t.pool.query<{ id: string; name: string; class_name: string; days: string; present: string; absent: string }>(
        `select s.id, s.name, c.name class_name, count(*) days, count(*) filter (where m.status in ('present','late','half_day')) present, count(*) filter (where m.status = 'absent') absent
         from attendance_marks m join attendance_sessions x on x.id = m.session_id join students s on s.id = m.student_id and s.status = 'active' join classes c on c.id = s.class_id
         where x.date between $1 and $2 and m.status <> 'leave' and ($4::text is null or c.id = $4) group by s.id, s.name, c.name, c.grade, c.section
         having count(*) filter (where m.status in ('present','late','half_day'))::float / count(*) < $3 order by 4 asc, s.name limit 500`, [p[0], p[1], goal / 100, q.classId ?? null]);
      return { ...base, scope: scope(p), summary: [{ label: `Students below ${goal}%`, value: String(rows.length) }, { label: 'Period', value: `${dayMonth(p[0])} to ${dayMonth(p[1])}` }],
        columns: [{ key: 'student', label: 'Student' }, { key: 'class', label: 'Class' }, { key: 'days', label: 'School days', align: 'right' }, { key: 'absent', label: 'Absent', align: 'right' }, { key: 'rate', label: 'Present', align: 'right' }],
        rows: rows.map((r) => ({ _student: r.id, student: r.name, class: r.class_name, days: Number(r.days), absent: Number(r.absent), rate: `${pct(Number(r.present), Number(r.days))}%` })) };
    }
    if (id === 'fees-collection') {
      const { rows } = await t.pool.query<{ head: string; head_name: string; billed: string; collected: string }>(
        `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id)
         select i.head, coalesce(h.name, i.head) head_name, sum(i.amount - i.waived_amount) billed, coalesce(sum(paid.p), 0) collected from fee_invoices i left join paid on paid.invoice_id = i.id
           left join fee_heads h on h.key = i.head join students s on s.id = i.student_id
         where ($1::date is null or i.due_on >= $1) and ($2::date is null or i.due_on <= $2) and ($3::text is null or s.class_id = $3)
         group by i.head, h.name, h.sort order by h.sort nulls last, i.head`, [q.from ?? null, q.to ?? null, q.classId ?? null]);
      const billed = rows.reduce((a, r) => a + Number(r.billed), 0);
      const col = rows.reduce((a, r) => a + Number(r.collected), 0);
      return { ...base, scope: scope(dated ? period([q.from ?? q.to!, q.to ?? q.from!]) : undefined), summary: [{ label: 'Billed', value: money(billed) }, { label: 'Collected', value: money(col) }, { label: 'Still due', value: money(billed - col) }],
        columns: [{ key: 'head', label: 'Fee' }, { key: 'billed', label: 'Billed', align: 'right' }, { key: 'collected', label: 'Collected', align: 'right' }, { key: 'due', label: 'Still due', align: 'right' }, { key: 'rate', label: 'Collected', align: 'right' }],
        rows: rows.map((r) => ({ head: r.head_name, billed: money(Number(r.billed)), collected: money(Number(r.collected)), due: money(Number(r.billed) - Number(r.collected)), rate: `${pct(Number(r.collected), Number(r.billed))}%` })) };
    }
    if (id === 'fees-defaulters') {
      const { rows } = await t.pool.query<{ id: string; name: string; class_name: string; guardian: string | null; amount: string; oldest: string }>(
        `with paid as (select invoice_id, sum(amount - refunded) p from payments group by invoice_id)
         select s.id, s.name, c.name class_name, g.name guardian, sum(i.amount - i.waived_amount - coalesce(paid.p, 0)) amount, min(i.due_on)::text oldest
         from fee_invoices i join students s on s.id = i.student_id join classes c on c.id = s.class_id left join paid on paid.invoice_id = i.id
           left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id
         where i.due_on < $1 and i.amount - i.waived_amount - coalesce(paid.p, 0) > 0 and s.status = 'active' and ($2::text is null or c.id = $2) group by s.id, s.name, c.name, g.name order by 5 desc, s.name limit 1000`, [today, q.classId ?? null]);
      return { ...base, scope: scope(), summary: [{ label: 'Families', value: String(rows.length) }, { label: 'Overdue', value: money(rows.reduce((a, r) => a + Number(r.amount), 0)) }],
        columns: [{ key: 'student', label: 'Student' }, { key: 'class', label: 'Class' }, { key: 'guardian', label: 'Guardian' }, { key: 'since', label: 'Oldest due date' }, { key: 'amount', label: 'Overdue', align: 'right' }],
        rows: rows.map((r) => ({ _student: r.id, student: r.name, class: r.class_name, guardian: r.guardian ?? '', since: dayMonth(r.oldest), amount: money(Number(r.amount)) })) };
    }
    if (id === 'strength') {
      const { rows } = await t.pool.query<{ name: string; teacher: string | null; n: string }>(
        `select c.name, u.name teacher, count(s.id) n from classes c left join users u on u.id = c.class_teacher_id left join students s on s.class_id = c.id and s.status = 'active' group by c.id, c.name, u.name, c.grade, c.section order by c.grade, c.section`);
      return { ...base, scope: scope(), summary: [{ label: 'Classes', value: String(rows.length) }, { label: 'Students', value: inr(rows.reduce((a, r) => a + Number(r.n), 0)) }],
        columns: [{ key: 'class', label: 'Class' }, { key: 'teacher', label: 'Class teacher' }, { key: 'students', label: 'Students', align: 'right' }],
        rows: rows.map((r) => ({ class: r.name, teacher: r.teacher ?? 'Not assigned', students: Number(r.n) })) };
    }
    if (id === 'results') {
      const grading = await this.settings.grading(t);
      const { rows } = await t.pool.query<{ exam: string; class_name: string; avg: string; pass: string; n: string }>(
        `select e.name exam, c.name class_name, round(avg(r.pct)) avg, round(100.0 * count(*) filter (where r.pct >= ${Number(grading.pass)}) / count(*)) pass, count(*) n
         from exams e join classes c on c.id = e.class_id join students s on s.class_id = c.id join exam_results r on r.student_id = s.id and r.exam = e.name where e.status = 'published' and ($1::text is null or c.id = $1)
         group by e.id, e.name, c.name, c.grade, c.section order by c.grade, c.section`, [q.classId ?? null]);
      return { ...base, scope: scope(), summary: [{ label: 'Published exams', value: String(rows.length) }],
        columns: [{ key: 'exam', label: 'Exam' }, { key: 'class', label: 'Class' }, { key: 'students', label: 'Students', align: 'right' }, { key: 'average', label: 'Average', align: 'right' }, { key: 'grade', label: 'Grade', align: 'right' }, { key: 'pass', label: 'Passed', align: 'right' }],
        rows: rows.map((r) => ({ exam: r.exam, class: r.class_name, students: Number(r.n), average: `${r.avg}%`, grade: grading.grade(Number(r.avg)), pass: `${r.pass}%` })) };
    }
    const { rows } = await t.pool.query<{ name: string; set: string; handed: string; ontime: string; total: string }>(
      `select c.name, count(distinct h.id) set, count(*) filter (where s.handed_at is not null) handed, count(*) filter (where s.on_time) ontime, count(s.student_id) total
       from classes c join homework h on h.class_id = c.id and h.status = 'set' and ($1::date is null or h.assigned_on >= $1) and ($2::date is null or h.assigned_on <= $2)
         left join homework_submissions s on s.homework_id = h.id where ($3::text is null or c.id = $3) group by c.id, c.name, c.grade, c.section order by c.grade, c.section`, [q.from ?? null, q.to ?? null, q.classId ?? null]);
    return { ...base, scope: scope(dated ? period([q.from ?? q.to!, q.to ?? q.from!]) : undefined), summary: [{ label: 'On time', value: `${pct(rows.reduce((a, r) => a + Number(r.ontime), 0), rows.reduce((a, r) => a + Number(r.total), 0))}%` }],
      columns: [{ key: 'class', label: 'Class' }, { key: 'set', label: 'Homework set', align: 'right' }, { key: 'handed', label: 'Handed in', align: 'right' }, { key: 'ontime', label: 'On time', align: 'right' }],
      rows: rows.map((r) => ({ class: r.name, set: Number(r.set), handed: `${pct(Number(r.handed), Number(r.total))}%`, ontime: `${pct(Number(r.ontime), Number(r.total))}%` })) };
  }

  csv(r: ReportData): string {
    const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [r.columns.map((c) => cell(c.label)).join(','), ...r.rows.map((row) => r.columns.map((c) => cell(row[c.key] ?? '')).join(','))].join('\n');
  }

  // Messages

  private threadSql(where = '', extra = ''): string {
    return `select th.id, th.subject, th.status, th.last_at, g.name guardian, s.name student, c.name class_name, th.assigned_to assigned_id, u.name assigned,
        lm.body last_body, lm.from_kind last_from, (select count(*) from thread_messages m where m.thread_id = th.id and m.from_kind = 'guardian' and m.read_at is null) unread
      from threads th left join guardians g on g.id = th.guardian_id left join students s on s.id = th.student_id left join classes c on c.id = s.class_id left join users u on u.id = th.assigned_to
        left join lateral (select body, from_kind from thread_messages m where m.thread_id = th.id order by m.created_at desc limit 1) lm on true ${where} order by th.last_at desc ${extra}`;
  }

  private threadRow(r: { id: string; subject: string; status: 'open' | 'closed'; last_at: Date; guardian: string | null; student: string | null; class_name: string | null; assigned_id: string | null; assigned: string | null; last_body: string | null; last_from: 'staff' | 'guardian' | null; unread: string }): ThreadRow {
    return { id: r.id, subject: r.subject, guardianName: r.guardian ?? 'A family', studentName: r.student, className: r.class_name, status: r.status, lastAt: r.last_at.toISOString(), lastBody: r.last_body ?? '', lastFrom: r.last_from ?? 'staff', unread: Number(r.unread), assignedToId: r.assigned_id, assignedToName: r.assigned };
  }

  async threads(t: TenantCtx): Promise<ThreadRow[]> {
    const { rows } = await t.pool.query(this.threadSql('', 'limit 200'));
    return rows.map((r) => this.threadRow(r));
  }

  async thread(t: TenantCtx, id: string): Promise<ThreadDetail> {
    const head = (await t.pool.query(this.threadSql('where th.id = $1'), [id])).rows[0];
    if (!head) throw notFound('That conversation');
    await t.pool.query("update thread_messages set read_at = now() where thread_id = $1 and from_kind = 'guardian' and read_at is null", [id]);
    const msgs = await t.pool.query<{ id: string; from_kind: 'staff' | 'guardian'; sender_name: string; body: string; created_at: Date; deleted_at: Date | null; file_ids: string[] | null }>(
      'select id, from_kind, sender_name, body, created_at, deleted_at, file_ids from thread_messages where thread_id = $1 order by created_at, id', [id]);
    const ids = msgs.rows.flatMap((m) => m.file_ids ?? []);
    const files = ids.length ? (await t.pool.query<{ id: string; name: string; mime: string }>("select id, name, mime from files where id = any($1) and status = 'clean' and deleted_at is null", [ids])).rows : [];
    return {
      ...this.threadRow({ ...head, unread: '0' }),
      messages: msgs.rows.map((m) => ({ id: m.id, from: m.from_kind, sender: m.sender_name, body: m.body, at: m.created_at.toISOString(), deleted: !!m.deleted_at, files: files.filter((f) => (m.file_ids ?? []).includes(f.id)) })),
    };
  }

  async startThread(t: TenantCtx, user: User, body: ThreadCreate): Promise<ThreadDetail> {
    const g = (await t.pool.query<{ guardian_id: string }>('select sg.guardian_id from student_guardians sg where sg.student_id = $1 order by sg.is_primary desc limit 1', [body.studentId])).rows[0];
    if (!g) throw new ApiError('validation', 'That student has no guardian on record to write to.', { fields: { studentId: 'No guardian on record.' } });
    const id = newId('thr');
    await t.pool.query('insert into threads (id, guardian_id, student_id, subject, assigned_to) values ($1,$2,$3,$4,$5)', [id, g.guardian_id, body.studentId, body.subject, user.id]);
    await this.chat.post(t, { id: user.id, name: user.name, kind: 'staff' }, id, body.body);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'message.started', entity: 'thread', entityId: id, detail: { subject: body.subject } });
    return this.thread(t, id);
  }

  async reply(t: TenantCtx, user: User, id: string, body: ThreadReply): Promise<ThreadDetail> {
    const th = (await t.pool.query<{ assigned_to: string | null }>('select assigned_to from threads where id = $1', [id])).rows[0];
    if (!th) throw notFound('That conversation');
    await this.chat.post(t, { id: user.id, name: user.name, kind: 'staff' }, id, body.body, body.fileIds);
    return this.thread(t, id);
  }

  async patchThread(t: TenantCtx, user: User, id: string, body: ThreadPatch): Promise<ThreadDetail> {
    // Handing it on: only to a colleague who may write to families.
    if (body.assignTo && !(await t.pool.query("select 1 from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where u.id = $1 and u.status = 'active' and r.permissions ? 'messages.write'", [body.assignTo])).rowCount) {
      throw new ApiError('validation', 'Choose a colleague who may write to families.', { fields: { assignTo: 'Cannot reply to families.' } });
    }
    const to = body.assignTo ?? (body.assignToMe ? user.id : null);
    const r = await t.pool.query('update threads set status = coalesce($2, status), assigned_to = coalesce($3, assigned_to) where id = $1', [id, body.status ?? null, to]);
    if (!r.rowCount) throw notFound('That conversation');
    if (to && to !== user.id) await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'message.handed', entity: 'thread', entityId: id, detail: { to } });
    return this.thread(t, id);
  }

  // Events

  async events(t: TenantCtx): Promise<EventRow[]> {
    const { rows } = await t.pool.query<{ id: string; title: string; starts_at: Date; ends_at: Date | null; kind: EventRow['kind']; venue: string; note: string; audience: string; category: string; needs_rsvp: boolean; lat: number | null; lng: number | null; going: string; maybe: string; cant: string; adults: string; class_id: string | null; class_name: string | null }>(
      `select e.id, e.title, e.starts_at, e.ends_at, e.kind, e.venue, e.note, e.audience, e.category, e.needs_rsvp, e.lat, e.lng, e.class_id, (select name from classes c where c.id = e.class_id) class_name,
         count(r.*) filter (where r.status = 'going') going, count(r.*) filter (where r.status = 'maybe') maybe, count(r.*) filter (where r.status = 'cant') cant,
         coalesce(sum(r.adults) filter (where r.status = 'going'), 0) adults
       from events e left join event_rsvps r on r.event_id = e.id where e.kind not in ('routine','cover') group by e.id order by e.starts_at desc limit 200`);
    return rows.map((r) => ({
      id: r.id, title: r.title, startsAt: r.starts_at.toISOString(), endsAt: r.ends_at?.toISOString() ?? null, kind: r.kind, venue: r.venue, note: r.note, audience: r.audience,
      category: r.category, needsRsvp: r.needs_rsvp, lat: r.lat, lng: r.lng, going: Number(r.going), maybe: Number(r.maybe), cant: Number(r.cant), adults: Number(r.adults),
      classId: r.class_id, className: r.class_name,
    }));
  }

  /** Who answered an event's invitation, family by family. */
  async eventReplies(t: TenantCtx, id: string): Promise<EventReply[]> {
    const { rows } = await t.pool.query<{ student: string; class_name: string; guardian: string | null; status: EventReply['status']; adults: number }>(
      `select s.name student, c.name class_name, g.name guardian, r.status, r.adults from event_rsvps r join students s on s.id = r.student_id join classes c on c.id = s.class_id
       left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id where r.event_id = $1 order by r.status, c.grade, c.section, s.name`, [id]);
    return rows.map((r) => ({ studentName: r.student, className: r.class_name, guardianName: r.guardian ?? '', status: r.status, adults: r.adults }));
  }

  async saveEvent(t: TenantCtx, user: User, id: string | null, body: EventSave): Promise<EventRow> {
    if (body.endsAt && body.endsAt < body.startsAt) throw new ApiError('validation', 'The event cannot end before it starts.', { fields: { endsAt: 'Pick a time after the start.' } });
    if (body.audience === 'class' && !(body.classId && (await t.pool.query('select 1 from classes where id = $1', [body.classId])).rowCount)) throw new ApiError('validation', 'Choose the class.', { fields: { classId: 'Choose the class.' } });
    const classId = body.audience === 'class' ? body.classId : null;
    if (id) {
      const r = await t.pool.query("update events set title = $2, starts_at = $3, ends_at = $4, kind = $5, venue = $6, note = $7, audience = $8, category = $9, needs_rsvp = $10, lat = $11, lng = $12, class_id = $13 where id = $1 and kind not in ('routine','cover')",
        [id, body.title, body.startsAt, body.endsAt ?? null, body.kind, body.venue, body.note, body.audience, body.category, body.needsRsvp, body.lat, body.lng, classId]);
      if (!r.rowCount) throw notFound('That event');
    } else {
      id = newId('evt');
      await t.pool.query('insert into events (id, title, starts_at, ends_at, kind, venue, note, audience, created_by, category, needs_rsvp, lat, lng, class_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [id, body.title, body.startsAt, body.endsAt ?? null, body.kind, body.venue, body.note, body.audience, user.id, body.category, body.needsRsvp, body.lat, body.lng, classId]);
      if (body.audience !== 'staff') {
        const g = await t.pool.query<{ phone: string | null }>("select distinct g.phone from guardians g join student_guardians sg on sg.guardian_id = g.id join students s on s.id = sg.student_id where s.status = 'active' and g.phone is not null and ($1::text is null or s.class_id = $1) limit 5000", [classId]);
        const date = new Date(body.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
        await this.messenger.notify(t, 'event.created', g.rows.map((x) => ({ to: x.phone!, vars: { title: body.title, date } })));
      }
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'event.saved', entity: 'event', entityId: id, detail: { title: body.title } });
    return (await this.events(t)).find((e) => e.id === id)!;
  }

  async deleteEvent(t: TenantCtx, user: User, id: string): Promise<void> {
    const r = await t.pool.query("delete from events where id = $1 and kind not in ('routine','cover') returning title", [id]);
    if (!r.rowCount) throw notFound('That event');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'event.removed', entity: 'event', entityId: id, detail: { title: r.rows[0].title } });
  }

  // Data requests

  private dsr(r: { id: string; kind: DataRequestRow['kind']; subject_name: string; requested_by: string; status: DataRequestRow['status']; note: string; answer: string; user_id: string | null; created_at: Date; resolved_at: Date | null }): DataRequestRow {
    return { id: r.id, kind: r.kind, subjectName: r.subject_name, requestedBy: r.requested_by, status: r.status, note: r.note, answer: r.answer, fromApp: !!r.user_id, createdAt: r.created_at.toISOString(), resolvedAt: r.resolved_at?.toISOString() ?? null };
  }

  async dataRequests(t: TenantCtx): Promise<DataRequestRow[]> {
    const { rows } = await t.pool.query('select id, kind, subject_name, requested_by, status, note, answer, user_id, created_at, resolved_at from data_requests order by (status = \'open\') desc, created_at desc limit 100');
    return rows.map((r) => this.dsr(r));
  }

  async createDataRequest(t: TenantCtx, user: User, body: DataRequestCreate): Promise<DataRequestRow> {
    const id = newId('dsr');
    await t.pool.query('insert into data_requests (id, kind, subject_name, requested_by, note) values ($1,$2,$3,$4,$5)', [id, body.kind, body.subjectName, body.requestedBy, body.note]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'privacy.request', entity: 'data_request', entityId: id, detail: { kind: body.kind, subject: body.subjectName } });
    return (await this.dataRequests(t)).find((r) => r.id === id)!;
  }

  async decideDataRequest(t: TenantCtx, user: User, id: string, body: DataRequestDecision): Promise<DataRequestRow> {
    const r = await t.pool.query("update data_requests set status = $2, answer = $3, resolved_at = now(), resolved_by = $4 where id = $1 and status = 'open'", [id, body.status, body.note, user.id]);
    // A request made from the app: its maker hears the answer there.
    const who = (await t.pool.query<{ phone: string | null; kind: string }>('select u.phone, d.kind from data_requests d join users u on u.id = d.user_id where d.id = $1', [id])).rows[0];
    if (r.rowCount && who?.phone) await this.messenger.notify(t, 'privacy.answered', [{ to: who.phone, vars: { request: who.kind === 'access' ? 'copy of your data' : who.kind, status: body.status === 'done' ? 'done' : 'declined', note: body.note } }]);
    if (!r.rowCount) throw new ApiError('conflict', 'That request is not open any more.');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: `privacy.${body.status}`, entity: 'data_request', entityId: id });
    return (await this.dataRequests(t)).find((x) => x.id === id)!;
  }
}
