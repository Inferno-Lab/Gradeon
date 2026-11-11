import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import {
  AlbumInput, BookInput, BusPosition, TripDelay, TripMark, TripStart, BusRouteInput, FILE_KINDS, FileStart, IssueInput, LeaverInput, NewYearInput, PhotoTags, PromotionInput, RefundRequest, RiderInput,
  type AlbumRow, type BookRow, type BusRouteRow, type FileRow, type FileUpload, type LibraryView, type LoanRow, type OnlinePaymentRow, type PhotoRow, type PromotionPreview,
  type ReconRow, type RefundRow, type ReservationRow, type SchoolChannels, type TransportView, type YearView, CAPABILITY_LABELS, GiveBack, CancelReservation } from '@gradeon/contracts';
import { ApiError, ZodPipe, forbidden } from '@gradeon/nest-kit';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Core, CurrentUser, Public, Require, RequireModule } from '../auth/guards.js';
import { NoTenant, Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { DocumentsService } from './documents.service.js';
import { FamilyService } from './family.service.js';
import { FilesService } from './files.service.js';
import { GalleryService } from './gallery.service.js';
import { HubService } from './hub.service.js';
import { LibraryService } from './library.service.js';
import { PaymentsService } from './payments.service.js';
import { SettingsService } from './support.js';
import { TransportService } from './transport.service.js';
import { YearService } from './year.service.js';

const sendPdf = (reply: FastifyReply, doc: { name: string; data: Buffer }) => {
  void reply.type('application/pdf').header('content-disposition', `inline; filename="${doc.name.replace(/"/g, '')}"`).send(doc.data);
};
const ListFiles = z.object({ kind: z.enum(FILE_KINDS), owner: z.string().min(1).max(120) });
// A declined refund always says why.
const RefundDecide = z.object({ approve: z.boolean(), note: z.string().trim().max(300).default('') }).refine((b) => b.approve || b.note.length >= 3, { message: 'Say why', path: ['note'] });
const Sorted = z.object({ note: z.string().trim().min(3, 'Say what was done').max(300) });
const Search = z.object({ q: z.string().max(80).default('') });

/** Uploads and downloads for staff and families alike: what each may touch is checked per kind (FilesService). */
const PhotoReport = z.object({ reason: z.string().trim().min(3, 'Say what is wrong').max(300) });
const Resolve = z.object({ remove: z.boolean() });

@Controller('v1/files')
@Core()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post() @HttpCode(200)
  start(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(FileStart)) b: FileStart): Promise<FileUpload> { return this.files.start(t, u, b); }

  @Post(':id/done') @HttpCode(200)
  done(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<FileRow> { return this.files.done(t, u.id, id); }

  @Get(':id/url')
  async url(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Query('download') dl?: string): Promise<{ url: string }> {
    return { url: await this.files.url(t, u, id, dl === '1') };
  }

  @Get()
  async list(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Query(new ZodPipe(ListFiles)) q: z.infer<typeof ListFiles>): Promise<FileRow[]> {
    const rows = await this.files.list(t, q.kind, [q.owner]);
    // Reading the list needs the same right as reading a file in it.
    if (rows[0]) await this.files.url(t, u, rows[0].id).catch((e: Error) => { if (e instanceof ApiError && e.getStatus() === 403) throw e; });
    return rows;
  }

  @Delete(':id') @HttpCode(204)
  remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.files.remove(t, u, id); }
}

/** The school's logo, for its sign-in pages before anyone signs in. */
@Controller('v1/school')
export class SchoolLogoController {
  constructor(private readonly files: FilesService, private readonly settings: SettingsService) {}

  @Public() @Core() @Get('logo')
  async logo(@Tenant() t: TenantCtx, @Res() reply: FastifyReply): Promise<void> {
    const id = await this.settings.value<string>(t, 'brand.logoFileId', '');
    if (!id) { void reply.code(404).send({ code: 'not_found', message: 'This school has no logo image.' }); return; }
    void reply.redirect(await this.files.url(t, null, id), 302);
  }
}

@Controller('v1/settings/channels')
@Core()
export class ChannelsController {
  constructor(private readonly hubs: HubService) {}

