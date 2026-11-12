import { Injectable } from '@nestjs/common';
import type { Clash, CoverRequest, PeriodDef, SlotCreate, SlotPatch, SlotRow, TeacherLoad, TeacherOption, TimetableView, WeekOf } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { AuditService, Messenger, SettingsService } from './support.js';

interface PeriodRow { idx: number; label: string; starts_at: string; ends_at: string; kind: PeriodDef['kind'] }
interface SlotQ {
  id: string; class_id: string; day: number; period: number; subject_id: string; subject_name: string; subject_color: string;
  teacher_id: string; teacher_name: string; room: string | null; cover_id: string | null; cover_name: string | null;
}

/** Subjects whose teachers can sensibly cover for each other. */
const RELATED: Record<string, string[]> = {
  sub_maths: ['sub_science', 'sub_computer'], sub_science: ['sub_maths', 'sub_computer'], sub_computer: ['sub_maths', 'sub_science'],
  sub_english: ['sub_hindi', 'sub_social'], sub_hindi: ['sub_english', 'sub_social'], sub_social: ['sub_english', 'sub_hindi'], sub_pe: [],
};

/** Teachers needing to be in two rooms in the same period. Cover (when set) replaces the class's own teacher. */
const CLASH_SQL = `
  select eff.teacher_id, u.name teacher_name, eff.day, eff.period, array_agg(eff.id order by c.grade, c.section) slot_ids, array_agg(c.name order by c.grade, c.section) class_names
  from (select id, class_id, day, period, coalesce(cover_teacher_id, teacher_id) teacher_id from timetable_slots) eff
  join classes c on c.id = eff.class_id join users u on u.id = eff.teacher_id
  group by eff.teacher_id, u.name, eff.day, eff.period having count(*) > 1 order by eff.day, eff.period`;

@Injectable()
export class TimetableService {
  constructor(
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
  ) {}

  /** Lessons in order: periods, with the break and lunch slotted where they fall in the day. */
  async periods(t: TenantCtx): Promise<PeriodDef[]> {
    const { rows } = await t.pool.query<PeriodRow>('select idx, label, starts_at, ends_at, kind from periods order by starts_at');
    return rows.map((r) => ({ idx: r.idx, label: r.label, starts: r.starts_at, ends: r.ends_at, kind: r.kind }));
  }

  private async clashes(t: TenantCtx, classId?: string): Promise<Clash[]> {
    const { rows } = await t.pool.query<{ teacher_id: string; teacher_name: string; day: number; period: number; slot_ids: string[]; class_names: string[] }>(CLASH_SQL);
    const out: Clash[] = [];
    for (const r of rows) {
      if (classId && !r.slot_ids.some((s) => s.startsWith(`slot_${classId}_`))) continue;
      out.push({ id: `${r.teacher_id}|${r.day}|${r.period}`, kind: 'teacher', teacherId: r.teacher_id, teacherName: r.teacher_name, day: r.day, period: r.period, slotIds: r.slot_ids, classNames: r.class_names, suggestion: await this.suggest(t, r.slot_ids, r.day, r.period) });
    }
    return out;
  }

  /** Someone who already teaches one of the classes and is free then: a related subject first, then the lightest week. */
  private async suggest(t: TenantCtx, slotIds: string[], day: number, period: number): Promise<Clash['suggestion']> {
    const subject = await t.pool.query<{ subject_id: string }>('select subject_id from timetable_slots where id = $1', [slotIds[0]]);
    const related = RELATED[subject.rows[0]?.subject_id ?? ''] ?? [];
    const { rows } = await t.pool.query<{ id: string; name: string; load: string; subject: string }>(
      `with cls as (select distinct class_id from timetable_slots where id = any($1)),
       busy as (select coalesce(cover_teacher_id, teacher_id) tid from timetable_slots where day = $2 and period = $3)
       select u.id, u.name, s.name subject, (select count(*) from timetable_slots x where coalesce(x.cover_teacher_id, x.teacher_id) = u.id) load
       from timetable_slots ts join cls on cls.class_id = ts.class_id join users u on u.id = ts.teacher_id join subjects s on s.id = ts.subject_id
       where u.id not in (select tid from busy) group by u.id, u.name, s.name, s.id order by array_position($4::text[], s.id) nulls last, load, u.name limit 1`, [slotIds, day, period, related]);
    const r = rows[0];
    return r ? { teacherId: r.id, teacherName: r.name, reason: `${r.name.split(' ')[0]} teaches ${r.subject} to this class and is free then.` } : null;
  }

