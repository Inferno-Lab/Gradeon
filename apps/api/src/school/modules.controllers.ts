import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  DataRequestCreate, DataRequestDecision, EnquiryCreate, EnquiryEnrol, EnquiryPatch, EventSave, ExamCreate, ExamMarksPut, HomeworkCreate, HomeworkMarks, InvoiceListQuery, StaffCreate, StaffPatch,
  ThreadCreate, ThreadPatch, ThreadReply,
  type DataRequestRow, type EnquiryRow, type EventRow, type ExamMarksView, type ExamResults, type ExamRow, type HomeworkDetail, type HomeworkRow, type InvoiceListRow, type InvoiceListSummary, type Paged,
  type ReceiptRow, type ReportData, type ReportInfo, type RoleRow, type StaffRow, type StudentDetail, type ThreadDetail, type ThreadRow,
} from '@gradeon/contracts';
import { z } from 'zod';
import { ZodPipe } from '@gradeon/nest-kit';
import { Core, CurrentUser, Require, RequireModule } from '../auth/guards.js';
import { Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { LearningService } from './learning.service.js';
import { OfficeService } from './office.service.js';
import { PeopleService } from './people.service.js';

const ClassFilter = z.object({ classId: z.string().optional(), subjectId: z.string().optional() });
const Q = z.object({ query: z.string().trim().max(80).optional() });

const Reopen = z.object({ note: z.string().trim().min(5, 'Say what is being corrected; families are told.').max(200) });

@Controller('v1')
@Core()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('subjects') @Require('students.read')
  async subjects(@Tenant() t: TenantCtx): Promise<{ id: string; name: string; color: string }[]> {
    return (await t.pool.query<{ id: string; name: string; color: string }>('select id, name, color from subjects order by name')).rows;
  }

  @Get('homework') @RequireModule('homework') @Require('homework.read')
  homework(@Tenant() t: TenantCtx, @Query(new ZodPipe(ClassFilter)) q: z.infer<typeof ClassFilter>): Promise<HomeworkRow[]> {
    return this.learning.homework(t, q);
  }

  @Post('homework') @RequireModule('homework') @Require('homework.write')
  createHomework(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(HomeworkCreate)) b: HomeworkCreate): Promise<HomeworkDetail> {
    return this.learning.createHomework(t, u, b);
  }

  @Get('homework/:id') @RequireModule('homework') @Require('homework.read')
  homeworkDetail(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<HomeworkDetail> {
    return this.learning.homeworkDetail(t, id);
  }

  @Put('homework/:id') @RequireModule('homework') @Require('homework.write')
  updateHomework(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(HomeworkCreate)) b: HomeworkCreate): Promise<HomeworkDetail> {
    return this.learning.updateHomework(t, u, id, b);
  }

  @Put('homework/:id/marks') @RequireModule('homework') @Require('homework.write')
  markHomework(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(HomeworkMarks)) b: HomeworkMarks): Promise<HomeworkDetail> {
    return this.learning.markHomework(t, u, id, b);
  }

  @Delete('homework/:id') @HttpCode(204) @RequireModule('homework') @Require('homework.write')
  async deleteHomework(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> {
    await this.learning.deleteHomework(t, u, id);
  }

  @Get('exams') @RequireModule('exams') @Require('exams.read')
  exams(@Tenant() t: TenantCtx, @Query(new ZodPipe(ClassFilter)) q: z.infer<typeof ClassFilter>): Promise<ExamRow[]> {
    return this.learning.exams(t, q.classId);
  }

  @Post('exams') @RequireModule('exams') @Require('exams.write')
  createExam(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(ExamCreate)) b: ExamCreate): Promise<ExamRow> {
    return this.learning.createExam(t, u, b);
  }

  @Put('exams/:id') @RequireModule('exams') @Require('exams.write')
  updateExam(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(ExamCreate)) b: ExamCreate): Promise<ExamRow> {
    return this.learning.updateExam(t, u, id, b);
  }

  @Post('exams/:id/reopen') @HttpCode(200) @RequireModule('exams') @Require('exams.publish')
  reopen(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Reopen)) b: z.infer<typeof Reopen>): Promise<ExamRow> {
    return this.learning.reopenExam(t, u, id, b.note);
  }

  @Get('exams/:id/marks') @RequireModule('exams') @Require('exams.read')
  marks(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<ExamMarksView> {
    return this.learning.marksView(t, id);
  }

  @Put('exams/:id/marks') @RequireModule('exams') @Require('exams.write')
  putMarks(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(ExamMarksPut)) b: ExamMarksPut): Promise<ExamMarksView> {
    return this.learning.putMarks(t, u, id, b);
  }

  @Get('exams/:id/results') @RequireModule('exams') @Require('exams.read')
  results(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<ExamResults> {
    return this.learning.results(t, id);
  }

  @Post('exams/:id/publish') @HttpCode(200) @RequireModule('exams') @Require('exams.publish')
  publish(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<{ families: number; exam: ExamRow }> {
    return this.learning.publishExam(t, u, id);
  }

  @Delete('exams/:id') @HttpCode(204) @RequireModule('exams') @Require('exams.write')
  async deleteExam(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> {
    await this.learning.deleteExam(t, u, id);
  }
}

@Controller('v1')
@Core()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('staff') @Require('staff.read')
  staff(@Tenant() t: TenantCtx, @Query(new ZodPipe(Q)) q: z.infer<typeof Q>): Promise<StaffRow[]> {
    return this.people.staff(t, q);
  }

  @Post('staff') @Require('staff.write')
  createStaff(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(StaffCreate)) b: StaffCreate): Promise<StaffRow> {
    return this.people.createStaff(t, u, b);
  }

  @Patch('staff/:id') @Require('staff.write')
  patchStaff(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(StaffPatch)) b: StaffPatch): Promise<StaffRow> {
    return this.people.patchStaff(t, u, id, b);
  }

  @Get('admissions') @RequireModule('people.admissions') @Require('admissions.read')
  enquiries(@Tenant() t: TenantCtx): Promise<EnquiryRow[]> {
    return this.people.enquiries(t);
  }

  @Post('admissions') @RequireModule('people.admissions') @Require('admissions.write')
  createEnquiry(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(EnquiryCreate)) b: EnquiryCreate): Promise<EnquiryRow> {
    return this.people.createEnquiry(t, u, b);
  }

  @Patch('admissions/:id') @RequireModule('people.admissions') @Require('admissions.write')
  patchEnquiry(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(EnquiryPatch)) b: EnquiryPatch): Promise<EnquiryRow> {
    return this.people.patchEnquiry(t, u, id, b);
  }

  @Post('admissions/:id/enrol') @RequireModule('people.admissions') @HttpCode(200) @Require('admissions.write', 'students.write')
  enrol(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(EnquiryEnrol)) b: EnquiryEnrol): Promise<StudentDetail> {
    return this.people.enrol(t, u, id, b);
  }

  @Get('roles') @Require('staff.read')
  roles(@Tenant() t: TenantCtx): Promise<RoleRow[]> {
    return this.people.roles(t);
  }

  // Roles are made and changed only from the console (Gradeon); the school sees them and, if allowed, puts its staff into them.
}

