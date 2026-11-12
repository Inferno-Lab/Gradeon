import { z } from 'zod';
import { RESERVED_SLUGS, SLUG_RE } from './common.js';
import type { Limits, ModuleDates } from './config.js';

export const CONSOLE_ROLES = ['super_admin', 'implementation', 'support', 'release_manager', 'finance', 'compliance', 'auditor'] as const;
export const ConsoleRole = z.enum(CONSOLE_ROLES);
/** What each console role is called and what it is for, kept with the roles so every page says the same. */
export const CONSOLE_ROLE_INFO: Record<(typeof CONSOLE_ROLES)[number], { label: string; help: string }> = {
  super_admin: { label: 'Super admin', help: 'Everything, including the team and the rules for risky changes' },
  implementation: { label: 'Implementation', help: 'Set schools up: configuration, roles, imports and requests' },
  support: { label: 'Support', help: 'Look inside schools, read-only, in support sessions' },
  release_manager: { label: 'Release manager', help: 'Releases, database changes, app builds and flags' },
  finance: { label: 'Finance', help: 'Plans, prices, billing and invoices' },
  compliance: { label: 'Compliance', help: 'Agreements, breaches, erasure and data requests' },
  auditor: { label: 'Auditor', help: 'Read everything, change nothing' },
};
export type ConsoleRole = z.infer<typeof ConsoleRole>;

export const SchoolStatus = z.enum(['onboarding', 'live', 'suspended', 'moving', 'offboarding', 'archived']);
export type SchoolStatus = z.infer<typeof SchoolStatus>;

/** Where a cell runs. A cell has exactly one target; the blueprint steps are the same on every target. */
export const DeployTarget = z.enum(['local', 'free-test', 'aws-cell']);
/** What each place a school can run is called on every console page. */
export const DEPLOY_TARGET_LABELS: Record<z.infer<typeof DeployTarget>, string> = { local: 'This computer', 'free-test': 'Free test track', 'aws-cell': 'Cloud cell' };
export type DeployTarget = z.infer<typeof DeployTarget>;

export const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_RE, 'Use 4 to 32 letters, numbers or dashes, starting with a letter')
  .refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'That address is reserved');

export const STEP_KEYS = ['database', 'keys-storage', 'migrate-seed', 'domain', 'admin', 'build-profile', 'store-checklist'] as const;
export const StepKey = z.enum(STEP_KEYS);

/** What each setup step is called on screen. */
export const STEP_LABELS: Record<(typeof STEP_KEYS)[number], string> = {
  database: 'Database',
  'keys-storage': 'Keys and storage',
  'migrate-seed': 'Migrations and defaults',
  domain: 'Domain',
  admin: 'First admin',
  'build-profile': 'App build profile',
  'store-checklist': 'Store checklist',
};
export type StepKey = z.infer<typeof StepKey>;

export const BlueprintStep = z.object({
  key: StepKey,
  label: z.string().min(2).max(80),
  optional: z.boolean().default(false),
  enabled: z.boolean().default(true),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type BlueprintStep = z.infer<typeof BlueprintStep>;

export const BlueprintInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{2,40}$/),
  name: z.string().min(3).max(80),
  target: DeployTarget,
  plan: z.string().nullable().default(null),
  steps: z.array(BlueprintStep).min(1).max(20),
});
export type BlueprintInput = z.infer<typeof BlueprintInput>;

