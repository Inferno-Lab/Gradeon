import { z } from 'zod';
import { ThemeColorsSchema, type AppMode, type ThemeColors } from './theme.js';


/** Attendance marks the data model knows; a school picks which it uses (`attendance.statuses`). */
export const ATTENDANCE_MARKS = ['present', 'absent', 'late', 'half_day', 'leave'] as const;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

/** A category of notices or events: its name, and the tone (a theme colour pair) it is drawn in. */
export const CATEGORY_TONES = ['v', 'g', 'a', 'c'] as const;
export const CATEGORY_TONE_LABELS: Record<(typeof CATEGORY_TONES)[number], string> = { v: 'Violet', g: 'Green', a: 'Amber', c: 'Coral' };
const CATEGORY = z.object({ key: z.string().regex(/^[a-z0-9-]{1,24}$/), name: z.string().trim().min(1).max(24), tone: z.enum(CATEGORY_TONES) });
export type Category = z.infer<typeof CATEGORY>;

/** The app's roles (config-engine's APP_ROLES is the same list). */
export const APP_ROLE_KEYS = ['parent', 'student', 'teacher', 'driver'] as const;
export type AppRoleKey = (typeof APP_ROLE_KEYS)[number];
const APP_LAYOUT = z.object({ dock: z.array(z.string()).max(4), home: z.array(z.string()).max(12), quick: z.array(z.string()).max(6) });
export type AppLayout = z.infer<typeof APP_LAYOUT>;
export const DEFAULT_APP_LAYOUT: Record<AppRoleKey, AppLayout> = {
  parent: { dock: ['home', 'academics', 'fees', 'chat'], home: ['dayRibbon', 'dueStack', 'attendance', 'nextExam', 'homework', 'notices', 'events'], quick: ['payFees', 'applyLeave', 'messageTeacher', 'timetable'] },
  student: { dock: ['home', 'homework', 'timetable', 'chat'], home: ['dayRibbon', 'homework', 'nextExam', 'notices', 'events'], quick: ['homework', 'timetable', 'events'] },
  teacher: { dock: ['home', 'classes', 'timetable', 'chat'], home: ['dayRibbon', 'notices', 'events'], quick: ['markAttendance', 'assignHomework', 'grade', 'postNotice'] },
  driver: { dock: ['home', 'trips', 'chat'], home: [], quick: [] },
};

