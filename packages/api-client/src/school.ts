import type {
  DataRequestCreate, DataRequestDecision, DataRequestRow, EnquiryCreate, EnquiryEnrol, EnquiryPatch, EnquiryRow, EventRow, EventSave, ExamCreate, ExamMarksPut, ExamMarksView, ExamResults, ExamRow,
  HomeworkCreate, HomeworkDetail, HomeworkMarks, HomeworkRow, InvoiceListQuery, InvoiceListRow, InvoiceListSummary, ReceiptRow, ReportData, ReportInfo, RoleRow, RoleSave, StaffCreate, StaffPatch, StaffRow,
  ThreadCreate, ThreadDetail, ThreadPatch, ThreadReply, ThreadRow,
  AttendanceDayPut, ApprovalDecision, ApprovalRow, AssignFee, AttendanceDay, AuditRow, ClassInfo, ContactReveal, CoverRequest, DashboardData, EffectiveConfig, FeeSummary, ImportResult, InvoiceRow,
  LoginRequest, LoginResponse, MessageRequest, NoticeCreate, NoticeRow, Paged, PaymentCreate, SearchHit, SessionUser, SettingsDoc, SettingsPatch, SettingsResponse, ShellData, SlotPatch, StudentCreate, StudentDetail,
  StudentRow, StudentSummary, StudentViews, TeacherLoad, TeacherOption, TimetableView, TokenPair, VerifyRequest,
} from '@gradeon/contracts';
import type { Http, Query } from './http';

