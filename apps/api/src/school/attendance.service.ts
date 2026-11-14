import { Injectable } from '@nestjs/common';
import {
  addDays, dayName, istToday, latestSchoolDay, schoolDaysEnding,
  type AttendanceDay, type AttendanceDayPut, type AttendanceStatus, type AttendanceWeekPoint, type PeriodMarksPut, type PeriodRoll,
} from '@tangent/contracts';
import { ApiError, forbidden, notFound } from '@tangent/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';


@Injectable()
export class AttendanceService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
  ) {}

  async day(t: TenantCtx, classId: string, date: string): Promise<AttendanceDay> {
    const cls = await t.pool.query('select 1 from classes where id = $1', [classId]);
    if (!cls.rowCount) throw notFound('That class');
    const { rows } = await t.pool.query<{ id: string; name: string; roll_no: string; status: AttendanceStatus | null; submitted: Date | null }>(
      `select s.id, s.name, s.roll_no, m.status, ses.submitted_at submitted from students s
       left join attendance_sessions ses on ses.class_id = s.class_id and ses.date = $2
       left join attendance_marks m on m.session_id = ses.id and m.student_id = s.id
       where s.class_id = $1 and s.status = 'active' order by s.roll_no, s.name`, [classId, date]);
    // Leave the office approved already answers for that day: the roll call starts with it marked.
    const leave = await t.pool.query<{ student_id: string; half: string | null }>(
      `select payload->>'studentId' student_id, payload->>'halfDay' half from approvals where kind = 'leave' and status = 'approved'
       and payload->>'studentId' = any($1) and (payload->>'from')::date <= $2 and (payload->>'to')::date >= $2`, [rows.map((r) => r.id), date]);
    const used = await this.settings.value<string[]>(t, 'attendance.statuses', ['present', 'absent', 'late', 'leave']);
    const away = (half: string | null): AttendanceStatus => (half && used.includes('half_day') ? 'half_day' : used.includes('leave') ? 'leave' : 'absent');
    const submitted = rows.some((r) => r.submitted);
    return {
      classId, date, submitted,
      marks: rows.map((r) => {
        const l = leave.rows.find((x) => x.student_id === r.id);
        return { studentId: r.id, name: r.name, rollNo: r.roll_no, status: r.status ?? (l && !submitted ? away(l.half) : null), onLeave: !!l };
      }),
    };
  }

  private async approves(t: TenantCtx, userId: string): Promise<boolean> {
    const r = await t.pool.query<{ ok: boolean }>("select exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 and r.permissions ? 'approvals.decide') ok", [userId]);
    return !!r.rows[0]?.ok;
  }

  /** A day can be marked when it has happened, is inside the correction window (or the person approves requests), and the school was open. */
  private async markable(t: TenantCtx, userId: string, date: string): Promise<void> {
    const today = istToday();
    if (date > today) throw new ApiError('validation', 'You cannot mark a day that has not happened yet.', { fields: { date: 'That day is in the future.' } });
    const lockDays = await this.settings.value<number>(t, 'attendance.lockAfterDays', 2);
    // After the window only someone who may approve changes it (console: Attendance → can be corrected for this many days).
    if (lockDays > 0 && date < addDays(today, -lockDays) && !(await this.approves(t, userId))) {
      throw new ApiError('locked', `Attendance older than ${lockDays} days is locked. Someone who approves requests at your school can change it.`);
    }
    // No roll call on a day the school is closed: a weekly off day or a holiday.
    const off = await this.settings.offDays(t);
    if (off.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) throw new ApiError('validation', 'The school is closed every week on that day, so there is no roll call.');
    const holiday = await t.pool.query<{ name: string }>(
      "select title as name from events where kind = 'holiday' and (starts_at at time zone 'Asia/Kolkata')::date <= $1 and (coalesce(ends_at, starts_at) at time zone 'Asia/Kolkata')::date >= $1 limit 1", [date]);
    if (holiday.rows[0]) throw new ApiError('validation', `The school is closed that day (${holiday.rows[0].name}), so there is no roll call.`);
  }

  async put(t: TenantCtx, user: { id: string; name: string }, body: AttendanceDayPut): Promise<AttendanceDay> {
    await this.markable(t, user.id, body.date);
    const used = await this.settings.value<string[]>(t, 'attendance.statuses', ['present', 'absent', 'late', 'leave']);
    const unused = body.marks.find((m) => !used.includes(m.status) && m.status !== 'present' && m.status !== 'absent');
    if (unused) throw new ApiError('validation', `The school does not use the mark “${unused.status.replace('_', ' ')}”.`);
    const roster = await t.pool.query<{ id: string; name: string }>("select id, name from students where class_id = $1 and status = 'active'", [body.classId]);
    if (!roster.rowCount) throw notFound('That class');
    const ids = new Set(roster.rows.map((r) => r.id));
    const bad = body.marks.find((m) => !ids.has(m.studentId));
    if (bad) throw new ApiError('validation', 'One of those students is not in this class.');
    const client = await t.pool.connect();
    const sid = `att_${body.classId}_${body.date}`;
    try {
      await client.query('begin');
      await client.query(
        `insert into attendance_sessions (id, class_id, date, marked_by, submitted_at) values ($1,$2,$3,$4,now())
         on conflict (class_id, date) do update set marked_by = excluded.marked_by, submitted_at = now()`, [sid, body.classId, body.date, user.id]);
      await client.query('delete from attendance_marks where session_id = $1', [sid]);
      const params: unknown[] = [];
      const tuples = body.marks.map((m) => `(${[sid, m.studentId, m.status].map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`);
      await client.query(`insert into attendance_marks (session_id, student_id, status) values ${tuples.join(',')}`, params);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'attendance.marked', entity: 'class', entityId: body.classId, detail: { date: body.date, marks: body.marks.length } });
    if (await this.settings.value<boolean>(t, 'attendance.notifyParents', true)) {
      const away = body.marks.filter((m) => m.status === 'absent' || m.status === 'late');
      if (away.length) {
        const g = await t.pool.query<{ phone: string | null; name: string; student_id: string }>(
          'select g.phone, s.name, s.id student_id from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id where s.id = any($1)', [away.map((a) => a.studentId)]);
        const status = new Map(away.map((a) => [a.studentId, a.status]));
        await this.messenger.notify(t, 'attendance.absent', g.rows.filter((r) => r.phone).map((r) => ({ to: r.phone!, vars: { student: r.name, status: status.get(r.student_id) === 'late' ? 'late' : 'absent' } })));
      }
    }
    return this.day(t, body.classId, body.date);
  }

  /** A class's periods on one day (from the timetable for that weekday), each with its teacher and the marks given so far. */
  async periods(t: TenantCtx, user: { id: string }, classId: string, date: string): Promise<PeriodRoll> {
    const day = await this.day(t, classId, date);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    const [slots, marks, boss] = await Promise.all([
      t.pool.query<{ period: number; label: string; starts_at: string; ends_at: string; subject: string; teacher_id: string; teacher_name: string }>(
        `select ts.period, p.label, p.starts_at, p.ends_at, s.name subject, coalesce(ts.cover_teacher_id, ts.teacher_id) teacher_id, u.name teacher_name
         from timetable_slots ts join periods p on p.idx = ts.period join subjects s on s.id = ts.subject_id join users u on u.id = coalesce(ts.cover_teacher_id, ts.teacher_id)
         where ts.class_id = $1 and ts.day = $2 order by p.starts_at`, [classId, dow]),
      t.pool.query<{ period: number; student_id: string; status: PeriodRoll['periods'][number]['marks'][string]; marked_by: string | null }>(
        'select pm.period, pm.student_id, pm.status, u.name marked_by from period_marks pm left join users u on u.id = pm.marked_by where pm.class_id = $1 and pm.date = $2', [classId, date]),
      this.approves(t, user.id),
    ]);
    return {
      classId, date,
      students: day.marks.map((m) => ({ studentId: m.studentId, name: m.name, rollNo: m.rollNo, day: m.status })),
      periods: slots.rows.map((p) => {
        const mine = marks.rows.filter((m) => m.period === p.period);
        return {
          period: p.period, label: p.label, startsAt: p.starts_at, endsAt: p.ends_at, subject: p.subject, teacherId: p.teacher_id, teacherName: p.teacher_name,
          mine: boss || p.teacher_id === user.id, markedBy: mine[0]?.marked_by ?? null, marks: Object.fromEntries(mine.map((m) => [m.student_id, m.status])),
        };
      }),
    };
  }

  /** Marks one period. A child missing from a period after being marked present for the day is the family's to know. */
  async putPeriod(t: TenantCtx, user: { id: string; name: string }, body: PeriodMarksPut): Promise<PeriodRoll> {
    await this.markable(t, user.id, body.date);
    const roll = await this.periods(t, user, body.classId, body.date);
    const p = roll.periods.find((x) => x.period === body.period);
    if (!p) throw new ApiError('validation', 'The class has no lesson in that period that day.');
    if (!p.mine) throw forbidden(`${p.teacherName} marks this period.`);
    const ids = new Set(roll.students.map((s) => s.studentId));
    if (body.marks.some((m) => !ids.has(m.studentId))) throw new ApiError('validation', 'One of those students is not in this class.');
    const params: unknown[] = [body.classId, body.date, body.period, user.id];
    const tuples = body.marks.map((m) => { params.push(m.studentId, m.status); return `($1,$2,$3,$${params.length - 1},$${params.length},$4,now())`; });
    await t.pool.query(
      `insert into period_marks (class_id, date, period, student_id, status, marked_by, marked_at) values ${tuples.join(',')}
       on conflict (class_id, date, period, student_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now()`, params);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'attendance.period', entity: 'class', entityId: body.classId, detail: { date: body.date, period: p.label, marks: body.marks.length } });
    const missing = body.marks.filter((m) => m.status === 'absent' && p.marks[m.studentId] !== 'absent'
      && ['present', 'late', 'half_day'].includes(roll.students.find((s) => s.studentId === m.studentId)?.day ?? ''));
    if (missing.length && body.date === istToday() && (await this.settings.value<boolean>(t, 'attendance.notifyParents', true))) {
      const g = await t.pool.query<{ phone: string | null; name: string }>(
        'select g.phone, s.name from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id where s.id = any($1)', [missing.map((m) => m.studentId)]);
      await this.messenger.notify(t, 'attendance.absent', g.rows.filter((r) => r.phone).map((r) => ({ to: r.phone!, vars: { student: r.name, status: `absent from ${p.subject} (${p.label})` } })));
    }
    return this.periods(t, user, body.classId, body.date);
  }

  /** Percentage present for each of the last six school days, with the same weekday a week earlier for comparison. */
  async week(t: TenantCtx, count = 6): Promise<AttendanceWeekPoint[]> {
    const OFF_DAYS = await this.settings.offDays(t);
    const today = istToday();
    const last = latestSchoolDay(today, OFF_DAYS);
    const days = schoolDaysEnding(last, count, OFF_DAYS);
    const before = days.map((d) => addDays(d, -7));
    const { rows } = await t.pool.query<{ d: string; present: string; total: string }>(
      `select to_char(s.date,'YYYY-MM-DD') d, count(*) filter (where m.status in ('present','late','half_day')) present, count(*) total
       from attendance_sessions s join attendance_marks m on m.session_id = s.id where s.date = any($1::date[]) group by s.date`, [[...days, ...before]]);
    const by = new Map(rows.map((r) => [r.d, { present: Number(r.present), total: Number(r.total) }]));
    const pct = (d: string) => { const x = by.get(d); return x && x.total ? Math.round((x.present / x.total) * 1000) / 10 : null; };
    return days.map((d, i) => {
      const x = by.get(d) ?? { present: 0, total: 0 };
      return { date: d, label: dayName(d, true), present: x.present, total: x.total, pct: pct(d) ?? 0, previousPct: pct(before[i]!), isToday: d === last };
    });
  }

  async unmarked(t: TenantCtx): Promise<{ id: string; name: string; teacherId: string | null }[]> {
    const OFF_DAYS = await this.settings.offDays(t);
    const last = latestSchoolDay(istToday(), OFF_DAYS);
    const { rows } = await t.pool.query<{ id: string; name: string; teacher: string | null }>(
      `select c.id, c.name, c.class_teacher_id teacher from classes c where not exists (select 1 from attendance_sessions a where a.class_id = c.id and a.date = $1)
       and exists (select 1 from students s where s.class_id = c.id) order by c.grade, c.section`, [last]);
    return rows.map((r) => ({ id: r.id, name: r.name, teacherId: r.teacher }));
  }

  /** Nudges the class teachers who have not marked yet. */
  async remind(t: TenantCtx, user: { id: string; name: string }): Promise<{ sent: number; classes: string[] }> {
    const list = await this.unmarked(t);
    const ids = list.map((c) => c.teacherId).filter((x): x is string => !!x);
    const { rows } = await t.pool.query<{ phone: string | null; name: string }>('select phone, name from users where id = any($1)', [ids]);
    await this.messenger.notify(t, 'attendance.reminder', rows.filter((r) => r.phone).map((r) => ({ to: r.phone!, vars: { teacher: r.name.split(' ')[0]! } })));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'attendance.reminded', entity: 'class', detail: { classes: list.map((c) => c.name).join(', ') } });
    return { sent: rows.length, classes: list.map((c) => c.name) };
  }

}
