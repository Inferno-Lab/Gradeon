import { Body, Controller, Get, Header, HttpCode, Inject, Injectable, Param, Patch, Post, type OnModuleInit } from '@nestjs/common';
import { activeFeatures, activeModules } from '@gradeon/config-engine';
import { IMPORT_KINDS, ImportInput, ReadinessMark, SampleLoad, importKind, inr, type EntitlementDoc, type ImportBatchRow, type ImportPreview, type MigrationView, type UploadRow } from '@gradeon/contracts';
import { commitImport, exportAll, listBatches, pg, previewImport, sampleSchool, templateXlsx, undoBatch } from '@gradeon/db';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { z } from 'zod';
import type { Registry } from '@gradeon/tenancy';
import { Actions } from './actions.js';
import { Db, Me, Needs, type ConsoleUser } from './core.js';
import { ENV, demosAllowed, type Env } from './env.js';
import { withSchoolDb } from './school-db.js';
import { REGISTRY } from './tokens.js';

const n = async (pool: pg.Pool, sql: string) => Number((await pool.query<{ n: string }>(sql)).rows[0]!.n);

/** Gradeon's onboarding team moves a school in: files in, checked, imported as batches that add up, and undone if wrong. */
@Injectable()
export class Migration implements OnModuleInit {
  constructor(private readonly db: Db, private readonly actions: Actions, @Inject(ENV) private readonly env: Env, @Inject(REGISTRY) private readonly registry: Registry) {}

  onModuleInit(): void {
    // Go live is the end of moving in: the school's Moving in page closes and the day is kept. Only with every item green.
    this.actions.handle('school.golive', async (schoolId, _params, by) => {
      const r = (await this.db.pool.query<{ name: string; slug: string; status: string; went_live_at: Date | null }>('select name, slug, status, went_live_at from schools where id = $1 and deleted_at is null', [schoolId])).rows[0];
      if (!r) throw new Error('That school is gone.');
      if (r.went_live_at) return `${r.name} went live on ${r.went_live_at.toISOString().slice(0, 10)} already.`;
      if (r.status !== 'live') throw new Error(`${r.name} is ${r.status}: it must be running before it goes live.`);
      const open = (await this.view(schoolId)).readiness.filter((x) => !x.done);
      if (open.length) throw new Error(`Not ready: ${open.map((x) => x.label.toLowerCase()).join('; ')}.`);
      await this.db.pool.query('update schools set went_live_at = now() where id = $1', [schoolId]);
      this.registry.invalidate(r.slug);
      await this.db.audit(by, 'school.went_live', 'school', schoolId, {});
      return `${r.name} is live. Its Moving in page has closed; records are added from each page now.`;
    });
  }

  private async school(id: string): Promise<{ entitlement: EntitlementDoc; kinds: string[]; checklist: Record<string, unknown>; modules: Set<string> }> {
    const r = (await this.db.pool.query<{ entitlement: EntitlementDoc; checklist: Record<string, unknown> }>('select entitlement, checklist from schools where id = $1 and deleted_at is null', [id])).rows[0];
    if (!r) throw notFound('That school');
    const mods = activeModules(r.entitlement);
    const modules = new Set(['core', ...mods, ...activeFeatures(r.entitlement, mods)]);
    return { entitlement: r.entitlement, kinds: IMPORT_KINDS.filter((k) => modules.has(k.module)).map((k) => k.key), checklist: r.checklist ?? {}, modules };
  }

  /** Go-live items the data cannot show (kept with the school's console checklist), and the old system's dues total. */
  async mark(user: ConsoleUser, id: string, m: ReadinessMark): Promise<MigrationView> {
    await this.school(id);
    const value = m.key === 'old_dues' ? m.amount : m.done;
    await this.db.pool.query("update schools set checklist = checklist || jsonb_build_object($2::text, $3::jsonb) where id = $1", [id, `golive.${m.key}`, JSON.stringify(value)]);
    await this.db.audit(user.email, 'migration.readiness', 'school', id, { key: m.key, value });
    return this.view(id);
  }

