import {
  boolean,
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

export const cells = pgTable('cells', {
  key: text('key').primaryKey(),
  target: text('target').notNull(), // local | free-test | aws-cell
  region: text('region').notNull(),
  maxSchools: integer('max_schools').notNull().default(50),
  /** false closes the cell to new schools and moves into it. */
  accepting: boolean('accepting').notNull().default(true),
  createdAt: at('created_at'),
});

export const plans = pgTable('plans', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  perStudentYear: integer('per_student_year').notNull(),
  modules: jsonb('modules').$type<string[]>().notNull(),
  limits: jsonb('limits').$type<{ students: number; storageGb: number; smsPerMonth: number }>().notNull(),
});

export const schools = pgTable(
  'schools',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    color: text('color').notNull(),
    logoText: text('logo_text').notNull(),
    status: text('status').notNull().default('onboarding'),
    plan: text('plan').notNull().references(() => plans.key),
    cell: text('cell').notNull().references(() => cells.key),
    target: text('target').notNull(),
    region: text('region').notNull(),
    /** Connection string for the school's own database, sealed with the platform key. */
    dbUrlSealed: text('db_url_sealed'),
    dbName: text('db_name'),
    apiVersion: text('api_version').notNull().default('0.0.0'),
    adminVersion: text('admin_version').notNull().default('0.0.0'),
    appVersion: text('app_version').notNull().default('0.0.0'),
    configVersion: integer('config_version').notNull().default(1),
    entitlement: jsonb('entitlement')
      .$type<{
        modules: string[];
        limits: { students: number; storageGb: number; smsPerMonth: number };
        locks: string[];
        overrides: Record<string, unknown>;
        version: number;
      }>()
      .notNull(),
    contact: jsonb('contact').$type<{ name: string; phone: string; email: string }>().notNull(),
    gstin: text('gstin').notNull().default(''),
    board: text('board').notNull().default('CBSE'),
    address: text('address').notNull().default(''),
    addressing: text('addressing').notNull().default('path'),
    customDomain: text('custom_domain').notNull().default(''),
    appName: text('app_name').notNull().default(''),
    studentsCount: integer('students_count').notNull().default(0),
    health: text('health').notNull().default('unknown'),
    healthMs: integer('health_ms'),
    healthAt: timestamp('health_at', { withTimezone: true }),
    lastIncident: text('last_incident'),
    onboardingDone: integer('onboarding_done').notNull().default(0),
    onboardingTotal: integer('onboarding_total').notNull().default(8),
    checklist: jsonb('checklist').$type<Record<string, string>>().notNull().default({}),
    ring: text('ring').notNull().default('rest'),
    profileYaml: text('profile_yaml'),
    createdBy: text('created_by').notNull().default('system'),
    createdAt: at('created_at'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('schools_slug_uq').on(t.slug), index('schools_cell_idx').on(t.cell)],
);

export const blueprints = pgTable(
  'blueprints',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    target: text('target').notNull(),
    plan: text('plan'),
    steps: jsonb('steps').$type<unknown[]>().notNull(),
    active: boolean('active').notNull().default(false),
    createdBy: text('created_by').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [uniqueIndex('blueprints_key_version_uq').on(t.key, t.version)],
);

export const wizardDrafts = pgTable('wizard_drafts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  step: integer('step').notNull().default(0),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: text('updated_by').notNull(),
  updatedAt: at('updated_at'),
});

