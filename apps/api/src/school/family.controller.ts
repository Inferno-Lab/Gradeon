import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '@gradeon/nest-kit';
import { CurrentUser, Core, RequireModule } from '../auth/guards.js';
import { Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { FamilyService } from './family.service.js';

const Today = z.object({ students: z.string().default('') });
const Subject = z.object({ subject: z.string().min(1).max(40) });
const Marks = z.object({ subject: z.string().min(1).max(40), values: z.record(z.string(), z.number().min(0).max(200)) });
const Submit = z.object({ studentId: z.string().min(1), fileName: z.string().max(200).optional(), fileIds: z.array(z.string()).max(5).default([]) });
const Grade = z.object({ studentId: z.string().min(1), marks: z.number().int().min(0).max(100), feedback: z.string().max(300).optional() });
const Assign = z.object({ classId: z.string().min(1), subject: z.string().min(1), title: z.string().min(3).max(120), description: z.string().max(1000).optional(), dueOn: z.string().min(10), maxMarks: z.number().int().min(1).max(100).optional() });
const Consent = z.object({ photos: z.boolean().optional() });
const Pay = z.object({ studentId: z.string().min(1), method: z.string().max(20).default('upi') });
const Rsvp = z.object({ status: z.string().min(1).max(10) });
const Notice = z.object({ title: z.string().min(3).max(120), body: z.string().min(3).max(4000), audience: z.string().optional() });
const Send = z.object({ text: z.string().trim().min(1).max(1000) });
const Start = z.object({ teacherId: z.string().min(1) });
const Leave = z.object({ studentId: z.string().min(1), from: z.string().min(10), to: z.string().min(10), reason: z.string().trim().min(2).max(300) });
const Review = z.object({ status: z.string().min(1), note: z.string().max(300).optional() });

/**
 * What the mobile app reads and writes, in the shapes its models already parse. Every route is scoped to the signed-in person:
 * a parent sees their children, a student sees themselves, a teacher sees what their permissions allow.
 */
@Controller('v1/f')
@Core()
export class FamilyController {
  constructor(private readonly f: FamilyService) {}

  @Get('me') me(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.me(t, u); }
  @Post('consent') @HttpCode(200) consent(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(Consent)) b: z.infer<typeof Consent>) { return this.f.consent(t, u, b.photos); }
  @Get('school') school(@Tenant() t: TenantCtx) { return this.f.school(t); }
  @Get('users/:id') userName(@Tenant() t: TenantCtx, @Param('id') id: string) { return this.f.userName(t, id); }

  @Get('students/:id') student(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.student(t, u, id); }
  @Get('classes/:id') schoolClass(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.schoolClass(t, u, id); }
  @Get('classes/:id/students') studentsIn(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.studentsIn(t, u, id); }
  @Get('teachers') teachers(@Tenant() t: TenantCtx) { return this.f.teachers(t); }
  @Get('teachers/:id') teacher(@Tenant() t: TenantCtx, @Param('id') id: string) { return this.f.teacher(t, id); }
  @Get('teachers/:id/classes') classesForTeacher(@Tenant() t: TenantCtx, @Param('id') id: string) { return this.f.classesForTeacher(t, id); }

  @Get('students/:id/attendance') @RequireModule('attendance') attendance(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.attendanceOf(t, u, id); }
  @Get('attendance/today') @RequireModule('attendance') today(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Query(new ZodPipe(Today)) q: z.infer<typeof Today>) { return this.f.today(t, u, q.students.split(',').filter(Boolean).slice(0, 200)); }
  @Post('attendance') @RequireModule('attendance.teacherApp') @HttpCode(200) markToday(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(z.record(z.string(), z.string()))) b: Record<string, string>) { return this.f.markToday(t, u, b); }

  @Get('classes/:id/timetable') @RequireModule('timetable') timetable(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.timetable(t, u, id); }

  @Get('classes/:id/homework') @RequireModule('homework') homework(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.homework(t, u, id); }
  @Get('homework/:id') @RequireModule('homework') homeworkOne(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.homeworkOne(t, u, id); }
  @Post('homework') @RequireModule('homework') @HttpCode(200) assign(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(Assign)) b: z.infer<typeof Assign>) { return this.f.assignHomework(t, u, b); }
  @Post('homework/:id/submissions') @RequireModule('homework.onlineSubmission') @HttpCode(200) submit(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Submit)) b: z.infer<typeof Submit>) { return this.f.submitHomework(t, u, id, b.studentId, b.fileIds); }
  @Post('homework/:id/grades') @RequireModule('homework.grading') @HttpCode(200) grade(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Grade)) b: z.infer<typeof Grade>) { return this.f.gradeHomework(t, u, id, b); }

  @Get('classes/:id/exams') @RequireModule('exams') exams(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.exams(t, u, id); }
  @Get('results/:examId/:studentId') @RequireModule('exams.resultsInApp') result(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('examId') e: string, @Param('studentId') s: string) { return this.f.result(t, u, e, s); }
  @Get('students/:id/results') @RequireModule('exams.resultsInApp') results(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.resultsOf(t, u, id); }
  @Get('classes/:id/marks') @RequireModule('exams') marksDraft(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Query(new ZodPipe(Subject)) q: z.infer<typeof Subject>) { return this.f.marksDraft(t, u, id, q.subject); }
  @Post('classes/:id/marks') @RequireModule('exams') @HttpCode(200) saveMarks(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Marks)) b: z.infer<typeof Marks>) { return this.f.saveMarks(t, u, id, b); }

  @Get('students/:id/fees') @RequireModule('fees') fees(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.feesOf(t, u, id); }
  @Post('fees/:id/pay') @RequireModule('fees.onlinePayment') @HttpCode(200) pay(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Pay)) b: z.infer<typeof Pay>) { return this.f.pay(t, u, id, b); }

  @Get('notices') @RequireModule('notices') notices(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.notices(t, u); }
  @Post('notices') @RequireModule('notices.teacherPosts') @HttpCode(200) postNotice(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(Notice)) b: z.infer<typeof Notice>) { return this.f.postNotice(t, u, b); }
  @Get('events') @RequireModule('events') events(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.events(t, u); }
  @Post('events/:id/rsvp') @RequireModule('events.rsvp') @HttpCode(200) rsvp(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Rsvp)) b: z.infer<typeof Rsvp>) { return this.f.rsvp(t, u, id, b.status); }

  @Get('users/:id/threads') @RequireModule('chat') threads(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.threads(t, u); }
  @Get('users/:id/messages') @RequireModule('chat') inbox(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.inbox(t, u); }
  @Get('threads/:id/messages') @RequireModule('chat') messages(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.messages(t, u, id); }
  @Post('threads/:id/messages') @RequireModule('chat') @HttpCode(200) send(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Send)) b: z.infer<typeof Send>) { return this.f.send(t, u, id, b.text); }
  @Post('threads/:id/read') @RequireModule('chat') @HttpCode(200) read(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.markRead(t, u, id); }
  @Post('threads') @RequireModule('chat.familyChat') @HttpCode(200) start(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(Start)) b: z.infer<typeof Start>) { return this.f.startThread(t, u, b.teacherId); }

  @Get('library/books') @RequireModule('library') books(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.books(t, u); }
  @Post('library/books/:id/renew') @RequireModule('library.reservations') @HttpCode(200) renew(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.renew(t, u, id); }
  @Get('students/:id/transport') @RequireModule('transport') transport(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.transport(t, u, id); }

  @Get('students/:id/leave') leave(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.leave(t, u, id); }
  @Post('leave') @HttpCode(200) applyLeave(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(Leave)) b: z.infer<typeof Leave>) { return this.f.applyLeave(t, u, b); }
  @Post('leave/:id/review') @HttpCode(200) review(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Review)) b: z.infer<typeof Review>) { return this.f.reviewLeave(t, u, id, b); }

  @Get('gallery') @RequireModule('gallery') gallery(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.gallery(t, u); }
  @Get('users/:id/notifications') notifications(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.notifications(t, u); }
  @Post('notifications/:id/dismiss') @HttpCode(200) dismiss(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.f.notificationState(t, u, [id], 'dismissed'); }
  @Post('users/:id/notifications/read') @HttpCode(200) readAll(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.f.readAll(t, u); }
}
