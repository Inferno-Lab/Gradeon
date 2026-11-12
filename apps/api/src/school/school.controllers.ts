import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApprovalDecision, AssignFee, FeeHeadsPut, AttendanceDayPut, PeriodMarksPut, CoverRequest, SlotCreate, WaiverRequest, ReceiptCancel, IsoDate, MessageRequest, NoticeCreate, PaymentCreate, SlotPatch, StudentCreate, StudentImport, StudentPatch, GuardiansPut, StudentQuery,
  type ApprovalRow, type AttendanceDay, type AttendanceWeekPoint, type PeriodRoll, type AuditRow, type ClassInfo, type ContactReveal, type DashboardData, type FeeHead, type FeeSummary, type ImportResult, type InvoiceRow, type InvoiceDetail,
  type NoticeRow, type SearchHit, type SettingsResponse, type ShellData, type GuardianRow, type StudentDetail, type StudentRow, type StudentSummary, type StudentViews, type TeacherLoad, type TeacherOption, type TimetableView, type WeekOf, type Paged,
} from '@gradeon/contracts';
import { MODULES, activeModules } from '@gradeon/config-engine';
import { templateXlsx } from '@gradeon/db';
import { z } from 'zod';
import { ZodPipe } from '@gradeon/nest-kit';
import { Core, CurrentUser, Require, RequireModule } from '../auth/guards.js';
import { NoTenant, Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { ApprovalsService } from './approvals.service.js';
import { AttendanceService } from './attendance.service.js';
import { DashboardService } from './dashboard.service.js';
import { FeesService } from './fees.service.js';
import { StudentsService } from './students.service.js';
import { NoticesService } from './notices.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';
import { TimetableService } from './timetable.service.js';

const DayQuery = z.object({ classId: z.string().min(1), date: IsoDate });
const InvoiceQuery = z.object({ studentId: z.string().min(1) });
const NoticeEdit = NoticeCreate.and(z.object({ tellAgain: z.boolean().default(false) }));
const ListApprovals = z.object({ view: z.enum(['waiting', 'sent', 'decided']).default('waiting'), kind: z.enum(['leave', 'fee_waiver', 'admission', 'notice', 'attendance', 'photo', 'receipt_cancel']).optional() });
const ClassQuery = z.object({ classId: z.string().min(1) });
const DashQuery = z.object({ days: z.coerce.number().int().min(1).max(30).default(6) });
const SearchQuery = z.object({ q: z.string().max(80).default('') });
const IdsQuery = z.object({ ids: z.string().optional() });
const Summ = StudentQuery.pick({ classId: true, house: true });

@Controller('v1/classes')
@Core()
export class ClassesController {
  constructor(private readonly tt: TimetableService) {}

  @Get() @Require('students.read')
  list(@Tenant() t: TenantCtx): Promise<ClassInfo[]> {
    return this.tt.classes(t);
  }
}

@Controller('v1/students')
@Core()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get() @Require('students.read')
  list(@Tenant() t: TenantCtx, @Query(new ZodPipe(StudentQuery)) q: StudentQuery): Promise<Paged<StudentRow>> {
    return this.students.list(t, q);
  }

  @Get('summary') @Require('students.read')
  summary(@Tenant() t: TenantCtx, @Query(new ZodPipe(Summ)) q: z.infer<typeof Summ>): Promise<StudentSummary> {
    return this.students.summary(t, q);
  }

  @Get('views') @Require('students.read')
  views(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<StudentViews> {
    return this.students.views(t, u.id);
  }

  @Get('export') @Require('students.read') @Header('content-type', 'text/csv; charset=utf-8') @Header('content-disposition', 'attachment; filename="students.csv"')
  export(@Tenant() t: TenantCtx, @Query(new ZodPipe(IdsQuery)) q: z.infer<typeof IdsQuery>): Promise<string> {
    return this.students.exportCsv(t, q.ids ? q.ids.split(',').slice(0, 500) : null);
  }

  @Post() @Require('students.write')
  create(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(StudentCreate)) body: StudentCreate): Promise<StudentDetail> {
    return this.students.create(t, body, u);
  }

  /** The students sheet to fill (the import engine's template: columns, an example row, dropdowns). */
  @Get('template') @Require('students.write') @Header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  template(): Buffer {
    return templateXlsx('students');
  }

  @Post('import') @HttpCode(200) @Require('students.write')
  import(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(StudentImport)) body: StudentImport): Promise<ImportResult> {
    return this.students.importCsv(t, body.csv, u);
  }

  @Post('message') @HttpCode(200) @Require('students.read')
  message(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(MessageRequest)) body: MessageRequest): Promise<{ sent: number }> {
    return this.students.message(t, body, u);
  }

  @Patch(':id') @Require('students.write')
  update(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(StudentPatch)) body: StudentPatch): Promise<StudentDetail> {
    return this.students.update(t, id, body, u);
  }

  @Put(':id/guardians') @Require('students.write')
  guardians(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(GuardiansPut)) body: GuardiansPut): Promise<GuardianRow[]> {
    return this.students.setGuardians(t, id, body, u);
  }

  @Post(':id/app-account') @HttpCode(200) @Require('students.write')
  studentAccount(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ phone: z.string().max(20).optional(), email: z.string().email().max(120).optional() }))) b: { phone?: string; email?: string }): Promise<{ sent: boolean }> {
    return this.students.studentAccount(t, u, id, b);
  }

  @Post('invite') @HttpCode(200) @Require('students.write')
  invite(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(z.object({ ids: z.array(z.string()).min(1).max(500) }))) body: { ids: string[] }): Promise<{ sent: number }> {
    return this.students.invite(t, body.ids, u);
  }

  @Post('assign-fee') @HttpCode(200) @Require('fees.collect') @RequireModule('fees')
  assignFee(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(AssignFee)) body: AssignFee): Promise<{ created: number }> {
    return this.students.assignFee(t, body, u);
  }

  @Get(':id') @Require('students.read')
  detail(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<StudentDetail> {
    return this.students.detail(t, id);
  }

  @Post(':id/reveal') @HttpCode(200) @Require('students.read')
  reveal(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<ContactReveal> {
    return this.students.reveal(t, id, u);
  }
}

@Controller('v1/attendance')
@RequireModule('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('day') @Require('attendance.read')
  day(@Tenant() t: TenantCtx, @Query(new ZodPipe(DayQuery)) q: z.infer<typeof DayQuery>): Promise<AttendanceDay> {
    return this.attendance.day(t, q.classId, q.date);
  }

  @Put('day') @Require('attendance.mark')
  put(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(AttendanceDayPut)) body: AttendanceDayPut): Promise<AttendanceDay> {
    return this.attendance.put(t, u, body);
  }

  @Get('periods') @RequireModule('attendance.periodWise') @Require('attendance.read')
  periods(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Query(new ZodPipe(DayQuery)) q: z.infer<typeof DayQuery>): Promise<PeriodRoll> {
    return this.attendance.periods(t, u, q.classId, q.date);
  }

  @Put('periods') @RequireModule('attendance.periodWise') @Require('attendance.mark')
  putPeriod(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(PeriodMarksPut)) body: PeriodMarksPut): Promise<PeriodRoll> {
    return this.attendance.putPeriod(t, u, body);
  }

  @Get('week') @Require('attendance.read')
  week(@Tenant() t: TenantCtx): Promise<AttendanceWeekPoint[]> {
    return this.attendance.week(t);
  }

  @Post('remind') @HttpCode(200) @Require('attendance.read')
  remind(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<{ sent: number; classes: string[] }> {
    return this.attendance.remind(t, u);
  }
}

