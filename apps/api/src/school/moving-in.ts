import { Body, Controller, Get, Header, HttpCode, Inject, Injectable, Param, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { FamilyInvite, IMPORT_KINDS, UploadCreate, importKind, type Activation, type ImportBatchRow, type LetterRow, type UploadRow } from '@tangent/contracts';
import { exportAll, listBatches, newId, readTable, templateXlsx } from '@tangent/db';
import { hashPassword } from '@tangent/security';
import { ZodPipe, notFound } from '@tangent/nest-kit';
import { z } from 'zod';
import { Core, CurrentUser, Require } from '../auth/guards.js';
import { Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { ENV, type Env } from '../env.js';
import { pdf, sendPdf, type PdfLine } from './pdf.js';
import { tempPassword } from './people.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

type Who = { id: string; name: string };
const ClassQ = z.object({ classId: z.string().max(60).optional() });

/** Primary guardians, one per family, with the class of each child. A family with children in two classes counts in both. */
const FAMILIES = `select distinct c.id class_id, g.id guardian_id, u.id user_id, u.invited_at, u.last_login_at, u.consented_at
  from students s join classes c on c.id = s.class_id join student_guardians sg on sg.student_id = s.id and sg.is_primary
  join guardians g on g.id = sg.guardian_id left join users u on u.id = g.user_id where s.status = 'active'`;

/**
 * Moving in, from the school's side: the files it sends Tangent's team, and go-live (inviting staff, inviting families
 * class by class with letters to send home, and seeing who has signed in). The import itself is the console's job.
 */
@Injectable()
export class MovingInService {
  constructor(private readonly audit: AuditService, private readonly messenger: Messenger, private readonly settings: SettingsService) {}

  async uploads(t: TenantCtx): Promise<UploadRow[]> {
    const { rows } = await t.pool.query<{ id: string; file_name: string; note: string; rows: number; uploaded_by: string; at: Date; status: UploadRow['status']; batch_id: string | null; set_aside_reason: string }>(
      'select id, file_name, note, rows, uploaded_by, at, status, batch_id, set_aside_reason from import_uploads order by at desc limit 200');
    return rows.map((r) => ({ id: r.id, fileName: r.file_name, note: r.note, rows: r.rows, uploadedBy: r.uploaded_by, at: r.at.toISOString(), status: r.status, batchId: r.batch_id, setAsideReason: r.set_aside_reason ?? '' }));
  }

  async upload(t: TenantCtx, body: UploadCreate, user: Who): Promise<UploadRow[]> {
    let rows = 0;
    // A sheet is counted; a PDF or a photo of a register is read by eye.
    if (/\.(csv|txt|xlsx)$/i.test(body.fileName)) try { rows = Math.max(0, readTable(body.content).length - 1); } catch { /* not a sheet after all */ }
    await t.pool.query('insert into import_uploads (id, file_name, note, content, rows, uploaded_by) values ($1,$2,$3,$4,$5,$6)', [newId('upl'), body.fileName, body.note, body.content, rows, user.name]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'files.sent', entity: 'upload', detail: { file: body.fileName, rows } });
    return this.uploads(t);
  }

  async activation(t: TenantCtx): Promise<Activation> {
    const [classes, fam, staff] = await Promise.all([
      t.pool.query<{ id: string; name: string; students: string }>("select c.id, c.name, count(s.id) students from classes c left join students s on s.class_id = c.id and s.status = 'active' group by c.id order by c.grade, c.section"),
      t.pool.query<{ class_id: string; guardian_id: string; invited_at: Date | null; last_login_at: Date | null; consented_at: Date | null }>(FAMILIES),
      t.pool.query<{ total: string; invited: string; signed: string }>(
        "select count(*) total, count(*) filter (where invited_at is not null or password_hash is not null) invited, count(last_login_at) signed from users where kind = 'staff' and status = 'active'"),
    ]);
    const all = new Map(fam.rows.map((r) => [r.guardian_id, r]));
    const s = staff.rows[0]!;
    return {
      staff: { total: Number(s.total), invited: Number(s.invited), signedIn: Number(s.signed) },
      families: { total: all.size, invited: [...all.values()].filter((r) => r.invited_at).length, signedIn: [...all.values()].filter((r) => r.last_login_at).length, consented: [...all.values()].filter((r) => r.consented_at).length },
      classes: classes.rows.map((c) => {
        const mine = fam.rows.filter((r) => r.class_id === c.id);
        return { classId: c.id, className: c.name, students: Number(c.students), families: mine.length, invited: mine.filter((r) => r.invited_at).length, signedIn: mine.filter((r) => r.last_login_at).length, consented: mine.filter((r) => r.consented_at).length };
      }),
    };
  }

  /** Texts each family not yet invited (in one class, or everywhere) and remembers it, so a second press reaches only the new ones. */
  async inviteFamilies(t: TenantCtx, classId: string | undefined, user: Who, remind = false): Promise<{ sent: number }> {
    // Families sign in by phone, so each needs a login first: an existing one with that phone (a teacher who is also a parent), or a new one.
    const loose = await t.pool.query<{ id: string; name: string; phone: string; existing: string | null }>(
      `select distinct g.id, g.name, g.phone, (select u.id from users u where right(regexp_replace(coalesce(u.phone,''), '\\D', '', 'g'), 10) = right(regexp_replace(g.phone, '\\D', '', 'g'), 10) limit 1) existing
       from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id
       where s.status = 'active' and g.user_id is null and g.phone is not null and ($1::text is null or s.class_id = $1)`, [classId ?? null]);
    const made = new Map<string, string>();
    for (const g of loose.rows) {
      const digits = g.phone.replace(/\D/g, '').slice(-10);
      let id = g.existing ?? made.get(digits);
      if (!id) {
        id = newId('usr');
        made.set(digits, id);
        // No email: it may belong to another login, and families sign in by phone.
        await t.pool.query("insert into users (id, kind, name, phone) values ($1, 'guardian', $2, $3)", [id, g.name, g.phone]);
      }
      await t.pool.query('update guardians set user_id = $2 where id = $1', [g.id, id]);
    }
    const { rows } = await t.pool.query<{ user_id: string; phone: string; student: string }>(
      `select distinct on (u.id) u.id user_id, g.phone, s.name student from students s join student_guardians sg on sg.student_id = s.id and sg.is_primary
       join guardians g on g.id = sg.guardian_id join users u on u.id = g.user_id
       where s.status = 'active' and g.phone is not null and ($1::text is null or s.class_id = $1)
         and (case when $2 then u.invited_at is not null and u.last_login_at is null else u.invited_at is null end) order by u.id, s.name`, [classId ?? null, remind]);
    if (!rows.length) return { sent: 0 };
    // A reminder is the same invite again, to families invited before who have not signed in yet.
    await this.messenger.notify(t, 'family.invite', rows.map((r) => ({ to: r.phone, vars: { student: r.student } })));
    await t.pool.query('update users set invited_at = now() where id = any($1)', [rows.map((r) => r.user_id)]);
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: remind ? 'family.reminded' : 'family.invited', entity: 'class', entityId: classId, detail: { families: rows.length } });
    return { sent: rows.length };
  }

  /** Staff brought in by Migration have no password yet: each gets a first one by email now, the day the school goes live. */
  async inviteStaff(t: TenantCtx, user: Who, remind = false): Promise<{ sent: number; skipped: string[] }> {
    // An invite (or, to remind, a new first password for someone who never signed in) needs an email or a phone to reach them.
    const all = (await t.pool.query<{ id: string; name: string; email: string | null; phone: string | null }>(
      remind ? "select id, name, email, phone from users where kind = 'staff' and status = 'active' and invited_at is not null and last_login_at is null"
        : "select id, name, email, phone from users where kind = 'staff' and status = 'active' and invited_at is null and password_hash is null")).rows;
    const rows = all.filter((r) => r.email || r.phone);
    const skipped = all.filter((r) => !r.email && !r.phone).map((r) => r.name);
    for (const r of rows) {
      const temp = tempPassword();
      await t.pool.query('update users set password_hash = $2, invited_at = now() where id = $1', [r.id, await hashPassword(temp)]);
      await this.messenger.notify(t, 'staff.invite', [{ to: r.phone ?? r.email ?? '', email: r.email, vars: { name: r.name.split(' ')[0]!, password: temp } }]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: remind ? 'staff.reminded' : 'staff.invited', entity: 'staff', detail: { count: rows.length, skipped: skipped.length } });
    return { sent: rows.length, skipped };
  }

  /**
   * The letters to send home, printed by the server from the school's own wording (console: People → letters), one page each:
   * to every family (or, when the school uses the app for students, every student) of a class or the school, with a QR code
   * that opens the school's app in the phone's own store.
   */
  async letterPdf(t: TenantCtx, classId: string | undefined, role: 'family' | 'student', base: string): Promise<{ name: string; data: Buffer }> {
    const rows = await this.letters(t, classId);
    if (!rows.length) throw notFound('Students in that class');
    const school = String((await this.settings.doc(t)).values['school.name'] ?? t.info.name);
    const words = await this.settings.value<string>(t, role === 'family' ? 'letters.family' : 'letters.student', '');
    const link = `${base.replace(/\/$/, '')}/hooks/app/${t.info.slug}`;
    const lines: PdfLine[] = [];
    rows.forEach((r, i) => {
      const vars: Record<string, string> = { school, student: r.student, class: r.className, guardian: r.guardian, phoneEnd: r.phoneEnd, link };
      const text = words.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
      lines.push({ text: school, size: 18, bold: true, gap: 0, page: i > 0 }, { text: `${role === 'family' ? 'For the family of ' : ''}${r.student} · ${r.className} · ${r.admissionNo}`, size: 10, gap: 18 }, { text: '', qr: link, gap: 0 });
      for (const para of text.split('\n')) lines.push({ text: para, gap: para ? 16 : 8 });
    });
    return { name: `${school} - letters${classId ? ` - ${rows[0]!.className}` : ''}.pdf`, data: await pdf(lines, { logo: null }) };
  }

  async letters(t: TenantCtx, classId: string | undefined): Promise<LetterRow[]> {
    const { rows } = await t.pool.query<{ id: string; name: string; admission_no: string; class_name: string; guardian: string; phone: string }>(
      `select s.id, s.name, s.admission_no, c.name class_name, g.name guardian, g.phone from students s join classes c on c.id = s.class_id
       join student_guardians sg on sg.student_id = s.id and sg.is_primary join guardians g on g.id = sg.guardian_id
       where s.status = 'active' and ($1::text is null or s.class_id = $1) order by c.grade, c.section, s.roll_no, s.name`, [classId ?? null]);
    return rows.map((r) => ({ studentId: r.id, student: r.name, admissionNo: r.admission_no, className: r.class_name, guardian: r.guardian, phoneEnd: (r.phone ?? '').replace(/\D/g, '').slice(-4) }));
  }

  /** Everything the school has, in the import templates: what it would take to another system. */
  async exportAll(t: TenantCtx, user: Who): Promise<Buffer> {
    const cfg = await this.settings.effective(t);
    const modules = new Set(['core', ...cfg.modules, ...cfg.features]);
    const zip = await exportAll(t.pool, IMPORT_KINDS.filter((k) => modules.has(k.module)).map((k) => k.key));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'school.exported', entity: 'school' });
    return zip;
  }
}

