import { Injectable } from '@nestjs/common';
import {
  addDays, dayName, istToday, latestSchoolDay, schoolDaysEnding,
  type AttendanceDay, type AttendanceDayPut, type AttendanceStatus, type AttendanceWeekPoint,
} from '@gradeon/contracts';
import { ApiError, notFound } from '@gradeon/nest-kit';
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
    return { classId, date, submitted: rows.some((r) => r.submitted), marks: rows.map((r) => ({ studentId: r.id, name: r.name, rollNo: r.roll_no, status: r.status })) };
  }

  async put(t: TenantCtx, user: { id: string; name: string }, body: AttendanceDayPut): Promise<AttendanceDay> {
    const today = istToday();
    if (body.date > today) throw new ApiError('validation', 'You cannot mark a day that has not happened yet.', { fields: { date: 'That day is in the future.' } });
    const lockDays = await this.settings.value<number>(t, 'attendance.lockAfterDays', 2);
    if (lockDays > 0 && body.date < addDays(today, -lockDays)) {
      const perms = await t.pool.query<{ ok: boolean }>("select exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 and r.key = 'principal') ok", [user.id]);
      if (!perms.rows[0]?.ok) throw new ApiError('locked', `Attendance older than ${lockDays} days is locked. Ask the principal to change it.`);
    }
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

  /** Percentage present for each of the last six school days, with the same weekday a week earlier for comparison. */
  async week(t: TenantCtx, count = 6): Promise<AttendanceWeekPoint[]> {
    const OFF_DAYS = await this.settings.offDays(t);
    const today = istToday();
    const last = latestSchoolDay(today, OFF_DAYS);
    const days = schoolDaysEnding(last, count, OFF_DAYS);
    const before = days.map((d) => addDays(d, -7));
    const { rows } = await t.pool.query<{ d: string; present: string; total: string }>(
      `select to_char(s.date,'YYYY-MM-DD') d, count(*) filter (where m.status in ('present','late')) present, count(*) total
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
