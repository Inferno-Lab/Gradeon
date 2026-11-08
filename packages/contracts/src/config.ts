import { z } from 'zod';
import { ThemeColorsSchema, type ThemeColors } from './theme.js';


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
  'modules.enabled': z.array(z.string()).default([]),
  'approvals.feeWaiver': z.enum(['principal', 'office', 'anyone']).default('principal'),
  'approvals.notice': z.enum(['required', 'off']).default('required'),
  'attendance.notifyParents': z.boolean().default(true),
  'attendance.lockAfterDays': z.number().int().min(0).max(30).default(2),
  'fees.lateFeePct': z.number().min(0).max(25).default(0),
  'fees.remindDaysBefore': z.number().int().min(0).max(30).default(3),
  'fees.dailyTarget': z.number().int().min(0).max(100000000).default(150000),
  'attendance.goalPct': z.number().min(50).max(100).default(95),
  'homework.goalPct': z.number().min(50).max(100).default(85),
  'term.name': z.string().max(30).default('Term 1'),
  'term.examsStart': z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  'students.pinnedClass': z.string().optional(),
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
  'feeStructures.schoolEdits': z.boolean().default(true),
  // Receipt numbers: {year} becomes the year. The start lets a school arriving from another system keep its numbering.
  'fees.receiptPrefix': z.string().trim().min(1).max(20).default('RCPT-{year}-'),
  'fees.receiptStart': z.number().int().min(1).max(99_999_999).default(9001),
  // Printed under the school's name on every receipt: the trust, its registration or GST number.
  'fees.receiptNote': z.string().max(300).default(''),
  // How the office may record a payment (families pay in the app by UPI, card or net banking).
  'fees.paymentMethods': z.array(z.enum(['cash', 'upi', 'card', 'netbanking', 'cheque'])).min(1).default(['cash', 'upi', 'card', 'netbanking', 'cheque']),
  'demo.mode': z.boolean().default(false),
  'vocab.student': z.string().max(24).default('Student'),
  'vocab.class': z.string().max(24).default('Class'),
  // The app: what sits in the dock, what the home screen shows, which quick buttons it offers.
  'app.dock': z.array(z.string()).max(4).default(['home', 'academics', 'fees', 'chat']),
  'app.home': z.array(z.string()).max(12).default(['dayRibbon', 'dueStack', 'attendance', 'nextExam', 'notices', 'events']),
  'app.quick': z.array(z.string()).max(6).default(['payFees', 'applyLeave', 'messageTeacher', 'timetable']),
  // Which languages the app offers; the school's default language comes first.
  'app.languages': z.array(z.enum(['en', 'hi', 'mr'])).min(1).default(['en', 'hi', 'mr']),
  // Whether teachers sign in to the app (families always do; teachers can always use the admin).
  'app.teachers': z.boolean().default(true),
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
  tagline: string;
  language: string;
  demoMode: boolean;
  /** The school's colours, so the sign-in pages wear them before anyone signs in. */
  theme: ThemeColors;
  privacy: { notice: string; officerName: string; officerEmail: string; officerPhone: string };
}

/** What the apps fetch: layers 1 to 5 resolved for one audience, with the version it was built from. */
export interface EffectiveConfig {
  version: number;
  school: { name: string; shortName: string; color: string; logoText: string; language: string; tagline: string };
  modules: string[];
  /** Features inside those modules the school has (catalogue keys like fees.onlinePayment). */
  features: string[];
  nav: { module: string; label: string; icon: string; href: string }[];
  settings: Record<string, unknown>;
  vocabulary: Record<string, string>;
  limits: EntitlementDoc['limits'];
  /** What the mobile app lays out: dock, home sections and quick actions, already limited to modules the school has. */
  app: { dock: string[]; home: string[]; quick: string[] };
  /** Kill switches and rollouts the console set for this school. */
  flags: Record<string, boolean>;
}