export interface BrandInfo {
  name: string;
  shortName: string;
  color: string;
  logoText: string;
  tagline: string;
  demoMode: boolean;
  language: string;
}

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
    logout: () => h.post<void>('/v1/auth/logout'),
    logoutAll: () => h.post<void>('/v1/auth/logout-all'),
    me: () => h.get<SessionUser>('/v1/me'),
    config: () => h.get<EffectiveConfig>('/v1/config'),
    shell: () => h.get<ShellData>('/v1/shell'),
    dashboard: (days = 6) => h.get<DashboardData>('/v1/dashboard', { days }),
    search: (q: string) => h.get<SearchHit[]>('/v1/search', { q }),
    classes: () => h.get<ClassInfo[]>('/v1/classes'),
    students: {
      list: (q: StudentListQuery) => h.get<Paged<StudentRow>>('/v1/students', q as Query),
      summary: (q: Pick<StudentListQuery, 'classId' | 'house'>) => h.get<StudentSummary>('/v1/students/summary', q as Query),
      views: () => h.get<StudentViews>('/v1/students/views'),
      detail: (id: string) => h.get<StudentDetail>(`/v1/students/${id}`),
      reveal: (id: string) => h.post<ContactReveal>(`/v1/students/${id}/reveal`),
      create: (b: StudentCreate) => h.post<StudentDetail>('/v1/students', b),
      import: (csv: string) => h.post<ImportResult>('/v1/students/import', { csv }),
      exportCsv: (ids?: string[]) => h.text('/v1/students/export', ids?.length ? { ids: ids.join(',') } : undefined),
      message: (b: MessageRequest) => h.post<{ sent: number }>('/v1/students/message', b),
      assignFee: (b: AssignFee) => h.post<{ created: number }>('/v1/students/assign-fee', b),
      invite: (ids: string[]) => h.post<{ sent: number }>('/v1/students/invite', { ids }),
    },
    attendance: {
      day: (classId: string, date: string) => h.get<AttendanceDay>('/v1/attendance/day', { classId, date }),
      save: (b: AttendanceDayPut) => h.put<AttendanceDay>('/v1/attendance/day', b),
      remind: () => h.post<{ sent: number; classes: string[] }>('/v1/attendance/remind'),
    },
    fees: {
      summary: () => h.get<FeeSummary>('/v1/fees/summary'),
      invoices: (studentId: string) => h.get<InvoiceRow[]>('/v1/fees/invoices', { studentId }),
      pay: (b: PaymentCreate) => h.post<{ receiptNo: string; amount: number; outstanding: number }>('/v1/fees/payments', b),
      remind: (ids: string[]) => h.post<{ sent: number }>('/v1/fees/reminders', { ids }),
    },
    approvals: {
      needsYou: () => h.get<ApprovalRow[]>('/v1/needs-you'),
      decide: (id: string, b: ApprovalDecision) => h.post<ApprovalRow>(`/v1/approvals/${id}/decision`, b),
    },
    notices: {
      list: () => h.get<NoticeRow[]>('/v1/notices'),
      create: (b: NoticeCreate) => h.post<NoticeRow>('/v1/notices', b),
    },
    timetable: {
      view: (classId: string) => h.get<TimetableView>('/v1/timetable', { classId }),
      loads: (classId: string) => h.get<TeacherLoad[]>('/v1/timetable/loads', { classId }),
      teachers: (slotId: string) => h.get<TeacherOption[]>('/v1/timetable/teachers', { slotId }),
      patch: (id: string, b: SlotPatch) => h.patch<void>(`/v1/timetable/slots/${id}`, b),
      cover: (b: CoverRequest) => h.post<void>('/v1/timetable/cover', b),
      publish: () => h.post<{ families: number; teachers: number; version: number }>('/v1/timetable/publish'),
    },
    subjects: () => h.get<{ id: string; name: string; color: string }[]>('/v1/subjects'),
    homework: {
      list: (q: { classId?: string; subjectId?: string } = {}) => h.get<HomeworkRow[]>('/v1/homework', q as Query),
      detail: (id: string) => h.get<HomeworkDetail>(`/v1/homework/${id}`),
      create: (b: HomeworkCreate) => h.post<HomeworkDetail>('/v1/homework', b),
      mark: (id: string, b: HomeworkMarks) => h.put<HomeworkDetail>(`/v1/homework/${id}/marks`, b),
      remove: (id: string) => h.del<void>(`/v1/homework/${id}`),
    },
    exams: {
      list: (classId?: string) => h.get<ExamRow[]>('/v1/exams', classId ? { classId } : undefined),
      create: (b: ExamCreate) => h.post<ExamRow>('/v1/exams', b),
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
      create: (b: RoleSave) => h.post<RoleRow>('/v1/roles', b),
      save: (id: string, b: RoleSave) => h.put<RoleRow>(`/v1/roles/${id}`, b),
      remove: (id: string) => h.del<void>(`/v1/roles/${id}`),
    },
    invoices: {
      list: (q: Partial<InvoiceListQuery>) => h.get<Paged<InvoiceListRow> & { summary: InvoiceListSummary }>('/v1/fees/invoice-list', q as Query),
      receipts: (query?: string) => h.get<ReceiptRow[]>('/v1/fees/receipts', query ? { query } : undefined),
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
    },
    events: {
      list: () => h.get<EventRow[]>('/v1/events'),
      create: (b: EventSave) => h.post<EventRow>('/v1/events', b),
      save: (id: string, b: EventSave) => h.put<EventRow>(`/v1/events/${id}`, b),
      remove: (id: string) => h.del<void>(`/v1/events/${id}`),
    },
    privacy: {
      requests: () => h.get<DataRequestRow[]>('/v1/privacy/requests'),
      create: (b: DataRequestCreate) => h.post<DataRequestRow>('/v1/privacy/requests', b),
      decide: (id: string, b: DataRequestDecision) => h.post<DataRequestRow>(`/v1/privacy/requests/${id}/decision`, b),
    },
    settings: {
      get: () => h.get<SettingsResponse>('/v1/settings'),
      patch: (b: SettingsPatch) => h.patch<SettingsDoc>('/v1/settings', b),
      audit: () => h.get<AuditRow[]>('/v1/settings/audit'),
    },
  };
}

export type SchoolApi = ReturnType<typeof schoolApi>;
