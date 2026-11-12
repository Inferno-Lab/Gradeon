import { istToday, type ApprovalKind, type EntitlementDoc, type Permission } from '@gradeon/contracts';

/** The admin menu's groups, in order (docs/product-map.md §3). A group shows once a page in it does. */
export const ADMIN_GROUPS = ['Home', 'People', 'Teach', 'Care', 'Money', 'Reach', 'Campus', 'School'] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

/** A tab of an admin page, with its own address (`/fees/invoices`). The first tab is the page itself. */
export interface AdminTab {
  key: string;
  label: string;
  feature?: string;
  anyOf?: Permission[];
}

/** One page of the school admin. The menu, the shortcuts, the routes test and the console's preview are built from these. */
export interface AdminPage {
  id: string;
  label: string;
  /** An icon key of `@gradeon/web-ui`'s IC. */
  icon: string;
  /** `G` then a letter. */
  keys: string;
  path: string;
  group: AdminGroup;
  /** Needs at least one of these to show the page; none means everyone signed in. */
  anyOf: Permission[];
  /** A feature of the module the page needs, beyond the module itself. */
  feature?: string;
  tabs?: AdminTab[];
  /** Leaves the menu once the school is live (Moving in). */
  untilLive?: boolean;
}

/** Who uses the app. Each role is switched on or off per school in the console (`app.roles`). */
export const APP_ROLES = ['parent', 'student', 'teacher', 'driver'] as const;
export type AppRole = (typeof APP_ROLES)[number];
export const APP_ROLE_LABELS: Record<AppRole, string> = { parent: 'Parents', student: 'Students', teacher: 'Teachers', driver: 'Bus drivers' };

/** Something a module offers the app: a bottom tab, a Home card or a quick button, for the roles it suits. */
export interface AppPiece {
  slot: 'dock' | 'home' | 'quick';
  key: string;
  label: string;
  roles: AppRole[];
  feature?: string;
}

/** A card or a "new" shortcut a module adds to the admin's dashboard. */
export interface DashboardPiece {
  kind: 'widget' | 'new';
  key: string;
  label: string;
  blurb: string;
  /** For `new`: where it goes, its keys and icon. */
  to?: string;
  keys?: string;
  icon?: string;
  anyOf?: Permission[];
  feature?: string;
}

/** live: built and sold. beta: built, given to pilot schools. planned: in the features master, not built yet (its switch cannot be turned on). */
export type CatalogueState = 'live' | 'beta' | 'planned';

/** A feature inside a module that the console can give or take per school, like online payment inside Fees. */
export interface FeatureDef {
  key: string;
  name: string;
  state: CatalogueState;
}

/**
 * Everything a module is, in one record (docs/product-map.md §7). The admin menu, the app's choices, the dashboard and the
 * console are built from it; `modules.test.ts` fails when a permission, setting, message, import or approval belongs to no
 * module or to two, so a new module cannot scatter.
 */
export interface ModuleManifest {
  key: string;
  name: string;
  blurb: string;
  state: CatalogueState;
  /** Rupees per student a year when the module is added on top of a plan; the console's Plans page can change it per plan. */
  addOnPerStudentYear: number;
  features: FeatureDef[];
  /** Core modules cannot be switched off. */
  core?: boolean;
  requires: string[];
  /** false while the module only exists in the mobile app on sample data. */
  backend: boolean;
  pages: AdminPage[];
  app: AppPiece[];
  /** Setting keys this module owns, shown together in the console's Configuration. */
  settings: string[];
  permissions: Permission[];
  /** Message keys (MESSAGE_EVENTS) it sends. */
  messages: string[];
  /** Import kinds (IMPORT_KINDS) that bring its data in. */
  imports: string[];
  /** Kinds of request it puts in the approvals queue. */
  approvals: ApprovalKind[];
  dashboard: DashboardPiece[];
}

const NONE = { pages: [], app: [], settings: [], permissions: [], messages: [], imports: [], approvals: [], dashboard: [] };
const planned = (key: string, name: string, blurb: string): ModuleManifest =>
  ({ key, name, blurb, state: 'planned', addOnPerStudentYear: 0, features: [], requires: ['people'], backend: false, ...NONE });