  private with<T>(id: string, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    return withSchoolDb(this.db, this.env.SECRETS_KEY, id, fn);
  }

  private async kindFor(id: string, kind: string): Promise<{ entitlement: EntitlementDoc }> {
    const s = await this.school(id);
    if (!importKind(kind)) throw notFound('That kind of import');
    if (!s.kinds.includes(kind)) throw new ApiError('validation', `This school’s plan does not include ${importKind(kind)!.label.toLowerCase()}. Change it on the school’s Plan and modules tab first.`);
    return s;
  }

  async view(id: string): Promise<MigrationView> {
    const s = await this.school(id);
    return this.with(id, async (pool) => {
      const [batches, uploads, students, staff, staffInvited, classes, year, orphans, families, invited, signed, dues] = await Promise.all([
        listBatches(pool), this.uploads(pool),
        n(pool, 'select count(*) n from students'), n(pool, "select count(*) n from users where kind = 'staff' and status = 'active'"),
        n(pool, "select count(*) n from users where kind = 'staff' and status = 'active' and (invited_at is not null or password_hash is not null)"),
        n(pool, 'select count(*) n from classes'), n(pool, 'select count(*) n from academic_years where current'),
        n(pool, "select count(*) n from students s where s.status = 'active' and not exists (select 1 from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = s.id and sg.is_primary and g.phone is not null)"),
        n(pool, "select count(distinct sg.guardian_id) n from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary where s.status = 'active'"),
        n(pool, "select count(distinct g.id) n from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id join users u on u.id = g.user_id where s.status = 'active' and u.invited_at is not null"),
        n(pool, "select count(distinct g.id) n from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id join users u on u.id = g.user_id where s.status = 'active' and u.last_login_at is not null"),
        n(pool, 'select count(*) n from fee_invoices'),
      ]);
      const [slots, outstanding] = await Promise.all([
        n(pool, 'select count(*) n from timetable_slots'),
        n(pool, 'select coalesce(sum(i.amount - i.waived_amount - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)), 0) n from fee_invoices i'),
      ]);
      const oldDues = typeof s.checklist['golive.old_dues'] === 'number' ? (s.checklist['golive.old_dues'] as number) : null;
      const ticked = (k: string) => s.checklist[`golive.${k}`] === true;
      const fees = s.kinds.includes('fee_dues');
      const readiness = [
        { key: 'structure', label: 'The year and its classes are set up', done: year > 0 && classes > 0, detail: `${classes} classes${year ? '' : ', no current year'}` },
        { key: 'staff', label: 'Staff are in', done: staff > 1, detail: `${staff} staff` },
        { key: 'students', label: 'Every student has a family who can sign in', done: students > 0 && orphans === 0, detail: orphans ? `${orphans} students have no guardian phone` : `${students} students, ${families} families` },
        // Reconciled to the rupee: what is still owed here against the old system's own dues report.
        ...(fees ? [{ key: 'fees', label: 'Opening fee dues are in and match the old system', done: dues > 0 && oldDues !== null && outstanding === oldDues,
          detail: oldDues === null ? `₹${inr(outstanding)} owed here; type the old system’s total to compare` : outstanding === oldDues ? `₹${inr(outstanding)}, the same as the old system` : `₹${inr(outstanding)} here, ₹${inr(oldDues)} in the old system` }] : []),
        ...(s.modules.has('timetable') ? [{ key: 'timetable', label: 'The timetable is in', done: slots > 0, detail: `${slots} lessons a week` }] : []),
        { key: 'config_reviewed', label: 'Gradeon has reviewed the school’s configuration', done: ticked('config_reviewed'), detail: ticked('config_reviewed') ? 'Done' : 'Not yet', manual: true },
        { key: 'staff_trained', label: 'The school’s staff are trained', done: ticked('staff_trained'), detail: ticked('staff_trained') ? 'Done' : 'Not yet', manual: true },
        { key: 'staff_invited', label: 'Staff have their invites', done: staff > 0 && staffInvited === staff, detail: `${staffInvited} of ${staff}` },
        { key: 'families_invited', label: 'Families are invited', done: families > 0 && invited === families, detail: `${invited} of ${families}` },
        { key: 'families_in', label: 'Most families have signed in', done: families > 0 && signed / families >= 0.8, detail: `${signed} of ${families}` },
      ];
      return { kinds: IMPORT_KINDS.filter((k) => s.kinds.includes(k.key)), batches, uploads, readiness, dues: fees ? { outstanding, oldSystem: oldDues } : undefined, students, studentLimit: s.entitlement.limits.students };
    });
  }

