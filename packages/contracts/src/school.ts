import type { ThemeColors } from './theme.js';
import { ATTENDANCE_MARKS, type MenuGroup } from './config.js';
import { z } from 'zod';
import { IsoDate } from './common.js';

export const AttendanceStatus = z.enum(ATTENDANCE_MARKS);
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
  gender: (typeof GENDERS)[number] | null;
  /** When and why a student who left the school left (null while on the roll). */
  left: { on: string; reason: string } | null;
  /** Every guardian (phones masked: the reveal call shows one in full). */
  guardians: GuardianRow[];
  /** The student's own app account (when the school uses the student role): how they sign in, and whether they have yet. */
  appAccount: { phone: string; email: string; lastSignIn: string | null } | null;
}

export const StudentQuery = z.object({
  query: z.string().trim().max(80).optional(),
  classId: z.string().optional(),
  house: z.string().max(20).optional(),
  feeStatus: z.enum(['paid', 'due', 'overdue']).optional(),
  attendance: z.enum(['low', 'perfect']).optional(),
  newThisYear: z.stringbool().optional(),
  /** Students who left the school, instead of those on the roll. */
  left: z.stringbool().optional(),
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
  /** Students who left (kept until the retention period ends). */
  left: number;
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
});
export type MessageRequest = z.infer<typeof MessageRequest>;

/** A fee head's key: one of the school's own fee heads (`/v1/fees/heads`). */
export const FeeHeadKey = z.string().regex(/^[a-z0-9_]{1,40}$/, 'Choose a kind of fee');

/** A kind of fee the school charges. The list is the school's own data, edited with its fee structures. */
export interface FeeHead { key: string; name: string; sort: number; concession: boolean }
export const FeeHeadsPut = z.object({
  heads: z.array(z.object({ key: FeeHeadKey.optional(), name: z.string().trim().min(2, 'Name the fee head').max(40), concession: z.boolean().default(false) })).min(1).max(30),
});
export type FeeHeadsPut = z.infer<typeof FeeHeadsPut>;

export const AssignFee = z.object({
  ids: z.array(z.string()).min(1).max(500),
  head: FeeHeadKey,
  title: z.string().trim().min(3, 'Name the fee').max(80),
  amount: z.number().int().positive('Enter an amount'),
  dueOn: IsoDate,
});
export type AssignFee = z.infer<typeof AssignFee>;

export const GENDERS = ['female', 'male', 'other'] as const;
/** The fields of a student's record a school may require (console: People → fields the office must fill). */
export const STUDENT_FIELDS = ['gender', 'house', 'admissionNo', 'bloodGroup', 'address'] as const;
const StudentFields = {
  name: z.string().trim().min(2, 'Enter the full name').max(80),
  classId: z.string().min(1, 'Choose a class'),
  rollNo: z.string().trim().max(10).optional(),
  dob: IsoDate,
  gender: z.enum(GENDERS).optional(),
  house: z.string().trim().max(24).optional(),
  admissionNo: z.string().trim().max(30).optional(),
  bloodGroup: z.string().trim().max(4).optional(),
  address: z.string().trim().max(200).optional(),
};
export const StudentCreate = z.object({
  ...StudentFields,
  guardianName: z.string().trim().min(2).max(80),
  guardianPhone: z.string().trim().min(8).max(20),
});
export type StudentCreate = z.infer<typeof StudentCreate>;
/** Changes to a student's own record; a change of class keeps their marks and attendance. */
export const StudentPatch = z.object(StudentFields).partial();
export type StudentPatch = z.infer<typeof StudentPatch>;
/** A student's guardians, all at once: who they are, which one is first, and who may collect the child. */
export const GuardiansPut = z.object({
  guardians: z.array(z.object({
    id: z.string().optional(), name: z.string().trim().min(2, 'Enter the name').max(80), phone: z.string().trim().min(8, 'Enter the phone number').max(20),
    email: z.string().trim().email('Check the email').max(120).or(z.literal('')).optional(), relation: z.string().trim().min(2).max(30), canCollect: z.boolean(), isPrimary: z.boolean(),
  })).min(1, 'A student needs at least one guardian').max(4),
}).refine((b) => b.guardians.filter((g) => g.isPrimary).length === 1, { message: 'Choose one guardian to contact first.', path: ['guardians'] });
export type GuardiansPut = z.infer<typeof GuardiansPut>;
export interface GuardianRow { id: string; name: string; phone: string; email: string; relation: string; canCollect: boolean; isPrimary: boolean; hasApp: boolean }

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
  /** onLeave: an approved leave covers the day; until the roll is taken its mark is filled in from the leave. */
  marks: { studentId: string; name: string; rollNo: string; status: AttendanceStatus | null; onLeave: boolean }[];
}

/** Attendance every period (feature attendance.periodWise): only present, late and absent; leave comes from the day. */
export const PERIOD_MARKS = ['present', 'late', 'absent'] as const;
export const PeriodMarksPut = z.object({
  classId: z.string(),
  date: IsoDate,
  period: z.number().int().min(0).max(30),
  marks: z.array(z.object({ studentId: z.string(), status: z.enum(PERIOD_MARKS) })).min(1).max(200),
});
export type PeriodMarksPut = z.infer<typeof PeriodMarksPut>;