export interface BlueprintRow extends BlueprintInput {
  id: string;
  version: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

/** The order the steps must keep. A blueprint may drop optional steps and change params, not reorder past this. */
export function stepOrderProblem(steps: { key: StepKey; enabled?: boolean }[]): string | null {
  let last = -1;
  for (const s of steps) {
    const at = STEP_KEYS.indexOf(s.key);
    if (at <= last) return `“${s.key}” is out of order. Steps must follow: ${STEP_KEYS.join(', ')}.`;
    last = at;
  }
  const keys = steps.map((s) => s.key);
  for (const required of ['database', 'migrate-seed', 'admin'] as StepKey[]) {
    const s = steps.find((x) => x.key === required);
    if (!s || !keys.includes(required)) return `The “${required}” step is required.`;
    if (s.enabled === false) return `The “${required}” step cannot be switched off.`;
  }
  return null;
}

export interface PlanRow {
  key: string;
  name: string;
  perStudentYear: number;
  modules: string[];
  /** Features this plan leaves out (false), like fees.onlinePayment on a starter plan. Applied when a school takes the plan. */
  features?: Record<string, boolean>;
  limits: Limits;
  /** Schools on this plan now. */
  schools?: number;
}

/** A plan as the console edits it: price per student a year, the modules it brings, features it leaves out, and its limits. */
export const PlanSave = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,23}$/, 'Use 2 to 24 lowercase letters, numbers or dashes, starting with a letter'),
  name: z.string().trim().min(2, 'Enter the plan’s name').max(40),
  perStudentYear: z.number().int().min(0, 'Enter a price, or 0 for free').max(1_000_000),
  modules: z.array(z.string()).min(1, 'Choose at least one module'),
  features: z.record(z.string(), z.boolean()).default({}),
  limits: z.object({
    students: z.number().int().min(1, 'At least 1').max(1_000_000),
    staff: z.number().int().min(0).max(100_000).optional(),
    storageGb: z.number().int().min(1, 'At least 1').max(100_000),
    smsPerMonth: z.number().int().min(0).max(10_000_000),
  }),
});
export type PlanSave = z.infer<typeof PlanSave>;

/** The boards a school can follow: the one list the wizard and a school's details offer. */
export const SCHOOL_BOARDS = ['CBSE', 'ICSE', 'State', 'IB', 'International', 'Other'] as const;

/** What Gradeon keeps about a school beside its own settings: the contact for Gradeon, tax number and board. */
export const SchoolDetailsPatch = z.object({
  contact: z.object({ name: z.string().trim().min(2, 'Enter the contact’s name').max(80), phone: z.string().trim().min(8, 'Enter a phone number').max(24), email: z.string().trim().email('Enter a valid email') }),
  gstin: z.string().trim().max(20).default(''),
  board: z.enum(SCHOOL_BOARDS),
});
export type SchoolDetailsPatch = z.infer<typeof SchoolDetailsPatch>;

export const WizardBasics = z.object({
  name: z.string().trim().min(3, 'Enter the school’s full name').max(80),
  shortName: z.string().trim().min(2, 'Enter a short name').max(20),
  slug: Slug,
  board: z.enum(SCHOOL_BOARDS).default('CBSE'),
  address: z.string().trim().max(240).default(''),
  city: z.string().trim().max(60).default(''),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().min(8).max(20),
  contactEmail: z.string().trim().email('Enter a valid email'),
  gstin: z.string().trim().max(20).default(''),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

export const WizardPlan = z.object({
  plan: z.string().min(1, 'Choose a plan'),
  modules: z.array(z.string()).min(1, 'Switch on at least one module'),
  locks: z.array(z.string()).default([]),
  students: z.number().int().min(1).max(20000).default(500),
});

/** A logo image as the console sends it: PNG or JPEG, base64, at most 2 MB once decoded. */
export const LogoUpload = z.object({ name: z.string().min(1).max(120), mime: z.enum(['image/png', 'image/jpeg']), data: z.string().min(10).max(3_000_000) });
export type LogoUpload = z.infer<typeof LogoUpload>;

export const WizardBranding = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #6A4CF5'),
  logoText: z.string().trim().min(1).max(2),
  appName: z.string().trim().min(2).max(30),
  tagline: z.string().trim().max(120).default(''),
  /** Stored in the school's storage once set-up has made it. */
  logo: LogoUpload.nullable().default(null),
});

export const WizardPlacement = z.object({
  target: DeployTarget,
  cell: z.string().min(1),
  addressing: z.enum(['subdomain', 'path']).default('path'),
  customDomain: z.string().trim().max(120).default(''),
});

export const WizardAdmin = z.object({
  name: z.string().trim().min(2, 'Enter the admin’s name').max(80),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().min(8, 'Enter a phone number').max(20),
  invite: z.enum(['sms', 'email', 'both']).default('both'),
  roles: z.array(z.string()).default(['principal']),
});

export const WizardData = z.object({ start: z.enum(['empty', 'demo', 'import']).default('demo') });

export const WizardPayload = z.object({
  basics: WizardBasics,
  plan: WizardPlan,
  branding: WizardBranding,
  placement: WizardPlacement,
  admin: WizardAdmin,
  data: WizardData,
});
export type WizardPayload = z.infer<typeof WizardPayload>;

export const WIZARD_STEPS = ['basics', 'plan', 'branding', 'placement', 'admin', 'data'] as const;
export type WizardStepKey = (typeof WIZARD_STEPS)[number];

