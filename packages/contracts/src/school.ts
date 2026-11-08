import { z } from 'zod';
import { IsoDate } from './common.js';

export const AttendanceStatus = z.enum(['present', 'absent', 'late', 'leave']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const FeeStatus = z.enum(['paid', 'due', 'overdue', 'partial']);
export type FeeStatus = z.infer<typeof FeeStatus>;

export interface ClassInfo {
  id: string;
  name: string;
  grade: number;
  section: string;
  studentCount: number;
  classTeacherId: string | null;
  classTeacherName: string | null;
}

export interface StudentRow {
  id: string;
  admissionNo: string;
  name: string;
  initials: string;
  classId: string;
  className: string;
  rollNo: string;
  house: string | null;
  guardianName: string;
  feeStatus: FeeStatus;
  amountDue: number;
  /** Last ten school days, oldest first. null means no school that day. */
  attendance10: (AttendanceStatus | null)[];
  attendancePct: number;
  status: 'active' | 'inactive';
}

export interface StudentDetail extends StudentRow {
  dob: string;
  bloodGroup: string | null;
  house: string | null;
  address: string | null;
  /** Masked. Use the reveal call for the full number; that is written to the audit log. */
  guardianPhone: string | null;
  guardianEmail: string | null;
  guardianName: string;
  routeName: string | null;
  facts: { attendancePct: number; exam: { name: string; grade: string; pct: number } | null; homework: { onTime: number; total: number }; libraryOut: number };
  chips: { house: string | null };
  admittedOn: string | null;
  recentActivity: { id: string; at: string; label: string; sub: string; tone: 'g' | 'v' | 'a' }[];
  roll24: (AttendanceStatus | null)[];
}

export const StudentQuery = z.object({
  query: z.string().trim().max(80).optional(),
  classId: z.string().optional(),
  house: z.string().max(20).optional(),
  feeStatus: z.enum(['paid', 'due', 'overdue']).optional(),
  attendance: z.enum(['low', 'perfect']).optional(),
  newThisYear: z.stringbool().optional(),
  sort: z.enum(['name', 'class', 'attendance', 'due']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});
export type StudentQuery = z.infer<typeof StudentQuery>;

export interface StudentSummary {
  inView: number;
  total: number;
  /** Present or late, on the latest school day, among students in view. */
  presentToday: number;
  /** Students in view that have a mark on that day. */
  markedToday: number;
  /** Of those present, how many were marked after 09:00. */
  presentSince: number;
  overdueAmount: number;
  overdueFamilies: number;
  avgAttendance: number;
  /** Percentage points against the previous period of the same length. */
  avgDelta: number;
  dayLabel: string;
}

export interface StudentViews {
  all: number;
  pinned: { classId: string; name: string; count: number } | null;
  overdue: number;
  newThisYear: number;
}

export interface ContactReveal {
  phone: string;
  email: string | null;
}

export const StudentImport = z.object({ csv: z.string().min(10).max(25_000_000) });
export type StudentImport = z.infer<typeof StudentImport>;
export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; message: string }[];
}

export const MessageRequest = z.object({
  ids: z.array(z.string()).min(1).max(500),
  body: z.string().trim().min(2, 'Write the message').max(500),
  channel: z.enum(['sms', 'whatsapp', 'push']).default('sms'),
});
export type MessageRequest = z.infer<typeof MessageRequest>;

export const AssignFee = z.object({
  ids: z.array(z.string()).min(1).max(500),
  head: z.enum(['tuition', 'transport', 'activities', 'lab']),
  title: z.string().trim().min(3, 'Name the fee').max(80),
  amount: z.number().int().positive('Enter an amount'),
  dueOn: IsoDate,
});
export type AssignFee = z.infer<typeof AssignFee>;

export const StudentCreate = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(80),
  classId: z.string().min(1, 'Choose a class'),
  rollNo: z.string().trim().max(10).optional(),
  dob: IsoDate,
  guardianName: z.string().trim().min(2).max(80),
  guardianPhone: z.string().trim().min(8).max(20),
  bloodGroup: z.string().trim().max(4).optional(),
  address: z.string().trim().max(200).optional(),
});
export type StudentCreate = z.infer<typeof StudentCreate>;

export const BulkStudentAction = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(['remind-fees', 'message', 'export']),
});
export type BulkStudentAction = z.infer<typeof BulkStudentAction>;

// Attendance
export const AttendanceDayPut = z.object({
  classId: z.string(),
  date: IsoDate,
  marks: z.array(z.object({ studentId: z.string(), status: AttendanceStatus })).min(1).max(200),
});
export type AttendanceDayPut = z.infer<typeof AttendanceDayPut>;

export interface AttendanceDay {
  classId: string;
  date: string;
  submitted: boolean;
  marks: { studentId: string; name: string; rollNo: string; status: AttendanceStatus | null }[];
}

export interface AttendanceWeekPoint {
  date: string;
  label: string;
  present: number;
  total: number;
  pct: number;
  previousPct: number | null;
  isToday: boolean;
}

// Fees
export interface FeeSummary {
  monthLabel: string;
  due: number;
  collected: number;
  pending: number;
  overdue: number;
  overdueFamilies: number;
  pct: number;
  collectedDelta: number;
  byHead: { head: 'tuition' | 'transport' | 'activities' | 'lab'; label: string; due: number; collected: number; pct: number }[];
  daily: { date: string; label: string; full: string; amount: number; isToday: boolean }[];
  dailyTarget: number;
}