@Controller('v1/fees')
@RequireModule('fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get('summary') @Require('fees.read')
  summary(@Tenant() t: TenantCtx, @Query(new ZodPipe(z.object({ period: z.enum(['month', 'term', 'year']).default('month') }))) q: { period: 'month' | 'term' | 'year' }): Promise<FeeSummary> {
    return this.fees.summary(t, 6, q.period);
  }

  @Get('heads') @Require('fees.read')
  heads(@Tenant() t: TenantCtx): Promise<FeeHead[]> {
    return this.fees.heads(t);
  }

  @Put('heads') @Require('setup.write')
  setHeads(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(FeeHeadsPut)) body: FeeHeadsPut): Promise<FeeHead[]> {
    return this.fees.setHeads(t, body, u);
  }

  @Get('invoices') @Require('fees.read')
  invoices(@Tenant() t: TenantCtx, @Query(new ZodPipe(InvoiceQuery)) q: z.infer<typeof InvoiceQuery>): Promise<InvoiceRow[]> {
    return this.fees.invoices(t, q.studentId);
  }

  @Get('invoice/:id') @Require('fees.read')
  invoice(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<InvoiceDetail> {
    return this.fees.invoice(t, id);
  }

  @Post('invoice/:id/waive') @HttpCode(200) @Require('fees.collect')
  waive(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(WaiverRequest)) body: WaiverRequest): Promise<InvoiceDetail> {
    return this.fees.requestWaiver(t, u, id, body);
  }

  @Post('receipts/:id/cancel') @HttpCode(200) @Require('fees.collect')
  cancelReceipt(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(ReceiptCancel)) body: ReceiptCancel): Promise<InvoiceDetail> {
    return this.fees.requestReceiptCancel(t, u, id, body);
  }

  @Post('payments') @HttpCode(200) @Require('fees.collect')
  async pay(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(PaymentCreate)) body: PaymentCreate): Promise<{ receiptNo: string; amount: number; outstanding: number }> {
    await this.fees.checkMethod(t, body.method);
    return this.fees.pay(t, u, body);
  }

  @Post('reminders') @RequireModule('fees.reminders') @HttpCode(200) @Require('fees.read')
  remind(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(z.object({ ids: z.array(z.string()).min(1).max(500).optional(), overdue: z.literal(true).optional() }).refine((b) => !!b.ids !== !!b.overdue, 'Name the students, or every overdue family'))) body: { ids?: string[]; overdue?: true }): Promise<{ sent: number }> {
    return this.fees.remind(t, u, body.overdue ? 'overdue' : body.ids!);
  }
}