export interface WizardDraftRow {
  id: string;
  name: string;
  step: number;
  data: Partial<Record<WizardStepKey, unknown>>;
  updatedBy: string;
  updatedAt: string;
}

export interface ReviewItem {
  label: string;
  detail: string;
}
export interface WizardReview {
  summary: ReviewItem[];
  willDo: { key: StepKey; label: string; detail: string; optional: boolean }[];
  capacity: { cell: string; schools: number; max: number; ok: boolean };
  needsApproval: boolean;
  problems: string[];
}

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface RunStepRow {
  key: StepKey;
  label: string;
  status: StepStatus;
  optional: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  log: { at: string; level: 'info' | 'warn' | 'error'; text: string }[];
  error: string | null;
}
export interface ProvisionRunRow {
  id: string;
  schoolId: string;
  schoolName: string;
  blueprintKey: string;
  blueprintVersion: number;
  target: DeployTarget;
  dryRun: boolean;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  steps: RunStepRow[];
}

export interface SchoolRow {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  color: string;
  logoText: string;
  status: SchoolStatus;
  plan: string;
  cell: string;
  target: DeployTarget;
  region: string;
  versions: { api: string; admin: string; app: string };
  configVersion: number;
  students: number;
  health: 'ok' | 'degraded' | 'down' | 'unknown';
  healthMs: number | null;
  onboarding: { done: number; total: number };
  lastIncident: string | null;
  adminUrl: string;
  createdAt: string;
  /** When Gradeon pressed Go live; null while the school is still moving in. */
  wentLiveAt: string | null;
}

export interface SchoolDetail extends SchoolRow {
  contact: { name: string; phone: string; email: string };
  gstin: string;
  board: string;
  entitlement: {
    plan: string;
    /** As granted (with what they need), before dates are applied. */
    modules: string[];
    /** What the school has today: within dates. */
    active: string[];
    features: Record<string, boolean>;
    dates: Record<string, ModuleDates>;
    trialUntil: string | null;
    limits: Limits;
    locks: string[];
    version: number;
  };
  usage: { students: number; storageGb: number; sms: number; staff: number };
  checklist: { key: string; label: string; state: 'done' | 'waiting' | 'todo'; by: string | null; at: string | null }[];
  runs: ProvisionRunRow[];
  builds: BuildRow[];
}

export interface BuildRow {
  id: string;
  schoolId: string;
  platform: 'android' | 'ios';
  version: string;
  status: 'queued' | 'building' | 'done' | 'failed' | 'unavailable';
  url: string | null;
  note: string;
  createdAt: string;
}

export const ACTIONS = ['school.golive', 'school.suspend', 'school.resume', 'school.erase', 'entitlements.push', 'migration.run', 'domain.set', 'build.app', 'backup.take', 'backup.restore', 'school.move', 'config.apply', 'integration.live', 'integration.mode', 'retention.erase'] as const;
/** What each action is called on every console page (approvals, rules for risky changes, history). */
export const ACTION_LABELS: Record<(typeof ACTIONS)[number], string> = {
  'school.golive': 'Take a school live', 'school.suspend': 'Pause a school', 'school.resume': 'Bring a school back', 'school.erase': 'Erase a school',
  'entitlements.push': 'Change a school’s plan and modules', 'migration.run': 'Run database changes', 'domain.set': 'Change a school’s address',
  'build.app': 'Build a school’s app', 'backup.take': 'Take a backup', 'backup.restore': 'Restore a backup', 'school.move': 'Move a school to another cell',
  'config.apply': 'Change a risky setting', 'integration.live': 'Take a connection live', 'integration.mode': 'Switch the platform to live messages',
  'retention.erase': 'Erase leavers past retention',
};
export const ActionKey = z.enum(ACTIONS);
export type ActionKey = z.infer<typeof ActionKey>;

export const ActionRequest = z.object({
  action: ActionKey,
  /** Every action is about one school, except taking an integration live, which may serve them all. */
  schoolId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  dryRun: z.boolean().default(false),
  /** Danger actions need the school code typed exactly. */
  confirmCode: z.string().optional(),
});
export type ActionRequest = z.infer<typeof ActionRequest>;