export const provisionRuns = pgTable(
  'provision_runs',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id').notNull(),
    schoolName: text('school_name').notNull(),
    blueprintKey: text('blueprint_key').notNull(),
    blueprintVersion: integer('blueprint_version').notNull(),
    target: text('target').notNull(),
    dryRun: boolean('dry_run').notNull().default(false),
    status: text('status').notNull().default('queued'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    steps: jsonb('steps').$type<unknown[]>().notNull(),
    startedAt: at('started_at'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('provision_runs_school_idx').on(t.schoolId)],
);

export const actions = pgTable('actions', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  schoolId: text('school_id'),
  schoolName: text('school_name'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull(),
  requestedBy: text('requested_by').notNull(),
  approvedBy: text('approved_by'),
  dryRun: boolean('dry_run').notNull().default(false),
  summary: text('summary').notNull().default(''),
  createdAt: at('created_at'),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const releases = pgTable('releases', {
  id: text('id').primaryKey(),
  version: text('version').notNull().unique(),
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('draft'),
  waves: jsonb('waves').$type<unknown[]>().notNull().default([]),
  haltReason: text('halt_reason'),
  createdBy: text('created_by').notNull(),
  createdAt: at('created_at'),
});

export const migrationRuns = pgTable(
  'migration_runs',
  {
    id: text('id').primaryKey(),
    tag: text('tag').notNull(),
    kind: text('kind').notNull(),
    schoolId: text('school_id').notNull(),
    state: text('state').notNull(), // pending | applied | failed
    ms: integer('ms'),
    error: text('error'),
    at: at('at'),
  },
  (t) => [uniqueIndex('migration_runs_uq').on(t.tag, t.schoolId)],
);

export const flags = pgTable(
  'flags',
  {
    key: text('key').notNull(),
    schoolId: text('school_id').notNull().default('*'),
    label: text('label').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    updatedBy: text('updated_by').notNull(),
    updatedAt: at('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.key, t.schoolId] }), index('flags_school_key_idx').on(t.schoolId, t.key)],
);

export const consoleSettings = pgTable('console_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: at('updated_at'),
});

export const builds = pgTable('builds', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull(),
  platform: text('platform').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull(),
  url: text('url'),
  note: text('note').notNull().default(''),
  createdAt: at('created_at'),
});

export const consoleUsers = pgTable(
  'console_users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    roles: jsonb('roles').$type<string[]>().notNull(),
    status: text('status').notNull().default('active'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    tokenVersion: integer('token_version').notNull().default(0),
    /** Sealed with SECRETS_KEY. */
    totpSecret: text('totp_secret'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: at('created_at'),
  },
  (t) => [uniqueIndex('console_users_email_uq').on(t.email)],
);

export const consoleSessions = pgTable(
  'console_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => consoleUsers.id, { onDelete: 'cascade' }),
    refreshHash: text('refresh_hash').notNull(),
    client: text('client').notNull().default('web'),
    createdAt: at('created_at'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('console_sessions_user_idx').on(t.userId)],
);

export const consoleOtp = pgTable(
  'console_otp',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => consoleUsers.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    /** email: a code we sent; app: the person's authenticator; enroll: first code from a new authenticator (pending_secret, sealed). */
    method: text('method').notNull().default('email'),
    pendingSecret: text('pending_secret'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('console_otp_user_idx').on(t.userId)],
);

export const supportSessions = pgTable('support_sessions', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull(),
  schoolName: text('school_name').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  startedBy: text('started_by').notNull(),
  approvedBy: text('approved_by'),
  createdAt: at('created_at'),
});

export const incidents = pgTable('incidents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  state: text('state').notNull(),
  schoolId: text('school_id'),
  startedAt: at('started_at'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull(),
  schoolName: text('school_name').notNull(),
  period: text('period').notNull(),
  amount: integer('amount').notNull(),
  status: text('status').notNull(),
  createdAt: at('created_at'),
});

export const sandboxMessages = pgTable(
  'sandbox_messages',
  {
    id: text('id').primaryKey(),
    schoolSlug: text('school_slug').notNull(),
    channel: text('channel').notNull(),
    toAddr: text('to_addr').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [index('sandbox_created_idx').on(t.createdAt)],
);

export const metricsMinute = pgTable(
  'metrics_minute',
  {
    at: timestamp('at', { withTimezone: true }).notNull(),
    schoolSlug: text('school_slug').notNull(),
    requests: integer('requests').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    p95Ms: integer('p95_ms').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.at, t.schoolSlug] })],
);

export const consoleAudit = pgTable(
  'console_audit',
  {
    id: text('id').primaryKey(),
    at: at('at'),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('console_audit_at_idx').on(t.at)],
);

export const complianceItems = pgTable('compliance_items', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull(),
  kind: text('kind').notNull(), // dpa | breach
  title: text('title').notNull(),
  status: text('status').notNull().default('open'), // open | signed | notified | closed
  note: text('note').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: at('created_at'),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});