  async view(t: TenantCtx, classId: string): Promise<TimetableView> {
    const cls = await t.pool.query<{ name: string }>('select name from classes where id = $1', [classId]);
    if (!cls.rows[0]) throw notFound('That class');
    const [periods, slots, clashes, meta, unplaced, draft] = await Promise.all([
      this.periods(t),
      t.pool.query<SlotQ>(
        `select ts.id, ts.class_id, ts.day, ts.period, ts.subject_id, s.name subject_name, s.color subject_color, ts.teacher_id, u.name teacher_name, ts.room,
           ts.cover_teacher_id cover_id, cu.name cover_name
         from timetable_slots ts join subjects s on s.id = ts.subject_id join users u on u.id = ts.teacher_id left join users cu on cu.id = ts.cover_teacher_id
         where ts.class_id = $1 order by ts.day, ts.period`, [classId]),
      this.clashes(t, classId),
      t.pool.query<{ key: string; value: unknown }>("select key, value from meta where key in ('timetable.version','timetable.publishedAt')"),
      t.pool.query<{ id: string; name: string; color: string; missing: number }>(
        `select s.id, s.name, s.color, s.per_week - count(ts.id)::int missing from subjects s left join timetable_slots ts on ts.subject_id = s.id and ts.class_id = $1
         group by s.id, s.name, s.color, s.per_week having s.per_week - count(ts.id) > 0 order by s.name`, [classId]),
      t.pool.query<{ n: string }>(
        `select count(*) n from timetable_slots where (teacher_id is distinct from published_teacher_id or subject_id is distinct from published_subject_id or cover_teacher_id is distinct from published_cover_id)`),
    ]);
    const m = new Map(meta.rows.map((r) => [r.key, r.value]));
    return {
      classId, className: cls.rows[0].name, periods,
      slots: slots.rows.map<SlotRow>((r) => ({
        id: r.id, classId: r.class_id, day: r.day, period: r.period, subjectId: r.subject_id, subjectName: r.subject_name, subjectColor: r.subject_color,
        teacherId: r.teacher_id, teacherName: r.teacher_name, room: r.room, substituteId: r.cover_id, substituteName: r.cover_name,
      })),
      clashes, unplaced: unplaced.rows.map((u) => ({ subjectId: u.id, name: u.name, color: u.color, missing: u.missing })),
      publishedAt: (m.get('timetable.publishedAt') as string | undefined) ?? null, draftChanges: Number(draft.rows[0]!.n), version: Number(m.get('timetable.version') ?? 1),
    };
  }