export interface ActionRow {
  id: string;
  action: ActionKey;
  schoolId: string | null;
  schoolName: string | null;
  status: 'pending_approval' | 'running' | 'done' | 'failed' | 'rejected';
  requestedBy: string;
  approvedBy: string | null;
  dryRun: boolean;
  /** The result once it ran (or what was asked, before). */
  summary: string;
  /** What was asked for, in words. */
  asked: string;
  /** Settings it changes, from what they are now to what they become. */
  changes: { key: string; before: unknown; after: unknown }[];
  /** The requester's note, and why it was rejected. */
  note: string;
  decisionNote: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface PolicyDoc {
  approvals: Record<string, { needed: boolean; roles: ConsoleRole[] }>;
  waves: { name: string; matches: 'internal' | 'pilot' | 'rest'; batch: number }[];
  halt: { errorRatePct: number; p95Ms: number };
  freeze: boolean;
  /** Why changes are frozen, shown on every console page while they are. */
  freezeReason: string;
  naming: { slugPattern: string; bundlePrefix: string };
  maintenanceWindow: string;
}

export interface ReleaseRow {
  id: string;
  version: string;
  notes: string;
  status: 'draft' | 'rolling' | 'paused' | 'halted' | 'done' | 'rolled_back';
  createdBy: string;
  createdAt: string;
  waves: {
    name: string;
    status: 'pending' | 'rolling' | 'done' | 'halted';
    schools: { id: string; name: string; state: 'pending' | 'rolling' | 'done' | 'failed' | 'rolled_back'; prev?: string }[];
  }[];
  haltReason: string | null;
}

export interface MigrationRow {
  tag: string;
  kind: 'expand' | 'backfill' | 'contract';
  schools: { id: string; name: string; state: 'pending' | 'applied' | 'failed'; ms: number | null; error: string | null }[];
}

export interface FleetSummary {
  schools: number;
  live: number;
  onboarding: number;
  healthy: number;
  degraded: number;
  /** Average requests per minute in each hour of the day, today and the day before. */
  requests24h: { hour: number; value: number; previous: number }[];
  p95Ms: number;
  cells: { key: string; target: DeployTarget; schools: number; max: number; region: string }[];
  incident: { id: string; title: string; body: string; state: 'open' | 'resolved'; startedAt: string; schoolId: string | null; schoolName: string | null } | null;
  /** When the last request numbers were read (null before the first). */
  readingAt: string | null;
  upcoming: { name: string; id: string }[];
  release: ReleaseRow | null;
}

export interface SandboxMessage {
  id: string;
  schoolSlug: string;
  channel: 'sms' | 'email' | 'whatsapp' | 'push';
  to: string;
  subject: string | null;
  body: string;
  createdAt: string;
}

export interface ConsoleUserRow {
  id: string;
  name: string;
  email: string;
  roles: ConsoleRole[];
  status: 'active' | 'invited' | 'disabled';
  lastSeenAt: string | null;
  /** Has set up an authenticator app for the second sign-in step. */
  authenticator: boolean;
}

export interface ConsoleSession {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: ConsoleRole[];
}

export interface FlagRow {
  key: string;
  label: string;
  scope: 'fleet' | 'school';
  schoolId: string | null;
  enabled: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface SupportSessionRow {
  id: string;
  schoolId: string;
  schoolName: string;
  reason: string;
  status: 'requested' | 'active' | 'ended' | 'expired';
  expiresAt: string | null;
  startedBy: string;
}

/** One school's row in the console's module grid. */
export interface EntitlementRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  /** As granted, and what the school has today (within dates). */
  modules: string[];
  active: string[];
  features: Record<string, boolean>;
  dates: Record<string, ModuleDates>;
  trialUntil: string | null;
  limits: Limits;
  locks: string[];
}

export interface InvoiceRowC {
  id: string;
  schoolId: string;
  schoolName: string;
  period: string;
  amount: number;
  /** How the amount was worked out: the plan, then each module added on top of it. */
  lines: { label: string; amount: number }[];
  /** Overdue is worked out: sent and not paid by the due date. */
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  /** Fifteen days after the month ends. */
  dueOn: string;
  sentAt: string | null;
  sentTo: string | null;
  paidOn: string | null;
  paidRef: string | null;
}

export const InvoicePaid = z.object({ paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the day it was paid'), reference: z.string().trim().min(2, 'Enter the payment reference').max(80) });
export type InvoicePaid = z.infer<typeof InvoicePaid>;

/** What each console role may do. The console hides what a role cannot use and the API refuses it. */
export const CONSOLE_PERMISSIONS = [
  'schools.read', 'schools.write', 'schools.danger', 'blueprints.write', 'releases.write', 'builds.write', 'flags.write',
  'support.access', 'billing.read', 'billing.write', 'team.write', 'audit.read', 'policy.write', 'sandbox.read', 'compliance.write',
  // Set up a school: its configuration, roles, who is in which role, and the requests schools send.
  'schools.configure',
  // Third parties: connections, routes, templates and the delivery log.
  'integrations.read', 'integrations.write',
] as const;
export type ConsolePermission = (typeof CONSOLE_PERMISSIONS)[number];

export const CONSOLE_ROLE_PERMISSIONS: Record<ConsoleRole, readonly ConsolePermission[]> = {
  super_admin: CONSOLE_PERMISSIONS,
  implementation: ['schools.read', 'schools.configure', 'sandbox.read', 'audit.read', 'integrations.read', 'integrations.write'],
  support: ['schools.read', 'support.access', 'sandbox.read', 'audit.read', 'integrations.read'],
  release_manager: ['schools.read', 'releases.write', 'builds.write', 'flags.write', 'sandbox.read'],
  finance: ['schools.read', 'billing.read', 'billing.write'],
  compliance: ['schools.read', 'audit.read', 'billing.read', 'compliance.write'],
  auditor: ['schools.read', 'audit.read', 'billing.read', 'sandbox.read', 'integrations.read'],
};

export function consolePermissions(roles: readonly ConsoleRole[]): ConsolePermission[] {
  return [...new Set(roles.flatMap((r) => CONSOLE_ROLE_PERMISSIONS[r]))];
}

export interface ConsoleTokens {
  accessToken: string;
  /** Present for non-browser clients. The console website keeps the refresh token in an httpOnly cookie. */
  refreshToken?: string;
  expiresInSeconds: number;
  user: ConsoleSession & { permissions: ConsolePermission[] };
}

export type ConsoleLoginResponse =
  | {
    step: 'otp';
    challenge: {
      challengeId: string;
      /** email: we sent a code; app: the code is in the person's authenticator app. */
      channel: 'email' | 'app';
      maskedTo: string;
      expiresInSeconds: number;
      demoCode?: string;
      /** First sign-in without an authenticator: add this key to the app, then type its code. */
      enroll?: { secret: string; uri: string };
    };
  }
  | { step: 'done'; tokens: ConsoleTokens };

export interface SupportToken {
  token: string;
  adminUrl: string;
  expiresAt: string;
}

// Cells

export const CellCreate = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{1,22}[a-z0-9]$/, 'Use 3 to 24 letters, numbers or dashes, starting with a letter'),
  target: DeployTarget,
  region: z.string().trim().min(2, 'Name the region').max(40),
  maxSchools: z.number().int().min(1, 'At least 1').max(500),
  /** The School databases connection (Integrations) that makes its schools' databases; needed on aws-cell. */
  connectionId: z.string().nullable().default(null),
}).refine((c) => c.target !== 'aws-cell' || !!c.connectionId, { message: 'A cell on AWS needs its School databases connection.', path: ['connectionId'] });
export type CellCreate = z.infer<typeof CellCreate>;