@Controller('v1')
@Core()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('needs-you') @Require('approvals.read')
  needsYou(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<ApprovalRow[]> {
    return this.approvals.needsYou(t, u.permissions);
  }

  @Get('approvals') @Require('approvals.read')
  list(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Query(new ZodPipe(ListApprovals)) q: z.infer<typeof ListApprovals>): Promise<ApprovalRow[]> {
    return this.approvals.list(t, u, q.view, q.kind);
  }

  @Post('approvals/:id/decision') @HttpCode(200) @Require('approvals.decide')
  decide(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(ApprovalDecision)) body: ApprovalDecision): Promise<ApprovalRow> {
    return this.approvals.decide(t, u, id, body);
  }

}

@Controller('v1/notices')
@RequireModule('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get() @Require('notices.read')
  list(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<NoticeRow[]> {
    return this.notices.list(t, u);
  }

  @Post() @Require('notices.write')
  create(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(NoticeCreate)) body: NoticeCreate): Promise<NoticeRow> {
    return this.notices.create(t, u, body);
  }

  @Put(':id') @Require('notices.write')
  update(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(NoticeEdit)) body: z.infer<typeof NoticeEdit>): Promise<NoticeRow> {
    return this.notices.update(t, u, id, body);
  }

  @Delete(':id') @HttpCode(204) @Require('notices.write')
  async remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> {
    await this.notices.remove(t, u, id);
  }

  /** Who has not acknowledged a notice that asked for it, to remind them. */
  @Get(':id/not-acknowledged') @Require('notices.read')
  notAcked(@Tenant() t: TenantCtx, @Param('id') id: string) {
    return this.notices.notAcked(t, id);
  }
}

@Controller('v1/timetable')
@RequireModule('timetable')
export class TimetableController {
  constructor(private readonly tt: TimetableService) {}

  @Get() @Require('timetable.read')
  view(@Tenant() t: TenantCtx, @Query(new ZodPipe(ClassQuery)) q: z.infer<typeof ClassQuery>): Promise<TimetableView> {
    return this.tt.view(t, q.classId);
  }

  @Get('loads') @Require('timetable.read')
  loads(@Tenant() t: TenantCtx, @Query(new ZodPipe(ClassQuery)) q: z.infer<typeof ClassQuery>): Promise<TeacherLoad[]> {
    return this.tt.loads(t, q.classId);
  }

  @Get('teachers') @Require('timetable.read')
  teachers(@Tenant() t: TenantCtx, @Query(new ZodPipe(z.object({ slotId: z.string().min(1) }))) q: { slotId: string }): Promise<TeacherOption[]> {
    return this.tt.teachers(t, q.slotId);
  }

