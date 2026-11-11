import type {
  ChangeRequestCreate, ChangeRequestRow, PasswordChange, EventReply, InvoiceDetail, WaiverRequest, ReceiptCancel, SlotCreate, WeekOf, StudentPatch, GuardiansPut, GuardianRow, DataRequestCreate, DataRequestDecision, DataRequestRow, EnquiryCreate, EnquiryEnrol, EnquiryPatch, EnquiryRow, EventRow, EventSave, ExamCreate, ExamMarksPut, ExamMarksView, ExamResults, ExamRow,
  HomeworkCreate, HomeworkDetail, HomeworkMarks, HomeworkRow, InvoiceListQuery, InvoiceListRow, InvoiceListSummary, ReceiptRow, ReportData, ReportInfo, RoleRow, StaffCreate, StaffPatch, StaffRow,
  ThreadCreate, ThreadDetail, ThreadPatch, ThreadReply, ThreadRow,
  AttendanceDayPut, PeriodMarksPut, PeriodRoll, GalleryReportRow, ApprovalDecision, ApprovalKind, ApprovalRow, AssignFee, AttendanceDay, AuditRow, ClassInfo, ContactReveal, CoverRequest, DashboardData, EffectiveConfig, FeeHead, FeeHeadsPut, FeeSummary, ImportResult, InvoiceRow,
  LoginChallenge, LoginRequest, LoginResponse, MessageRequest, NoticeCreate, NoticeRow, Paged, PaymentCreate, SearchHit, SessionUser, SettingsResponse, ShellData, SlotPatch, StudentCreate, StudentDetail,
  StudentRow, StudentSummary, StudentViews, TeacherLoad, TeacherOption, TimetableView, TokenPair, VerifyRequest,
  Activation, ImportBatchRow, LetterRow, SetupSection, UploadCreate, UploadRow,
  AlbumInput, AlbumRow, BookInput, BookRow, BusRouteInput, BusRouteRow, FileKind, FileRow, FileStart, FileUpload, GiveBack, IssueInput, LeaverInput, LibraryView, LoanRow, NewYearInput, OnlinePaymentRow, PhotoRow,
  PromotionInput, PromotionPreview, ReconRow, RefundRequest, RefundRow, RiderInput, SchoolChannels, TransportView, YearView,
} from '@gradeon/contracts';
import type { Http, Query } from './http';

import type { SchoolBrand } from '@gradeon/contracts';
export type BrandInfo = SchoolBrand;

export type StudentListQuery = {
  query?: string; classId?: string; house?: string; feeStatus?: 'paid' | 'due' | 'overdue'; attendance?: 'low' | 'perfect'; newThisYear?: boolean;
  sort?: 'name' | 'class' | 'attendance' | 'due'; dir?: 'asc' | 'desc'; page?: number; limit?: number;
};