export const CellPatch = z.object({
  region: z.string().trim().min(2).max(40).optional(),
  maxSchools: z.number().int().min(1).max(500).optional(),
  accepting: z.boolean().optional(),
  connectionId: z.string().nullable().optional(),
});
export type CellPatch = z.infer<typeof CellPatch>;

// Compliance desk

/** Who else handles a school's data: worked out from the Hub's live connections, not a list kept by hand. */
export interface SubprocessorRow { name: string; purpose: string; serves: string; region: string }

/** The notice a school gets about a breach: shown to the person sending it first, then sent as is. */
export const breachNotice = (school: string, title: string, note: string) =>
  `Gradeon has recorded an incident that may affect ${school}: ${title}. ${note}\nYou can use this to meet your 72-hour notification duty.`;

export const ComplianceCreate = z.object({
  schoolId: z.string().min(1, 'Choose a school'),
  kind: z.enum(['dpa', 'breach']),
  title: z.string().trim().min(3, 'Say what this is').max(120),
  note: z.string().trim().max(600).default(''),
});
export type ComplianceCreate = z.infer<typeof ComplianceCreate>;

export const ComplianceUpdate = z.object({
  status: z.enum(['open', 'signed', 'notified', 'closed']),
  note: z.string().trim().max(600).default(''),
  /** Signing: the day, who signed for the school, and the signed file (PDF or image, base64, up to 5 MB). */
  signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  signedBy: z.string().trim().min(2).max(80).optional(),
  file: z.object({ name: z.string().min(1).max(120), data: z.string().min(10).max(7_000_000) }).optional(),
});
export type ComplianceUpdate = z.infer<typeof ComplianceUpdate>;