  /** Which channels reach the school's families and through what: read-only (Gradeon sets them up in the console). */
  @Get() @Require('settings.read')
  async channels(@Tenant() t: TenantCtx): Promise<SchoolChannels> {
    const caps = ['sms', 'whatsapp', 'email', 'push', 'payments', 'storage', 'maps'] as const;
    return { channels: await Promise.all(caps.map(async (c) => ({ capability: c, label: CAPABILITY_LABELS[c], ...(await this.hubs.hub.describe(c, t.info.id, t.info.slug)) }))) };
  }
}

@Controller('v1/fees')
@RequireModule('fees')
export class FeesOnlineController {
  constructor(private readonly payments: PaymentsService, private readonly docs: DocumentsService) {}

  @Get('online') @RequireModule('fees.onlinePayment') @Require('fees.read')
  online(@Tenant() t: TenantCtx): Promise<OnlinePaymentRow[]> { return this.payments.online(t); }

  @Get('refunds') @RequireModule('fees.refunds') @Require('fees.read')
  refunds(@Tenant() t: TenantCtx): Promise<RefundRow[]> { return this.payments.refunds(t); }

  @Post('refunds') @RequireModule('fees.refunds') @HttpCode(200) @Require('fees.refund')
  refund(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(RefundRequest)) b: RefundRequest): Promise<RefundRow> {
    return this.payments.requestRefund(t, u, b.paymentId, b.amount, b.reason);
  }

  @Post('refunds/:id/decide') @RequireModule('fees.refunds') @HttpCode(200) @Require('fees.refund')
  decide(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(RefundDecide)) b: z.infer<typeof RefundDecide>): Promise<RefundRow> {
    return this.payments.decideRefund(t, u, id, b.approve, b.note);
  }

  @Get('reconciliation') @RequireModule('fees.onlinePayment') @Require('fees.read')
  recon(@Tenant() t: TenantCtx): Promise<ReconRow[]> { return this.payments.reconciliation(t); }

  @Post('reconciliation/:id/resolve') @RequireModule('fees.onlinePayment') @HttpCode(204) @Require('fees.collect')
  resolve(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Sorted)) b: z.infer<typeof Sorted>): Promise<void> { return this.payments.resolveRecon(t, u, id, b.note); }

  @Get('payments/:id/receipt.pdf') @Require('fees.read')
  async receipt(@Tenant() t: TenantCtx, @Param('id') id: string, @Res() reply: FastifyReply): Promise<void> { sendPdf(reply, await this.docs.receipt(t, id, null)); }
}

@Controller('v1/exams')
@RequireModule('exams')
export class ReportCardsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get(':id/report-cards/:student') @Require('exams.read')
  async card(@Tenant() t: TenantCtx, @Param('id') id: string, @Param('student') student: string, @Res() reply: FastifyReply): Promise<void> {
    sendPdf(reply, await this.docs.reportCard(t, id, student, null));
  }
}

@Controller('v1/library')
@RequireModule('library')
export class LibraryController {
  constructor(private readonly lib: LibraryService) {}

  @Get() @Require('library.read')
  view(@Tenant() t: TenantCtx): Promise<LibraryView> { return this.lib.view(t); }

  @Post('books') @HttpCode(200) @Require('library.write')
  add(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(BookInput)) b: BookInput): Promise<BookRow> { return this.lib.saveBook(t, u, b); }

  @Put('books/:id') @Require('library.write')
  save(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(BookInput)) b: BookInput): Promise<BookRow> { return this.lib.saveBook(t, u, b, id); }

  @Delete('books/:id') @HttpCode(204) @Require('library.write')
  remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.lib.deleteBook(t, u, id); }

  @Post('loans') @HttpCode(200) @Require('library.write')
  issue(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(IssueInput)) b: IssueInput): Promise<LoanRow> { return this.lib.issue(t, u, b); }

  @Post('loans/:id/return') @HttpCode(200) @Require('library.write')
  giveBack(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(GiveBack)) b: GiveBack): Promise<{ fine: number; billed: boolean }> { return this.lib.giveBack(t, u, id, b); }

  @Post('loans/:id/renew') @HttpCode(200) @Require('library.write')
  renew(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<LoanRow> { return this.lib.renewAtDesk(t, u, id); }

  @Post('reservations/:id/cancel') @HttpCode(204) @Require('library.write')
  cancel(@Tenant() t: TenantCtx, @Param('id') id: string, @Body(new ZodPipe(CancelReservation)) b: { reason: string }): Promise<void> { return this.lib.cancelReservation(t, id, null, b.reason); }
}