  async patchSlot(t: TenantCtx, user: { id: string; name: string }, id: string, patch: SlotPatch): Promise<void> {
    await this.editable(t);
    const sets: string[] = [];
    const params: unknown[] = [id];
    const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    if (patch.subjectId) add('subject_id', patch.subjectId);
    if (patch.teacherId) { add('teacher_id', patch.teacherId); sets.push('cover_teacher_id = null'); }
    if (patch.room !== undefined) add('room', patch.room);
    if (!sets.length) throw new ApiError('validation', 'Nothing to change.');
    const res = await t.pool.query(`update timetable_slots set ${sets.join(', ')} where id = $1`, params);
    if (!res.rowCount) throw notFound('That period');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'timetable.slot_changed', entity: 'slot', entityId: id, detail: patch as Record<string, unknown> });
  }

  private async editable(t: TenantCtx): Promise<void> {
    if ((await this.settings.value<boolean>(t, 'timetable.schoolEdits', true)) === false) throw forbidden('Gradeon keeps your timetable. Ask Gradeon to change it.');
  }

  /** Places a lesson in a free period. A teacher already teaching then is refused, so no clash is made here. */
  async createSlot(t: TenantCtx, user: { id: string; name: string }, b: SlotCreate): Promise<{ id: string }> {
    await this.editable(t);
    if ((await t.pool.query('select 1 from timetable_slots where class_id = $1 and day = $2 and period = $3', [b.classId, b.day, b.period])).rowCount) throw new ApiError('conflict', 'That period already has a lesson. Change it instead.');
    if (!(await t.pool.query("select 1 from periods where idx = $1 and kind = 'period'", [b.period])).rowCount) throw new ApiError('validation', 'That is not a teaching period.');
    if ((await t.pool.query('select 1 from timetable_slots where day = $1 and period = $2 and coalesce(cover_teacher_id, teacher_id) = $3', [b.day, b.period, b.teacherId])).rowCount) {
      throw new ApiError('conflict', 'That teacher already has a class in this period.', { fields: { teacherId: 'Busy then.' } });
    }
    const id = newId('slt');
    await t.pool.query('insert into timetable_slots (id, class_id, day, period, subject_id, teacher_id, room) values ($1,$2,$3,$4,$5,$6,$7)', [id, b.classId, b.day, b.period, b.subjectId, b.teacherId, b.room || null]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'timetable.slot_placed', entity: 'slot', entityId: id, detail: { class: b.classId, day: b.day, period: b.period } });
    return { id };
  }

  /** Frees a period: the class has no lesson then. */
  async removeSlot(t: TenantCtx, user: { id: string; name: string }, id: string): Promise<void> {
    await this.editable(t);
    const r = await t.pool.query('delete from timetable_slots where id = $1', [id]);
    if (!r.rowCount) throw notFound('That period');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'timetable.slot_freed', entity: 'slot', entityId: id });
  }

  /** A teacher's week (their own lessons and the ones they cover) or a room's, across every class. */
  async weekOf(t: TenantCtx, by: { teacherId?: string; room?: string }): Promise<WeekOf> {
    const where = by.teacherId ? 'coalesce(ts.cover_teacher_id, ts.teacher_id) = $1' : 'lower(ts.room) = lower($1)';
    const [periods, rows, who] = await Promise.all([
      this.periods(t),
      t.pool.query<SlotQ & { class_name: string }>(
        `select ts.id, ts.class_id, c.name class_name, ts.day, ts.period, ts.subject_id, s.name subject_name, s.color subject_color, ts.teacher_id, u.name teacher_name, ts.room,
           ts.cover_teacher_id cover_id, cu.name cover_name
         from timetable_slots ts join classes c on c.id = ts.class_id join subjects s on s.id = ts.subject_id join users u on u.id = ts.teacher_id left join users cu on cu.id = ts.cover_teacher_id
         where ${where} order by ts.day, ts.period`, [by.teacherId ?? by.room]),
      by.teacherId ? t.pool.query<{ name: string }>('select name from users where id = $1', [by.teacherId]) : null,
    ]);
    if (by.teacherId && !who?.rows[0]) throw notFound('That teacher');
    return {
      title: by.teacherId ? who!.rows[0]!.name : `Room ${by.room}`, periods,
      slots: rows.rows.map((r) => ({
        id: r.id, classId: r.class_id, className: r.class_name, day: r.day, period: r.period, subjectId: r.subject_id, subjectName: r.subject_name, subjectColor: r.subject_color,
        teacherId: r.teacher_id, teacherName: r.teacher_name, room: r.room, substituteId: r.cover_id, substituteName: r.cover_name,
      })),
    };
  }

  /** The rooms the timetable uses, for the room view. */
  async rooms(t: TenantCtx): Promise<string[]> {
    return (await t.pool.query<{ room: string }>("select distinct room from timetable_slots where coalesce(room, '') <> '' order by room")).rows.map((r) => r.room);
  }

  async cover(t: TenantCtx, user: { id: string; name: string }, body: CoverRequest): Promise<void> {
    const busy = await t.pool.query<{ n: string }>(
      `select count(*) n from timetable_slots x join timetable_slots me on me.id = $1 where x.day = me.day and x.period = me.period and x.id <> me.id and coalesce(x.cover_teacher_id, x.teacher_id) = $2`, [body.slotId, body.teacherId]);
    if (Number(busy.rows[0]!.n) > 0) throw new ApiError('conflict', 'That teacher already has a class in this period.');
    const res = await t.pool.query('update timetable_slots set cover_teacher_id = $2 where id = $1', [body.slotId, body.teacherId]);
    if (!res.rowCount) throw notFound('That period');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'timetable.cover_set', entity: 'slot', entityId: body.slotId, detail: { teacher: body.teacherId } });
  }

  /** Makes the draft the live timetable and tells the people it changes for. Refuses while any clash is open. */
  async publish(t: TenantCtx, user: { id: string; name: string }): Promise<{ families: number; teachers: number; version: number }> {
    if ((await this.clashes(t)).length) throw new ApiError('conflict', 'Fix the clash before publishing.');
    const changed = await t.pool.query<{ class_id: string; teacher_id: string }>(
      `select class_id, coalesce(cover_teacher_id, teacher_id) teacher_id from timetable_slots
       where teacher_id is distinct from published_teacher_id or subject_id is distinct from published_subject_id or cover_teacher_id is distinct from published_cover_id`);
    const classes = [...new Set(changed.rows.map((r) => r.class_id))];
    const teachers = [...new Set(changed.rows.map((r) => r.teacher_id))];
    const fam = classes.length ? await t.pool.query<{ n: string }>('select count(distinct sg.guardian_id) n from students s join student_guardians sg on sg.student_id = s.id where s.class_id = any($1)', [classes]) : null;
    await t.pool.query('update timetable_slots set published_teacher_id = teacher_id, published_subject_id = subject_id, published_cover_id = cover_teacher_id');
    await t.pool.query("update meta set value = to_jsonb((value)::int + 1) where key = 'timetable.version'");
    await t.pool.query("update meta set value = to_jsonb($1::text) where key = 'timetable.publishedAt'", [new Date().toISOString()]);
    const v = await t.pool.query<{ value: number }>("select value from meta where key = 'timetable.version'");
    if (teachers.length) {
      const phones = await t.pool.query<{ phone: string | null }>('select phone from users where id = any($1)', [teachers]);
      await this.messenger.notify(t, 'timetable.published', phones.rows.filter((p) => p.phone).map((p) => ({ to: p.phone!, vars: {} })));
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'timetable.published', entity: 'timetable', detail: { classes: classes.length, teachers: teachers.length } });
    return { families: Number(fam?.rows[0]?.n ?? 0), teachers: teachers.length, version: Number(v.rows[0]!.value) };
  }

  /** Everyone who could take a period, the free ones first. */
  async teachers(t: TenantCtx, slotId: string): Promise<TeacherOption[]> {
    const { rows } = await t.pool.query<{ id: string; name: string; subjects: string[]; load: string; max: number; free: boolean }>(
      `select u.id, u.name, array(select s.name from staff_subjects ss join subjects s on s.id = ss.subject_id where ss.user_id = u.id order by s.name) subjects,
         (select count(*) from timetable_slots x where coalesce(x.cover_teacher_id, x.teacher_id) = u.id) load, st.max_periods_per_week max,
         not exists (select 1 from timetable_slots x join timetable_slots me on me.id = $1 where x.day = me.day and x.period = me.period and x.id <> me.id and coalesce(x.cover_teacher_id, x.teacher_id) = u.id) free
       from users u join staff st on st.user_id = u.id where u.kind = 'staff' and u.status = 'active' and st.designation = 'Teacher' order by free desc, load, u.name`, [slotId]);
    return rows.map((r) => ({ id: r.id, name: r.name, subjects: r.subjects, load: Number(r.load), max: r.max, free: r.free }));
  }

  async loads(t: TenantCtx, classId: string): Promise<TeacherLoad[]> {
    const { rows } = await t.pool.query<{ id: string; name: string; load: string; max: number; subjects: string[] }>(
      `select u.id, u.name, (select count(*) from timetable_slots x where coalesce(x.cover_teacher_id, x.teacher_id) = u.id) load, st.max_periods_per_week max,
         array(select s.name from staff_subjects ss join subjects s on s.id = ss.subject_id where ss.user_id = u.id) subjects
       from users u join staff st on st.user_id = u.id
       where u.id in (select teacher_id from timetable_slots where class_id = $1 union select cover_teacher_id from timetable_slots where class_id = $1 and cover_teacher_id is not null)
       order by 3 desc, u.name`, [classId]);
    return rows.map((r) => ({ teacherId: r.id, name: r.name, periodsPerWeek: Number(r.load), max: r.max, subjects: r.subjects }));
  }

  async classes(t: TenantCtx): Promise<{ id: string; name: string; grade: number; section: string; studentCount: number; classTeacherId: string | null; classTeacherName: string | null }[]> {
    const { rows } = await t.pool.query<{ id: string; name: string; grade: number; section: string; n: string; tid: string | null; tname: string | null }>(
      `select c.id, c.name, c.grade, c.section, (select count(*) from students s where s.class_id = c.id) n, c.class_teacher_id tid, u.name tname
       from classes c left join users u on u.id = c.class_teacher_id order by c.grade, c.section`);
    return rows.map((r) => ({ id: r.id, name: r.name, grade: r.grade, section: r.section, studentCount: Number(r.n), classTeacherId: r.tid, classTeacherName: r.tname }));
  }
}