@Controller('v1')
@Core()
export class OfficeController {
  constructor(private readonly office: OfficeService) {}

  @Get('fees/invoice-list') @RequireModule('fees') @Require('fees.read')
  invoiceList(@Tenant() t: TenantCtx, @Query(new ZodPipe(InvoiceListQuery)) q: InvoiceListQuery): Promise<Paged<InvoiceListRow> & { summary: InvoiceListSummary }> {
    return this.office.invoiceList(t, q);
  }

  @Get('fees/receipts') @RequireModule('fees') @Require('fees.read')
  receipts(@Tenant() t: TenantCtx, @Query(new ZodPipe(Q)) q: z.infer<typeof Q>): Promise<ReceiptRow[]> {
    return this.office.receipts(t, q.query);
  }

  @Get('reports') @Require('reports.read')
  reports(): ReportInfo[] {
    return this.office.reportList();
  }

  @Get('reports/:id') @Require('reports.read')
  report(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<ReportData> {
    return this.office.report(t, id);
  }

  @Get('reports/:id/csv') @Require('reports.read') @Header('content-type', 'text/csv; charset=utf-8') @Header('content-disposition', 'attachment; filename="report.csv"')
  async reportCsv(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<string> {
    return this.office.csv(await this.office.report(t, id));
  }

  @Get('messages') @RequireModule('chat') @Require('messages.read')
  threads(@Tenant() t: TenantCtx): Promise<ThreadRow[]> {
    return this.office.threads(t);
  }

  @Post('messages') @RequireModule('chat') @Require('messages.write')
  startThread(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(ThreadCreate)) b: ThreadCreate): Promise<ThreadDetail> {
    return this.office.startThread(t, u, b);
  }

  @Get('messages/:id') @RequireModule('chat') @Require('messages.read')
  thread(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<ThreadDetail> {
    return this.office.thread(t, id);
  }

  @Post('messages/:id/reply') @HttpCode(200) @RequireModule('chat') @Require('messages.write')
  reply(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(ThreadReply)) b: ThreadReply): Promise<ThreadDetail> {
    return this.office.reply(t, u, id, b);
  }

  @Patch('messages/:id') @RequireModule('chat') @Require('messages.write')
  patchThread(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(ThreadPatch)) b: ThreadPatch): Promise<ThreadDetail> {
    return this.office.patchThread(t, u, id, b);
  }

  @Get('events') @RequireModule('events') @Require('events.read')
  events(@Tenant() t: TenantCtx): Promise<EventRow[]> {
    return this.office.events(t);
  }

  @Post('events') @RequireModule('events') @Require('events.write')
  createEvent(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(EventSave)) b: EventSave): Promise<EventRow> {
    return this.office.saveEvent(t, u, null, b);
  }

  @Put('events/:id') @RequireModule('events') @Require('events.write')
  saveEvent(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(EventSave)) b: EventSave): Promise<EventRow> {
    return this.office.saveEvent(t, u, id, b);
  }

  @Delete('events/:id') @HttpCode(204) @RequireModule('events') @Require('events.write')
  async deleteEvent(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> {
    await this.office.deleteEvent(t, u, id);
  }

  @Get('privacy/requests') @Require('settings.read')
  dataRequests(@Tenant() t: TenantCtx): Promise<DataRequestRow[]> {
    return this.office.dataRequests(t);
  }

  @Post('privacy/requests') @Require('privacy.manage')
  createDataRequest(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(DataRequestCreate)) b: DataRequestCreate): Promise<DataRequestRow> {
    return this.office.createDataRequest(t, u, b);
  }

  @Post('privacy/requests/:id/decision') @HttpCode(200) @Require('privacy.manage')
  decideDataRequest(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(DataRequestDecision)) b: DataRequestDecision): Promise<DataRequestRow> {
    return this.office.decideDataRequest(t, u, id, b);
  }
}