@Controller('v1/transport')
@RequireModule('transport')
export class TransportController {
  constructor(private readonly tr: TransportService) {}

  @Get() @Require('transport.read')
  view(@Tenant() t: TenantCtx): Promise<TransportView> { return this.tr.view(t); }

  @Get('places') @Require('transport.write')
  places(@Tenant() t: TenantCtx, @Query(new ZodPipe(z.object({ q: z.string().trim().min(3).max(120) }))) q: { q: string }) { return this.tr.places(t, q.q); }

  @Get('routes/:id/map') @Require('transport.read')
  routeMap(@Tenant() t: TenantCtx, @Param('id') id: string) { return this.tr.routeMap(t, id); }

  @Post('routes/:id/bill') @HttpCode(200) @RequireModule('fees') @Require('fees.collect')
  bill(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ title: z.string().trim().min(3, 'Name the fee').max(80), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the due date') }))) b: { title: string; dueOn: string }) {
    return this.tr.billRiders(t, u, id, b);
  }

  @Post('routes') @RequireModule('transport.routes') @HttpCode(200) @Require('transport.write')
  add(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(BusRouteInput)) b: BusRouteInput): Promise<BusRouteRow> { return this.tr.saveRoute(t, u, b); }

  @Put('routes/:id') @RequireModule('transport.routes') @Require('transport.write')
  save(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(BusRouteInput)) b: BusRouteInput): Promise<BusRouteRow> { return this.tr.saveRoute(t, u, b, id); }

  @Delete('routes/:id') @RequireModule('transport.routes') @HttpCode(204) @Require('transport.write')
  remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.tr.deleteRoute(t, u, id); }

  @Put('riders') @HttpCode(204) @Require('transport.write')
  rider(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(RiderInput)) b: RiderInput): Promise<void> { return this.tr.setRider(t, u, b); }
}

@Controller('v1/gallery')
@RequireModule('gallery')
export class GalleryController {
  constructor(private readonly g: GalleryService) {}

  @Get() @Require('gallery.read')
  albums(@Tenant() t: TenantCtx): Promise<AlbumRow[]> { return this.g.albums(t); }

  @Post() @HttpCode(200) @Require('gallery.write')
  add(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(AlbumInput)) b: AlbumInput): Promise<AlbumRow> { return this.g.saveAlbum(t, u, b); }

  @Put(':id') @Require('gallery.write')
  save(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(AlbumInput)) b: AlbumInput): Promise<AlbumRow> { return this.g.saveAlbum(t, u, b, id); }

  @Post(':id/publish') @HttpCode(200) @Require('gallery.write')
  publish(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ published: z.boolean() }))) b: { published: boolean }): Promise<AlbumRow> {
    return this.g.publish(t, u, id, b.published);
  }

  @Delete(':id') @HttpCode(204) @Require('gallery.write')
  remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.g.deleteAlbum(t, u, id); }

  @Get(':id/photos') @Require('gallery.read')
  photos(@Tenant() t: TenantCtx, @Param('id') id: string): Promise<PhotoRow[]> { return this.g.photos(t, id); }

  @Put('photos/:fileId/tags') @HttpCode(204) @Require('gallery.write')
  tag(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('fileId') id: string, @Body(new ZodPipe(PhotoTags)) b: z.infer<typeof PhotoTags>): Promise<void> { return this.g.tag(t, u, id, b.studentIds); }

  @Get('reports') @Require('gallery.read')
  reports(@Tenant() t: TenantCtx) { return this.g.reports(t); }

  @Post('reports/:id/resolve') @HttpCode(204) @Require('gallery.write')
  resolve(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Resolve)) b: z.infer<typeof Resolve>): Promise<void> { return this.g.resolve(t, u, id, b.remove); }
}

@Controller('v1/year')
@Core()
export class YearController {
  constructor(private readonly y: YearService) {}

  @Get() @Require('students.read')
  view(@Tenant() t: TenantCtx): Promise<YearView> { return this.y.view(t); }