  private async uploads(pool: pg.Pool): Promise<UploadRow[]> {
    const { rows } = await pool.query<{ id: string; file_name: string; note: string; rows: number; uploaded_by: string; at: Date; status: UploadRow['status']; batch_id: string | null; set_aside_reason: string }>(
      'select id, file_name, note, rows, uploaded_by, at, status, batch_id, set_aside_reason from import_uploads order by at desc limit 200');
    return rows.map((r) => ({ id: r.id, fileName: r.file_name, note: r.note, rows: r.rows, uploadedBy: r.uploaded_by, at: r.at.toISOString(), status: r.status, batchId: r.batch_id, setAsideReason: r.set_aside_reason ?? '' }));
  }

  async upload(id: string, uploadId: string): Promise<{ fileName: string; content: string }> {
    return this.with(id, async (pool) => {
      const r = (await pool.query<{ file_name: string; content: string }>('select file_name, content from import_uploads where id = $1', [uploadId])).rows[0];
      if (!r) throw notFound('That file');
      return { fileName: r.file_name, content: r.content };
    });
  }

  async setAside(id: string, uploadId: string, by: string, reason: string): Promise<UploadRow[]> {
    return this.with(id, async (pool) => {
      const r = (await pool.query<{ status: string }>('select status from import_uploads where id = $1', [uploadId])).rows[0];
      if (!r) throw notFound('That file');
      if (r.status === 'new' && reason.trim().length < 3) throw new ApiError('validation', 'Say why, so the school knows what to send instead.', { fields: { reason: 'Say why.' } });
      await pool.query("update import_uploads set status = case when status = 'set_aside' then 'new' else 'set_aside' end, set_aside_reason = case when status = 'set_aside' then '' else $2 end where id = $1 and status <> 'imported'", [uploadId, reason.trim()]);
      await this.db.audit(by, 'import.file_set_aside', 'school', id, { uploadId, reason });
      return this.uploads(pool);
    });
  }

  async preview(id: string, input: ImportInput): Promise<ImportPreview> {
    await this.kindFor(id, input.kind);
    return this.with(id, (pool) => previewImport(pool, input));
  }

  async commit(id: string, input: ImportInput, by: string): Promise<ImportBatchRow> {
    const s = await this.kindFor(id, input.kind);
    return this.with(id, async (pool) => {
      if (input.kind === 'students') {
        const p = await previewImport(pool, input);
        const total = (await n(pool, 'select count(*) n from students')) + p.counts.create;
        if (total > s.entitlement.limits.students) throw new ApiError('validation', `This takes the school to ${total} students; its plan allows ${s.entitlement.limits.students}. Raise the limit on the Plan and modules tab first.`);
      }
      const batch = await commitImport(pool, input, by);
      await this.db.pool.query('update schools set students_count = $2 where id = $1', [id, await n(pool, 'select count(*) n from students')]);
      await this.db.audit(by, 'import.committed', 'school', id, { kind: input.kind, file: input.fileName, created: batch.created, updated: batch.updated, skipped: batch.skipped });
      return batch;
    });
  }

  async undo(id: string, batchId: string, by: string): Promise<ImportBatchRow[]> {
    return this.with(id, async (pool) => {
      await undoBatch(pool, batchId);
      await pool.query("update import_uploads set status = 'new', batch_id = null where batch_id = $1", [batchId]);
      await this.db.pool.query('update schools set students_count = $2 where id = $1', [id, await n(pool, 'select count(*) n from students')]);
      await this.db.audit(by, 'import.undone', 'school', id, { batchId });
      return listBatches(pool);
    });
  }