  @Get('week') @Require('timetable.read')
  week(@Tenant() t: TenantCtx, @Query(new ZodPipe(z.object({ teacherId: z.string().optional(), room: z.string().max(20).optional() }).refine((q) => !!q.teacherId !== !!q.room, 'Name a teacher or a room'))) q: { teacherId?: string; room?: string }): Promise<WeekOf> {
    return this.tt.weekOf(t, q);
  }

  @Get('rooms') @Require('timetable.read')
  rooms(@Tenant() t: TenantCtx): Promise<string[]> {
    return this.tt.rooms(t);
  }

  @Post('slots') @Require('timetable.edit')
  place(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(SlotCreate)) body: SlotCreate): Promise<{ id: string }> {
    return this.tt.createSlot(t, u, body);
  }

  @Delete('slots/:id') @HttpCode(204) @Require('timetable.edit')
  async free(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> {
    await this.tt.removeSlot(t, u, id);
  }

  @Patch('slots/:id') @HttpCode(204) @Require('timetable.edit')
  async patch(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(SlotPatch)) body: SlotPatch): Promise<void> {
    await this.tt.patchSlot(t, u, id, body);
  }

  @Post('cover') @RequireModule('timetable.cover') @HttpCode(204) @Require('timetable.edit')
  async cover(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(CoverRequest)) body: CoverRequest): Promise<void> {
    await this.tt.cover(t, u, body);
  }

  @Post('publish') @HttpCode(200) @Require('timetable.publish')
  publish(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<{ families: number; teachers: number; version: number }> {
    return this.tt.publish(t, u);
  }
}

@Controller('v1')
@Core()
export class DashboardController {
  constructor(
    private readonly dash: DashboardService,
    private readonly settings: SettingsService,
  ) {}

  @Get('dashboard')
  get(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Query(new ZodPipe(DashQuery)) q: z.infer<typeof DashQuery>): Promise<DashboardData> {
    return this.dash.get(t, u, q.days);
  }

  @Get('shell')
  async shell(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<ShellData> {
    const cfg = await this.settings.effective(t, u.permissions);
    return this.dash.shell(t, cfg.modules, cfg.features, u.permissions);
  }

  @Get('search')
  async search(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Query(new ZodPipe(SearchQuery)) q: z.infer<typeof SearchQuery>): Promise<SearchHit[]> {
    const cfg = await this.settings.effective(t, u.permissions);
    return this.dash.search(t, q.q, u.permissions, cfg.modules);
  }
}

@Controller('v1/settings')
@Core()
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly messenger: Messenger,
  ) {}

  @Get() @Require('settings.read')
  async get(@Tenant() t: TenantCtx): Promise<SettingsResponse> {
    const [doc, counts, smsUsed] = await Promise.all([
      this.settings.doc(t),
      t.pool.query<{ students: string; staff: string }>("select (select count(*) from students where status = 'active') students, (select count(*) from staff) staff"),
      this.messenger.smsThisMonth(t.info.slug),
    ]);
    const entitled = activeModules(t.info.entitlement);
    const { limits, plan } = t.info.entitlement;
    const usage = { plan, students: Number(counts.rows[0]!.students), staff: Number(counts.rows[0]!.staff), studentLimit: limits.students, smsUsed, smsLimit: limits.smsPerMonth };
    return { ...doc, usage, modules: MODULES.map((m) => ({ key: m.key, name: m.name, blurb: m.blurb, requires: m.requires, core: !!m.core, backend: m.backend, entitled: entitled.includes(m.key) })) };
  }

  // No write route: a school's configuration changes only from the console (Gradeon staff). See ConfigService in the console API.

  @Get('audit') @Require('audit.read')
  auditLog(@Tenant() t: TenantCtx): Promise<AuditRow[]> {
    return this.audit.list(t);
  }
}

@Controller()
export class HealthController {
  @NoTenant() @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }

  /** Cheap check the console uses to see a school's database answering, and how fast. */
  @Core() @Get('v1/ping')
  async ping(@Tenant() t: TenantCtx): Promise<{ ok: true; ms: number; apiVersion: string }> {
    const started = Date.now();
    await t.pool.query('select 1');
    return { ok: true, ms: Date.now() - started, apiVersion: t.info.apiVersion };
  }
}