export interface ComplianceRow {
  id: string;
  schoolId: string;
  schoolName: string;
  kind: 'dpa' | 'breach';
  title: string;
  status: 'open' | 'signed' | 'notified' | 'closed';
  note: string;
  createdBy: string;
  createdAt: string;
  /** A breach must reach the school within 72 hours of being found. */
  deadlineAt: string | null;
  closedAt: string | null;
  signedOn: string | null;
  signedBy: string | null;
  fileName: string | null;
}

/** A family's or staff member's data request at any school, for the one list across schools. */
export interface DataRequestAcross { id: string; schoolId: string; schoolName: string; kind: string; subjectName: string; requestedBy: string; status: string; createdAt: string }

export interface PublicStatus {
  updatedAt: string;
  state: 'ok' | 'degraded' | 'down';
  schools: { name: string; state: 'ok' | 'degraded' | 'down' }[];
  incidents: { id: string; title: string; open: boolean; startedAt: string; resolvedAt: string | null }[];
}

/** What the admin, the console and the app send when something breaks in the browser or on the phone. */
export const ClientError = z.object({
  source: z.enum(['admin', 'console', 'app']),
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().max(300).optional(),
  release: z.string().max(40).optional(),
});
export type ClientError = z.infer<typeof ClientError>;

export interface ErrorGroup {
  fingerprint: string;
  source: 'api' | 'console-api' | 'admin' | 'console' | 'app';
  schoolSlug: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  release: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
  /** Marked handled, and it has not happened since. */
  handledBy: string | null;
  handledAt: string | null;
}

export interface BackupRow {
  id: string;
  kind: 'daily' | 'manual';
  takenBy: string;
  bytes: number;
  takenAt: string;
}

/** A restore drill: one school's fresh backup put back into a scratch database and counted. */
export interface RestoreDrillRow {
  id: string;
  schoolName: string;
  ok: boolean;
  tables: number;
  rows: number;
  students: number;
  ms: number;
  error: string | null;
  by: string;
  at: string;
}

/** A school's configuration as the console edits it. */
export interface SchoolConfig {
  version: number;
  values: Record<string, unknown>;
  /** Modules the school has (its plan and dates): only their settings are shown. */
  entitled: string[];
  /** Features the school has inside those modules: roles only offer permissions for what the school has. */
  features: string[];
  roles: RoleDef[];
  classes: { id: string; name: string }[];
  /** The school's own fee heads (a list it keeps; fees.gstHeads picks from it). */
  feeHeads: { key: string; name: string }[];
  staff: { id: string; name: string; designation: string; roleId: string | null }[];
  versions: ConfigVersionRow[];
}

export interface RoleDef { id: string; key: string; name: string; description: string; permissions: string[]; locked: boolean; people: number }

export interface ConfigVersionRow { id: string; version: number; changes: { key: string; from: unknown; to: unknown }[]; note: string; by: string; at: string }

export const ConfigPatch = z.object({
  expectedVersion: z.number().int(),
  /** null puts a setting back to the platform default. */
  changes: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(200).default(''),
});
export type ConfigPatch = z.infer<typeof ConfigPatch>;

export const RoleDefSave = z.object({
  name: z.string().trim().min(2, 'Give the role a name').max(40),
  description: z.string().trim().max(160).default(''),
  permissions: z.array(z.string()).max(60),
});
export type RoleDefSave = z.infer<typeof RoleDefSave>;

export interface ConfigTemplateRow { id: string; name: string; keys: number; roles: number; createdBy: string; createdAt: string }

/** What a school asks Gradeon to change (the admin's "Ask Gradeon to change this"). */
export const ChangeRequestCreate = z.object({
  area: z.string().trim().min(2).max(60),
  message: z.string().trim().min(5, 'Say what you would like changed').max(1000),
});
export type ChangeRequestCreate = z.infer<typeof ChangeRequestCreate>;

