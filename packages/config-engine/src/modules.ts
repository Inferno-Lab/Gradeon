import type { Permission } from '@gradeon/contracts';

export interface ModuleNav {
  label: string;
  icon: string;
  href: string;
  /** Needs at least one of these to show the item. */
  anyOf: Permission[];
}

export interface ModuleManifest {
  key: string;
  name: string;
  blurb: string;
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
    name: 'Attendance',
    blurb: 'Daily roll calls and alerts to families.',
    requires: ['people'],
    backend: true,
    nav: [],
    settings: ['attendance.notifyParents', 'attendance.lockAfterDays'],
  },
  {
    key: 'fees',
    name: 'Fees',
    blurb: 'Invoices, payments, receipts and reminders.',
    requires: ['people'],
    backend: true,
    nav: [
      { label: 'Fees', icon: 'fees', href: '/fees', anyOf: ['fees.read'] },
      { label: 'Invoices', icon: 'invoices', href: '/invoices', anyOf: ['fees.read'] },
    ],
    settings: ['fees.lateFeePct', 'fees.remindDaysBefore'],
  },
  {
    key: 'notices',
    name: 'Notices',
    blurb: 'Announcements to families and staff, with approvals.',
    requires: [],
    backend: true,
    nav: [{ label: 'Notices', icon: 'notices', href: '/notices', anyOf: ['notices.read'] }],
    settings: ['approvals.notice'],
  },
  {
    key: 'timetable',
    name: 'Timetable',
    blurb: 'Weekly periods, clashes and cover.',
    requires: ['people'],
    backend: true,
    nav: [{ label: 'Timetable', icon: 'timetable', href: '/timetable', anyOf: ['timetable.read'] }],
    settings: [],
  },
  { key: 'homework', name: 'Homework', blurb: 'Set and review homework.', requires: ['people'], backend: true, nav: [{ label: 'Homework', icon: 'homework', href: '/homework', anyOf: ['homework.read'] }], settings: ['homework.goalPct'] },
  { key: 'exams', name: 'Exams and results', blurb: 'Marks, results and report cards.', requires: ['people'], backend: true, nav: [{ label: 'Exams', icon: 'exams', href: '/exams', anyOf: ['exams.read'] }], settings: [] },
  { key: 'events', name: 'Events', blurb: 'Calendar, events and RSVPs.', requires: [], backend: true, nav: [{ label: 'Events', icon: 'events', href: '/events', anyOf: ['events.read'] }], settings: [] },
  { key: 'chat', name: 'Messages', blurb: 'Chat between staff and families.', requires: ['people'], backend: true, nav: [{ label: 'Messages', icon: 'messages', href: '/messages', anyOf: ['messages.read'] }], settings: [] },
  { key: 'transport', name: 'Transport', blurb: 'Routes, stops and live bus.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'library', name: 'Library', blurb: 'Books and loans.', requires: ['people'], backend: false, nav: [], settings: [] },
  { key: 'gallery', name: 'Gallery', blurb: 'Photos with consent.', requires: [], backend: false, nav: [], settings: [] },
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
    { key: 'busEta', label: 'Bus arrival', module: 'transport' },
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