/** Every call the school admin and apps make, typed from the shared contracts. */
export function schoolApi(h: Http) {
  return {
    brand: () => h.get<BrandInfo>('/v1/brand'),
    login: (b: LoginRequest) => h.post<LoginResponse>('/v1/auth/login', b),
    verify: (b: VerifyRequest) => h.post<TokenPair>('/v1/auth/verify', b),
    resetStart: (identifier: string) => h.post<LoginChallenge>('/v1/auth/reset/start', { identifier }),
    resetFinish: (b: { challengeId: string; code: string; password: string }) => h.post<void>('/v1/auth/reset/finish', b),
    logout: () => h.post<void>('/v1/auth/logout'),
    logoutAll: () => h.post<void>('/v1/auth/logout-all'),
    changePassword: (b: PasswordChange) => h.post<void>('/v1/auth/password', b),
    /** The signed-in person's own choices (USER_PREFS), kept with their account. */
    prefs: {
      get: () => h.get<Record<string, unknown>>('/v1/me/prefs'),
      put: (key: string, value: unknown) => h.put<void>('/v1/me/prefs', { key, value }),
    },
    me: () => h.get<SessionUser>('/v1/me'),
    config: () => h.get<EffectiveConfig>('/v1/config'),
    shell: () => h.get<ShellData>('/v1/shell'),
    dashboard: (days = 6) => h.get<DashboardData>('/v1/dashboard', { days }),
    search: (q: string) => h.get<SearchHit[]>('/v1/search', { q }),
    classes: () => h.get<ClassInfo[]>('/v1/classes'),
    students: {
      appAccount: (id: string, b: { phone?: string; email?: string }) => h.post<{ sent: boolean }>(`/v1/students/${id}/app-account`, b),
      update: (id: string, b: StudentPatch) => h.patch<StudentDetail>(`/v1/students/${id}`, b),
      setGuardians: (id: string, b: GuardiansPut) => h.put<GuardianRow[]>(`/v1/students/${id}/guardians`, b),
      list: (q: StudentListQuery) => h.get<Paged<StudentRow>>('/v1/students', q as Query),
      summary: (q: Pick<StudentListQuery, 'classId' | 'house'>) => h.get<StudentSummary>('/v1/students/summary', q as Query),
      views: () => h.get<StudentViews>('/v1/students/views'),
      detail: (id: string) => h.get<StudentDetail>(`/v1/students/${id}`),
      reveal: (id: string) => h.post<ContactReveal>(`/v1/students/${id}/reveal`),
      create: (b: StudentCreate) => h.post<StudentDetail>('/v1/students', b),
      import: (csv: string) => h.post<ImportResult>('/v1/students/import', { csv }),
      template: () => h.blob('/v1/students/template'),
      exportCsv: (ids?: string[]) => h.text('/v1/students/export', ids?.length ? { ids: ids.join(',') } : undefined),
      message: (b: MessageRequest) => h.post<{ sent: number }>('/v1/students/message', b),
      assignFee: (b: AssignFee) => h.post<{ created: number }>('/v1/students/assign-fee', b),
      invite: (ids: string[]) => h.post<{ sent: number }>('/v1/students/invite', { ids }),
    },
    attendance: {
      day: (classId: string, date: string) => h.get<AttendanceDay>('/v1/attendance/day', { classId, date }),
      save: (b: AttendanceDayPut) => h.put<AttendanceDay>('/v1/attendance/day', b),
      remind: () => h.post<{ sent: number; classes: string[] }>('/v1/attendance/remind'),
      periods: (classId: string, date: string) => h.get<PeriodRoll>('/v1/attendance/periods', { classId, date }),
      savePeriod: (b: PeriodMarksPut) => h.put<PeriodRoll>('/v1/attendance/periods', b),
    },
    fees: {
      summary: (period: 'month' | 'term' | 'year' = 'month') => h.get<FeeSummary>('/v1/fees/summary', { period }),
      heads: () => h.get<FeeHead[]>('/v1/fees/heads'),
      setHeads: (b: FeeHeadsPut) => h.put<FeeHead[]>('/v1/fees/heads', b),
      invoices: (studentId: string) => h.get<InvoiceRow[]>('/v1/fees/invoices', { studentId }),
      pay: (b: PaymentCreate) => h.post<{ receiptNo: string; amount: number; outstanding: number }>('/v1/fees/payments', b),
      remind: (ids: string[]) => h.post<{ sent: number }>('/v1/fees/reminders', { ids }),
      remindOverdue: () => h.post<{ sent: number }>('/v1/fees/reminders', { overdue: true }),
    },
    approvals: {
      needsYou: () => h.get<ApprovalRow[]>('/v1/needs-you'),
      decide: (id: string, b: ApprovalDecision) => h.post<ApprovalRow>(`/v1/approvals/${id}/decision`, b),
      list: (view: 'waiting' | 'sent' | 'decided' = 'waiting', kind?: ApprovalKind) => h.get<ApprovalRow[]>('/v1/approvals', { view, ...(kind ? { kind } : {}) }),
    },
    notices: {
      list: () => h.get<NoticeRow[]>('/v1/notices'),
      create: (b: NoticeCreate) => h.post<NoticeRow>('/v1/notices', b),
      update: (id: string, b: NoticeCreate & { tellAgain?: boolean }) => h.put<NoticeRow>(`/v1/notices/${id}`, b),
      remove: (id: string) => h.del<void>(`/v1/notices/${id}`),
      notAcknowledged: (id: string) => h.get<{ id: string; name: string; phone: string | null }[]>(`/v1/notices/${id}/not-acknowledged`),
    },
    timetable: {
      view: (classId: string) => h.get<TimetableView>('/v1/timetable', { classId }),
      loads: (classId: string) => h.get<TeacherLoad[]>('/v1/timetable/loads', { classId }),
      teachers: (slotId: string) => h.get<TeacherOption[]>('/v1/timetable/teachers', { slotId }),
      patch: (id: string, b: SlotPatch) => h.patch<void>(`/v1/timetable/slots/${id}`, b),
      place: (b: SlotCreate) => h.post<{ id: string }>('/v1/timetable/slots', b),
      free: (id: string) => h.del<void>(`/v1/timetable/slots/${id}`),
      week: (by: { teacherId: string } | { room: string }) => h.get<WeekOf>('/v1/timetable/week', by as Query),
      rooms: () => h.get<string[]>('/v1/timetable/rooms'),
      cover: (b: CoverRequest) => h.post<void>('/v1/timetable/cover', b),
      publish: () => h.post<{ families: number; teachers: number; version: number }>('/v1/timetable/publish'),
    },
    subjects: () => h.get<{ id: string; name: string; color: string }[]>('/v1/subjects'),
    homework: {
      list: (q: { classId?: string; subjectId?: string } = {}) => h.get<HomeworkRow[]>('/v1/homework', q as Query),
      detail: (id: string) => h.get<HomeworkDetail>(`/v1/homework/${id}`),
      create: (b: HomeworkCreate) => h.post<HomeworkDetail>('/v1/homework', b),
      update: (id: string, b: HomeworkCreate) => h.put<HomeworkDetail>(`/v1/homework/${id}`, b),
      mark: (id: string, b: HomeworkMarks) => h.put<HomeworkDetail>(`/v1/homework/${id}/marks`, b),
      remove: (id: string) => h.del<void>(`/v1/homework/${id}`),
    },
    exams: {
      list: (classId?: string) => h.get<ExamRow[]>('/v1/exams', classId ? { classId } : undefined),
      create: (b: ExamCreate) => h.post<ExamRow>('/v1/exams', b),
      update: (id: string, b: ExamCreate) => h.put<ExamRow>(`/v1/exams/${id}`, b),
      reopen: (id: string, note: string) => h.post<ExamRow>(`/v1/exams/${id}/reopen`, { note }),
      marks: (id: string) => h.get<ExamMarksView>(`/v1/exams/${id}/marks`),
      putMarks: (id: string, b: ExamMarksPut) => h.put<ExamMarksView>(`/v1/exams/${id}/marks`, b),
      results: (id: string) => h.get<ExamResults>(`/v1/exams/${id}/results`),
      publish: (id: string) => h.post<{ families: number; exam: ExamRow }>(`/v1/exams/${id}/publish`),
      remove: (id: string) => h.del<void>(`/v1/exams/${id}`),
    },
    staff: {
      list: (query?: string) => h.get<StaffRow[]>('/v1/staff', query ? { query } : undefined),
      create: (b: StaffCreate) => h.post<StaffRow>('/v1/staff', b),
      patch: (id: string, b: StaffPatch) => h.patch<StaffRow>(`/v1/staff/${id}`, b),
    },
    admissions: {
      list: () => h.get<EnquiryRow[]>('/v1/admissions'),
      create: (b: EnquiryCreate) => h.post<EnquiryRow>('/v1/admissions', b),
      patch: (id: string, b: EnquiryPatch) => h.patch<EnquiryRow>(`/v1/admissions/${id}`, b),
      enrol: (id: string, b: EnquiryEnrol) => h.post<StudentDetail>(`/v1/admissions/${id}/enrol`, b),
    },
    roles: {
      list: () => h.get<RoleRow[]>('/v1/roles'),
    },
    invoices: {
      list: (q: Partial<InvoiceListQuery>) => h.get<Paged<InvoiceListRow> & { summary: InvoiceListSummary }>('/v1/fees/invoice-list', q as Query),
      receipts: (query?: string, page = 1) => h.get<Paged<ReceiptRow>>('/v1/fees/receipts', { ...(query ? { query } : {}), page }),
      one: (id: string) => h.get<InvoiceDetail>(`/v1/fees/invoice/${id}`),
      waive: (id: string, b: WaiverRequest) => h.post<InvoiceDetail>(`/v1/fees/invoice/${id}/waive`, b),
      cancelReceipt: (id: string, b: ReceiptCancel) => h.post<InvoiceDetail>(`/v1/fees/receipts/${id}/cancel`, b),
      exportCsv: (q: Partial<InvoiceListQuery>) => h.text('/v1/fees/invoice-list/export', q as Query),
    },
    reports: {
      list: () => h.get<ReportInfo[]>('/v1/reports'),
      get: (id: string) => h.get<ReportData>(`/v1/reports/${id}`),
      csv: (id: string) => h.text(`/v1/reports/${id}/csv`),
    },
    messages: {
      list: () => h.get<ThreadRow[]>('/v1/messages'),
      get: (id: string) => h.get<ThreadDetail>(`/v1/messages/${id}`),
      start: (b: ThreadCreate) => h.post<ThreadDetail>('/v1/messages', b),
      reply: (id: string, b: ThreadReply) => h.post<ThreadDetail>(`/v1/messages/${id}/reply`, b),
      patch: (id: string, b: ThreadPatch) => h.patch<ThreadDetail>(`/v1/messages/${id}`, b),
      /** Colleagues who may write to families, to hand a conversation to. */
      staff: () => h.get<{ id: string; name: string }[]>('/v1/messages/staff'),
    },
    events: {
      list: () => h.get<EventRow[]>('/v1/events'),
      replies: (id: string) => h.get<EventReply[]>(`/v1/events/${id}/replies`),
      create: (b: EventSave) => h.post<EventRow>('/v1/events', b),
      save: (id: string, b: EventSave) => h.put<EventRow>(`/v1/events/${id}`, b),
      remove: (id: string) => h.del<void>(`/v1/events/${id}`),
    },
    setup: {
      sections: () => h.get<SetupSection[]>('/v1/setup'),
      save: (kind: string, row: Record<string, string>) => h.put<SetupSection[]>(`/v1/setup/${kind}`, { row }),
      remove: (kind: string, id: string) => h.del<SetupSection[]>(`/v1/setup/${kind}/${encodeURIComponent(id)}`),
      applyFee: (id: string) => h.post<{ created: number }>(`/v1/setup/fee_structures/${id}/apply`),
    },
    movingIn: {
      uploads: () => h.get<UploadRow[]>('/v1/moving-in/uploads'),
      batches: () => h.get<ImportBatchRow[]>('/v1/moving-in/batches'),
      upload: (b: UploadCreate) => h.post<UploadRow[]>('/v1/moving-in/uploads', b),
      activation: () => h.get<Activation>('/v1/moving-in/activation'),
      inviteFamilies: (classId?: string) => h.post<{ sent: number }>('/v1/moving-in/families/invite', classId ? { classId } : {}),
      inviteStaff: () => h.post<{ sent: number }>('/v1/moving-in/staff/invite'),
      letters: (classId?: string) => h.get<LetterRow[]>('/v1/moving-in/letters', classId ? { classId } : undefined),
      template: (kind: string) => h.blob(`/v1/moving-in/template/${kind}`),
      exportAll: () => h.blob('/v1/moving-in/export'),
    },
    privacy: {
      requests: () => h.get<DataRequestRow[]>('/v1/privacy/requests'),
      create: (b: DataRequestCreate) => h.post<DataRequestRow>('/v1/privacy/requests', b),
      decide: (id: string, b: DataRequestDecision) => h.post<DataRequestRow>(`/v1/privacy/requests/${id}/decision`, b),
    },
    /** The school asks Gradeon to change its setup. */
    changeRequests: {
      list: () => h.get<ChangeRequestRow[]>('/v1/change-requests'),
      create: (b: ChangeRequestCreate) => h.post<ChangeRequestRow[]>('/v1/change-requests', b),
    },
    settings: {
      get: () => h.get<SettingsResponse>('/v1/settings'),
      audit: () => h.get<AuditRow[]>('/v1/settings/audit'),
      channels: () => h.get<SchoolChannels>('/v1/settings/channels'),
    },
    files: {
      start: (b: FileStart) => h.post<FileUpload>('/v1/files', b),
      done: (id: string) => h.post<FileRow>(`/v1/files/${id}/done`),
      url: (id: string, download = false) => h.get<{ url: string }>(`/v1/files/${id}/url`, download ? { download: '1' } : undefined),
      list: (kind: FileKind, owner: string) => h.get<FileRow[]>('/v1/files', { kind, owner }),
      remove: (id: string) => h.del<void>(`/v1/files/${id}`),
    },
    online: {
      payments: () => h.get<OnlinePaymentRow[]>('/v1/fees/online'),
      refunds: () => h.get<RefundRow[]>('/v1/fees/refunds'),
      refund: (b: RefundRequest) => h.post<RefundRow>('/v1/fees/refunds', b),
      decide: (id: string, approve: boolean, note = '') => h.post<RefundRow>(`/v1/fees/refunds/${id}/decide`, { approve, note }),
      reconciliation: () => h.get<ReconRow[]>('/v1/fees/reconciliation'),
      resolve: (id: string, note: string) => h.post<void>(`/v1/fees/reconciliation/${id}/resolve`, { note }),
      receipt: (paymentId: string) => h.blob(`/v1/fees/payments/${paymentId}/receipt.pdf`),
      reportCard: (examId: string, studentId: string) => h.blob(`/v1/exams/${examId}/report-cards/${studentId}`),
    },
    library: {
      view: () => h.get<LibraryView>('/v1/library'),
      add: (b: BookInput) => h.post<BookRow>('/v1/library/books', b),
      save: (id: string, b: BookInput) => h.put<BookRow>(`/v1/library/books/${id}`, b),
      remove: (id: string) => h.del<void>(`/v1/library/books/${id}`),
      issue: (b: IssueInput) => h.post<LoanRow>('/v1/library/loans', b),
      giveBack: (id: string, b: GiveBack) => h.post<{ fine: number; billed: boolean }>(`/v1/library/loans/${id}/return`, b),
      renew: (id: string) => h.post<LoanRow>(`/v1/library/loans/${id}/renew`),
      cancel: (id: string, reason: string) => h.post<void>(`/v1/library/reservations/${id}/cancel`, { reason }),
    },
    transport: {
      view: () => h.get<TransportView>('/v1/transport'),
      add: (b: BusRouteInput) => h.post<BusRouteRow>('/v1/transport/routes', b),
      save: (id: string, b: BusRouteInput) => h.put<BusRouteRow>(`/v1/transport/routes/${id}`, b),
      remove: (id: string) => h.del<void>(`/v1/transport/routes/${id}`),
      rider: (b: RiderInput) => h.put<void>('/v1/transport/riders', b),
      places: (q: string) => h.get<{ label: string; lat: number; lng: number }[]>('/v1/transport/places', { q }),
      map: (routeId: string) => h.get<{ url: string | null }>(`/v1/transport/routes/${routeId}/map`),
      bill: (routeId: string, b: { title: string; dueOn: string }) => h.post<{ created: number; skipped: number }>(`/v1/transport/routes/${routeId}/bill`, b),
    },
    gallery: {
      albums: () => h.get<AlbumRow[]>('/v1/gallery'),
      add: (b: AlbumInput) => h.post<AlbumRow>('/v1/gallery', b),
      save: (id: string, b: AlbumInput) => h.put<AlbumRow>(`/v1/gallery/${id}`, b),
      publish: (id: string, published: boolean) => h.post<AlbumRow>(`/v1/gallery/${id}/publish`, { published }),
      remove: (id: string) => h.del<void>(`/v1/gallery/${id}`),
      photos: (id: string) => h.get<PhotoRow[]>(`/v1/gallery/${id}/photos`),
      tag: (fileId: string, studentIds: string[]) => h.put<void>(`/v1/gallery/photos/${fileId}/tags`, { studentIds }),
      reports: () => h.get<GalleryReportRow[]>('/v1/gallery/reports'),
      resolve: (id: string, remove: boolean) => h.post<void>(`/v1/gallery/reports/${id}/resolve`, { remove }),
    },
    year: {
      view: () => h.get<YearView>('/v1/year'),
      create: (b: NewYearInput) => h.post<void>('/v1/year', b),
      start: (id: string) => h.post<void>(`/v1/year/${id}/start`),
      remove: (id: string) => h.del<void>(`/v1/year/${id}`),
      preview: () => h.get<PromotionPreview>('/v1/year/promotion'),
      promote: (b: PromotionInput) => h.post<{ runId: string; moved: number; left: number }>('/v1/year/promotion', b),
      undo: (runId: string) => h.post<void>(`/v1/year/promotion/${runId}/undo`),
      leaver: (b: LeaverInput) => h.post<void>('/v1/year/leavers', b),
      rejoin: (id: string) => h.post<void>(`/v1/year/leavers/${id}/rejoin`),
    },
  };
}

/** Uploads a file straight to storage (the address comes from the API), then tells the API it arrived. */
export async function uploadFile(api: ReturnType<typeof schoolApi>, kind: FileKind, ownerId: string, file: File): Promise<FileRow> {
  const { fileId, upload } = await api.files.start({ kind, ownerId, name: file.name, mime: file.type, bytes: file.size });
  const res = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file });
  if (!res.ok) throw new Error('The upload did not go through. Try again.');
  return api.files.done(fileId);
}