export interface ChangeRequestRow {
  id: string; schoolId: string; schoolSlug: string; schoolName: string; area: string; message: string; requestedBy: string;
  status: 'open' | 'done' | 'declined'; answer: string; answeredBy: string | null; createdAt: string; closedAt: string | null;
}

/** The store ID a school's app is listed under: the same package name on Android and bundle ID on iPhone. */
export const appIdFor = (slug: string, prefix = 'com.gradeon.') => `${prefix.endsWith('.') ? prefix : `${prefix}.`}${slug.replace(/[^a-z0-9]/g, '')}`;

/** Console history in words: each entry's action key as people read it (every console page shows these, never the key). */
const AUDIT_WORDS: Record<string, string> = {
  'auth.authenticator_added': 'Added an authenticator', 'auth.authenticator_reset': 'Reset their authenticator', 'auth.password_changed': 'Changed their password',
  'auth.password_reset': 'Reset their password', 'auth.refresh_replayed': 'A stolen sign-in was stopped', 'billing.generated': 'Created the month’s invoices',
  'blueprint.activated': 'Switched a blueprint on', 'blueprint.saved': 'Saved a blueprint', 'build.requested': 'Asked for an app build', 'cell.changed': 'Changed a cell',
  'cell.created': 'Added a cell', 'cell.removed': 'Removed a cell', 'checklist.changed': 'Changed an app store step', 'config.changed': 'Changed settings', 'flag.removed': 'Removed a flag',
  'flag.set': 'Switched a flag', 'import.committed': 'Imported records', 'import.file_set_aside': 'Set a school’s file aside', 'import.sample_loaded': 'Loaded a test school',
  'import.undone': 'Undid an import', 'integration.allowlist': 'Changed who gets real messages in test', 'integration.changed': 'Changed a connection',
  'integration.created': 'Added a connection', 'integration.deleted': 'Deleted a connection', 'integration.mode': 'Switched messages to live or test',
  'integration.retried': 'Sent a failed message again', 'integration.routed': 'Chose a school’s connection', 'integration.template': 'Saved an approved template',
  'integration.template.deleted': 'Deleted an approved template', 'integration.tested': 'Tested a connection', 'integration.unrouted': 'Put a school back on Gradeon’s connection',
  'invoice.status': 'Changed an invoice', 'job.retried': 'Retried a background job', 'migration.readiness': 'Ticked a go-live item', 'plan.added': 'Added a plan',
  'plan.changed': 'Changed a plan', 'plan.removed': 'Removed a plan', 'policy.changed': 'Changed the rules for risky changes', 'provision.retried': 'Retried a set-up step',
  'provision.step_skipped': 'Skipped a set-up step', 'release.created': 'Created a release', 'release.done': 'Finished a release', 'release.halted': 'A release stopped by itself',
  'release.rolled_back': 'Marked a release rolled back', 'release.started': 'Started a release', 'role.removed': 'Removed a role', 'role.saved': 'Saved a role',
  'school.created': 'Created the school', 'school.details': 'Changed the school’s details', 'school.exported': 'Exported everything', 'school.logo': 'Changed the logo',
  'school.went_live': 'Took the school live', 'staff.role_set': 'Put a person into a role', 'support.ended': 'Ended a support session', 'support.started': 'Started a support session',
  'team.added': 'Added a team member', 'team.changed': 'Changed a team member', 'team.invited': 'Invited a team member', 'team.removed': 'Removed a team member', 'theme.changed': 'Changed the console colours',
  'request.done': 'Answered a request: done', 'request.declined': 'Answered a request: declined',
};
const PHASES: Record<string, string> = { requested: 'asked', rejected: 'rejected', finished: 'carried out', approved: 'approved' };

export function auditLabel(action: string): string {
  if (AUDIT_WORDS[action]) return AUDIT_WORDS[action]!;
  const m = /^action\.(.+)\.(requested|rejected|finished|approved)$/.exec(action);
  if (m && m[1]! in ACTION_LABELS) return `${ACTION_LABELS[m[1] as keyof typeof ACTION_LABELS]}: ${PHASES[m[2]!]}`;
  const c = /^compliance\.([a-z_]+)\.([a-z_]+)$/.exec(action);
  if (c) return `${c[1] === 'breach' ? 'Breach' : c[1] === 'agreement' ? 'Agreement' : 'Compliance item'} ${c[2]!.replace(/_/g, ' ')}`;
  return action.replace(/[._]/g, ' ').replace(/^./, (x) => x.toUpperCase());
}