  @Post() @HttpCode(204) @Require('year.manage')
  create(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(NewYearInput)) b: NewYearInput): Promise<void> { return this.y.createYear(t, u, b); }

  @Post(':id/start') @HttpCode(204) @Require('year.manage')
  start(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.y.startYear(t, u, id); }

  @Delete(':id') @HttpCode(204) @Require('year.manage')
  remove(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.y.deleteDraft(t, u, id); }

  @Get('promotion') @Require('year.manage')
  preview(@Tenant() t: TenantCtx): Promise<PromotionPreview> { return this.y.preview(t); }

  @Post('promotion') @HttpCode(200) @Require('year.manage')
  promote(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(PromotionInput)) b: PromotionInput): Promise<{ runId: string; moved: number; left: number }> { return this.y.promote(t, u, b); }

  @Post('promotion/:id/undo') @HttpCode(204) @Require('year.manage')
  undo(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.y.undo(t, u, id); }

  @Post('leavers') @HttpCode(204) @Require('year.manage')
  leaver(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(LeaverInput)) b: LeaverInput): Promise<void> { return this.y.leaver(t, u, b); }

  @Post('leavers/:id/rejoin') @HttpCode(204) @Require('year.manage')
  rejoin(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> { return this.y.rejoin(t, u, id); }
}

const Device = z.object({ token: z.string().min(10).max(4096), platform: z.enum(['android', 'ios', 'web']), appVersion: z.string().max(20).optional() });
const Order = z.object({ studentId: z.string().min(1) });
const Reserve = z.object({ studentId: z.string().min(1) });

/** What the app adds for Phase 4: phones for notifications, paying online, documents, library, transport and the gallery. */
@Controller('v1/f')
@Core()
export class FamilyCampusController {
  constructor(
    private readonly f: FamilyService,
    private readonly payments: PaymentsService,
    private readonly docs: DocumentsService,
    private readonly lib: LibraryService,
    private readonly tr: TransportService,
    private readonly g: GalleryService,
  ) {}

  /** The children a parent may see; null for staff (who see what their permissions allow). */
  private async kids(t: TenantCtx, u: AuthedUser): Promise<string[] | null> {
    const w = await this.f.who(t, u);
    return w.kind === 'staff' ? null : w.children;
  }

  private async mine(t: TenantCtx, u: AuthedUser, studentId: string): Promise<void> {
    const k = await this.kids(t, u);
    if (k && !k.includes(studentId)) throw forbidden('That student is not yours to look at.');
  }