/** One day's periods for a class: who teaches each, whether it was marked, and each student's mark. */
export interface PeriodRoll {
  classId: string;
  date: string;
  students: { studentId: string; name: string; rollNo: string; day: AttendanceStatus | null }[];
  periods: {
    period: number; label: string; startsAt: string; endsAt: string; subject: string; teacherId: string; teacherName: string;
    /** Whether the person asking may mark it: the period's teacher (or its cover), or someone who approves requests. */
    mine: boolean;
    markedBy: string | null;
    marks: Record<string, (typeof PERIOD_MARKS)[number]>;
  }[];
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
  byHead: { head: string; label: string; due: number; collected: number; pct: number }[];
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

/** One invoice opened: what it is for, every payment against it, and any waiver asked for or given. */
export interface InvoiceDetail extends InvoiceRow {
  studentName: string;
  className: string;
  head: string;
  headName: string;
  waived: number;
  outstanding: number;
  payments: { id: string; receiptNo: string; amount: number; refunded: number; method: string; paidOn: string; cancelled: boolean; cancelReason: string }[];
  /** A waiver or cancellation waiting for a second person, if any. */
  pending: { id: string; title: string } | null;
}
/** Asks for part of an invoice to be waived, or all of what is left of it (cancel); a second person decides in Approvals. */
export const WaiverRequest = z.object({ amount: z.number().int().positive('Enter an amount'), reason: z.string().trim().min(3, 'Say why').max(300), cancel: z.boolean().default(false) });
export type WaiverRequest = z.infer<typeof WaiverRequest>;
export const ReceiptCancel = z.object({ reason: z.string().trim().min(3, 'Say why').max(300) });
export type ReceiptCancel = z.infer<typeof ReceiptCancel>;

// Notices
/**
 * A notice as written in the admin or the teachers' app. Who it goes to: everyone, parents, students, staff, or one class.
 * Writing to the whole school needs notices.publish, pinning needs notices.pin; anyone else writes to their own classes.
 */
export const NoticeCreate = z.object({
  title: z.string().trim().min(3, 'Give the notice a title').max(120),
  body: z.string().trim().min(3, 'Write the notice').max(4000),
  audience: z.enum(['everyone', 'parents', 'students', 'staff', 'class']).default('everyone'),
  classId: z.string().optional(),
  /** One of the school's notice categories. */
  category: z.string().trim().min(1).max(24).default('academic'),
  pinned: z.boolean().default(false),
  needsAck: z.boolean().default(false),
  /** Publish now (true), keep as a draft (false); with publishAt, it goes out then instead. */
  publish: z.boolean().default(false),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  fileIds: z.array(z.string()).max(5).default([]),
}).refine((n) => n.audience !== 'class' || !!n.classId, { message: 'Choose the class', path: ['classId'] });
export type NoticeCreate = z.infer<typeof NoticeCreate>;

export interface NoticeRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  classId: string | null;
  className: string | null;
  category: string;
  pinned: boolean;
  needsAck: boolean;
  status: 'draft' | 'pending' | 'scheduled' | 'published';
  author: string;
  authorId: string | null;
  publishedAt: string | null;
  publishAt: string | null;
  editedAt: string | null;
  createdAt: string;
  files: { id: string; name: string; mime: string }[];
  /** For a published notice: how many it reached, how many opened it, and (when asked) acknowledged it. */
  reach: { audience: number; read: number; acked: number };
}

// Approvals
export type ApprovalKind = 'leave' | 'fee_waiver' | 'admission' | 'notice' | 'attendance' | 'photo' | 'receipt_cancel';
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
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  decidedAt: string | null;
  /** Who asked, and who decided with the reason they gave (a decline always has one). */
  requesterName?: string;
  decidedByName?: string | null;
  decisionNote?: string;
}
export const ApprovalDecision = z.object({ decision: z.enum(['approve', 'reject', 'undo']), note: z.string().trim().max(300).optional() })
  .refine((d) => d.decision !== 'reject' || !!d.note, { message: 'Say why, so the person who asked knows what to do next.', path: ['note'] });
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
/** Puts a lesson in a free period of a class. */
export const SlotCreate = z.object({ classId: z.string().min(1), day: z.number().int().min(1).max(7), period: z.number().int().min(0), subjectId: z.string().min(1, 'Choose a subject'), teacherId: z.string().min(1, 'Choose a teacher'), room: z.string().max(20).nullable().optional() });
export type SlotCreate = z.infer<typeof SlotCreate>;
/** One teacher's or one room's week, across classes. */
export interface WeekOf { title: string; periods: PeriodDef[]; slots: (SlotRow & { className: string })[] }
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
  /** The term today is in (empty when the calendar has none) and the next exam (empty label and null days when none is scheduled). */
  term: { name: string; examsLabel: string; daysToGo: number | null; progress: number };
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
  school: { name: string; shortName: string; logoText: string; logoUrl: string | null; place: string; color: string; address: string; phone: string; receiptNote: string; studentWord: string; classWord: string; paymentMethods: string[] };
  term: DashboardData['term'];
  badges: DashboardData['badges'];
  modules: string[];
  /** Features inside those modules (like people.admissions): pages and menu items for a missing one are hidden. */
  features: string[];
  /** The menu for this person, built from the module definitions (config-engine `adminMenu`). */
  menu: MenuGroup[];
  /** The colours the console changed for this school. */
  theme: ThemeColors;
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