export const PaymentCreate = z.object({
  studentId: z.string(),
  invoiceId: z.string(),
  amount: z.number().int().positive('Enter an amount'),
  method: z.enum(['cash', 'upi', 'card', 'netbanking', 'cheque']),
  reference: z.string().trim().max(60).optional(),
});
export type PaymentCreate = z.infer<typeof PaymentCreate>;

export interface InvoiceRow {
  id: string;
  studentId: string;
  title: string;
  amount: number;
  paid: number;
  dueOn: string;
  status: FeeStatus;
}

// Notices
export const NoticeCreate = z.object({
  title: z.string().trim().min(3, 'Give the notice a title').max(120),
  body: z.string().trim().min(3, 'Write the notice').max(4000),
  audience: z.enum(['everyone', 'parents', 'staff', 'class']).default('everyone'),
  classId: z.string().optional(),
  publish: z.boolean().default(false),
});
export type NoticeCreate = z.infer<typeof NoticeCreate>;

export interface NoticeRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  status: 'draft' | 'pending' | 'published';
  author: string;
  publishedAt: string | null;
  createdAt: string;
}

// Approvals
export type ApprovalKind = 'leave' | 'fee_waiver' | 'admission' | 'notice' | 'attendance';
export interface ApprovalRow {
  id: string;
  kind: ApprovalKind;
  title: string;
  subtitle: string;
  initials: string;
  tone: 'coral' | 'amber' | 'blue' | 'mint' | 'violet';
  /** Button label, and the line shown after it is done. */
  action: string;
  doneText: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt: string | null;
}
export const ApprovalDecision = z.object({ decision: z.enum(['approve', 'reject', 'undo']) });
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

// Timetable
export interface PeriodDef {
  idx: number;
  label: string;
  starts: string;
  ends: string;
  kind: 'period' | 'break' | 'lunch';
}
export interface SlotRow {
  id: string;
  classId: string;
  day: number;
  period: number;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  teacherId: string;
  teacherName: string;
  room: string | null;
  substituteId: string | null;
  substituteName: string | null;
}
export interface Clash {
  id: string;
  kind: 'teacher';
  teacherId: string;
  teacherName: string;
  day: number;
  period: number;
  slotIds: string[];
  classNames: string[];
  suggestion: { teacherId: string; teacherName: string; reason: string } | null;
}
export interface TimetableView {
  classId: string;
  className: string;
  periods: PeriodDef[];
  slots: SlotRow[];
  clashes: Clash[];
  unplaced: { subjectId: string; name: string; color: string; missing: number }[];
  publishedAt: string | null;
  draftChanges: number;
  version: number;
}
export const SlotPatch = z.object({
  subjectId: z.string().optional(),
  teacherId: z.string().optional(),
  room: z.string().max(20).nullable().optional(),
});
export type SlotPatch = z.infer<typeof SlotPatch>;
export const CoverRequest = z.object({ slotId: z.string(), teacherId: z.string(), date: IsoDate.optional() });
export type CoverRequest = z.infer<typeof CoverRequest>;
export interface TeacherLoad {
  teacherId: string;
  name: string;
  periodsPerWeek: number;
  max: number;
  subjects: string[];
}

export interface TeacherOption {
  id: string;
  name: string;
  subjects: string[];
  load: number;
  max: number;
  /** Not teaching another class in the period being changed. */
  free: boolean;
}

// Dashboard
export interface DashboardData {
  /** Modules the school has: the dashboard shows only their tiles, charts and actions (their numbers are not sent at all). */
  modules: string[];
  greetingName: string;
  roleLabel: string;
  schoolName: string;
  /** The latest school day shown, and whether it is today. */
  day: { date: string; label: string; isToday: boolean; clock: string };
  term: { name: string; examsLabel: string; daysToGo: number; progress: number };
  subtitle: { marked: number; classes: number };
  present: { value: number; total: number; deltaPct: number; versus: string };
  fees: { collected: number; due: number; pct: number; deltaPct: number; overdueFamilies: number; monthLabel: string };
  approvals: { count: number; avatars: { initials: string; tone: ApprovalRow['tone'] }[] };
  charts: {
    attendance: { goal: number; points: AttendanceWeekPoint[] };
    fees: { goal: number; points: { date: string; label: string; full: string; amount: number; isToday: boolean }[] };
    homework: { goal: number; points: { date: string; label: string; full: string; pct: number; isToday: boolean }[] };
  };
  feeHeads: FeeSummary['byHead'];
  classRolls: { classId: string; name: string; present: number; late: number; absent: number; unmarked: number; size: number; pct: number }[];
  needsYou: ApprovalRow[];
  timeline: { id: string; time: string; title: string; subtitle: string; state: 'done' | 'now' | 'next' }[];
  timelineProgress: number;
  badges: { attendance: number; admissions: number; messages: number };
}

/** What the menu needs on every page: who the school is, the term card, and the counts beside menu items. */
export interface ShellData {
  school: { name: string; shortName: string; logoText: string; place: string; color: string; address: string; phone: string; receiptNote: string; studentWord: string; classWord: string; paymentMethods: string[] };
  term: DashboardData['term'];
  badges: DashboardData['badges'];
  modules: string[];
  /** Features inside those modules (like people.admissions): pages and menu items for a missing one are hidden. */
  features: string[];
}

// Search (command palette)
export interface SearchHit {
  group: 'People' | 'Go to' | 'Actions';
  title: string;
  hint: string;
  href: string;
  keys?: string;
}

// Audit
export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}
