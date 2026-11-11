import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const academicYears = pgTable('academic_years', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  current: boolean('current').notNull().default(false),
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // staff | guardian | student
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    status: text('status').notNull().default('active'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: at('created_at'),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
    uniqueIndex('users_phone_uq').on(t.phone),
    index('users_phone_digits_idx').on(sql`right(regexp_replace(coalesce(${t.phone}, ''), '\\D', '', 'g'), 10)`),
  ],
);

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  permissions: jsonb('permissions').$type<string[]>().notNull(),
  locked: boolean('locked').notNull().default(false),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    refreshHash: text('refresh_hash').notNull(),
    userAgent: text('user_agent'),
    client: text('client').notNull().default('web'),
    createdAt: at('created_at'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_user_live_idx').on(t.userId).where(sql`${t.revokedAt} is null`),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    channel: text('channel').notNull(),
    purpose: text('purpose').notNull().default('sign_in'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: at('created_at'),
  },
  (t) => [index('otp_challenges_user_idx').on(t.userId)],
);

export const staff = pgTable('staff', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  designation: text('designation').notNull().default('Teacher'),
  department: text('department'),
  joinedOn: date('joined_on'),
  maxPeriodsPerWeek: integer('max_periods_per_week').notNull().default(30),
});

export const subjects = pgTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  perWeek: integer('per_week').notNull().default(5),
});

export const staffSubjects = pgTable(
  'staff_subjects',
  {
    userId: text('user_id').notNull().references(() => staff.userId, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.subjectId] })],
);

export const classes = pgTable('classes', {
  id: text('id').primaryKey(),
  yearId: text('year_id').notNull().references(() => academicYears.id),
  name: text('name').notNull(),
  grade: integer('grade').notNull(),
  section: text('section').notNull(),
  classTeacherId: text('class_teacher_id').references(() => users.id, { onDelete: 'set null' }),
});

export const students = pgTable(
  'students',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    admissionNo: text('admission_no').notNull().unique(),
    name: text('name').notNull(),
    classId: text('class_id').notNull().references(() => classes.id),
    rollNo: text('roll_no').notNull().default(''),
    dob: date('dob').notNull(),
    bloodGroup: text('blood_group'),
    house: text('house'),
    gender: text('gender'),
    avatarUrl: text('avatar_url'),
    address: text('address'),
    status: text('status').notNull().default('active'),
    admittedOn: date('admitted_on'),
    createdAt: at('created_at'),
  },
  (t) => [index('students_class_idx').on(t.classId), index('students_name_idx').on(sql`lower(${t.name})`), index('students_user_idx').on(t.userId)],
);

export const guardians = pgTable(
  'guardians',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    relation: text('relation').notNull().default('Parent'),
  },
  (t) => [index('guardians_user_idx').on(t.userId)],
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    guardianId: text('guardian_id').notNull().references(() => guardians.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    /** May collect the child from school (migration 0021). */
    canCollect: boolean('can_collect').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.guardianId] }), index('student_guardians_guardian_idx').on(t.guardianId)],
);

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: text('id').primaryKey(),
    classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('attendance_sessions_uq').on(t.classId, t.date)],
);

/** Attendance every period (feature attendance.periodWise), beside the day's roll call (migration 0020). */
export const periodMarks = pgTable(
  'period_marks',
  {
    classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    period: integer('period').notNull(),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
    markedAt: at('marked_at'),
  },
  (t) => [primaryKey({ columns: [t.classId, t.date, t.period, t.studentId] }), index('period_marks_student_idx').on(t.studentId, t.date)],
);

export const attendanceMarks = pgTable(
  'attendance_marks',
  {
    sessionId: text('session_id').notNull().references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // present | absent | late | leave
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] }), index('attendance_marks_student_idx').on(t.studentId)],
);

export const feeInvoices = pgTable(
  'fee_invoices',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    head: text('head').notNull().default('tuition'), // tuition | transport | activities | lab
    title: text('title').notNull(),
    amount: integer('amount').notNull(),
    dueOn: date('due_on').notNull(),
    waivedAmount: integer('waived_amount').notNull().default(0),
    createdAt: at('created_at'),
  },
  (t) => [index('fee_invoices_student_idx').on(t.studentId), index('fee_invoices_student_due_idx').on(t.studentId, t.dueOn)],
);

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    method: text('method').notNull(),
    reference: text('reference'),
    receiptNo: text('receipt_no').notNull().unique(),
    paidOn: date('paid_on').notNull(),
    recordedBy: text('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: at('created_at'),
  },
  (t) => [index('payments_invoice_idx').on(t.invoiceId)],
);