const P = (id: string, label: string, icon: string, keys: string, path: string, group: AdminGroup, anyOf: Permission[], extra: Partial<AdminPage> = {}): AdminPage =>
  ({ id, label, icon, keys, path, group, anyOf, ...extra });
const A = (slot: AppPiece['slot'], key: string, label: string, roles: AppRole[], feature?: string): AppPiece => ({ slot, key, label, roles, ...(feature ? { feature } : {}) });
const FAMILY: AppRole[] = ['parent', 'student'];
const EVERYONE: AppRole[] = ['parent', 'student', 'teacher', 'driver'];

/** One manifest per product module. Within a menu group, pages keep this order. */
export const MODULES: ModuleManifest[] = [
  {
    key: 'school', state: 'live', addOnPerStudentYear: 0, core: true, requires: [], backend: true,
    name: 'School', blurb: 'The dashboard, approvals, reports, the academic year, the school profile and its records.',
    features: [],
    pages: [
      P('dash', 'Dashboard', 'dash', 'G D', '/', 'Home', []),
      P('appr', 'Approvals', 'appr', 'G Q', '/approvals', 'Home', ['approvals.read'], { tabs: [{ key: 'waiting', label: 'Waiting for me' }, { key: 'sent', label: 'Sent by me' }, { key: 'decided', label: 'Decided' }] }),
      P('rep', 'Reports', 'rep', 'G R', '/reports', 'Home', ['reports.read'], { tabs: [{ key: 'attendance', label: 'Attendance', feature: 'attendance' }, { key: 'money', label: 'Money', feature: 'fees' }, { key: 'learning', label: 'Learning' }, { key: 'people', label: 'People' }] }),
      P('year', 'Academic year', 'year', 'G Y', '/year', 'School', ['settings.read', 'setup.write', 'year.manage'], {
        tabs: [{ key: 'terms', label: 'Years and terms' }, { key: 'holidays', label: 'Holidays' }, { key: 'classes', label: 'Classes' }, { key: 'subjects', label: 'Subjects' }, { key: 'bells', label: 'Bell times' }, { key: 'year-end', label: 'Year-end', anyOf: ['year.manage'] }],
      }),
      P('profile', 'School profile', 'set', 'G ,', '/profile', 'School', ['settings.read'], {
        tabs: [{ key: 'identity', label: 'Identity' }, { key: 'plan', label: 'Plan and modules' }, { key: 'app', label: 'The app' }, { key: 'roles', label: 'Roles' }, { key: 'messages', label: 'Messages' }, { key: 'privacy', label: 'Privacy notice' }, { key: 'data', label: 'Your data', anyOf: ['privacy.manage'] }],
      }),
      P('privacy', 'Privacy requests', 'inbox', 'G P', '/privacy', 'School', ['privacy.manage']),
      P('audit', 'Audit log', 'bp', 'G L', '/audit', 'School', ['audit.read']),
      P('move', 'Moving in', 'mig', 'G U', '/moving-in', 'School', ['setup.write'], { untilLive: true }),
    ],
    app: [A('dock', 'home', 'Home', EVERYONE)],
    settings: ['classes.schoolEdits', 'calendar.weeklyOff', 'calendar.weekStarts', 'calendar.schoolEdits', 'dashboard.rollClasses'],
    permissions: ['approvals.read', 'approvals.decide', 'settings.read', 'privacy.manage', 'audit.read', 'reports.read', 'setup.write', 'year.manage'],
    messages: ['privacy.answered'],
    imports: ['years', 'terms', 'holidays', 'subjects', 'periods', 'classes'],
    approvals: [],
    dashboard: [],
  },
  {
    key: 'people', state: 'live', addOnPerStudentYear: 0, core: true, requires: ['school'], backend: true,
    name: 'People', blurb: 'Students, guardians and staff.',
    features: [{ key: 'people.admissions', name: 'Admissions', state: 'live' }, { key: 'people.udise', name: 'UDISE+ export', state: 'planned' }],
    pages: [
      P('stu', 'Students', 'stu', 'G S', '/students', 'People', ['students.read'], { tabs: [{ key: 'list', label: 'Students' }, { key: 'app', label: 'On the app' }] }),
      P('staff', 'Staff', 'staff', 'G F', '/staff', 'People', ['staff.read']),
      P('adm', 'Admissions', 'adm', 'G M', '/admissions', 'People', ['admissions.read'], { feature: 'people.admissions' }),
    ],
    app: [A('dock', 'academics', 'Academics', FAMILY), A('dock', 'classes', 'My classes', ['teacher'])],
    settings: ['vocab.student', 'vocab.students', 'vocab.class', 'vocab.classes', 'people.houses', 'students.required', 'letters.family', 'letters.student', 'admissions.sources', 'admissions.stages', 'staff.schoolAssignsRoles'],
    permissions: ['students.read', 'students.write', 'staff.read', 'staff.write', 'admissions.read', 'admissions.write'],
    messages: ['admissions.offer', 'family.invite', 'student.invite', 'staff.invite', 'office.message'],
    imports: ['staff', 'students', 'contacts', 'admissions'],
    approvals: ['admission', 'photo'],
    dashboard: [{ kind: 'new', key: 'addStudent', label: 'Add student', blurb: 'A new student and their family', to: '/students?add=1', keys: 'N S', icon: 'stu', anyOf: ['students.write'] }],
  },
  {
    key: 'attendance', state: 'live', addOnPerStudentYear: 40, requires: ['people'], backend: true,
    name: 'Attendance', blurb: 'Daily roll calls, leave requests and alerts to families.',
    features: [
      { key: 'attendance.parentAlerts', name: 'Absence alerts to families', state: 'live' }, { key: 'attendance.teacherApp', name: 'Teachers mark from the app', state: 'live' },
      { key: 'attendance.periodWise', name: 'Attendance every period', state: 'live' }, { key: 'attendance.staff', name: 'Staff attendance', state: 'planned' },
      { key: 'attendance.biometric', name: 'Biometric and RFID', state: 'planned' },
    ],
    pages: [P('att', 'Attendance', 'att', 'G A', '/attendance', 'Teach', ['attendance.read'], { tabs: [{ key: 'roll', label: 'Roll call' }, { key: 'periods', label: 'Every period', feature: 'attendance.periodWise' }, { key: 'leave', label: 'Leave requests', anyOf: ['approvals.read'] }] })],
    app: [
      A('home', 'attendance', 'Attendance this month', FAMILY), A('quick', 'applyLeave', 'Apply for leave', ['parent']),
      A('quick', 'markAttendance', 'Mark attendance', ['teacher'], 'attendance.teacherApp'),
    ],
    settings: ['attendance.notifyParents', 'attendance.lockAfterDays', 'attendance.goalPct', 'attendance.statuses', 'leave.reasons'],
    permissions: ['attendance.read', 'attendance.mark'],
    messages: ['attendance.absent', 'attendance.reminder', 'leave.decided'],
    imports: ['attendance'],
    approvals: ['leave', 'attendance'],
    dashboard: [
      { kind: 'widget', key: 'rolls', label: 'Class rolls', blurb: 'Attendance of each class today' },
      { kind: 'new', key: 'markAttendance', label: 'Mark attendance', blurb: 'Today’s roll call', to: '/attendance', keys: 'N A', icon: 'att', anyOf: ['attendance.mark'] },
    ],
  },
  {
    key: 'timetable', state: 'live', addOnPerStudentYear: 40, requires: ['people'], backend: true,
    name: 'Timetable', blurb: 'Weekly periods, clashes and cover.',
    features: [{ key: 'timetable.cover', name: 'Cover for absent teachers', state: 'live' }],
    pages: [P('tt', 'Timetable', 'tt', 'G T', '/timetable', 'Teach', ['timetable.read'])],
    app: [
      A('dock', 'timetable', 'Timetable', ['parent', 'student', 'teacher']), A('home', 'dayRibbon', 'Today’s timetable', ['parent', 'student', 'teacher']),
      A('quick', 'timetable', 'Timetable', FAMILY),
    ],
    settings: ['timetable.schoolEdits'],
    permissions: ['timetable.read', 'timetable.edit', 'timetable.publish'],
    messages: ['timetable.published'],
    imports: ['timetable'],
    approvals: [],
    dashboard: [{ kind: 'widget', key: 'day', label: 'Today at school', blurb: 'The timeline of the school day' }],
  },
  {
    key: 'homework', state: 'live', addOnPerStudentYear: 40, requires: ['people'], backend: true,
    name: 'Homework', blurb: 'Set, hand in, grade and review homework.',
    features: [{ key: 'homework.onlineSubmission', name: 'Hand in from the app', state: 'live' }, { key: 'homework.grading', name: 'Grades and feedback', state: 'live' }],
    pages: [P('hw', 'Homework', 'hw', 'G H', '/homework', 'Teach', ['homework.read'])],
    app: [
      A('dock', 'homework', 'Homework', FAMILY), A('home', 'homework', 'Homework to do', FAMILY), A('quick', 'homework', 'Homework', FAMILY),
      A('quick', 'assignHomework', 'Set homework', ['teacher']), A('quick', 'grade', 'Grade', ['teacher'], 'homework.grading'),
    ],
    settings: ['homework.goalPct', 'homework.showClassProgress', 'homework.handedInBy', 'homework.defaultDueDays', 'homework.defaultMarks'],
    permissions: ['homework.read', 'homework.write'],
    messages: ['homework.new', 'homework.graded'],
    imports: [],
    approvals: [],
    dashboard: [],
  },
  {
    key: 'exams', state: 'live', addOnPerStudentYear: 60, requires: ['people'], backend: true,
    name: 'Exams and results', blurb: 'The exam timetable, marks, results and report cards.',
    features: [
      { key: 'exams.resultsInApp', name: 'Results in the app', state: 'live' }, { key: 'exams.reportCards', name: 'Report cards in board formats', state: 'planned' },
      { key: 'exams.hpc', name: 'NEP Holistic Progress Card', state: 'planned' },
    ],
    pages: [P('ex', 'Exams', 'ex', 'G X', '/exams', 'Teach', ['exams.read'])],
    app: [A('home', 'nextExam', 'Next exam', FAMILY), A('quick', 'enterMarks', 'Enter marks', ['teacher'])],
    settings: ['results.showRank', 'grading.scale', 'grading.passPct', 'exams.defaultMaxMarks', 'exams.leadDays'],
    permissions: ['exams.read', 'exams.write', 'exams.publish'],
    messages: ['exam.results', 'exam.reopened'],
    imports: ['marks'],
    approvals: [],
    dashboard: [{ kind: 'new', key: 'scheduleExam', label: 'Schedule an exam', blurb: 'Dates and subjects for a class', to: '/exams?new=1', keys: 'N E', icon: 'ex', anyOf: ['exams.write'] }],
  },
  {
    key: 'fees', state: 'live', addOnPerStudentYear: 80, requires: ['people'], backend: true,
    name: 'Fees', blurb: 'Fee structures, invoices, payments, receipts and reminders.',
    features: [
      { key: 'fees.onlinePayment', name: 'Families pay in the app', state: 'live' }, { key: 'fees.reminders', name: 'Fee reminders', state: 'live' },
      { key: 'fees.lateFines', name: 'Late fines', state: 'live' }, { key: 'fees.concessions', name: 'Concession rules', state: 'planned' },
      { key: 'fees.gstReceipts', name: 'GST receipts', state: 'live' }, { key: 'fees.refunds', name: 'Refunds', state: 'live' }, { key: 'fees.tally', name: 'Tally export', state: 'planned' },
    ],
    pages: [P('fee', 'Fees', 'fee', 'G E', '/fees', 'Money', ['fees.read'], {
      tabs: [{ key: 'overview', label: 'Overview' }, { key: 'invoices', label: 'Invoices' }, { key: 'receipts', label: 'Receipts' }, { key: 'online', label: 'Online payments', feature: 'fees.onlinePayment' }, { key: 'structure', label: 'Fee structure' }],
    })],
    app: [A('dock', 'fees', 'Fees', ['parent']), A('home', 'dueStack', 'Fees due', ['parent']), A('quick', 'payFees', 'Pay fees', ['parent'], 'fees.onlinePayment')],
    settings: [
      'fees.receiptPrefix', 'fees.receiptStart', 'fees.receiptNote', 'fees.paymentMethods', 'fees.lateFeePct', 'fees.remindDaysBefore', 'fees.gstin', 'fees.gstSac',
      'fees.gstRatePct', 'fees.gstHeads', 'fees.refundApprovalAbove', 'fees.dailyTarget', 'feeStructures.schoolEdits',
    ],
    permissions: ['fees.read', 'fees.collect', 'fees.waive', 'fees.refund'],
    messages: ['fees.reminder', 'fees.receipt', 'fees.refunded'],
    imports: ['fee_heads', 'fee_structures', 'fee_dues', 'payments'],
    approvals: ['fee_waiver', 'receipt_cancel'],
    dashboard: [
      { kind: 'widget', key: 'fees', label: 'Fees by type', blurb: 'What each kind of fee has collected' },
      { kind: 'new', key: 'collectFee', label: 'Collect a fee', blurb: 'Record a payment at the desk', to: '/fees?collect=1', keys: 'N F', icon: 'fee', anyOf: ['fees.collect'] },
    ],
  },
  {
    key: 'notices', state: 'live', addOnPerStudentYear: 20, requires: [], backend: true,
    name: 'Notices', blurb: 'Announcements to families and staff: scheduled, acknowledged and approved.',
    features: [{ key: 'notices.teacherPosts', name: 'Teachers post from the app', state: 'live' }],
    pages: [P('notice', 'Notices', 'notice', 'G N', '/notices', 'Reach', ['notices.read'])],
    app: [
      A('dock', 'notices', 'Notices', ['parent', 'student', 'teacher']), A('home', 'notices', 'Latest notices', ['parent', 'student', 'teacher']),
      A('quick', 'postNotice', 'Post a notice', ['teacher'], 'notices.teacherPosts'),
    ],
    settings: ['approvals.notice', 'notices.categories'],
    permissions: ['notices.read', 'notices.write', 'notices.publish', 'notices.pin'],
    messages: ['notice.published'],
    imports: [],
    approvals: ['notice'],
    dashboard: [{ kind: 'new', key: 'postNotice', label: 'Post a notice', blurb: 'To families, a class or staff', to: '/notices?new=1', keys: 'N N', icon: 'notice', anyOf: ['notices.write'] }],
  },
  {
    key: 'chat', state: 'live', addOnPerStudentYear: 40, requires: ['people'], backend: true,
    name: 'Messages', blurb: 'Conversations between staff and families.',
    features: [
      { key: 'chat.familyChat', name: 'Families start conversations', state: 'live' }, { key: 'chat.studentChat', name: 'Students message teachers', state: 'live' },
      { key: 'chat.calls', name: 'Families may call the office from the app', state: 'live' },
    ],
    pages: [P('msg', 'Messages', 'msg', 'G G', '/messages', 'Reach', ['messages.read'])],
    app: [A('dock', 'chat', 'Chat', EVERYONE), A('quick', 'messageTeacher', 'Message a teacher', FAMILY, 'chat.familyChat')],
    settings: [],
    permissions: ['messages.read', 'messages.write'],
    messages: ['chat.message'],
    imports: [],
    approvals: [],
    dashboard: [],
  },
  {
    key: 'events', state: 'live', addOnPerStudentYear: 20, requires: [], backend: true,
    name: 'Events', blurb: 'The school calendar, events and RSVPs.',
    features: [{ key: 'events.rsvp', name: 'RSVPs from families', state: 'live' }],
    pages: [P('evt', 'Events', 'evt', 'G V', '/events', 'Reach', ['events.read'])],
    app: [
      A('dock', 'events', 'Events', ['parent', 'student', 'teacher']), A('home', 'events', 'Coming up', ['parent', 'student', 'teacher']),
      A('quick', 'events', 'Events', FAMILY),
    ],
    settings: ['events.categories', 'events.showGoing'],
    permissions: ['events.read', 'events.write'],
    messages: ['event.created'],
    imports: [],
    approvals: [],
    dashboard: [],
  },
  {
    key: 'gallery', state: 'live', addOnPerStudentYear: 20, requires: ['people'], backend: true,
    name: 'Gallery', blurb: 'Albums by class and event, shared with families who consented to photos.',
    features: [{ key: 'gallery.downloads', name: 'Families save and share photos', state: 'live' }],
    pages: [P('gal', 'Gallery', 'photo', 'G O', '/gallery', 'Reach', ['gallery.read'])],
    app: [A('dock', 'gallery', 'Gallery', FAMILY)],
    settings: [],
    permissions: ['gallery.read', 'gallery.write'],
    messages: ['gallery.album'],
    imports: [],
    approvals: [],
    dashboard: [],
  },
  {
    key: 'library', state: 'live', addOnPerStudentYear: 30, requires: ['people'], backend: true,
    name: 'Library', blurb: 'The catalogue, loans to students and staff, fines and reservations.',
    features: [{ key: 'library.reservations', name: 'Reserve and renew from the app', state: 'live' }],
    pages: [P('lib', 'Library', 'book', 'G B', '/library', 'Campus', ['library.read'], { tabs: [{ key: 'books', label: 'Books' }, { key: 'loans', label: 'Loans' }, { key: 'waiting', label: 'Waiting' }] })],
    app: [A('dock', 'library', 'Library', ['parent', 'student', 'teacher'])],
    settings: ['library.loanDays', 'library.finePerDay', 'library.maxRenewals', 'library.maxLoans', 'library.staffMaxLoans'],
    permissions: ['library.read', 'library.write'],
    messages: ['library.ready', 'library.overdue', 'library.cancelled'],
    imports: ['library_books', 'library_loans'],
    approvals: [],
    dashboard: [],
  },
  {
    key: 'transport', state: 'live', addOnPerStudentYear: 60, requires: ['people'], backend: true,
    name: 'Transport', blurb: 'Routes, stops, who rides which bus, route fees, drivers’ trips and the live bus.',
    features: [{ key: 'transport.routes', name: 'Routes, stops and route fees', state: 'live' }, { key: 'transport.liveBus', name: 'Live bus tracking', state: 'live' }],
    pages: [P('bus', 'Transport', 'bus', 'G J', '/transport', 'Campus', ['transport.read'], {
      tabs: [{ key: 'routes', label: 'Routes' }, { key: 'riders', label: 'Riders' }, { key: 'live', label: 'Live bus', feature: 'transport.liveBus' }],
    })],
    app: [A('dock', 'transport', 'Transport', FAMILY), A('dock', 'trips', 'Trips', ['driver'], 'transport.liveBus')],
    settings: ['transport.nearMinutes', 'transport.familyCalls'],
    permissions: ['transport.read', 'transport.write'],
    messages: ['bus.near', 'bus.late', 'bus.dropped'],
    imports: ['transport'],
    approvals: [],
    dashboard: [],
  },
  // Not built yet (features master): the switch exists so plans and prices can name them; it cannot be turned on until they ship.
  planned('certificates', 'Certificates and ID cards', 'Transfer, bonafide and character certificates; printed ID cards.'),
  planned('diary', 'Digital diary', 'Daily diary and classwork notes to families.'),
  planned('visitors', 'Visitors and gate pass', 'Visitor log, gate passes and pick-up authorisation.'),
  planned('payroll', 'HR and payroll', 'Staff records, salary, payslips and statutory deductions.'),
  planned('lms', 'Study material and online tests', 'Course material, quizzes and online tests.'),
  planned('ptm', 'Parent-teacher meetings', 'Booking slots for parent-teacher meetings.'),
  planned('helpdesk', 'Helpdesk and grievances', 'Tickets and grievances from families and staff.'),
  planned('surveys', 'Surveys', 'Surveys and feedback forms.'),
  planned('health', 'Health and infirmary', 'Health records, infirmary visits and medication.'),
  planned('behaviour', 'Behaviour', 'Merits, incidents and follow-up.'),
  planned('hostel', 'Hostel', 'Rooms, allocation, attendance and hostel fees.'),
  planned('inventory', 'Inventory', 'Stock, assets and purchase records.'),
  planned('alumni', 'Alumni', 'Alumni directory and events.'),
  planned('campuses', 'Multi-campus view', 'One view across a trust’s schools.'),
  planned('canteen', 'Canteen wallet', 'Cashless canteen with a prepaid wallet.'),
  planned('assistant', 'AI assistant', 'At-risk alerts, report-card comment drafts and smart reminders.'),
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function moduleByKey(key: string): ModuleManifest | undefined {
  return BY_KEY.get(key);
}

export const CORE_MODULES = MODULES.filter((m) => m.core).map((m) => m.key);

/** Adds the modules each module needs, drops unknown keys, always keeps the core ones. Keeps manifest order. */
export function closeModules(keys: readonly string[]): string[] {
  const want = new Set<string>();
  const visit = (k: string) => {
    const m = BY_KEY.get(k);
    if (!m || want.has(k)) return;
    want.add(k);
    m.requires.forEach(visit);
  };
  CORE_MODULES.forEach(visit);
  keys.forEach(visit);
  return MODULES.filter((m) => want.has(m.key)).map((m) => m.key);
}

const FEATURES = new Map(MODULES.flatMap((m) => m.features.map((f) => [f.key, { ...f, module: m.key }] as const)));

export function featureByKey(key: string): (FeatureDef & { module: string }) | undefined {
  return FEATURES.get(key);
}

/** Modules the school has today: its entitlement within each module's dates (a trial ends, a module starts later), plus what they need. */
export function activeModules(ent: Pick<EntitlementDoc, 'modules' | 'dates'>, today: string = istToday()): string[] {
  const inDates = ent.modules.filter((k) => {
    const d = ent.dates?.[k];
    return !d || ((!d.from || d.from <= today) && (!d.until || today <= d.until));
  });
  return closeModules(inDates);
}

/** Features the school has inside `modules`: built ones are on unless the console switched them off; planned ones never are. */
export function activeFeatures(ent: Pick<EntitlementDoc, 'features'>, modules: readonly string[]): string[] {
  return MODULES.filter((m) => modules.includes(m.key)).flatMap((m) => m.features)
    .filter((f) => f.state !== 'planned' && ent.features?.[f.key] !== false).map((f) => f.key);
}

/** Modules that would stop working if `key` were switched off. */
export function dependents(key: string, enabled: readonly string[]): string[] {
  return enabled.filter((k) => k !== key && (BY_KEY.get(k)?.requires ?? []).includes(key));
}

/** Whether a school with these modules and features has `key` (a module or a feature). */
export const hasKey = (has: { modules: readonly string[]; features: readonly string[] }, key: string | undefined): boolean =>
  !key || has.modules.includes(key) || has.features.includes(key);

const pieces = (slot: AppPiece['slot']) => MODULES.flatMap((m) => m.app.filter((p) => p.slot === slot).map((p) => ({ ...p, module: m.key })));

/** What the app can put in its dock, on its home screen and in its quick buttons, with the module and roles of each: built from MODULES. */
export const APP_CATALOG: Record<AppPiece['slot'], (AppPiece & { module: string })[]> = { dock: pieces('dock'), home: pieces('home'), quick: pieces('quick') };

/** Every admin page with its module, in menu order. */
export const ADMIN_PAGES: (AdminPage & { module: string })[] = ADMIN_GROUPS.flatMap((g) => MODULES.flatMap((m) => m.pages.filter((p) => p.group === g).map((p) => ({ ...p, module: m.key }))));

/** The admin page a path belongs to: its own, or the closest one above it (`/students/x` is Students). */
export function pageForPath(path: string): (AdminPage & { module: string }) | undefined {
  return ADMIN_PAGES.find((p) => p.path === path) ?? ADMIN_PAGES.filter((p) => p.path !== '/' && path.startsWith(`${p.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
}

/** Whether a person with `permissions` (null: no check) may see something guarded by `anyOf`. */
const may = (permissions: readonly string[] | null, anyOf: readonly string[] | undefined) => !permissions || !anyOf?.length || anyOf.some((p) => permissions.includes(p));

/** The admin menu for a school: pages whose module (and feature) it has, that the person may open, Moving in only before go-live. */
export function adminMenu(has: { modules: readonly string[]; features: readonly string[] }, permissions: readonly string[] | null, live: boolean):
  { group: AdminGroup; pages: (AdminPage & { module: string })[] }[] {
  const shown = ADMIN_PAGES.filter((p) => has.modules.includes(p.module) && hasKey(has, p.feature) && may(permissions, p.anyOf) && !(p.untilLive && live))
    .map((p) => ({ ...p, tabs: p.tabs?.filter((t) => hasKey(has, t.feature) && may(permissions, t.anyOf)) }));
  return ADMIN_GROUPS.map((group) => ({ group, pages: shown.filter((p) => p.group === group) })).filter((g) => g.pages.length);
}

/** The dashboard's widgets and "new" shortcuts for a school and a person. */
export function dashboardPieces(has: { modules: readonly string[]; features: readonly string[] }, permissions: readonly string[] | null): (DashboardPiece & { module: string })[] {
  return MODULES.filter((m) => has.modules.includes(m.key)).flatMap((m) => m.dashboard.map((d) => ({ ...d, module: m.key })))
    .filter((d) => hasKey(has, d.feature) && may(permissions, d.anyOf));
}
