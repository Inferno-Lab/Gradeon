import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@gradeon/db';
import { addDays, istToday, type AttendanceStatus } from '@gradeon/contracts';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import type { Registry } from '@gradeon/tenancy';
import { REGISTRY, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { AttendanceService } from './attendance.service.js';
import { ApprovalsService } from './approvals.service.js';
import { FeesService } from './fees.service.js';
import { LearningService, gradeOf } from './learning.service.js';
import { OfficeService } from './office.service.js';
import { AuditService, SettingsService } from './support.js';

const DAYS = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const key = (subjectId: string) => subjectId.replace(/^sub_/, '');

interface Who {
  id: string;
  name: string;
  kind: 'staff' | 'guardian';
  phone: string | null;
  email: string | null;
  /** The students this person looks after. */
  children: string[];
  guardianIds: string[];
  perms: string[];
}

/** The family API: what the mobile app reads and writes, in the shapes the app already parses. Scoped by who is signed in. */
@Injectable()
export class FamilyService {
  constructor(
    @Inject(REGISTRY) private readonly registry: Registry,
    private readonly attendance: AttendanceService,
    private readonly approvals: ApprovalsService,
    private readonly fees: FeesService,
    private readonly learning: LearningService,
    private readonly office: OfficeService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async who(t: TenantCtx, user: AuthedUser): Promise<Who> {
    const u = (await t.pool.query<{ id: string; kind: Who['kind'] | 'student'; name: string; phone: string | null; email: string | null }>('select id, kind, name, phone, email from users where id = $1', [user.id])).rows[0];
    if (!u) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.');
    if (u.kind === 'student') throw forbidden('Students sign in through a parent account.');
    let children: string[] = [];
    let guardianIds: string[] = [];
    // A teacher can be a parent at the same school: their children come with their account either way.
    guardianIds = (await t.pool.query<{ id: string }>('select id from guardians where user_id = $1', [u.id])).rows.map((g) => g.id);
    if (guardianIds.length) {
      children = (await t.pool.query<{ student_id: string }>('select distinct student_id from student_guardians where guardian_id = any($1)', [guardianIds])).rows.map((r) => r.student_id);
    }
    return { id: u.id, kind: u.kind, name: u.name, phone: u.phone, email: u.email, children, guardianIds, perms: user.permissions };
  }

  private async mayStudent(w: Who, studentId: string): Promise<void> {
    if (w.kind === 'staff' || w.children.includes(studentId)) return;
    throw forbidden('That student is not yours to look at.');
  }

  private async mayClass(t: TenantCtx, w: Who, classId: string): Promise<void> {
    if (w.kind === 'staff') return;
    const r = await t.pool.query('select 1 from students where class_id = $1 and id = any($2) limit 1', [classId, w.children]);
    if (!r.rowCount) throw forbidden('That class is not yours to look at.');
  }

  // Identity and directory

  async me(t: TenantCtx, user: AuthedUser): Promise<Record<string, unknown>> {
    const w = await this.who(t, user);
    const c = (await t.pool.query<{ consented_at: Date | null; photo_consent: boolean | null }>('select consented_at, photo_consent from users where id = $1', [user.id])).rows[0];
    return {
      id: w.id, role: w.kind === 'guardian' ? 'parent' : 'teacher', name: w.name, email: w.email ?? '', phone: w.phone ?? '', avatarUrl: '', password: '',
      childIds: w.kind === 'guardian' ? w.children : [], ...(w.kind === 'staff' ? { teacherId: w.id } : {}),
      consentedAt: c?.consented_at?.toISOString() ?? null, photoConsent: c?.photo_consent ?? null,
    };
  }

  /** A family agrees to the school's privacy notice (once), and says whether the school may share photos of the child. */
  async consent(t: TenantCtx, user: AuthedUser, photos: boolean | undefined): Promise<{ consentedAt: string; photoConsent: boolean | null }> {
    const { rows } = await t.pool.query<{ consented_at: Date; photo_consent: boolean | null }>(
      'update users set consented_at = coalesce(consented_at, now()), photo_consent = coalesce($2, photo_consent) where id = $1 returning consented_at, photo_consent', [user.id, photos ?? null]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'privacy.consented', entity: 'user', entityId: user.id, detail: { photos: photos ?? null } });
    return { consentedAt: rows[0]!.consented_at.toISOString(), photoConsent: rows[0]!.photo_consent };
  }

  async school(t: TenantCtx): Promise<Record<string, unknown>> {
    const v = (await this.settings.doc(t)).values;
    const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
    const principal = (await t.pool.query<{ name: string }>("select u.name from staff st join users u on u.id = st.user_id where st.designation = 'Principal' limit 1")).rows[0]?.name ?? '';
    return {
      // The school's own facts only: the year it was founded and its office hours are not recorded, so they are left empty.
      name: s('school.name') || t.info.name, tagline: s('school.tagline'), address: s('school.address'), phone: s('school.phone'), email: s('school.email'), website: '', principal, founded: 0,
      officeHours: '', about: s('school.tagline'),
    };
  }

  async userName(t: TenantCtx, id: string): Promise<{ id: string; name: string }> {
    const r = (await t.pool.query<{ id: string; name: string }>('select id, name from users where id = $1', [id])).rows[0];
    if (!r) throw notFound('That person');
    return r;
  }

  private studentJson(r: { id: string; user_id: string | null; name: string; class_id: string; roll_no: string; dob: string; blood_group: string | null; house: string | null; address: string | null; g_name: string | null; g_phone: string | null }) {
    return { id: r.id, userId: r.user_id, name: r.name, classId: r.class_id, rollNo: r.roll_no, dob: r.dob, bloodGroup: r.blood_group ?? '', house: r.house ?? '', avatarUrl: '', guardianName: r.g_name ?? '', guardianPhone: r.g_phone ?? '', address: r.address ?? '' };
  }

  private readonly studentSql = `select s.id, s.user_id, s.name, s.class_id, s.roll_no, s.dob::text, s.blood_group, s.house, s.address, g.name g_name, g.phone g_phone
    from students s left join student_guardians sg on sg.student_id = s.id and sg.is_primary left join guardians g on g.id = sg.guardian_id`;

  async student(t: TenantCtx, user: AuthedUser, id: string) {
    const w = await this.who(t, user);
    await this.mayStudent(w, id);
    const r = (await t.pool.query(`${this.studentSql} where s.id = $1`, [id])).rows[0];
    if (!r) throw notFound('That student');
    return this.studentJson(r);
  }

  async studentsIn(t: TenantCtx, user: AuthedUser, classId: string) {
    const w = await this.who(t, user);
    await this.mayClass(t, w, classId);
    const { rows } = await t.pool.query(`${this.studentSql} where s.class_id = $1 and s.status = 'active' order by s.roll_no, s.name`, [classId]);
    return rows.map((r) => this.studentJson(r));
  }

  private async classJson(t: TenantCtx, id: string) {
    const c = (await t.pool.query<{ id: string; grade: number; section: string; class_teacher_id: string | null; room: string | null }>(
      `select c.id, c.grade, c.section, c.class_teacher_id, (select room from timetable_slots ts where ts.class_id = c.id and room is not null limit 1) room from classes c where c.id = $1`, [id])).rows[0];
    if (!c) throw notFound('That class');
    const ids = (await t.pool.query<{ id: string }>("select id from students where class_id = $1 and status = 'active' order by roll_no", [id])).rows.map((r) => r.id);
    return { id: c.id, name: `Class ${c.grade}`, section: c.section, classTeacherId: c.class_teacher_id ?? '', room: c.room ?? '', studentIds: ids };
  }

  async schoolClass(t: TenantCtx, user: AuthedUser, id: string) {
    await this.mayClass(t, await this.who(t, user), id);
    return this.classJson(t, id);
  }

  private async teacherJson(t: TenantCtx, rows: { id: string; name: string; email: string | null; phone: string | null; subject: string | null }[]) {
    const ids = rows.map((r) => r.id);
    const cls = await t.pool.query<{ t: string; c: string }>(
      `select class_teacher_id t, id c from classes where class_teacher_id = any($1) union select distinct teacher_id, class_id from timetable_slots where teacher_id = any($1)`, [ids]);
    return rows.map((r) => ({ id: r.id, userId: r.id, name: r.name, subject: r.subject ?? '', email: r.email ?? '', phone: r.phone ?? '', avatarUrl: '', classIds: cls.rows.filter((c) => c.t === r.id).map((c) => c.c) }));
  }

  private readonly teacherSql = `select u.id, u.name, u.email, u.phone, (select min(ss.subject_id) from staff_subjects ss where ss.user_id = u.id) subject from users u join staff s on s.user_id = u.id where u.status = 'active'`;

  async teachers(t: TenantCtx) {
    const { rows } = await t.pool.query<{ id: string; name: string; email: string | null; phone: string | null; subject: string | null }>(`${this.teacherSql} order by u.name limit 300`);
    return this.teacherJson(t, rows.map((r) => ({ ...r, subject: r.subject ? key(r.subject) : null })));
  }

  async teacher(t: TenantCtx, id: string) {
    const { rows } = await t.pool.query<{ id: string; name: string; email: string | null; phone: string | null; subject: string | null }>(`${this.teacherSql} and u.id = $1`, [id]);
    if (!rows[0]) throw notFound('That teacher');
    return (await this.teacherJson(t, rows.map((r) => ({ ...r, subject: r.subject ? key(r.subject) : null }))))[0]!;
  }

  async classesForTeacher(t: TenantCtx, id: string) {
    const ids = (await t.pool.query<{ c: string }>('select id c from classes where class_teacher_id = $1 union select distinct class_id from timetable_slots where teacher_id = $1', [id])).rows.map((r) => r.c);
    return Promise.all(ids.map((c) => this.classJson(t, c)));
  }

  // Attendance

  async attendanceOf(t: TenantCtx, user: AuthedUser, studentId: string) {
    await this.mayStudent(await this.who(t, user), studentId);
    const { rows } = await t.pool.query<{ date: string; status: AttendanceStatus }>(
      `select x.date::text date, m.status from attendance_marks m join attendance_sessions x on x.id = m.session_id where m.student_id = $1 and x.date >= $2 order by x.date`, [studentId, addDays(istToday(), -120)]);
    return rows.map((r) => ({ studentId, date: r.date, status: r.status === 'leave' ? 'absent' : r.status }));
  }

  async today(t: TenantCtx, user: AuthedUser, students: string[]) {
    const w = await this.who(t, user);
    if (w.kind !== 'staff') students = students.filter((s) => w.children.includes(s));
    const { rows } = await t.pool.query<{ student_id: string; status: string }>(
      `select m.student_id, m.status from attendance_marks m join attendance_sessions x on x.id = m.session_id where x.date = $1 and m.student_id = any($2)`, [istToday(), students]);
    return Object.fromEntries(rows.map((r) => [r.student_id, r.status === 'leave' ? 'absent' : r.status]));
  }

  async markToday(t: TenantCtx, user: AuthedUser, byStudent: Record<string, string>) {
    if (!user.permissions.includes('attendance.mark')) throw forbidden('You are not allowed to mark attendance.');
    const ids = Object.keys(byStudent);
    const { rows } = await t.pool.query<{ id: string; class_id: string }>('select id, class_id from students where id = any($1)', [ids]);
    const today = istToday();
    for (const cls of new Set(rows.map((r) => r.class_id))) {
      const existing = await t.pool.query<{ student_id: string; status: AttendanceStatus }>(
        'select m.student_id, m.status from attendance_marks m join attendance_sessions x on x.id = m.session_id where x.class_id = $1 and x.date = $2', [cls, today]);
      const merged = new Map(existing.rows.map((e) => [e.student_id, e.status]));
      for (const r of rows.filter((x) => x.class_id === cls)) {
        const s = byStudent[r.id];
        if (s === 'present' || s === 'absent' || s === 'late') merged.set(r.id, s);
      }
      await this.attendance.put(t, user, { classId: cls, date: today, marks: [...merged].map(([studentId, status]) => ({ studentId, status })) });
    }
    return { ok: true };
  }

  // Timetable

  async timetable(t: TenantCtx, user: AuthedUser, classId: string) {
    await this.mayClass(t, await this.who(t, user), classId);
    const [slots, periods] = await Promise.all([
      t.pool.query<{ day: number; period: number; subject_id: string; teacher_id: string; room: string | null; starts_at: string; ends_at: string }>(
        `select ts.day, ts.period, ts.subject_id, coalesce(ts.cover_teacher_id, ts.teacher_id) teacher_id, ts.room, p.starts_at, p.ends_at from timetable_slots ts join periods p on p.idx = ts.period where ts.class_id = $1`, [classId]),
      t.pool.query<{ idx: number; kind: string; starts_at: string; ends_at: string }>("select idx, kind, starts_at, ends_at from periods where kind <> 'period'"),
    ]);
    const days = [...new Set(slots.rows.map((s) => s.day))].sort();
    return days.map((d) => ({
      classId, day: DAYS[d],
      periods: [
        ...slots.rows.filter((s) => s.day === d).map((s) => ({ id: `${classId}-${DAYS[d]}-${s.period}`, subject: key(s.subject_id), teacherId: s.teacher_id, start: s.starts_at, end: s.ends_at, room: s.room ?? '', kind: 'class' })),
        ...periods.rows.map((p) => ({ id: `${classId}-${DAYS[d]}-b${p.idx}`, subject: 'break', start: p.starts_at, end: p.ends_at, room: '', kind: p.kind === 'lunch' ? 'recess' : 'break' })),
      ].sort((a, b) => a.start.localeCompare(b.start)),
    }));
  }

  // Homework

  private async homeworkRows(t: TenantCtx, where: string, params: unknown[]) {
    const hw = await t.pool.query<{ id: string; class_id: string; subject_id: string; title: string; description: string; assigned_on: string; due_on: string; max_marks: number; created_by: string | null }>(
      `select id, class_id, subject_id, title, description, assigned_on::text, due_on::text, max_marks, created_by from homework ${where} order by assigned_on desc, id limit 80`, params);
    if (!hw.rowCount) return [];
    const subs = await t.pool.query<{ homework_id: string; student_id: string; handed_at: Date | null; score: number | null; feedback: string }>(
      'select homework_id, student_id, handed_at, score, feedback from homework_submissions where homework_id = any($1)', [hw.rows.map((h) => h.id)]);
    return hw.rows.map((h) => ({
      id: h.id, classId: h.class_id, subject: key(h.subject_id), title: h.title, description: h.description, assignedOn: h.assigned_on, dueOn: h.due_on, teacherId: h.created_by ?? '', maxMarks: h.max_marks, attachments: [] as string[],
      submissions: subs.rows.filter((s) => s.homework_id === h.id).map((s) => ({
        studentId: s.student_id, status: s.score != null ? 'graded' : s.handed_at ? 'submitted' : 'pending', ...(s.handed_at ? { submittedAt: s.handed_at.toISOString() } : {}),
        ...(s.score != null ? { marks: s.score, grade: gradeOf(Math.round((s.score / h.max_marks) * 100)), feedback: s.feedback } : {}),
      })),
    }));
  }

  async homework(t: TenantCtx, user: AuthedUser, classId: string) {
    await this.mayClass(t, await this.who(t, user), classId);
    return this.homeworkRows(t, 'where class_id = $1', [classId]);
  }

  async homeworkOne(t: TenantCtx, user: AuthedUser, id: string) {
    const [h] = await this.homeworkRows(t, 'where id = $1', [id]);
    if (!h) throw notFound('That homework');
    await this.mayClass(t, await this.who(t, user), h.classId);
    return h;
  }

  async submitHomework(t: TenantCtx, user: AuthedUser, id: string, studentId: string) {
    const w = await this.who(t, user);
    await this.mayStudent(w, studentId);
    const h = (await t.pool.query<{ due_on: string }>('select due_on::text from homework where id = $1', [id])).rows[0];
    if (!h) throw notFound('That homework');
    await t.pool.query(
      `insert into homework_submissions (homework_id, student_id, handed_at, on_time) values ($1,$2,now(),$3)
       on conflict (homework_id, student_id) do update set handed_at = coalesce(homework_submissions.handed_at, now()), on_time = coalesce(homework_submissions.on_time and homework_submissions.handed_at is not null, excluded.on_time)`, [id, studentId, istToday() <= h.due_on]);
    return { ok: true };
  }

  async gradeHomework(t: TenantCtx, user: AuthedUser, id: string, b: { studentId: string; marks: number; feedback?: string }) {
    if (!user.permissions.includes('homework.write')) throw forbidden('You are not allowed to grade homework.');
    await this.learning.markHomework(t, user, id, { marks: [{ studentId: b.studentId, handed: true, score: b.marks, feedback: b.feedback ?? '' }] });
    return { ok: true };
  }

  async assignHomework(t: TenantCtx, user: AuthedUser, b: { classId: string; subject: string; title: string; description?: string; dueOn: string; maxMarks?: number }) {
    if (!user.permissions.includes('homework.write')) throw forbidden('You are not allowed to set homework.');
    const d = await this.learning.createHomework(t, user, { classId: b.classId, subjectId: `sub_${b.subject}`, title: b.title, description: b.description ?? '', dueOn: b.dueOn.slice(0, 10), maxMarks: b.maxMarks ?? 20 });
    return { id: d.id };
  }

  // Exams and results

  async exams(t: TenantCtx, user: AuthedUser, classId: string) {
    await this.mayClass(t, await this.who(t, user), classId);
    const list = (await this.learning.exams(t, classId)).filter((e) => e.status !== 'marking' || user.permissions.includes('exams.write'));
    return list.map((e) => ({ id: e.id, name: e.name, classId: e.classId, startDate: e.startsOn, endDate: e.endsOn, status: e.status === 'published' ? 'completed' : 'upcoming', subjects: e.subjects.map((s) => key(s.subjectId)) }));
  }

  private async resultOf(t: TenantCtx, examId: string, studentId: string) {
    const res = await this.learning.results(t, examId);
    if (res.exam.status !== 'published') throw notFound('That result');
    const row = res.rows.find((r) => r.studentId === studentId);
    if (!row) throw notFound('That result');
    const marks = await t.pool.query<{ subject_id: string; score: string | null; max_marks: number }>(
      'select m.subject_id, m.score, x.max_marks from exam_marks m join exam_subjects x on x.exam_id = m.exam_id and x.subject_id = m.subject_id where m.exam_id = $1 and m.student_id = $2', [examId, studentId]);
    const trend = await t.pool.query<{ exam: string; pct: number }>('select exam, pct from exam_results where student_id = $1 order by exam limit 6', [studentId]);
    return {
      id: `res_${studentId}_${examId}`, examId, studentId, overallPercent: row.pct, grade: row.grade, rank: row.rank, totalStudents: res.rows.length,
      subjects: marks.rows.map((m) => ({ subject: key(m.subject_id), marks: Math.round(Number(m.score ?? 0)), maxMarks: m.max_marks, grade: gradeOf(Math.round((Number(m.score ?? 0) / m.max_marks) * 100)) })),
      trend: trend.rows.map((x) => ({ label: x.exam, percent: x.pct })),
    };
  }

  async result(t: TenantCtx, user: AuthedUser, examId: string, studentId: string) {
    await this.mayStudent(await this.who(t, user), studentId);
    return this.resultOf(t, examId, studentId);
  }

  async resultsOf(t: TenantCtx, user: AuthedUser, studentId: string) {
    await this.mayStudent(await this.who(t, user), studentId);
    const ex = await t.pool.query<{ id: string }>("select e.id from exams e join students s on s.class_id = e.class_id where s.id = $1 and e.status = 'published' order by e.starts_on desc", [studentId]);
    const out = [];
    for (const e of ex.rows) { try { out.push(await this.resultOf(t, e.id, studentId)); } catch { /* the student has no marks in this exam */ } }
    return out;
  }

  private async openExam(t: TenantCtx, classId: string, subject: string) {
    return (await t.pool.query<{ id: string }>(
      `select e.id from exams e join exam_subjects x on x.exam_id = e.id where e.class_id = $1 and x.subject_id = $2 and e.status in ('upcoming','marking') order by e.starts_on limit 1`, [classId, `sub_${subject}`])).rows[0];
  }

  async marksDraft(t: TenantCtx, user: AuthedUser, classId: string, subject: string) {
    if (!user.permissions.includes('exams.read')) throw forbidden('You are not allowed to see marks.');
    const e = await this.openExam(t, classId, subject);
    if (!e) return {};
    const { rows } = await t.pool.query<{ student_id: string; score: string }>('select student_id, score from exam_marks where exam_id = $1 and subject_id = $2 and score is not null', [e.id, `sub_${subject}`]);
    return Object.fromEntries(rows.map((r) => [r.student_id, Math.round(Number(r.score))]));
  }

  async saveMarks(t: TenantCtx, user: AuthedUser, classId: string, b: { subject: string; values: Record<string, number> }) {
    if (!user.permissions.includes('exams.write')) throw forbidden('You are not allowed to enter marks.');
    const e = await this.openExam(t, classId, b.subject);
    if (!e) throw new ApiError('conflict', 'No exam is open for marks in this subject. Add one under Exams in the admin.');
    const marks = Object.entries(b.values).map(([studentId, score]) => ({ studentId, subjectId: `sub_${b.subject}`, score, absent: false }));
    if (marks.length) await this.learning.putMarks(t, user, e.id, { marks });
    return { ok: true };
  }

  // Fees

  async feesOf(t: TenantCtx, user: AuthedUser, studentId: string) {
    await this.mayStudent(await this.who(t, user), studentId);
    const inv = await t.pool.query<{ id: string; title: string; amount: number; waived_amount: number; due_on: string; paid: string; last: string | null; method: string | null; reference: string | null }>(
      `select i.id, i.title, i.amount, i.waived_amount, i.due_on::text, coalesce((select sum(amount) from payments p where p.invoice_id = i.id), 0) paid,
         (select paid_on::text from payments p where p.invoice_id = i.id order by paid_on desc limit 1) last, (select method from payments p where p.invoice_id = i.id order by paid_on desc limit 1) method,
         (select coalesce(reference, receipt_no) from payments p where p.invoice_id = i.id order by paid_on desc limit 1) reference
       from fee_invoices i where i.student_id = $1 order by i.due_on, i.id`, [studentId]);
    const pay = await t.pool.query<{ id: string; invoice_id: string; title: string; amount: number; paid_on: string; method: string; reference: string }>(
      `select p.id, p.invoice_id, i.title, p.amount, p.paid_on::text, p.method, coalesce(p.reference, p.receipt_no) reference from payments p join fee_invoices i on i.id = p.invoice_id where i.student_id = $1 order by p.paid_on desc, p.id`, [studentId]);
    const year = (await t.pool.query<{ label: string }>('select label from academic_years where current limit 1')).rows[0]?.label ?? '';
    return {
      studentId, academicYear: year,
      installments: inv.rows.map((i) => { const due = i.amount - i.waived_amount; const paid = Number(i.paid) >= due; return { id: i.id, title: i.title, amount: due, dueDate: i.due_on, paid, ...(paid && i.last ? { paidOn: i.last, method: i.method, reference: i.reference } : {}) }; }),
      receipts: pay.rows.map((p) => ({ id: p.id, installmentId: p.invoice_id, title: p.title, amount: p.amount, paidOn: p.paid_on, method: p.method, reference: p.reference })),
    };
  }

  async pay(t: TenantCtx, user: AuthedUser, invoiceId: string, b: { studentId: string; method: string }) {
    await this.mayStudent(await this.who(t, user), b.studentId);
    const inv = (await t.pool.query<{ amount: number; waived_amount: number; paid: string }>(
      'select i.amount, i.waived_amount, coalesce((select sum(amount) from payments p where p.invoice_id = i.id), 0) paid from fee_invoices i where i.id = $1 and i.student_id = $2', [invoiceId, b.studentId])).rows[0];
    if (!inv) throw notFound('That fee');
    const outstanding = inv.amount - inv.waived_amount - Number(inv.paid);
    const method = (['upi', 'card', 'netbanking'].includes(b.method) ? b.method : 'upi') as 'upi';
    const done = await this.fees.pay(t, user, { studentId: b.studentId, invoiceId, amount: outstanding, method, reference: `APP${Date.now().toString(36).toUpperCase()}` });
    const p = (await t.pool.query<{ id: string; title: string; amount: number; paid_on: string; method: string; reference: string }>(
      `select p.id, i.title, p.amount, p.paid_on::text, p.method, coalesce(p.reference, p.receipt_no) reference from payments p join fee_invoices i on i.id = p.invoice_id where p.receipt_no = $1`, [done.receiptNo])).rows[0]!;
    return { id: p.id, installmentId: invoiceId, title: p.title, amount: p.amount, paidOn: p.paid_on, method: p.method, reference: p.reference };
  }

  // Notices and events

  async notices(t: TenantCtx, user: AuthedUser) {
    const w = await this.who(t, user);
    const { rows } = await t.pool.query<{ id: string; title: string; body: string; audience: string; author: string | null; published_at: Date; class_id: string | null }>(
      `select n.id, n.title, n.body, n.audience, u.name author, n.published_at, n.class_id from notices n left join users u on u.id = n.author_id where n.status = 'published' order by n.published_at desc limit 60`);
    const myClasses = w.children.length ? new Set((await t.pool.query<{ class_id: string }>('select class_id from students where id = any($1)', [w.children])).rows.map((r) => r.class_id)) : new Set<string>();
    return rows
      .filter((n) => w.kind === 'staff' || (n.audience !== 'staff' && (n.audience !== 'class' || (n.class_id && myClasses.has(n.class_id)))))
      .map((n) => ({ id: n.id, title: n.title, body: n.body, category: 'general', audience: n.audience === 'staff' ? 'teachers' : n.audience === 'parents' ? 'parents' : 'all', pinned: false, date: n.published_at.toISOString().slice(0, 10), author: n.author ?? 'School office', attachments: [] as string[] }));
  }

  async postNotice(t: TenantCtx, user: AuthedUser, b: { title: string; body: string; audience?: string }) {
    if (!user.permissions.includes('notices.write')) throw forbidden('You are not allowed to post notices.');
    const audience = b.audience === 'parents' ? 'parents' : b.audience === 'teachers' ? 'staff' : 'everyone';
    const n = await this.approvals.createNotice(t, user, { title: b.title, body: b.body, audience, publish: true });
    return { id: n.id, status: n.status };
  }

  async events(t: TenantCtx, user: AuthedUser) {
    const w = await this.who(t, user);
    const { rows } = await t.pool.query<{ id: string; title: string; starts_at: Date; kind: string; venue: string; note: string; audience: string }>(
      "select id, title, starts_at, kind, venue, note, audience from events where kind not in ('routine','cover') order by starts_at limit 100");
    const mine = w.children.length ? await t.pool.query<{ event_id: string; status: string }>('select event_id, status from event_rsvps where student_id = any($1)', [w.children]) : { rows: [] as { event_id: string; status: string }[] };
    return rows.filter((e) => w.kind === 'staff' || e.audience !== 'staff').map((e) => {
      const ist = new Date(e.starts_at.getTime() + 330 * 60_000).toISOString();
      const r = mine.rows.find((m) => m.event_id === e.id);
      return { id: e.id, title: e.title, description: e.note, date: ist.slice(0, 10), time: ist.slice(11, 16), venue: e.venue, category: e.kind, imageUrl: '', rsvps: r ? [{ userId: w.id, status: r.status }] : [] };
    });
  }

  async rsvp(t: TenantCtx, user: AuthedUser, eventId: string, status: string) {
    const w = await this.who(t, user);
    if (!['going', 'maybe', 'cant'].includes(status)) throw new ApiError('validation', 'Choose going, maybe or cannot come.');
    if (!(await t.pool.query('select 1 from events where id = $1', [eventId])).rowCount) throw notFound('That event');
    for (const s of w.children) await t.pool.query('insert into event_rsvps (event_id, student_id, status) values ($1,$2,$3) on conflict (event_id, student_id) do update set status = excluded.status', [eventId, s, status]);
    return { ok: true };
  }

  // Chat

  private async threadScope(w: Who): Promise<{ where: string; params: unknown[] }> {
    return w.kind === 'staff'
      ? { where: '(th.assigned_to = $1 or ($2 and th.assigned_to is null))', params: [w.id, w.perms.includes('messages.read')] }
      : { where: 'th.guardian_id = any($1) and $2::boolean', params: [w.guardianIds.length ? w.guardianIds : ['none'], true] };
  }

  async threads(t: TenantCtx, user: AuthedUser) {
    const w = await this.who(t, user);
    const sc = await this.threadScope(w);
    const { rows } = await t.pool.query<{ id: string; subject: string; assigned_to: string | null; staff: string | null; g_user: string | null; guardian: string | null }>(
      `select th.id, th.subject, th.assigned_to, u.name staff, g.user_id g_user, g.name guardian from threads th left join users u on u.id = th.assigned_to left join guardians g on g.id = th.guardian_id where ${sc.where} order by th.last_at desc limit 100`, sc.params);
    return rows.map((r) => ({
      id: r.id, title: w.kind === 'staff' ? r.guardian ?? 'A family' : r.staff ?? 'School office', subtitle: r.subject,
      participantIds: [w.id, ...(w.kind === 'staff' ? [r.g_user ?? `guardian_${r.id}`] : [r.assigned_to ?? 'school_office'])], avatarUrl: '', online: false,
    }));
  }

  private msgJson(m: { id: string; thread_id: string; from_kind: string; sender_name: string; body: string; created_at: Date; read_at: Date | null; g_user: string | null; staff_id: string | null }) {
    return { id: m.id, threadId: m.thread_id, senderId: m.from_kind === 'guardian' ? m.g_user ?? `guardian_${m.thread_id}` : m.staff_id ?? 'school_office', text: m.body, sentAt: m.created_at.toISOString(), read: m.read_at != null };
  }

  private readonly msgSql = `select m.id, m.thread_id, m.from_kind, m.sender_name, m.body, m.created_at, m.read_at, g.user_id g_user, (select id from users where name = m.sender_name and kind = 'staff' limit 1) staff_id
    from thread_messages m join threads th on th.id = m.thread_id left join guardians g on g.id = th.guardian_id`;

  async messages(t: TenantCtx, user: AuthedUser, threadId: string) {
    const w = await this.who(t, user);
    const sc = await this.threadScope(w);
    const ok = await t.pool.query(`select 1 from threads th where th.id = $${sc.params.length + 1} and ${sc.where}`, [...sc.params, threadId]);
    if (!ok.rowCount) throw notFound('That conversation');
    const { rows } = await t.pool.query(`${this.msgSql} where m.thread_id = $1 order by m.created_at, m.id`, [threadId]);
    return rows.map((m) => this.msgJson(m));
  }

  async inbox(t: TenantCtx, user: AuthedUser) {
    const w = await this.who(t, user);
    const sc = await this.threadScope(w);
    const { rows } = await t.pool.query(`${this.msgSql} where ${sc.where} order by m.created_at, m.id limit 1000`, sc.params);
    return rows.map((m) => this.msgJson(m));
  }

  async send(t: TenantCtx, user: AuthedUser, threadId: string, text: string) {
    const w = await this.who(t, user);
    await this.messages(t, user, threadId);
    if (w.kind === 'staff') {
      if (!user.permissions.includes('messages.write')) throw forbidden('You are not allowed to write to families.');
      await this.office.reply(t, user, threadId, { body: text });
    } else {
      await t.pool.query(
        `insert into thread_messages (id, thread_id, from_kind, sender_name, body, created_at)
         values ($1,$2,'guardian',$3,$4, greatest(now(), coalesce((select max(created_at) + interval '1 millisecond' from thread_messages where thread_id = $2), now())))`,
        [newId('tmsg'), threadId, w.name, text],
      );
      await t.pool.query("update threads set last_at = now(), status = 'open' where id = $1", [threadId]);
    }
    return { ok: true };
  }

  async markRead(t: TenantCtx, user: AuthedUser, threadId: string) {
    const w = await this.who(t, user);
    await this.messages(t, user, threadId);
    await t.pool.query('update thread_messages set read_at = now() where thread_id = $1 and from_kind = $2 and read_at is null', [threadId, w.kind === 'staff' ? 'guardian' : 'staff']);
    return { ok: true };
  }

  async startThread(t: TenantCtx, user: AuthedUser, teacherId: string) {
    const w = await this.who(t, user);
    if (w.kind !== 'guardian') throw forbidden('Only a parent can start a conversation here.');
    const teacher = (await t.pool.query<{ name: string }>("select name from users where id = $1 and kind = 'staff'", [teacherId])).rows[0];
    if (!teacher) throw notFound('That teacher');
    const found = (await t.pool.query<{ id: string }>('select id from threads where guardian_id = any($1) and assigned_to = $2 limit 1', [w.guardianIds, teacherId])).rows[0];
    if (found) return { id: found.id };
    const id = newId('thr');
    await t.pool.query('insert into threads (id, guardian_id, student_id, subject, assigned_to) values ($1,$2,$3,$4,$5)', [id, w.guardianIds[0], w.children[0] ?? null, `Message for ${teacher.name}`, teacherId]);
    return { id };
  }

  // Library, transport, leave, gallery

  async books(t: TenantCtx, user: AuthedUser) {
    const w = await this.who(t, user);
    if (!w.children.length) return [];
    const { rows } = await t.pool.query<{ id: string; student_id: string; title: string; due_on: string }>('select id, student_id, title, due_on::text from library_loans where student_id = any($1) and returned_on is null order by due_on', [w.children]);
    return rows.map((b) => ({ id: b.id, title: b.title, author: '', category: 'Library', isbn: '', available: false, coverUrl: '', borrowedBy: b.student_id, dueDate: b.due_on }));
  }

  async renew(t: TenantCtx, user: AuthedUser, id: string) {
    const w = await this.who(t, user);
    const r = await t.pool.query('update library_loans set due_on = due_on + 7 where id = $1 and student_id = any($2) and returned_on is null', [id, w.children]);
    if (!r.rowCount) throw notFound('That book');
    return { ok: true };
  }

  async transport(t: TenantCtx, user: AuthedUser, studentId: string) {
    await this.mayStudent(await this.who(t, user), studentId);
    const r = (await t.pool.query<{ route: string }>('select route from transport_assignments where student_id = $1', [studentId])).rows[0];
    if (!r) return null;
    // shortcut: only the route is known to the platform; stops, the bus and live position arrive with the transport module.
    return { studentId, routeName: r.route, busNumber: '', etaMinutes: 0, progress: 0, driver: { name: '', phone: '', avatarUrl: '' }, stops: [] };
  }

  private leaveJson(r: { id: string; status: string; payload: Record<string, unknown>; created_at: Date; subject_ref: string | null }) {
    const p = r.payload;
    return { id: r.id, studentId: String(p.studentId ?? r.subject_ref ?? ''), from: String(p.from ?? ''), to: String(p.to ?? ''), reason: String(p.reason ?? ''), status: r.status, appliedOn: r.created_at.toISOString().slice(0, 10), ...(p.reviewer ? { reviewedBy: String(p.reviewer) } : {}), ...(p.reviewNote ? { reviewNote: String(p.reviewNote) } : {}) };
  }

  async leave(t: TenantCtx, user: AuthedUser, studentId: string) {
    await this.mayStudent(await this.who(t, user), studentId);
    const { rows } = await t.pool.query("select id, status, payload, created_at, subject_ref from approvals where kind = 'leave' and payload->>'studentLeave' = 'true' and payload->>'studentId' = $1 order by created_at desc", [studentId]);
    return rows.map((r) => this.leaveJson(r));
  }

  async applyLeave(t: TenantCtx, user: AuthedUser, b: { studentId: string; from: string; to: string; reason: string }) {
    await this.mayStudent(await this.who(t, user), b.studentId);
    const s = (await t.pool.query<{ name: string }>('select name from students where id = $1', [b.studentId])).rows[0];
    if (!s) throw notFound('That student');
    const from = b.from.slice(0, 10);
    const to = b.to.slice(0, 10);
    if (to < from) throw new ApiError('validation', 'The last day cannot be before the first day.');
    const id = newId('apr');
    await t.pool.query("insert into approvals (id, kind, title, subtitle, requester_name, subject_ref, payload) values ($1,'leave',$2,$3,$4,$5,$6)",
      [id, `Leave for ${s.name}`, `${from} to ${to} · ${b.reason.slice(0, 60)}`, s.name, b.studentId, JSON.stringify({ studentLeave: true, studentId: b.studentId, from, to, reason: b.reason })]);
    return { id };
  }

  async reviewLeave(t: TenantCtx, user: AuthedUser, id: string, b: { status: string; note?: string }) {
    const row = (await t.pool.query<{ payload: Record<string, unknown>; subject_ref: string | null; status: string }>("select payload, subject_ref, status from approvals where id = $1 and kind = 'leave' and payload->>'studentLeave' = 'true'", [id])).rows[0];
    if (!row) throw notFound('That request');
    const isClassTeacher = (await t.pool.query('select 1 from students s join classes c on c.id = s.class_id where s.id = $1 and c.class_teacher_id = $2', [row.subject_ref, user.id])).rowCount;
    if (!isClassTeacher && !user.permissions.includes('approvals.decide')) throw forbidden('Only the class teacher can decide this.');
    if (b.status !== 'approved' && b.status !== 'rejected') throw new ApiError('validation', 'Choose approved or rejected.');
    await t.pool.query('update approvals set status = $2, decided_by = $3, decided_at = now(), payload = $4 where id = $1', [id, b.status, user.id, JSON.stringify({ ...row.payload, reviewer: user.name, reviewNote: b.note ?? '' })]);
    await this.approvals.tellLeave(t, row, b.status);
    return { ok: true };
  }

  // Notifications: the messages the school sent to this person's phone, as the app lists them.

  async notifications(t: TenantCtx, user: AuthedUser) {
    const w = await this.who(t, user);
    if (!w.phone) return [];
    const { rows } = await this.registry.pool.query<{ id: string; body: string; created_at: Date; channel: string }>(
      `select distinct on (body, date_trunc('minute', created_at)) id, body, created_at, channel from sandbox_messages where school_slug = $1 and to_addr = $2 and channel in ('push','sms') order by body, date_trunc('minute', created_at), (channel = 'push') desc limit 60`, [t.info.slug, w.phone]);
    const state = await t.pool.query<{ message_id: string; state: string }>('select message_id, state from notification_state where user_id = $1', [w.id]);
    const by = new Map(state.rows.map((s) => [s.message_id, s.state]));
    const kind = (b: string) => (/fee|receipt|payment/i.test(b) ? ['fees', '/fees'] : /homework/i.test(b) ? ['homework', '/homework'] : /result|exam/i.test(b) ? ['exam', '/academics'] : /absent|late|attendance/i.test(b) ? ['attendance', '/attendance'] : /notice/i.test(b) ? ['notice', '/notices'] : /event|meeting/i.test(b) ? ['event', '/events'] : ['general', '/notifications']);
    return rows.filter((r) => by.get(r.id) !== 'dismissed').sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).map((r) => {
      const [type, route] = kind(r.body) as [string, string];
      return { id: r.id, userId: w.id, title: r.body.split(/[.:]/)[0]!.slice(0, 60), body: r.body, type, date: r.created_at.toISOString(), read: by.get(r.id) === 'read', route };
    });
  }

  async notificationState(t: TenantCtx, user: AuthedUser, ids: string[], state: 'read' | 'dismissed') {
    for (const id of ids) await t.pool.query('insert into notification_state (user_id, message_id, state) values ($1,$2,$3) on conflict (user_id, message_id) do update set state = excluded.state, at = now()', [user.id, id, state]);
    return { ok: true };
  }

  async readAll(t: TenantCtx, user: AuthedUser) {
    const list = await this.notifications(t, user);
    return this.notificationState(t, user, list.filter((n) => !n.read).map((n) => n.id), 'read');
  }
}
