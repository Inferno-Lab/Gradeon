import { Injectable, type OnModuleInit } from '@nestjs/common';
import { istToday, type LeaverInput, type NewYearInput, type PromotionInput, type PromotionPreview, type YearView } from '@tangent/contracts';
import { newId, type Job } from '@tangent/db';
import { ApiError, notFound } from '@tangent/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { HubService } from './hub.service.js';
import { AuditService, SettingsService } from './support.js';

type User = { id: string; name: string };
type Move = { studentId: string; fromClassId: string; toClassId: string | null; status: string };

/**
 * Year-end. Classes are lasting sections (Grade 5 A is Grade 5 A every year): promotion moves students up to the next grade's
 * section as one batch that can be undone, the top grade leaves, detained students stay. A new year is drafted, then started:
 * classes, terms and fee due dates move to it and the old year is archived. Dues are never cleared, so they carry forward.
 */
@Injectable()
export class YearService implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly hubs: HubService,
  ) {}

  onModuleInit(): void {
    this.hubs.handle('retention.erase', (job) => this.eraseJob(job));
  }

  async view(t: TenantCtx): Promise<YearView> {
    const months = await this.settings.value<number>(t, 'privacy.retentionMonths', 36);
    const [years, runs, leavers] = await Promise.all([
      t.pool.query(`select y.*, y.starts_on::text s, y.ends_on::text e, (select count(*) from classes c where c.year_id = y.id)::int classes,
          (select count(*) from students s join classes c on c.id = s.class_id where c.year_id = y.id and s.status = 'active')::int students from academic_years y order by y.starts_on desc`),
      t.pool.query('select r.*, jsonb_array_length(r.moves) n, fy.label from_label, ty.label to_label from promotion_runs r left join academic_years fy on fy.id = r.from_year left join academic_years ty on ty.id = r.to_year order by r.created_at desc limit 20'),
      t.pool.query(`select id, name, admission_no, left_on::text left_on, coalesce(leaving_reason, '') reason, (left_on + make_interval(months => $1))::date::text erase_after
          from students where status = 'left' and erased_at is null and left_on is not null order by left_on desc limit 500`, [months]),
    ]);
    const today = istToday();
    return {
      years: years.rows.map((y) => ({ id: y.id, label: y.label, startsOn: y.s, endsOn: y.e, status: y.status, classes: y.classes, students: y.students })),
      runs: runs.rows.map((r) => ({ id: r.id, fromYear: r.from_label ?? r.from_year, toYear: r.to_label ?? r.to_year, students: r.n, createdAt: r.created_at.toISOString(), undoneAt: r.undone_at?.toISOString() ?? null })),
      leavers: leavers.rows.map((l) => ({ id: l.id, name: l.name, admissionNo: l.admission_no, leftOn: l.left_on, reason: l.reason, eraseAfter: l.erase_after, due: l.erase_after <= today })),
      retentionMonths: months,
    };
  }

  async createYear(t: TenantCtx, user: User, b: NewYearInput): Promise<void> {
    if (b.endsOn <= b.startsOn) throw new ApiError('validation', 'The year must end after it starts.', { fields: { endsOn: 'After the start.' } });
    if ((await t.pool.query("select 1 from academic_years where status = 'draft'")).rowCount) throw new ApiError('conflict', 'A new year is already drafted. Start it or change it first.');
    const cur = (await t.pool.query<{ ends_on: string }>("select ends_on::text from academic_years where status = 'current' limit 1")).rows[0];
    if (cur && b.startsOn <= cur.ends_on) throw new ApiError('validation', 'The new year must start after the current one ends.', { fields: { startsOn: `After ${cur.ends_on}.` } });
    const id = newId('yr');
    await t.pool.query("insert into academic_years (id, label, starts_on, ends_on, current, status) values ($1,$2,$3,$4,false,'draft')", [id, b.label, b.startsOn, b.endsOn]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'year.drafted', entity: 'year', entityId: id, detail: { label: b.label } });
  }

  /** Starts the drafted year: its classes, terms (copied a year on) and fee due dates (a year on) move to it; the old year is archived. */
  async startYear(t: TenantCtx, user: User, id: string): Promise<void> {
    const y = (await t.pool.query<{ status: string; starts_on: Date }>('select status, starts_on from academic_years where id = $1', [id])).rows[0];
    if (!y) throw notFound('That year');
    if (y.status !== 'draft') throw new ApiError('conflict', 'Only a drafted year can be started.');
    // Starting archives the year students are in: they are promoted into the new one first.
    if (!(await t.pool.query('select 1 from promotion_runs where to_year = $1 and undone_at is null', [id])).rowCount) {
      throw new ApiError('conflict', 'Promote students into this year first. Starting it archives the year they are in now.');
    }
    const old = (await t.pool.query<{ id: string; starts_on: Date }>("select id, starts_on from academic_years where status = 'current' limit 1")).rows[0];
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      if (old) {
        await client.query("update academic_years set status = 'archived', current = false where id = $1", [old.id]);
        await client.query('update classes set year_id = $2 where year_id = $1', [old.id, id]);
        const shift = Math.round((y.starts_on.getTime() - old.starts_on.getTime()) / 86_400_000);
        await client.query(`insert into terms (id, year_id, name, starts_on, ends_on) select 'trm_' || substr(md5(random()::text), 1, 12), $2, name, starts_on + $3::int, ends_on + $3::int from terms where year_id = $1`, [old.id, id, shift]);
        await client.query('update fee_structures set due_on = due_on + $1::int', [shift]);
      }
      await client.query("update academic_years set status = 'current', current = true where id = $1", [id]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'year.started', entity: 'year', entityId: id });
  }

  async deleteDraft(t: TenantCtx, user: User, id: string): Promise<void> {
    const r = await t.pool.query("delete from academic_years where id = $1 and status = 'draft'", [id]);
    if (!r.rowCount) throw new ApiError('conflict', 'Only a drafted year can be removed.');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'year.draft.deleted', entity: 'year', entityId: id });
  }

  /** Each class and where its students go by default: the next grade's section with the same letter, or out of the school. */
  async preview(t: TenantCtx): Promise<PromotionPreview> {
    const { rows } = await t.pool.query<{ id: string; name: string; grade: number; section: string; n: number }>(
      "select c.id, c.name, c.grade, c.section, (select count(*) from students s where s.class_id = c.id and s.status = 'active')::int n from classes c order by c.grade, c.section");
    const dues = (await t.pool.query<{ total: string; n: string }>(
      `select coalesce(sum(owed), 0) total, count(distinct student_id) n from (select i.student_id, i.amount - i.waived_amount - coalesce((select sum(amount - refunded) from payments where invoice_id = i.id), 0) owed
       from fee_invoices i join students s on s.id = i.student_id and s.status = 'active') x where owed > 0`)).rows[0]!;
    return {
      classes: rows.map((c) => {
        const to = rows.find((x) => x.grade === c.grade + 1 && x.section === c.section) ?? rows.find((x) => x.grade === c.grade + 1);
        return { fromClassId: c.id, fromName: c.name, toClassId: to?.id ?? null, toName: to?.name ?? null, students: c.n };
      }),
      dues: Number(dues.total), duesStudents: Number(dues.n),
    };
  }

  /** Moves every class at once (one statement, so Grade 4 can move into Grade 5 as Grade 5 moves on). */
  async promote(t: TenantCtx, user: User, b: PromotionInput): Promise<{ runId: string; moved: number; left: number }> {
    const to = (await t.pool.query<{ status: string; ends_on: Date }>('select status, ends_on from academic_years where id = $1', [b.toYear])).rows[0];
    if (!to) throw notFound('That year');
    if (to.status !== 'draft') throw new ApiError('conflict', 'Draft the next year first: students are promoted into it.');
    const from = (await t.pool.query<{ id: string; ends_on: string }>("select id, ends_on::text from academic_years where status = 'current' limit 1")).rows[0];
    const map = new Map(b.moves.map((m) => [m.fromClassId, m.toClassId]));
    const students = (await t.pool.query<{ id: string; class_id: string }>("select id, class_id from students where status = 'active' and class_id = any($1)", [[...map.keys()]])).rows;
    const moves: Move[] = students.map((s) => {
      const leaving = b.leaving.includes(s.id) || (!b.detained.includes(s.id) && map.get(s.class_id) === null);
      return { studentId: s.id, fromClassId: s.class_id, toClassId: b.detained.includes(s.id) || leaving ? s.class_id : map.get(s.class_id)!, status: leaving ? 'left' : 'active' };
    });
    const leftOn = from?.ends_on ?? istToday();
    const runId = newId('prm');
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `update students s set class_id = m."toClassId", status = m.status, left_on = case when m.status = 'left' then $2::date else s.left_on end,
           leaving_reason = case when m.status = 'left' then 'Completed the school' else s.leaving_reason end
         from jsonb_to_recordset($1::jsonb) as m("studentId" text, "toClassId" text, status text) where s.id = m."studentId"`, [JSON.stringify(moves), leftOn]);
      await client.query('insert into promotion_runs (id, from_year, to_year, moves, created_by) values ($1,$2,$3,$4,$5)', [runId, from?.id ?? '', b.toYear, JSON.stringify(moves), user.id]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    const left = moves.filter((m) => m.status === 'left').length;
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'year.promoted', entity: 'year', entityId: b.toYear, detail: { moved: moves.length - left, left, detained: b.detained.length } });
    return { runId, moved: moves.length - left, left };
  }

  /** Puts every student back where the run found them. Only the latest run, and only once. */
  async undo(t: TenantCtx, user: User, runId: string): Promise<void> {
    const latest = (await t.pool.query<{ id: string; moves: Move[]; undone_at: Date | null }>('select id, moves, undone_at from promotion_runs order by created_at desc limit 1')).rows[0];
    if (!latest || latest.id !== runId) throw new ApiError('conflict', 'Only the latest promotion can be undone.');
    if (latest.undone_at) throw new ApiError('conflict', 'This promotion was already undone.');
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `update students s set class_id = m."fromClassId", status = 'active', left_on = case when m.status = 'left' then null else s.left_on end,
           leaving_reason = case when m.status = 'left' then null else s.leaving_reason end
         from jsonb_to_recordset($1::jsonb) as m("studentId" text, "fromClassId" text, status text) where s.id = m."studentId"`, [JSON.stringify(latest.moves)]);
      await client.query('update promotion_runs set undone_at = now() where id = $1', [runId]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'year.promotion.undone', entity: 'year', entityId: runId });
  }

  async leaver(t: TenantCtx, user: User, b: LeaverInput): Promise<void> {
    const r = await t.pool.query("update students set status = 'left', left_on = $2, leaving_reason = $3 where id = $1 and status = 'active'", [b.studentId, b.leftOn, b.reason]);
    if (!r.rowCount) throw notFound('That student');
    await t.pool.query('delete from transport_assignments where student_id = $1', [b.studentId]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'student.left', entity: 'student', entityId: b.studentId, detail: { leftOn: b.leftOn, reason: b.reason } });
  }

  async rejoin(t: TenantCtx, user: User, studentId: string): Promise<void> {
    const r = await t.pool.query("update students set status = 'active', left_on = null, leaving_reason = null where id = $1 and status = 'left' and erased_at is null", [studentId]);
    if (!r.rowCount) throw notFound('That student');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'student.rejoined', entity: 'student', entityId: studentId });
  }

  /**
   * Erases leavers past the retention period (queued by the console after two people approved). Money records stay, as the law
   * asks, under "Erased student"; everything that names or pictures the child goes.
   */
  private async eraseJob(job: Job): Promise<string> {
    const s = await this.hubs.schoolPool(job.schoolId ?? '');
    if (!s) return 'School not found.';
    const months = Number((await s.pool.query<{ value: number }>("select value from settings where key = 'privacy.retentionMonths'")).rows[0]?.value ?? 36);
    const ids = (await s.pool.query<{ id: string }>("select id from students where status = 'left' and erased_at is null and left_on + make_interval(months => $1) <= current_date", [months])).rows.map((r) => r.id);
    if (!ids.length) return 'Nobody is past the retention period.';
    const files = (await s.pool.query<{ storage_key: string }>("select storage_key from files where deleted_at is null and ((kind in ('student_photo','student_document') and owner_id = any($1)) or (kind = 'homework_submission' and split_part(owner_id, ':', 2) = any($1)))", [ids])).rows;
    const store = await this.hubs.hub.resolve('storage', s.id, s.slug).catch(() => null);
    for (const f of files) await store?.adapter.storage?.remove(store.ctx, f.storage_key).catch(() => undefined);
    await s.pool.query("update files set deleted_at = now() where deleted_at is null and ((kind in ('student_photo','student_document') and owner_id = any($1)) or (kind = 'homework_submission' and split_part(owner_id, ':', 2) = any($1)))", [ids]);
    await s.pool.query('delete from gallery_tags where student_id = any($1)', [ids]);
    await s.pool.query('delete from transport_assignments where student_id = any($1)', [ids]);
    // Guardians who have no other child at the school go too.
    await s.pool.query('delete from student_guardians where student_id = any($1)', [ids]);
    await s.pool.query('delete from guardians g where not exists (select 1 from student_guardians sg where sg.guardian_id = g.id)');
    await s.pool.query(
      "update students set name = 'Erased student', dob = '2000-01-01', blood_group = null, house = null, avatar_url = null, address = null, user_id = null, erased_at = now() where id = any($1)", [ids]);
    await s.pool.query("insert into audit_log (id, actor_name, action, entity, detail) values ($1, 'Tangent', 'retention.erased', 'student', $2)", [newId('aud'), JSON.stringify({ count: ids.length, months })]);
    return `Erased ${ids.length} leavers past ${months} months.`;
  }
}