@Controller('v1/moving-in')
@Core()
export class MovingInController {
  constructor(private readonly moving: MovingInService, @Inject(ENV) private readonly env: Env) {}

  @Get('uploads') @Require('setup.write')
  uploads(@Tenant() t: TenantCtx): Promise<UploadRow[]> {
    return this.moving.uploads(t);
  }

  /** What Tangent imported, with the totals to check against the old system (undo stays with Tangent). */
  @Get('batches') @Require('setup.write')
  batches(@Tenant() t: TenantCtx): Promise<ImportBatchRow[]> {
    return listBatches(t.pool);
  }

  @Post('uploads') @Require('setup.write')
  upload(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(UploadCreate)) body: UploadCreate): Promise<UploadRow[]> {
    return this.moving.upload(t, body, u);
  }

  @Get('activation') @Require('students.read')
  activation(@Tenant() t: TenantCtx): Promise<Activation> {
    return this.moving.activation(t);
  }

  @Post('families/invite') @HttpCode(200) @Require('students.write')
  inviteFamilies(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(FamilyInvite.extend({ remind: z.boolean().default(false) }))) body: FamilyInvite & { remind: boolean }): Promise<{ sent: number }> {
    return this.moving.inviteFamilies(t, body.classId, u, body.remind);
  }

  @Post('staff/invite') @HttpCode(200) @Require('staff.write')
  inviteStaff(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(z.object({ remind: z.boolean().default(false) }))) b: { remind: boolean }): Promise<{ sent: number; skipped: string[] }> {
    return this.moving.inviteStaff(t, u, b.remind);
  }

  @Get('letters.pdf') @Require('students.read')
  async letterPdf(@Tenant() t: TenantCtx, @Query(new ZodPipe(ClassQ.extend({ role: z.enum(['family', 'student']).default('family') }))) q: { classId?: string; role: 'family' | 'student' }, @Res() reply: FastifyReply): Promise<void> {
    sendPdf(reply, await this.moving.letterPdf(t, q.classId, q.role, this.env.API_BASE_URL));
  }

  /** A blank sheet to fill, as the console's: an .xlsx with the columns, an example row and dropdowns. */
  @Get('template/:kind') @Require('setup.write') @Header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  template(@Param('kind') kind: string): Buffer {
    if (!importKind(kind)) throw notFound('That kind of import');
    return templateXlsx(kind);
  }

  @Get('export') @Require('privacy.manage') @Header('content-type', 'application/zip') @Header('content-disposition', 'attachment; filename="school-export.zip"')
  exportAll(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<Buffer> {
    return this.moving.exportAll(t, u);
  }
}