/** Every setting a school can change (config layer 4). Defaults here are the platform defaults (layer 1). */
export const SchoolSettingsSchema = z.object({
  'school.name': z.string().min(2).max(80),
  'school.shortName': z.string().min(2).max(20),
  'school.tagline': z.string().max(120).default(''),
  'school.place': z.string().max(60).default(''),
  'school.phone': z.string().max(24).default(''),
  'school.email': z.string().max(120).default(''),
  'school.address': z.string().max(240).default(''),
  'school.language': z.enum(['en', 'hi', 'mr']).default('en'),
  'brand.color': z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #6A4CF5'),
  'brand.logoText': z.string().max(2).default(''),
  // Every colour of the school's admin and app that Gradeon changed from the design's defaults (keys from THEME_KEYS).
  'theme.colors': ThemeColorsSchema.default({}),
  'approvals.notice': z.enum(['required', 'off']).default('required'),
  'attendance.notifyParents': z.boolean().default(true),
  'attendance.lockAfterDays': z.number().int().min(0).max(30).default(2),
  'fees.lateFeePct': z.number().min(0).max(25).default(0),
  'fees.remindDaysBefore': z.number().int().min(0).max(30).default(3),
  'fees.dailyTarget': z.number().int().min(0).max(100000000).default(150000),
  'attendance.goalPct': z.number().min(50).max(100).default(95),
  'homework.goalPct': z.number().min(50).max(100).default(85),
  'dashboard.rollClasses': z.array(z.string()).max(8).default([]),
  'security.twoFactor': z.boolean().default(true),
  'security.passwordMinLength': z.number().int().min(8).max(64).default(8),
  'security.webSessionDays': z.number().int().min(1).max(30).default(7),
  'security.appSessionDays': z.number().int().min(1).max(90).default(30),
  // Whether the school may put its own staff into the roles Gradeon made for it. Roles themselves are set from the console only.
  'staff.schoolAssignsRoles': z.boolean().default(true),
  // The school's own data (its timetable today; classes, terms, holidays and fee structures as their screens arrive) stays with the
  // school, inside limits set here: each area has a switch that can lock it so only Gradeon changes it.
  'timetable.schoolEdits': z.boolean().default(true),
  'classes.schoolEdits': z.boolean().default(true),
  'calendar.schoolEdits': z.boolean().default(true),
  // The days the school is closed every week (holidays and second Saturdays are calendar entries). At least one day is a school day.
  'calendar.weeklyOff': z.array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).max(6).default(['sun']),
  'feeStructures.schoolEdits': z.boolean().default(true),
  // Receipt numbers: {year} becomes the year. The start lets a school arriving from another system keep its numbering.
  'fees.receiptPrefix': z.string().trim().min(1).max(20).default('RCPT-{year}-'),
  'fees.receiptStart': z.number().int().min(1).max(99_999_999).default(9001),
  // Printed under the school's name on every receipt: the trust, its registration or GST number.
  'fees.receiptNote': z.string().max(300).default(''),
  // How the office may record a payment (families pay in the app by UPI, card or net banking).
  // GST on receipts (feature fees.gstReceipts): the school's GSTIN, the service code and rate, and which fee heads are taxable.
  'fees.gstin': z.string().trim().regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'A GSTIN has 15 characters, like 27AAAAA0000A1Z5').default(''),
  'fees.gstSac': z.string().trim().max(8).default('999293'),
  'fees.gstRatePct': z.number().min(0).max(28).default(18),
  'fees.gstHeads': z.array(z.string()).default([]),
  // Refunds above this many rupees need a second person in the school (fees.refund on both).
  'fees.refundApprovalAbove': z.number().int().min(0).max(10_000_000).default(5000),
  // The school's logo image (a file kept in its storage); the letters stand in until there is one.
  'brand.logoFileId': z.string().default(''),
  // Library rules.
  'library.loanDays': z.number().int().min(1).max(60).default(14),
  'library.finePerDay': z.number().int().min(0).max(100).default(1),
  'library.maxRenewals': z.number().int().min(0).max(5).default(1),
  // Books a student, and a member of staff, may have out at once.
  'library.maxLoans': z.number().int().min(1).max(20).default(3),
  'library.staffMaxLoans': z.number().int().min(1).max(50).default(5),
  // Families are told the bus is near when it is this many minutes from their stop.
  'transport.nearMinutes': z.number().int().min(2).max(30).default(10),
  'fees.paymentMethods': z.array(z.enum(['cash', 'upi', 'card', 'netbanking', 'cheque'])).min(1).default(['cash', 'upi', 'card', 'netbanking', 'cheque']),
  'vocab.student': z.string().max(24).default('Student'),
  'vocab.class': z.string().max(24).default('Class'),
  // Plurals, for words that do not take an "s" ("Children"); empty means the singular with the usual English ending.
  'vocab.students': z.string().max(24).default(''),
  'vocab.classes': z.string().max(24).default(''),
  // Where enquiries come from, as the school counts them (Admissions and its reports).
  'admissions.sources': z.array(z.string().trim().min(1).max(40)).min(1).max(16).default(['Walk-in', 'Phone', 'Website', 'Referral', 'Event']),
  // The school's houses, if it has them: on student profiles, the roll-call grid and the app.
  'people.houses': z.array(z.object({ key: z.string().regex(/^[a-z0-9-]{1,24}$/), name: z.string().min(1).max(24), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(12).default([]),
  // The first column of every week grid (attendance, leave, the app's calendars).
  'calendar.weekStarts': z.enum(['mon', 'sun']).default('mon'),
  // The attendance marks the school uses (present and absent always).
  'attendance.statuses': z.array(z.enum(ATTENDANCE_MARKS)).min(2).default(['present', 'absent', 'late', 'leave']),
  // Reasons a family picks when asking for leave.
  'leave.reasons': z.array(z.string().trim().min(1).max(40)).min(1).max(12).default(['Unwell', 'Family function', 'Travel', 'Appointment', 'Other']),
  // Families see how many classmates have handed in; who may hand in from the app.
  'homework.showClassProgress': z.boolean().default(false),
  'homework.handedInBy': z.enum(['parent', 'student', 'either']).default('either'),
  // Results: class rank shown to families; the grading scale (highest first) and the pass mark.
  'results.showRank': z.boolean().default(false),
  'grading.scale': z.array(z.object({ grade: z.string().min(1).max(4), minPct: z.number().min(0).max(100) })).min(1).max(12).default([
    { grade: 'A1', minPct: 91 }, { grade: 'A2', minPct: 81 }, { grade: 'B1', minPct: 71 }, { grade: 'B2', minPct: 61 }, { grade: 'C1', minPct: 51 },
    { grade: 'C2', minPct: 41 }, { grade: 'D', minPct: 33 }, { grade: 'E', minPct: 0 },
  ]),
  'grading.passPct': z.number().min(0).max(100).default(33),
  // Categories of notices and events: one list each, used by the people who write them and the people who read them.
  'notices.categories': z.array(CATEGORY).min(1).max(16).default([
    { key: 'academic', name: 'Academic', tone: 'v' }, { key: 'exams', name: 'Exams', tone: 'c' }, { key: 'events', name: 'Events', tone: 'g' },
    { key: 'sports', name: 'Sports', tone: 'a' }, { key: 'holiday', name: 'Holiday', tone: 'g' }, { key: 'fees', name: 'Fees', tone: 'a' },
  ]),
  'events.categories': z.array(CATEGORY).min(1).max(16).default([
    { key: 'academic', name: 'Academic', tone: 'v' }, { key: 'cultural', name: 'Cultural', tone: 'g' }, { key: 'sports', name: 'Sports', tone: 'a' },
    { key: 'meeting', name: 'Meeting', tone: 'v' }, { key: 'holiday', name: 'Holiday', tone: 'c' },
  ]),
  // Families see how many are going to an event.
  'events.showGoing': z.boolean().default(false),
  // Who a family may call about the bus from the app (never the driver while driving).
  'transport.familyCalls': z.enum(['attendant', 'office', 'none']).default('office'),
  // Who signs in to the app, and what each role sees: its bottom tabs, Home cards and quick buttons.
  'app.roles': z.array(z.enum(APP_ROLE_KEYS)).default(['parent', 'teacher']),
  'app.layout': z.object({ parent: APP_LAYOUT, student: APP_LAYOUT, teacher: APP_LAYOUT, driver: APP_LAYOUT }).default(DEFAULT_APP_LAYOUT),
  // Which languages the app offers; the school's default language comes first.
  'app.languages': z.array(z.enum(['en', 'hi', 'mr'])).min(1).default(['en', 'hi', 'mr']),
  // Notifications: which message goes out on which channel, and when families are left in peace.
  'notify.rules': z.record(z.string(), z.object({ push: z.boolean(), sms: z.boolean(), email: z.boolean() })).default({}),
  'notify.quietFrom': z.string().regex(/^\d{2}:\d{2}$/, 'Use a time like 21:00').default('21:00'),
  'notify.quietTo': z.string().regex(/^\d{2}:\d{2}$/, 'Use a time like 07:00').default('07:00'),
  // Message templates by key, with {placeholders}. Empty means the built-in wording.
  'templates.messages': z.record(z.string(), z.string().max(320)).default({}),
  // Privacy and consent.
  'privacy.notice': z.string().max(4000).default(''),
  'privacy.officerName': z.string().max(80).default(''),
  'privacy.officerEmail': z.string().max(120).default(''),
  'privacy.officerPhone': z.string().max(24).default(''),
  'privacy.retentionMonths': z.number().int().min(12).max(120).default(36),
  'privacy.photoConsent': z.boolean().default(true),
  'privacy.consentRequired': z.boolean().default(true),
});
export type SchoolSettings = z.infer<typeof SchoolSettingsSchema>;
export type SettingKey = keyof SchoolSettings;

export const SettingsPatch = z.object({
  expectedVersion: z.number().int().optional(),
  changes: z.record(z.string(), z.unknown()),
});
export type SettingsPatch = z.infer<typeof SettingsPatch>;

export interface SettingsDoc {
  version: number;
  values: Record<string, unknown>;
  /** Keys the platform has locked: the school cannot change them. */
  locked: string[];
  updatedAt: string | null;
}

export interface SettingsResponse extends SettingsDoc {
  modules: { key: string; name: string; blurb: string; requires: string[]; core: boolean; backend: boolean; entitled: boolean }[];
  /** What the plan card shows: how much of the plan the school is using this month. */
  usage: { plan: string; students: number; staff: number; studentLimit: number; smsUsed: number; smsLimit: number };
}

/** A school's limits. Staff is optional because older entitlements did not have it (no limit then). */
export interface Limits { students: number; staff?: number; storageGb: number; smsPerMonth: number }

/** One module's dates for one school, ISO days in IST: a trial (until), a module that starts later (from), a contract end. */
export interface ModuleDates { from?: string; until?: string }

export interface EntitlementDoc {
  plan: string;
  modules: string[];
  /** Features switched away from the catalogue's default for this school (false takes a built feature away). */
  features?: Record<string, boolean>;
  /** Per-module dates; a module outside its dates counts as off everywhere. */
  dates?: Record<string, ModuleDates>;
  /** The school pays nothing until this day (inclusive). */
  trialUntil?: string;
  limits: Limits;
  locks: string[];
  overrides: Record<string, unknown>;
  version: number;
}

/** What a school's sign-in pages show before anyone signs in: who the school is, and its privacy notice. */
export interface SchoolBrand {
  name: string;
  shortName: string;
  color: string;
  logoText: string;
  /** A link to the school's logo image (valid an hour), or null while it has only letters. */
  logoUrl: string | null;
  tagline: string;
  language: string;
  demoMode: boolean;
  /** The school's colours, so the sign-in pages wear them before anyone signs in. */
  theme: ThemeColors;
  /** The app's full palette for each of its themes, worked out from the theme, so the app needs no colour arithmetic. */
  palette: Record<AppMode, Record<string, string>>;
  privacy: { notice: string; officerName: string; officerEmail: string; officerPhone: string };
}

export interface MenuGroup {
  group: string;
  pages: { id: string; module: string; label: string; icon: string; keys: string; href: string; tabs: { key: string; label: string; href: string }[] }[];
}

/** What the apps fetch: layers 1 to 5 resolved for one audience, with the version it was built from. */
export interface EffectiveConfig {
  version: number;
  school: { name: string; shortName: string; color: string; logoText: string; language: string; tagline: string; place: string; address: string; phone: string; email: string };
  modules: string[];
  /** Features inside those modules the school has (catalogue keys like fees.onlinePayment). */
  features: string[];
  /** The admin menu for this audience, built from the module definitions: groups of pages, each with its tabs. */
  menu: MenuGroup[];
  settings: Record<string, unknown>;
  vocabulary: Record<string, string>;
  limits: EntitlementDoc['limits'];
  /** The app: which roles may sign in, and each role's dock, Home cards and quick buttons, already limited to what the school has. */
  app: { roles: AppRoleKey[]; layout: Record<AppRoleKey, AppLayout> };
  privacy: { notice: string; officerName: string; officerEmail: string; officerPhone: string };
  /** Kill switches and rollouts the console set for this school. */
  flags: Record<string, boolean>;
}

/** What a person chooses for themselves (`/v1/me/prefs`): saved to their account, so it follows them from browser to phone. */
export const USER_PREFS = {
  /** The class the admin's Students page opens on. */
  'students.class': z.string().max(60).nullable(),
  /** The admin dashboard's cards, in order. */
  'dashboard.widgets': z.array(z.string().max(40)).max(12),
  /** Messages this person turned off in the app (message keys; urgent ones cannot be). */
  'notify.off': z.array(z.string().max(60)).max(60),
  /** The app's welcome after the first sign-in has been seen. */
  'welcome.seen': z.boolean(),
} as const;
export type UserPrefKey = keyof typeof USER_PREFS;
export const UserPrefPut = z.object({ key: z.enum(Object.keys(USER_PREFS) as [UserPrefKey, ...UserPrefKey[]]), value: z.unknown() });

/** A grading scale (`grading.scale`): each grade from the lowest percentage that earns it. */
export type GradingScale = { grade: string; minPct: number }[];
/** The grade a percentage earns on the school's scale ('' when the scale has no grade that low). */
export function gradeFor(pct: number, scale: GradingScale): string {
  return [...scale].sort((a, b) => b.minPct - a.minPct).find((g) => pct >= g.minPct)?.grade ?? '';
}