  async exportAll(id: string, by: string): Promise<Buffer> {
    const s = await this.school(id);
    const zip = await this.with(id, (pool) => exportAll(pool, s.kinds));
    await this.db.audit(by, 'school.exported', 'school', id);
    return zip;
  }

  /** A realistic test school through the same importer a real one uses: only into a school with no students yet. */
  async loadSample(id: string, students: number, by: string): Promise<ImportBatchRow[]> {
    const s = await this.school(id);
    if (!demosAllowed(this.env)) throw new ApiError('forbidden', 'A test school is only for the test track, never a real school.');
    return this.with(id, async (pool) => {
      if (await n(pool, 'select count(*) n from students')) throw new ApiError('conflict', 'This school already has students. A test school only goes into an empty one.');
      if (students > s.entitlement.limits.students) throw new ApiError('validation', `The plan allows ${s.entitlement.limits.students} students. Raise the limit on the Plan and modules tab first.`);
      for (const f of sampleSchool(students).files.filter((f) => s.kinds.includes(f.kind))) await commitImport(pool, { kind: f.kind, csv: f.csv, fileName: f.name }, by);
      await this.db.pool.query('update schools set students_count = $2 where id = $1', [id, await n(pool, 'select count(*) n from students')]);
      await this.db.audit(by, 'import.sample_loaded', 'school', id, { students });
      return listBatches(pool);
    });
  }
}

@Controller('console/v1/schools/:id/import')
export class MigrationController {
  constructor(private readonly migration: Migration) {}

  @Get() @Needs('schools.read')
  view(@Param('id') id: string): Promise<MigrationView> {
    return this.migration.view(id);
  }

  @Patch('readiness') @Needs('schools.configure')
  mark(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(ReadinessMark)) body: ReadinessMark): Promise<MigrationView> {
    return this.migration.mark(me, id, body);
  }

  /** The kind's template as an .xlsx with dropdowns (CSV still imports; this is the friendlier sheet to fill). */
  @Get('template/:kind') @Needs('schools.read') @Header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  template(@Param('kind') kind: string): Buffer {
    if (!importKind(kind)) throw notFound('That kind of import');
    return templateXlsx(kind);
  }

  @Get('uploads/:uploadId') @Needs('schools.read')
  upload(@Param('id') id: string, @Param('uploadId') uploadId: string): Promise<{ fileName: string; content: string }> {
    return this.migration.upload(id, uploadId);
  }

  @Post('uploads/:uploadId/set-aside') @HttpCode(200) @Needs('schools.configure')
  setAside(@Me() me: ConsoleUser, @Param('id') id: string, @Param('uploadId') uploadId: string, @Body(new ZodPipe(z.object({ reason: z.string().max(200).default('') }))) b: { reason: string }): Promise<UploadRow[]> {
    return this.migration.setAside(id, uploadId, me.email, b.reason);
  }

  @Post('preview') @HttpCode(200) @Needs('schools.configure')
  preview(@Param('id') id: string, @Body(new ZodPipe(ImportInput)) body: ImportInput): Promise<ImportPreview> {
    return this.migration.preview(id, body);
  }

  @Post('commit') @HttpCode(200) @Needs('schools.configure')
  commit(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(ImportInput)) body: ImportInput): Promise<ImportBatchRow> {
    return this.migration.commit(id, body, me.email);
  }

  @Post('batches/:batchId/undo') @HttpCode(200) @Needs('schools.configure')
  undo(@Me() me: ConsoleUser, @Param('id') id: string, @Param('batchId') batchId: string): Promise<ImportBatchRow[]> {
    return this.migration.undo(id, batchId, me.email);
  }

  @Get('export') @Needs('schools.configure') @Header('content-type', 'application/zip') @Header('content-disposition', 'attachment; filename="school-export.zip"')
  exportAll(@Me() me: ConsoleUser, @Param('id') id: string): Promise<Buffer> {
    return this.migration.exportAll(id, me.email);
  }

  @Post('sample') @HttpCode(200) @Needs('schools.configure')
  sample(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(SampleLoad)) body: SampleLoad): Promise<ImportBatchRow[]> {
    return this.migration.loadSample(id, body.students, me.email);
  }
}
