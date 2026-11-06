import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, Post, Put } from '@nestjs/common';
import { SETUP_KINDS, SetupSave, importKind, type SetupSection } from '@gradeon/contracts';
import { commitImport, exportRows, newId, previewImport } from '@gradeon/db';
import { ApiError, ZodPipe, forbidden, notFound } from '@gradeon/nest-kit';
import { Core, CurrentUser, Require, RequireModule } from '../auth/guards.js';
import { Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { AuditService, SettingsService } from './support.js';

const REMOVE: Record<string, { sql: string; inUse: string }> = {
  years: { sql: 'delete from academic_years where id = $1', inUse: 'Classes still belong to this year. Move them to another year first.' },
  terms: { sql: 'delete from terms where id = $1', inUse: 'Something still uses this term.' },
  holidays: { sql: "delete from events where id = $1 and kind = 'holiday'", inUse: 'Something still uses this holiday.' },
  classes: { sql: 'delete from classes where id = $1', inUse: 'Students are still in this class. Move them to another class first.' },
  subjects: { sql: 'delete from subjects where id = $1', inUse: 'The timetable, homework or exams still use this subject.' },
  periods: { sql: "delete from periods where idx::text = $1", inUse: 'The timetable still uses this period. Move those lessons first.' },
  fee_structures: { sql: 'delete from fee_structures where id = $1', inUse: 'Something still uses this fee.' },
};
const LOCKED: Record<string, string> = {
  'calendar.schoolEdits': 'Gradeon keeps your years, terms and holidays. Ask Gradeon to change them.',
  'classes.schoolEdits': 'Gradeon keeps your classes, subjects and periods. Ask Gradeon to change them.',
  'feeStructures.schoolEdits': 'Gradeon keeps your fee structures. Ask Gradeon to change them.',
};

/** Classes and calendar: the school edits its own structure through the import engine, so a typed row gets the same checks (and undo) as a file. */
@Injectable()
export class SetupService {
  constructor(private readonly audit: AuditService, private readonly settings: SettingsService) {}

  async sections(t: TenantCtx): Promise<SetupSection[]> {
    const modules = (await this.settings.effective(t)).modules;
    const out: SetupSection[] = [];
    for (const s of SETUP_KINDS) {
      const kind = importKind(s.key)!;
      if (kind.module !== 'core' && !modules.includes(kind.module)) continue;
      const rows = (await exportRows(t.pool, s.key)) as SetupSection['rows'];
      out.push({ kind: s.key, label: kind.label, locked: (await this.settings.value<boolean>(t, s.lock, true)) === false, columns: kind.columns, rows });
    }
    return out;
  }

  private async open(t: TenantCtx, key: string): Promise<void> {
    const s = SETUP_KINDS.find((k) => k.key === key);
    const kind = importKind(key);
    if (!s || !kind) throw notFound('That part of setup');
    if (kind.module !== 'core' && !(await this.settings.effective(t)).modules.includes(kind.module)) throw new ApiError('locked', 'This feature is not part of your school’s plan.');
    if ((await this.settings.value<boolean>(t, s.lock, true)) === false) throw forbidden(LOCKED[s.lock]!);
  }

  async save(t: TenantCtx, key: string, row: Record<string, string>, user: { id: string; name: string }): Promise<SetupSection[]> {
    await this.open(t, key);
    const input = { kind: key, rows: [row], fileName: 'School setup' };
    const check = (await previewImport(t.pool, input)).rows[0]!;
    if (check.errors.length) throw new ApiError('validation', check.errors.join(' '));
    await commitImport(t.pool, input, user.name);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'setup.saved', entity: key, detail: { added: check.action === 'create' } });
    return this.sections(t);
  }

  async remove(t: TenantCtx, key: string, id: string, user: { id: string; name: string }): Promise<SetupSection[]> {
    await this.open(t, key);
    try {
      const { rowCount } = await t.pool.query(REMOVE[key]!.sql, [id]);
      if (!rowCount) throw notFound('That row');
    } catch (err) {
      if ((err as { code?: string }).code === '23503') throw new ApiError('conflict', REMOVE[key]!.inUse);
      throw err;
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'setup.removed', entity: key, entityId: id });
    return this.sections(t);
  }

  /** Bills every active student in the fee's grade (or every grade) once: a student who already has a fee with this name is left alone. */
  async apply(t: TenantCtx, id: string, user: { id: string; name: string }): Promise<{ created: number }> {
    const fee = (await t.pool.query<{ head: string; title: string; amount: number; due_on: string; grade: number | null }>('select head, title, amount, due_on::text, grade from fee_structures where id = $1', [id])).rows[0];
    if (!fee) throw notFound('That fee');
    const { rows } = await t.pool.query<{ id: string }>(
      `select s.id from students s join classes c on c.id = s.class_id where s.status = 'active' and ($1::int is null or c.grade = $1)
       and not exists (select 1 from fee_invoices i where i.student_id = s.id and lower(i.title) = lower($2))`, [fee.grade, fee.title]);
    if (rows.length) {
      await t.pool.query('insert into fee_invoices (id, student_id, head, title, amount, due_on) select unnest($1::text[]), unnest($2::text[]), $3, $4, $5, $6',
        [rows.map(() => newId('inv')), rows.map((r) => r.id), fee.head, fee.title, fee.amount, fee.due_on]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'fee.assigned', entity: 'fee_structure', entityId: id, detail: { count: rows.length, title: fee.title, amount: fee.amount } });
    return { created: rows.length };
  }
}

@Controller('v1/setup')
@Core()
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get() @Require('students.read')
  sections(@Tenant() t: TenantCtx): Promise<SetupSection[]> {
    return this.setup.sections(t);
  }

  // Each kind belongs to a module (fee structures to fees); `open` checks it, since the kind is in the path.
  @Put(':kind') @Require('setup.write')
  save(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('kind') kind: string, @Body(new ZodPipe(SetupSave)) body: SetupSave): Promise<SetupSection[]> {
    return this.setup.save(t, kind, body.row, u);
  }

  @Delete(':kind/:id') @Require('setup.write')
  remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('kind') kind: string, @Param('id') id: string): Promise<SetupSection[]> {
    return this.setup.remove(t, kind, id, u);
  }

  @Post('fee_structures/:id/apply') @HttpCode(200) @RequireModule('fees') @Require('fees.collect')
  apply(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<{ created: number }> {
    return this.setup.apply(t, id, u);
  }
}