  @Post('devices') @HttpCode(204)
  async device(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(Device)) b: z.infer<typeof Device>): Promise<void> {
    await t.pool.query(
      `insert into devices (id, user_id, platform, token, app_version) values ('dev_' || substr(md5($3), 1, 16), $1, $2, $3, $4)
       on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version, last_seen = now()`, [u.id, b.platform, b.token, b.appVersion ?? null]);
  }

  @Delete('devices/:token') @HttpCode(204)
  async forget(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('token') token: string): Promise<void> {
    await t.pool.query('delete from devices where token = $1 and user_id = $2', [token, u.id]);
  }

  @Post('fees/:id/order') @RequireModule('fees.onlinePayment') @HttpCode(200)
  async order(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Order)) b: z.infer<typeof Order>) {
    await this.mine(t, u, b.studentId);
    return this.payments.order(t, u, id, b.studentId);
  }

  @Get('orders/:id') @RequireModule('fees.onlinePayment')
  async orderStatus(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) {
    return this.payments.orderStatus(t, id, await this.kids(t, u));
  }

  @Get('receipts/:id/pdf') @RequireModule('fees')
  async receipt(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    sendPdf(reply, await this.docs.receipt(t, id, await this.kids(t, u)));
  }

  @Get('results/:examId/:studentId/pdf') @RequireModule('exams.resultsInApp')
  async reportCard(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('examId') e: string, @Param('studentId') s: string, @Res() reply: FastifyReply): Promise<void> {
    sendPdf(reply, await this.docs.reportCard(t, e, s, (await this.kids(t, u)) ?? [s]));
  }

  @Get('library/catalogue') @RequireModule('library')
  catalogue(@Tenant() t: TenantCtx, @Query(new ZodPipe(Search)) q: z.infer<typeof Search>): Promise<BookRow[]> { return this.lib.books(t, q.q); }

  @Get('library/mine') @RequireModule('library')
  async mineLib(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<{ loans: LoanRow[]; reservations: ReservationRow[] }> {
    const k = (await this.kids(t, u)) ?? [];
    return { loans: (await this.lib.loans(t, k)).filter((l) => !l.returnedOn), reservations: await this.lib.reservations(t, k) };
  }

  @Post('library/books/:id/reserve') @RequireModule('library.reservations') @HttpCode(200)
  async reserve(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(Reserve)) b: z.infer<typeof Reserve>): Promise<ReservationRow> {
    await this.mine(t, u, b.studentId);
    return this.lib.reserve(t, id, b.studentId);
  }

  @Post('library/loans/:id/renew') @RequireModule('library.reservations') @HttpCode(200)
  async renewLoan(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<LoanRow> {
    return this.lib.renew(t, id, (await this.kids(t, u)) ?? []);
  }

  @Delete('library/reservations/:id') @RequireModule('library.reservations') @HttpCode(204)
  async unreserve(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<void> {
    return this.lib.cancelReservation(t, id, await this.kids(t, u));
  }

  @Get('students/:id/bus') @RequireModule('transport')
  async bus(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) {
    await this.mine(t, u, id);
    return this.tr.forStudent(t, id);
  }

  /** The bus driver's screen: their routes today, trips, stops with riders. */
  @Get('driver/day') @RequireModule('transport.liveBus')
  driverDay(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser) { return this.tr.driverDay(t, u); }

  @Post('driver/trips') @RequireModule('transport.liveBus') @HttpCode(200)
  startTrip(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(TripStart)) b: z.infer<typeof TripStart>) { return this.tr.startTrip(t, u, b.routeId, b.kind); }

  @Post('driver/trips/:id/end') @RequireModule('transport.liveBus') @HttpCode(200)
  endTrip(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string) { return this.tr.endTrip(t, u, id); }

  @Post('driver/trips/:id/position') @RequireModule('transport.liveBus') @HttpCode(200)
  tripPosition(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(BusPosition)) b: z.infer<typeof BusPosition>) { return this.tr.tripPosition(t, u, id, b); }

  @Post('driver/trips/:id/marks') @RequireModule('transport.liveBus') @HttpCode(200)
  mark(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(TripMark)) b: z.infer<typeof TripMark>) { return this.tr.mark(t, u, id, b); }

  @Post('driver/trips/:id/delay') @RequireModule('transport.liveBus') @HttpCode(200)
  delay(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(TripDelay)) b: z.infer<typeof TripDelay>) { return this.tr.delay(t, u, id, b); }

  @Get('albums') @RequireModule('gallery')
  async albums(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser): Promise<AlbumRow[]> {
    const k = await this.kids(t, u);
    if (k === null) return this.g.albums(t);
    const classes = (await t.pool.query<{ class_id: string }>('select distinct class_id from students where id = any($1)', [k])).rows.map((r) => r.class_id);
    return this.g.albums(t, classes);
  }

  @Post('photos/:fileId/report') @RequireModule('gallery') @HttpCode(200)
  async reportPhoto(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('fileId') id: string, @Body(new ZodPipe(PhotoReport)) b: z.infer<typeof PhotoReport>) {
    await this.g.report(t, u, id, b.reason);
    return { ok: true };
  }

  @Get('albums/:id/photos') @RequireModule('gallery')
  async photos(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<PhotoRow[]> {
    const albums = await this.albums(t, u);
    if (!albums.some((a) => a.id === id)) throw forbidden('That album is not shared with you.');
    return this.g.photos(t, id, (await this.kids(t, u)) !== null);
  }
}

const Find = z.object({ code: z.string().trim().toLowerCase().min(2).max(60) });

/** The shared app's school finder: the code a school gives its families (its address name or its own domain) gives back the school. */
@Controller('v1/finder')
@Public()
@NoTenant()
export class FinderController {
  constructor(private readonly hubs: HubService) {}

  @Get()
  async find(@Query(new ZodPipe(Find)) q: z.infer<typeof Find>): Promise<{ slug: string; name: string; shortName: string }> {
    const { rows } = await this.hubs.hub.o.pool.query(
      "select slug, name, short_name from schools where (slug = $1 or (custom_domain <> '' and custom_domain = $1)) and status = 'live' and deleted_at is null", [q.code]);
    if (!rows[0]) throw new ApiError('not_found', 'No school has that code. Check it with the school office.');
    return { slug: rows[0].slug, name: rows[0].name, shortName: rows[0].short_name };
  }
}
