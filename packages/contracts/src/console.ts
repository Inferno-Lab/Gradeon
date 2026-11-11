import { z } from 'zod';
import { RESERVED_SLUGS, SLUG_RE } from './common.js';
import type { Limits, ModuleDates } from './config.js';

export const CONSOLE_ROLES = ['super_admin', 'implementation', 'support', 'release_manager', 'finance', 'compliance', 'auditor'] as const;
export const ConsoleRole = z.enum(CONSOLE_ROLES);
export type ConsoleRole = z.infer<typeof ConsoleRole>;

export const SchoolStatus = z.enum(['onboarding', 'live', 'suspended', 'moving', 'offboarding', 'archived']);
export type SchoolStatus = z.infer<typeof SchoolStatus>;

/** Where a cell runs. A cell has exactly one target; the blueprint steps are the same on every target. */
export const DeployTarget = z.enum(['local', 'free-test', 'aws-cell']);
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
}

export const WizardBasics = z.object({
  name: z.string().trim().min(3, 'Enter the school’s full name').max(80),
  shortName: z.string().trim().min(2, 'Enter a short name').max(20),
  slug: Slug,
  board: z.enum(['CBSE', 'ICSE', 'State', 'IB', 'International', 'Other']).default('CBSE'),
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
  addOns: z.array(z.string()).default([]),
  locks: z.array(z.string()).default([]),
  students: z.number().int().min(1).max(20000).default(500),
});

export const WizardBranding = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #6A4CF5'),
  logoText: z.string().trim().min(1).max(2),
  appName: z.string().trim().min(2).max(30),
  tagline: z.string().trim().max(120).default(''),
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
}

export interface SchoolDetail extends SchoolRow {
  contact: { name: string; phone: string; email: string };
  gstin: string;
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
  checklist: { key: string; label: string; state: 'done' | 'waiting' | 'todo' }[];
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

export const ACTIONS = ['school.suspend', 'school.resume', 'school.erase', 'entitlements.push', 'migration.run', 'domain.set', 'build.app', 'backup.take', 'backup.restore', 'school.move', 'config.apply', 'integration.live', 'integration.mode', 'retention.erase'] as const;
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
  summary: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface PolicyDoc {
  approvals: Record<string, { needed: boolean; roles: ConsoleRole[] }>;
  waves: { name: string; matches: 'internal' | 'pilot' | 'rest'; batch: number }[];
  halt: { errorRatePct: number; p95Ms: number };
  freeze: boolean;
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
  incident: { id: string; title: string; body: string; state: 'open' | 'resolved'; startedAt: string; schoolName: string | null } | null;
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
  status: 'draft' | 'sent' | 'paid' | 'overdue';
}

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

export const SUBPROCESSORS = [
  { name: 'Neon', purpose: 'Databases for the registry and every school', region: 'Singapore' },
  { name: 'Render', purpose: 'Runs the platform and serves the admin and console', region: 'Singapore' },
  { name: 'GitHub', purpose: 'Source code and Android app builds', region: 'United States' },
] as const;

export const ComplianceCreate = z.object({
  schoolId: z.string().min(1, 'Choose a school'),
  kind: z.enum(['dpa', 'breach']),
  title: z.string().trim().min(3, 'Say what this is').max(120),
  note: z.string().trim().max(600).default(''),
});
export type ComplianceCreate = z.infer<typeof ComplianceCreate>;

export const ComplianceUpdate = z.object({ status: z.enum(['open', 'signed', 'notified', 'closed']), note: z.string().trim().max(600).default('') });
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
}

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
export const appIdFor = (slug: string) => `com.gradeon.${slug.replace(/[^a-z0-9]/g, '')}`;