export const notices = pgTable(
  'notices',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    audience: text('audience').notNull().default('everyone'),
    classId: text('class_id').references(() => classes.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('draft'), // draft | pending | published
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** One of the school's notice categories (notices.categories). */
    category: text('category').notNull().default('academic'),
    pinned: boolean('pinned').notNull().default(false),
    /** Published at this time by the job queue (status stays draft or approved until then). */
    publishAt: timestamp('publish_at', { withTimezone: true }),
    /** Families are asked to acknowledge it; the office sees who has not. */
    needsAck: boolean('needs_ack').notNull().default(false),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: at('created_at'),
  },
  (t) => [index('notices_status_pub_idx').on(t.status, t.publishedAt)],
);

export const noticeReads = pgTable('notice_reads', {
  noticeId: text('notice_id').notNull().references(() => notices.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  readAt: at('read_at'),
  ackedAt: timestamp('acked_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.noticeId, t.userId] })]);

export const approvals = pgTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // leave | fee_waiver | admission | notice | attendance
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    requesterName: text('requester_name').notNull(),
    /** Who sent it (a parent can correct or withdraw it while it waits). */
    requestedBy: text('requested_by'),
    subjectRef: text('subject_ref'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('pending'),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** The reason given with the decision; a decline always has one. */
    decisionNote: text('decision_note').notNull().default(''),
    createdAt: at('created_at'),
  },
  (t) => [index('approvals_status_idx').on(t.status)],
);

export const periods = pgTable('periods', {
  idx: integer('idx').primaryKey(),
  label: text('label').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  kind: text('kind').notNull().default('period'),
});

export const timetableSlots = pgTable(
  'timetable_slots',
  {
    id: text('id').primaryKey(),
    classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    day: integer('day').notNull(), // 1 Monday .. 7 Sunday
    period: integer('period').notNull().references(() => periods.idx),
    subjectId: text('subject_id').notNull().references(() => subjects.id),
    teacherId: text('teacher_id').notNull().references(() => users.id),
    room: text('room'),
    /** Published value, so unpublished edits can be counted and reverted. */
    publishedTeacherId: text('published_teacher_id'),
    publishedSubjectId: text('published_subject_id'),
    /** A standing cover: this teacher takes the period instead of `teacherId` until the timetable changes again. */
    coverTeacherId: text('cover_teacher_id'),
    publishedCoverId: text('published_cover_id'),
  },
  (t) => [uniqueIndex('timetable_slot_uq').on(t.classId, t.day, t.period), index('timetable_teacher_idx').on(t.teacherId, t.day, t.period)],
);

export const substitutions = pgTable(
  'substitutions',
  {
    id: text('id').primaryKey(),
    slotId: text('slot_id').notNull().references(() => timetableSlots.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    teacherId: text('teacher_id').notNull().references(() => users.id),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: at('created_at'),
  },
  (t) => [uniqueIndex('substitutions_uq').on(t.slotId, t.date), index('substitutions_date_idx').on(t.date)],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: at('updated_at'),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  kind: text('kind').notNull().default('event'),
  note: text('note').notNull().default(''),
  audience: text('audience').notNull().default('everyone'),
  venue: text('venue').notNull().default(''),
  createdBy: text('created_by'),
  /** One of the school's event categories. */
  category: text('category').notNull().default(''),
  /** Families are asked whether they are coming (and how many). */
  needsRsvp: boolean('needs_rsvp').notNull().default(false),
  /** Where it is, for directions in the app. */
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: at('at'),
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull().default('System'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('audit_at_idx').on(t.at), index('audit_entity_idx').on(t.entity, t.entityId)],
);

export const homework = pgTable(
  'homework',
  {
    id: text('id').primaryKey(),
    classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull().references(() => subjects.id),
    title: text('title').notNull(),
    assignedOn: date('assigned_on').notNull(),
    dueOn: date('due_on').notNull(),
    description: text('description').notNull().default(''),
    maxMarks: integer('max_marks').notNull().default(20),
    createdBy: text('created_by'),
    /** draft: the teacher is still writing it (only they see it); set: families see it. */
    status: text('status').notNull().default('set'),
    /** false: handed in and checked, but not marked. */
    graded: boolean('graded').notNull().default(true),
  },
  (t) => [index('homework_class_due_idx').on(t.classId, t.dueOn)],
);

export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    homeworkId: text('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    handedAt: timestamp('handed_at', { withTimezone: true }),
    onTime: boolean('on_time').notNull().default(false),
    score: integer('score'),
    feedback: text('feedback').notNull().default(''),
    /** Sent back for a redo, with why: the family can hand it in again. */
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    returnNote: text('return_note').notNull().default(''),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.homeworkId, t.studentId] }), index('homework_sub_student_idx').on(t.studentId)],
);

