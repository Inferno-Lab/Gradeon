import { z } from 'zod';
import { IsoDate } from './common.js';
import { Permission } from './permissions.js';
import type { FeeStatus } from './school.js';

// Homework

export const HomeworkCreate = z.object({
  classId: z.string().min(1, 'Choose a class'),
  subjectId: z.string().min(1, 'Choose a subject'),
  title: z.string().trim().min(3, 'Give the homework a title').max(120),
  description: z.string().trim().max(1000).default(''),
  dueOn: IsoDate,
  maxMarks: z.number().int().min(1).max(100).default(20),
});
export type HomeworkCreate = z.infer<typeof HomeworkCreate>;

export const HomeworkMarks = z.object({
  marks: z.array(z.object({
    studentId: z.string().min(1),
    handed: z.boolean(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    feedback: z.string().trim().max(300).optional(),
  })).min(1).max(200),
});
export type HomeworkMarks = z.infer<typeof HomeworkMarks>;

export interface HomeworkRow {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  title: string;
  description: string;
  assignedOn: string;
  dueOn: string;
  maxMarks: number;
  handedIn: number;
  onTime: number;
  total: number;
}

export interface HomeworkDetail extends HomeworkRow {
  students: { studentId: string; name: string; rollNo: string; handedAt: string | null; onTime: boolean; score: number | null; feedback: string }[];
}

// Exams

export const ExamCreate = z.object({
  name: z.string().trim().min(3, 'Name the exam').max(80),
  classId: z.string().min(1, 'Choose a class'),
  startsOn: IsoDate,
  endsOn: IsoDate,
  subjects: z.array(z.object({ subjectId: z.string().min(1), onDate: IsoDate.nullable().optional(), maxMarks: z.number().int().min(1).max(200).default(100) })).min(1, 'Pick at least one subject').max(12),
});
export type ExamCreate = z.infer<typeof ExamCreate>;

export const ExamMarksPut = z.object({
  marks: z.array(z.object({ studentId: z.string().min(1), subjectId: z.string().min(1), score: z.number().min(0).max(200).nullable(), absent: z.boolean().default(false) })).min(1).max(2000),
});
export type ExamMarksPut = z.infer<typeof ExamMarksPut>;

export interface ExamRow {
  id: string;
  name: string;
  classId: string;
  className: string;
  startsOn: string;
  endsOn: string;
  status: 'upcoming' | 'marking' | 'published';
  subjects: { subjectId: string; name: string; onDate: string | null; maxMarks: number }[];
  /** Marks entered out of marks expected (students × subjects). */
  entered: number;
  expected: number;
}

export interface ExamMarksView {
  exam: ExamRow;
  students: { studentId: string; name: string; rollNo: string; marks: Record<string, { score: number | null; absent: boolean }> }[];
}

export interface ExamResults {
  exam: ExamRow;
  average: number;
  passPct: number;
  rows: { studentId: string; name: string; rollNo: string; total: number; max: number; pct: number; grade: string; rank: number }[];
}

// People: staff, admissions, roles

export interface StaffRow {
  id: string;
  name: string;
  initials: string;
  email: string | null;
  phone: string | null;
  designation: string;
  department: string | null;
  subjects: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  periodsPerWeek: number;
  maxPeriods: number;
  status: 'active' | 'inactive';
  joinedOn: string | null;
}

export const StaffCreate = z.object({
  name: z.string().trim().min(2, 'Enter the name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().min(8, 'Enter a phone number').max(24),
  designation: z.string().trim().min(2).max(60).default('Teacher'),
  department: z.string().trim().max(60).optional(),
  subjectIds: z.array(z.string()).max(8).default([]),
  roleId: z.string().min(1, 'Choose a role'),
});
export type StaffCreate = z.infer<typeof StaffCreate>;

export const StaffPatch = z.object({
  designation: z.string().trim().min(2).max(60).optional(),
  department: z.string().trim().max(60).nullable().optional(),
  subjectIds: z.array(z.string()).max(8).optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type StaffPatch = z.infer<typeof StaffPatch>;

export const ENQUIRY_STAGES = ['enquiry', 'applied', 'test', 'offer', 'enrolled', 'declined'] as const;
export type EnquiryStage = (typeof ENQUIRY_STAGES)[number];

export interface EnquiryRow {
  id: string;
  childName: string;
  initials: string;
  gradeSought: number;
  guardianName: string;
  phone: string;
  email: string | null;
  source: string;
  stage: EnquiryStage;
  testOn: string | null;
  note: string;
  studentId: string | null;
  createdAt: string;
}

export const EnquiryCreate = z.object({
  childName: z.string().trim().min(2, 'Enter the child’s name').max(80),
  gradeSought: z.number().int().min(1, 'Choose a grade').max(12),
  guardianName: z.string().trim().min(2, 'Enter the guardian’s name').max(80),
  phone: z.string().trim().min(8, 'Enter a phone number').max(24),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  source: z.enum(['walk-in', 'phone', 'website', 'referral', 'event']).default('walk-in'),
  note: z.string().trim().max(400).default(''),
});
export type EnquiryCreate = z.infer<typeof EnquiryCreate>;

export const EnquiryPatch = z.object({
  stage: z.enum(ENQUIRY_STAGES).optional(),
  testOn: IsoDate.nullable().optional(),
  note: z.string().trim().max(400).optional(),
});
export type EnquiryPatch = z.infer<typeof EnquiryPatch>;

export const EnquiryEnrol = z.object({ classId: z.string().min(1, 'Choose a class'), dob: IsoDate });
export type EnquiryEnrol = z.infer<typeof EnquiryEnrol>;

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  locked: boolean;
  people: number;
}

export const RoleSave = z.object({
  name: z.string().trim().min(3, 'Name the role').max(40),
  description: z.string().trim().max(160).default(''),
  permissions: z.array(Permission).max(60),
});
export type RoleSave = z.infer<typeof RoleSave>;

// Money: invoice list, payments

export const InvoiceListQuery = z.object({
  status: z.enum(['paid', 'partial', 'due', 'overdue']).optional(),
  head: z.enum(['tuition', 'transport', 'activities', 'lab']).optional(),
  query: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuery>;

export interface InvoiceListRow {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  head: string;
  title: string;
  amount: number;
  waived: number;
  paid: number;
  outstanding: number;
  dueOn: string;
  status: FeeStatus;
}

export interface InvoiceListSummary {
  count: number;
  billed: number;
  collected: number;
  outstanding: number;
}

export interface ReceiptRow {
  id: string;
  receiptNo: string;
  studentName: string;
  className: string;
  title: string;
  amount: number;
  method: string;
  reference: string | null;
  paidOn: string;
  recordedBy: string;
}

// Reports

export interface ReportInfo {
  id: string;
  title: string;
  blurb: string;
  area: 'Attendance' | 'Fees' | 'People' | 'Learning';
}

export interface ReportData {
  id: string;
  title: string;
  summary: { label: string; value: string }[];
  columns: { key: string; label: string; align?: 'right' }[];
  rows: Record<string, string | number>[];
}

// Messages

export interface ThreadRow {
  id: string;
  subject: string;
  guardianName: string;
  studentName: string | null;
  className: string | null;
  status: 'open' | 'closed';
  lastAt: string;
  lastBody: string;
  lastFrom: 'staff' | 'guardian';
  unread: number;
  assignedToName: string | null;
}

export interface ThreadDetail extends ThreadRow {
  messages: { id: string; from: 'staff' | 'guardian'; sender: string; body: string; at: string }[];
}

export const ThreadCreate = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  subject: z.string().trim().min(3, 'Write a subject').max(100),
  body: z.string().trim().min(2, 'Write a message').max(1000),
});
export type ThreadCreate = z.infer<typeof ThreadCreate>;

export const ThreadReply = z.object({ body: z.string().trim().min(1, 'Write a reply').max(1000) });
export type ThreadReply = z.infer<typeof ThreadReply>;

export const ThreadPatch = z.object({ status: z.enum(['open', 'closed']).optional(), assignToMe: z.boolean().optional() });
export type ThreadPatch = z.infer<typeof ThreadPatch>;

// Events

export const EVENT_KINDS = ['event', 'holiday', 'exam', 'ptm', 'routine'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EventSave = z.object({
  title: z.string().trim().min(3, 'Name the event').max(100),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  kind: z.enum(EVENT_KINDS).default('event'),
  venue: z.string().trim().max(80).default(''),
  note: z.string().trim().max(300).default(''),
  audience: z.enum(['everyone', 'parents', 'staff']).default('everyone'),
});
export type EventSave = z.infer<typeof EventSave>;

export interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  kind: EventKind;
  venue: string;
  note: string;
  audience: string;
  going: number;
  maybe: number;
  cant: number;
}

// Privacy

export const DATA_REQUEST_KINDS = ['access', 'correction', 'erasure'] as const;

export const DataRequestCreate = z.object({
  kind: z.enum(DATA_REQUEST_KINDS),
  subjectName: z.string().trim().min(2, 'Whose data is this about?').max(80),
  requestedBy: z.string().trim().max(80).default(''),
  note: z.string().trim().max(400).default(''),
});
export type DataRequestCreate = z.infer<typeof DataRequestCreate>;

export const DataRequestDecision = z.object({ status: z.enum(['done', 'declined']), note: z.string().trim().max(400).default('') });
export type DataRequestDecision = z.infer<typeof DataRequestDecision>;

export interface DataRequestRow {
  id: string;
  kind: (typeof DATA_REQUEST_KINDS)[number];
  subjectName: string;
  requestedBy: string;
  status: 'open' | 'done' | 'declined';
  note: string;
  createdAt: string;
  resolvedAt: string | null;
}

// Messages the school sends on its own. One list drives the Notifications tab (who gets what, where), the Message templates tab
// (the wording) and the code that sends them.
export interface MessageEvent {
  key: string;
  label: string;
  /** Who receives it. */
  to: 'families' | 'staff';
  /** The {placeholders} the wording may use. */
  vars: string[];
  text: string;
  /** Channels on until the school changes them. */
  defaults: { push: boolean; sms: boolean; email: boolean };
  /** Sent even in quiet hours. */
  urgent?: boolean;
}

export const MESSAGE_EVENTS: MessageEvent[] = [
  { key: 'attendance.absent', label: 'Child marked absent or late', to: 'families', vars: ['student', 'status', 'school'], text: '{student} was marked {status} today at {school}.', defaults: { push: true, sms: true, email: false }, urgent: true },
  { key: 'attendance.reminder', label: 'Teacher has not marked attendance', to: 'staff', vars: ['teacher'], text: 'Hi {teacher}, please mark attendance for your class today.', defaults: { push: true, sms: true, email: false } },
  { key: 'fees.reminder', label: 'Fee reminder', to: 'families', vars: ['student', 'school'], text: 'Reminder: fees for {student} are due. Pay in the Gradeon app to get an instant receipt.', defaults: { push: true, sms: true, email: false } },
  { key: 'fees.receipt', label: 'Payment received', to: 'families', vars: ['receipt', 'amount', 'title'], text: 'Receipt {receipt}: {amount} received for {title}. Thank you.', defaults: { push: true, sms: true, email: true } },
  { key: 'timetable.published', label: 'Timetable changed', to: 'staff', vars: ['school'], text: 'The timetable was updated. Open the Gradeon app to see your new periods.', defaults: { push: true, sms: true, email: false } },
  { key: 'homework.new', label: 'New homework', to: 'families', vars: ['student', 'subject', 'title', 'due'], text: 'New {subject} homework for {student}: {title}, due {due}.', defaults: { push: true, sms: false, email: false } },
  { key: 'exam.results', label: 'Results published', to: 'families', vars: ['student', 'exam'], text: 'Results for {exam} are out. See how {student} did in the Gradeon app.', defaults: { push: true, sms: true, email: false } },
  { key: 'notice.published', label: 'New notice', to: 'families', vars: ['title', 'school'], text: 'New notice from {school}: {title}. Read it in the Gradeon app.', defaults: { push: true, sms: false, email: false } },
  { key: 'event.created', label: 'New event', to: 'families', vars: ['title', 'date'], text: '{title} on {date}. Tell us if you can come in the Gradeon app.', defaults: { push: true, sms: false, email: false } },
  { key: 'admissions.offer', label: 'Admission offer', to: 'families', vars: ['child', 'school'], text: 'Good news: {child} has been offered a place at {school}. Please visit the office to complete admission.', defaults: { push: false, sms: true, email: true } },
  { key: 'leave.decided', label: 'Leave request answered', to: 'families', vars: ['who', 'from', 'to', 'status'], text: 'Leave for {who} from {from} to {to} was {status}.', defaults: { push: true, sms: true, email: false } },
  { key: 'family.invite', label: 'Invite a family to the app', to: 'families', vars: ['student', 'school'], text: '{school} now uses Gradeon. Install the Gradeon app and sign in with this phone number to follow {student}’s day.', defaults: { push: false, sms: true, email: false }, urgent: true },
  { key: 'staff.invite', label: 'Staff invite', to: 'staff', vars: ['name', 'school', 'password'], text: 'Welcome to {school}, {name}. Sign in with your email and the temporary password {password}, then choose your own.', defaults: { push: false, sms: false, email: true }, urgent: true },
];
