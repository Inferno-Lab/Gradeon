import { istToday, type EntitlementDoc, type Permission } from '@gradeon/contracts';

export interface ModuleNav {
  label: string;
  icon: string;
  href: string;
  /** Needs at least one of these to show the item. */
  anyOf: Permission[];
}

/** live: built and sold. beta: built, given to pilot schools. planned: in the features master, not built yet (its switch cannot be turned on). */
export type CatalogueState = 'live' | 'beta' | 'planned';

/** A feature inside a module that the console can give or take per school, like online payment inside Fees. */
export interface FeatureDef {
  key: string;
  name: string;
  state: CatalogueState;
}

export interface ModuleManifest {
  key: string;
  name: string;
  blurb: string;
  state: CatalogueState;
  /** Rupees per student a year when the module is added on top of the plan. ponytail: working prices until the owner sets them. */
  addOnPerStudentYear: number;
  features: FeatureDef[];
  /** Core modules cannot be switched off. */
  core?: boolean;
  requires: string[];
  /** false while the module only exists in the mobile app on sample data. */
  backend: boolean;
  nav: ModuleNav[];
  /** Setting keys this module owns, shown together in the settings page. */
  settings: string[];
}

/** One manifest per product module. Plans, the admin menu, the app config and the wizard all read this list. */
export const MODULES: ModuleManifest[] = [
  {
    key: 'people',
    state: 'live',
    addOnPerStudentYear: 0,
    features: [{ key: 'people.admissions', name: 'Admissions', state: 'live' }, { key: 'people.udise', name: 'UDISE+ export', state: 'planned' }],
    name: 'People',
    blurb: 'Students, guardians and staff.',
    core: true,
    requires: [],
    backend: true,
    nav: [
      { label: 'Students', icon: 'students', href: '/students', anyOf: ['students.read'] },
      { label: 'Staff', icon: 'staff', href: '/staff', anyOf: ['staff.read'] },
      { label: 'Admissions', icon: 'admissions', href: '/admissions', anyOf: ['admissions.read'] },
    ],
    settings: ['vocab.student', 'vocab.class'],
  },
  {
    key: 'attendance',
    state: 'live',
    addOnPerStudentYear: 40,
    features: [{ key: 'attendance.parentAlerts', name: 'Absence alerts to families', state: 'live' }, { key: 'attendance.teacherApp', name: 'Teachers mark from the app', state: 'live' }, { key: 'attendance.staff', name: 'Staff attendance', state: 'planned' }, { key: 'attendance.biometric', name: 'Biometric and RFID', state: 'planned' }],
    name: 'Attendance',
    blurb: 'Daily roll calls and alerts to families.',
    requires: ['people'],
    backend: true,
    nav: [],
    settings: ['attendance.notifyParents', 'attendance.lockAfterDays'],
  },
  {
    key: 'fees',
    state: 'live',
    addOnPerStudentYear: 80,
    features: [{ key: 'fees.onlinePayment', name: 'Families pay in the app', state: 'live' }, { key: 'fees.reminders', name: 'Fee reminders', state: 'live' }, { key: 'fees.lateFines', name: 'Late fines', state: 'live' }, { key: 'fees.concessions', name: 'Concession rules', state: 'planned' }, { key: 'fees.gstReceipts', name: 'GST receipts', state: 'live' }, { key: 'fees.refunds', name: 'Refunds', state: 'live' }, { key: 'fees.tally', name: 'Tally export', state: 'planned' }],
    name: 'Fees',
    blurb: 'Invoices, payments, receipts and reminders.',
    requires: ['people'],
    backend: true,
    nav: [
      { label: 'Fees', icon: 'fees', href: '/fees', anyOf: ['fees.read'] },
      { label: 'Invoices', icon: 'invoices', href: '/invoices', anyOf: ['fees.read'] },
    ],
    settings: ['fees.lateFeePct', 'fees.remindDaysBefore', 'fees.gstin', 'fees.gstSac', 'fees.gstRatePct', 'fees.gstHeads', 'fees.refundApprovalAbove'],
  },
  {
    key: 'notices',
    state: 'live',
    addOnPerStudentYear: 20,
    features: [{ key: 'notices.teacherPosts', name: 'Teachers post from the app', state: 'live' }],
    name: 'Notices',
    blurb: 'Announcements to families and staff, with approvals.',
    requires: [],
    backend: true,
    nav: [{ label: 'Notices', icon: 'notices', href: '/notices', anyOf: ['notices.read'] }],
    settings: ['approvals.notice'],
  },
  {
    key: 'timetable',
    state: 'live',
    addOnPerStudentYear: 40,
    features: [{ key: 'timetable.cover', name: 'Cover for absent teachers', state: 'live' }],
    name: 'Timetable',
    blurb: 'Weekly periods, clashes and cover.',
    requires: ['people'],
    backend: true,
    nav: [{ label: 'Timetable', icon: 'timetable', href: '/timetable', anyOf: ['timetable.read'] }],
    settings: [],
  },
  { key: 'homework', state: 'live', addOnPerStudentYear: 40, features: [{ key: 'homework.onlineSubmission', name: 'Hand in from the app', state: 'live' }, { key: 'homework.grading', name: 'Grades and feedback', state: 'live' }], name: 'Homework', blurb: 'Set and review homework.', requires: ['people'], backend: true, nav: [{ label: 'Homework', icon: 'homework', href: '/homework', anyOf: ['homework.read'] }], settings: ['homework.goalPct'] },
  { key: 'exams', state: 'live', addOnPerStudentYear: 60, features: [{ key: 'exams.resultsInApp', name: 'Results in the app', state: 'live' }, { key: 'exams.reportCards', name: 'Report cards in board formats', state: 'planned' }, { key: 'exams.hpc', name: 'NEP Holistic Progress Card', state: 'planned' }], name: 'Exams and results', blurb: 'Marks, results and report cards.', requires: ['people'], backend: true, nav: [{ label: 'Exams', icon: 'exams', href: '/exams', anyOf: ['exams.read'] }], settings: [] },
  { key: 'events', state: 'live', addOnPerStudentYear: 20, features: [{ key: 'events.rsvp', name: 'RSVPs from families', state: 'live' }], name: 'Events', blurb: 'Calendar, events and RSVPs.', requires: [], backend: true, nav: [{ label: 'Events', icon: 'events', href: '/events', anyOf: ['events.read'] }], settings: [] },
  { key: 'chat', state: 'live', addOnPerStudentYear: 40, features: [{ key: 'chat.familyChat', name: 'Families start conversations', state: 'live' }], name: 'Messages', blurb: 'Chat between staff and families.', requires: ['people'], backend: true, nav: [{ label: 'Messages', icon: 'messages', href: '/messages', anyOf: ['messages.read'] }], settings: [] },
  { key: 'transport', state: 'live', addOnPerStudentYear: 60, features: [{ key: 'transport.routes', name: 'Routes, stops and route fees', state: 'live' }, { key: 'transport.liveBus', name: 'Live bus tracking', state: 'live' }], name: 'Transport', blurb: 'Routes, stops, who rides which bus, route fees and the live bus.', requires: ['people'], backend: true, nav: [{ label: 'Transport', icon: 'transport', href: '/transport', anyOf: ['transport.read'] }], settings: ['transport.nearMinutes'] },
  { key: 'library', state: 'live', addOnPerStudentYear: 30, features: [{ key: 'library.reservations', name: 'Reserve and renew from the app', state: 'live' }], name: 'Library', blurb: 'The catalogue, issue and return, fines and reservations.', requires: ['people'], backend: true, nav: [{ label: 'Library', icon: 'library', href: '/library', anyOf: ['library.read'] }], settings: ['library.loanDays', 'library.finePerDay', 'library.maxRenewals'] },
  { key: 'gallery', state: 'live', addOnPerStudentYear: 20, features: [], name: 'Gallery', blurb: 'Albums by class and event, shared with families who consented to photos.', requires: ['people'], backend: true, nav: [{ label: 'Gallery', icon: 'gallery', href: '/gallery', anyOf: ['gallery.read'] }], settings: [] },
  // Not built yet (features master): the switch exists so plans and prices can name them; it cannot be turned on until they ship.
  { key: 'certificates', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Certificates and ID cards', blurb: 'Transfer, bonafide and character certificates; printed ID cards.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'diary', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Digital diary', blurb: 'Daily diary and classwork notes to families.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'visitors', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Visitors and gate pass', blurb: 'Visitor log, gate passes and pick-up authorisation.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'payroll', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'HR and payroll', blurb: 'Staff records, salary, payslips and statutory deductions.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'lms', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Study material and online tests', blurb: 'Course material, quizzes and online tests.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'ptm', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Parent-teacher meetings', blurb: 'Booking slots for parent-teacher meetings.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'helpdesk', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Helpdesk and grievances', blurb: 'Tickets and grievances from families and staff.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'surveys', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Surveys', blurb: 'Surveys and feedback forms.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'health', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Health and infirmary', blurb: 'Health records, infirmary visits and medication.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'behaviour', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Behaviour', blurb: 'Merits, incidents and follow-up.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'hostel', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Hostel', blurb: 'Rooms, allocation, attendance and hostel fees.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'inventory', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Inventory', blurb: 'Stock, assets and purchase records.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'alumni', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Alumni', blurb: 'Alumni directory and events.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'campuses', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Multi-campus view', blurb: 'One view across a trust\u2019s schools.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'canteen', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'Canteen wallet', blurb: 'Cashless canteen with a prepaid wallet.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'assistant', state: 'planned', addOnPerStudentYear: 0, features: [], name: 'AI assistant', blurb: 'At-risk alerts, report-card comment drafts and smart reminders.', requires: ['people'], backend: false, nav: [], settings: [] },
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

/** What the app can put in its dock, on its home screen and in its quick buttons, and the module each needs. The App layout page edits the choice. */
export const APP_CATALOG = {
  dock: [
    { key: 'home', label: 'Home', module: 'people' },
    { key: 'academics', label: 'Academics', module: 'people' },
    { key: 'fees', label: 'Fees', module: 'fees' },
    { key: 'notices', label: 'Notices', module: 'notices' },
    { key: 'chat', label: 'Chat', module: 'chat' },
    { key: 'events', label: 'Events', module: 'events' },
    { key: 'transport', label: 'Transport', module: 'transport' },
    { key: 'library', label: 'Library', module: 'library' },
    { key: 'gallery', label: 'Gallery', module: 'gallery' },
  ],
  home: [
    { key: 'dayRibbon', label: 'Today\u2019s timetable', module: 'timetable' },
    { key: 'dueStack', label: 'Fees due', module: 'fees' },
    { key: 'attendance', label: 'Attendance this month', module: 'attendance' },
    { key: 'nextExam', label: 'Next exam', module: 'exams' },
    { key: 'homework', label: 'Homework to do', module: 'homework' },
    { key: 'notices', label: 'Latest notices', module: 'notices' },
    { key: 'events', label: 'Coming up', module: 'events' },
  ],
  quick: [
    { key: 'payFees', label: 'Pay fees', module: 'fees' },
    { key: 'applyLeave', label: 'Apply for leave', module: 'people' },
    { key: 'messageTeacher', label: 'Message a teacher', module: 'chat' },
    { key: 'timetable', label: 'Timetable', module: 'timetable' },
    { key: 'homework', label: 'Homework', module: 'homework' },
    { key: 'events', label: 'Events', module: 'events' },
  ],
} as const;
