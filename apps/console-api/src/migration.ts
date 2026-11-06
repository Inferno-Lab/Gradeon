import { Body, Controller, Get, Header, HttpCode, Inject, Injectable, Param, Post } from '@nestjs/common';
import { activeFeatures, activeModules } from '@gradeon/config-engine';
import { IMPORT_KINDS, ImportInput, SampleLoad, importKind, type EntitlementDoc, type ImportBatchRow, type ImportPreview, type MigrationView, type UploadRow } from '@gradeon/contracts';
import { commitImport, exportAll, listBatches, pg, previewImport, sampleSchool, templateCsv, undoBatch } from '@gradeon/db';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { Db, Me, Needs, type ConsoleUser } from './core.js';
import { ENV, type Env } from './env.js';
import { withSchoolDb } from './school-db.js';

const n = async (pool: pg.Pool, sql: string) => Number((await pool.query<{ n: string }>(sql)).rows[0]!.n);

/** Gradeon's onboarding team moves a school in: files in, checked, imported as batches that add up, and undone if wrong. */
@Injectable()
export class Migration {
  constructor(private readonly db: Db, @Inject(ENV) private readonly env: Env) {}

  private async school(id: string): Promise<{ entitlement: EntitlementDoc; kinds: string[] }> {
    const r = (await this.db.pool.query<{ entitlement: EntitlementDoc }>('select entitlement from schools where id = $1 and deleted_at is null', [id])).rows[0];
    if (!r) throw notFound('That school');
    const mods = activeModules(r.entitlement);
    const modules = new Set(['core', ...mods, ...activeFeatures(r.entitlement, mods)]);
    return { entitlement: r.entitlement, kinds: IMPORT_KINDS.filter((k) => modules.has(k.module)).map((k) => k.key) };
  }

  private with<T>(id: string, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    return withSchoolDb(this.db, this.env.SECRETS_KEY, id, fn);
  }

  private async kindFor(id: string, kind: string): Promise<{ entitlement: EntitlementDoc }> {
    const s = await this.school(id);
    if (!importKind(kind)) throw notFound('That kind of import');
    if (!s.kinds.includes(kind)) throw new ApiError('validation', `This school’s plan does not include ${importKind(kind)!.label.toLowerCase()}. Change it under Entitlements first.`);
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
      const fees = s.kinds.includes('fee_dues');
      const readiness = [
        { key: 'structure', label: 'The year and its classes are set up', done: year > 0 && classes > 0, detail: `${classes} classes${year ? '' : ', no current year'}` },
        { key: 'staff', label: 'Staff are in', done: staff > 1, detail: `${staff} staff` },
        { key: 'students', label: 'Every student has a family who can sign in', done: students > 0 && orphans === 0, detail: orphans ? `${orphans} students have no guardian phone` : `${students} students, ${families} families` },
        ...(fees ? [{ key: 'fees', label: 'Opening fee dues are in and match the old system', done: dues > 0 && batches.some((b) => b.kind === 'fee_dues' && !b.undoneAt), detail: `${dues} fees` }] : []),
        { key: 'staff_invited', label: 'Staff have their invites', done: staff > 0 && staffInvited === staff, detail: `${staffInvited} of ${staff}` },
        { key: 'families_invited', label: 'Families are invited', done: families > 0 && invited === families, detail: `${invited} of ${families}` },
        { key: 'families_in', label: 'Most families have signed in', done: families > 0 && signed / families >= 0.8, detail: `${signed} of ${families}` },
      ];
      return { kinds: IMPORT_KINDS.filter((k) => s.kinds.includes(k.key)), batches, uploads, readiness, students, studentLimit: s.entitlement.limits.students };
    });
  }

  private async uploads(pool: pg.Pool): Promise<UploadRow[]> {
    const { rows } = await pool.query<{ id: string; file_name: string; note: string; rows: number; uploaded_by: string; at: Date; status: UploadRow['status']; batch_id: string | null }>(
      'select id, file_name, note, rows, uploaded_by, at, status, batch_id from import_uploads order by at desc limit 200');
    return rows.map((r) => ({ id: r.id, fileName: r.file_name, note: r.note, rows: r.rows, uploadedBy: r.uploaded_by, at: r.at.toISOString(), status: r.status, batchId: r.batch_id }));
  }

  async upload(id: string, uploadId: string): Promise<{ fileName: string; content: string }> {
    return this.with(id, async (pool) => {
      const r = (await pool.query<{ file_name: string; content: string }>('select file_name, content from import_uploads where id = $1', [uploadId])).rows[0];
      if (!r) throw notFound('That file');
      return { fileName: r.file_name, content: r.content };
    });
  }

  async setAside(id: string, uploadId: string, by: string): Promise<UploadRow[]> {
    return this.with(id, async (pool) => {
      await pool.query("update import_uploads set status = case when status = 'set_aside' then 'new' else 'set_aside' end where id = $1 and status <> 'imported'", [uploadId]);
      await this.db.audit(by, 'import.file_set_aside', 'school', id, { uploadId });
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
        if (total > s.entitlement.limits.students) throw new ApiError('validation', `This takes the school to ${total} students; its plan allows ${s.entitlement.limits.students}. Raise the limit under Entitlements first.`);
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
    return this.with(id, async (pool) => {
      if (await n(pool, 'select count(*) n from students')) throw new ApiError('conflict', 'This school already has students. A test school only goes into an empty one.');
      if (students > s.entitlement.limits.students) throw new ApiError('validation', `The plan allows ${s.entitlement.limits.students} students. Raise the limit under Entitlements first.`);
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

  @Get('template/:kind') @Needs('schools.read') @Header('content-type', 'text/csv; charset=utf-8')
  template(@Param('kind') kind: string): string {
    if (!importKind(kind)) throw notFound('That kind of import');
    return templateCsv(kind);
  }

  @Get('uploads/:uploadId') @Needs('schools.read')
  upload(@Param('id') id: string, @Param('uploadId') uploadId: string): Promise<{ fileName: string; content: string }> {
    return this.migration.upload(id, uploadId);
  }

  @Post('uploads/:uploadId/set-aside') @HttpCode(200) @Needs('schools.configure')
  setAside(@Me() me: ConsoleUser, @Param('id') id: string, @Param('uploadId') uploadId: string): Promise<UploadRow[]> {
    return this.migration.setAside(id, uploadId, me.email);
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