export const examResults = pgTable(
  'exam_results',
  {
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    exam: text('exam').notNull(),
    grade: text('grade').notNull(),
    pct: integer('pct').notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.exam] })],
);

export const libraryLoans = pgTable(
  'library_loans',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id').references(() => students.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueOn: date('due_on').notNull(),
    returnedOn: date('returned_on'),
    /** A member of staff borrowing (then studentId is empty). */
    staffUserId: text('staff_user_id'),
  },
  (t) => [index('library_student_idx').on(t.studentId)],
);

export const transportAssignments = pgTable('transport_assignments', {
  studentId: text('student_id').primaryKey().references(() => students.id, { onDelete: 'cascade' }),
  route: text('route').notNull(),
});

// Added by migrations 0001 and 0002: exams, admissions, family messages, event replies, data requests.
export const exams = pgTable('exams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  status: text('status').notNull().default('upcoming'), // upcoming | marking | published
  publishedAt: timestamp('published_at', { withTimezone: true }),
  /** Why published results were reopened: told to families when they go out again. */
  reopenedNote: text('reopened_note').notNull().default(''),
  createdBy: text('created_by'),
  createdAt: at('created_at'),
});

export const examSubjects = pgTable('exam_subjects', {
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  onDate: date('on_date'),
  maxMarks: integer('max_marks').notNull().default(100),
  /** The paper's time ("09:00") and room, for the exam timetable families see. */
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  room: text('room').notNull().default(''),
}, (t) => [primaryKey({ columns: [t.examId, t.subjectId] })]);

export const examMarks = pgTable('exam_marks', {
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  score: text('score'),
  absent: boolean('absent').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.examId, t.studentId, t.subjectId] })]);

export const enquiries = pgTable('enquiries', {
  id: text('id').primaryKey(),
  childName: text('child_name').notNull(),
  gradeSought: integer('grade_sought').notNull(),
  guardianName: text('guardian_name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email'),
  source: text('source').notNull().default('walk-in'),
  stage: text('stage').notNull().default('enquiry'), // enquiry | applied | test | offer | enrolled | declined
  testOn: date('test_on'),
  note: text('note').notNull().default(''),
  studentId: text('student_id').references(() => students.id, { onDelete: 'set null' }),
  createdAt: at('created_at'),
  updatedAt: at('updated_at'),
});

export const threads = pgTable('threads', {
  id: text('id').primaryKey(),
  guardianId: text('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
  studentId: text('student_id').references(() => students.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  /** A student's own conversation (students message teachers when the school allows it). */
  studentUserId: text('student_user_id'),
  lastAt: at('last_at'),
  createdAt: at('created_at'),
});

export const threadMessages = pgTable('thread_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  fromKind: text('from_kind').notNull(), // staff | guardian | student
  senderName: text('sender_name').notNull(),
  senderId: text('sender_id'),
  body: text('body').notNull(),
  fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
  createdAt: at('created_at'),
  readAt: timestamp('read_at', { withTimezone: true }),
  /** Taken back by its sender: shown as "message deleted". */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  /** Reported to the office by the other side, with why. */
  reportedAt: timestamp('reported_at', { withTimezone: true }),
  reportReason: text('report_reason').notNull().default(''),
});

export const eventRsvps = pgTable('event_rsvps', {
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // going | maybe | cant
  /** Grown-ups coming with the child. */
  adults: integer('adults').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.eventId, t.studentId] })]);

export const dataRequests = pgTable('data_requests', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // access | correction | erasure
  subjectName: text('subject_name').notNull(),
  requestedBy: text('requested_by').notNull().default(''),
  status: text('status').notNull().default('open'),
  note: text('note').notNull().default(''),
  createdAt: at('created_at'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'),
  /** Made from the app by this person, who follows it there. */
  userId: text('user_id'),
  answer: text('answer').notNull().default(''),
});
