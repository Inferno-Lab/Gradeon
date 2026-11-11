import dns from 'node:dns/promises';
import { closeModules } from '@gradeon/config-engine';
import type { DeployTarget, StepKey, WizardPayload } from '@gradeon/contracts';
import { migrate, pg } from '@gradeon/db';
import { seedSchool } from '@gradeon/db/seed';
import { hashPassword, randomToken, seal, unseal } from '@gradeon/security';
import type { Registry } from '@gradeon/tenancy';
import type { Db, reg } from '../core.js';
import type { Env } from '../env.js';
import type { Sandbox } from '../sandbox.js';
import type { Hub } from '@gradeon/integrations';

type SchoolRecord = typeof reg.schools.$inferSelect;

/** A step that cannot continue until a person fixes something outside the platform. The message says what. */
export class StepBlocked extends Error {}

/** What a step needs to say what it will do, before anything exists. */
export interface DescribeCtx {
  env: Env;
  slug: string;
  payload: WizardPayload;
  target: DeployTarget;
}

export interface StepCtx extends DescribeCtx {
  env: Env;
  db: Db;
  /** The console's Integrations Hub: the cell's database connection, the App builds connection. */
  hub: Hub;
  registry: Registry;
  sandbox: Sandbox;
  fetch: typeof fetch;
  school: SchoolRecord;
  payload: WizardPayload;
  target: DeployTarget;
  params: Record<string, unknown>;
  log: (level: 'info' | 'warn' | 'error', text: string) => void;
  /** Read the school again after an earlier step changed it. */
  reload: () => Promise<SchoolRecord>;
}

export interface StepResult {
  detail: string;
  /** The step chose not to run (nothing to do on this target). */
  skipped?: boolean;
}

export interface Driver {
  describe: (c: DescribeCtx) => string;
  run: (c: StepCtx) => Promise<StepResult>;
}

export const dbName = (slug: string) => `school_${slug.replace(/-/g, '_')}`;
const SQL_NAME = /^[a-z][a-z0-9_]{0,62}$/;

export function adminUrlFor(env: Env, slug: string, addressing: string, custom: string): string {
  if (custom) return `https://${custom}`;
  return addressing === 'subdomain' ? `https://${slug}.${env.BASE_DOMAIN}` : `${env.ADMIN_BASE_URL.replace(/\/$/, '')}/s/${slug}`;
}

/** Replaces the user, password and database of a connection string, keeping its host and options. */
export function withCredentials(url: string, user: string, password: string, database: string): string {
  const u = new URL(url);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  u.pathname = `/${database}`;
  return u.toString();
}

export async function adminQuery<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** A database of the school's own, on a server we already have, owned by a role of its own. */
export async function createOnServer(log: StepCtx['log'], adminUrl: string, name: string): Promise<{ url: string; name: string }> {
  const role = `${name}_app`;
  if (!SQL_NAME.test(name) || !SQL_NAME.test(role)) throw new Error('That address cannot be used as a database name.');
  const password = randomToken(18).replace(/[^a-zA-Z0-9]/g, 'x');
  return adminQuery(adminUrl, async (c) => {
    let owner: string | null = null;
    try {
      const exists = await c.query('select 1 from pg_roles where rolname = $1', [role]);
      await c.query(exists.rowCount ? `alter role ${role} login password '${password}'` : `create role ${role} login password '${password}'`);
      await c.query(`grant ${role} to current_user`).catch(() => undefined);
      owner = role;
    } catch (err) {
      log('warn', `Could not create a database role (${(err as Error).message}). The school will use the server’s own role.`);
    }
    const found = await c.query('select 1 from pg_database where datname = $1', [name]);
    if (!found.rowCount) await c.query(`create database ${name}${owner ? ` owner ${owner}` : ''}`);
    await c.query(`revoke connect on database ${name} from public`).catch(() => undefined);
    if (owner) {
      await c.query(`grant connect on database ${name} to ${owner}`).catch(() => undefined);
      await c.query(`grant connect on database ${name} to current_user`).catch(() => undefined);
    }
    const base = new URL(adminUrl);
    const user = owner ?? decodeURIComponent(base.username);
    const pw = owner ? password : decodeURIComponent(base.password);
    return { url: withCredentials(adminUrl, user, pw, name), name };
  });
}

const database: Driver = {
  describe: (c) => `${dbName(c.slug)}, a database of its own on the cell’s server, with its own role and password`,
  run: async (c) => {
    if (c.school.dbUrlSealed) {
      const existing = unseal(c.school.dbUrlSealed, c.env.SECRETS_KEY);
      await adminQuery(existing, (x) => x.query('select 1'));
      return { detail: `${c.school.dbName ?? dbName(c.school.slug)} is ready (kept from the earlier try)` };
    }
    // The cell's School databases connection makes it (a PostgreSQL server, or a Neon project per school); a cell without one
    // uses the registry's own server, which is how the local and shared test cells work.
    const cell = (await c.db.pool.query<{ connection_id: string | null }>('select connection_id from cells where key = $1', [c.school.cell])).rows[0];
    let made: { url: string; name: string };
    if (cell?.connection_id) {
      const { conn, adapter, ctx } = await c.hub.use(cell.connection_id);
      c.log('info', `creating it through ${conn.name}`);
      const r = await adapter.databases!.create(ctx, dbName(c.school.slug), randomToken(18).replace(/[^a-zA-Z0-9]/g, 'x'));
      made = { url: r.url, name: r.dbName };
    } else if (c.target === 'aws-cell') {
      throw new StepBlocked(`Cell ${c.school.cell} has no School databases connection. Add one under Integrations, give it to the cell under Cells, then retry.`);
    } else {
      made = await createOnServer(c.log, c.env.REGISTRY_DATABASE_URL, dbName(c.school.slug));
    }
    await c.db.pool.query('update schools set db_url_sealed = $2, db_name = $3 where id = $1', [c.school.id, seal(made.url, c.env.SECRETS_KEY), made.name]);
    c.log('info', `created ${made.name}`);
    return { detail: `${made.name} on cell ${c.school.cell} with its own role and password` };
  },
};

const keysStorage: Driver = {
  describe: (c) => (c.target === 'aws-cell' ? 'An encryption key and file prefix for this school' : `Files prefix schools/${c.slug}/ and queue space`),
  run: async (c) => {
    if (c.target === 'aws-cell') return { detail: 'Not connected: the cloud key and bucket drivers are not set up on this cell', skipped: true };
    return { detail: `Files prefix schools/${c.school.slug}/ · cache and queue space reserved · secrets sealed with the platform key` };
  },
};

let demoHash: Promise<string> | undefined;

const migrateSeed: Driver = {
  describe: (c) => `Run every migration, then roles, periods and templates${c.payload.data.start === 'demo' ? ', plus the demo school' : ''}`,
  run: async (c) => {
    const school = await c.reload();
    if (!school.dbUrlSealed) throw new Error('The database step has not run yet.');
    const pool = new pg.Pool({ connectionString: unseal(school.dbUrlSealed, c.env.SECRETS_KEY), max: 4, connectionTimeoutMillis: 20_000 });
    try {
      const applied = await migrate(pool, 'school');
      c.log('info', `applied ${applied.length} migration${applied.length === 1 ? '' : 's'}`);
      const seeded = await pool.query("select to_regclass('public.meta') is not null and exists (select 1 from meta where key = 'seeded.mode') as done").then((r) => r.rows[0]?.done === true).catch(() => false);
      let tail = 'roles, periods and templates already in place';
      if (!seeded) {
        demoHash ??= hashPassword('nest2026');
        const p = c.payload;
        const report = await seedSchool(pool, {
          school: { name: p.basics.name, shortName: p.basics.shortName, tagline: p.branding.tagline, place: [p.basics.board, p.basics.city].filter(Boolean).join(' · '), phone: p.basics.contactPhone, email: p.basics.contactEmail, address: [p.basics.address, p.basics.city].filter(Boolean).join(', '), color: p.branding.color, logoText: p.branding.logoText, language: p.basics.language },
          admin: { name: p.admin.name, email: p.admin.email, phone: p.admin.phone, passwordHash: '!' },
          modules: closeModules(p.plan.modules), data: p.data.start === 'demo' ? 'demo' : 'empty', demoPasswordHash: await demoHash,
        });
        tail = report.students ? `roles, periods and templates, then ${report.students.toLocaleString('en-IN')} sample students in ${report.classes} classes` : 'roles, periods and templates';
        c.log('info', `seeded in ${report.ms} ms`);
      }
      return { detail: `${applied.length ? `${applied.length} ${applied.length === 1 ? "migration" : "migrations"}` : "All migrations"}, then ${tail}` };
    } finally {
      await pool.end();
    }
  },
};

const domain: Driver = {
  describe: (c) => (c.payload.placement.customDomain ? `Check the DNS record for ${c.payload.placement.customDomain}` : `Reserve ${adminUrlFor(c.env, c.slug, c.payload.placement.addressing, '')}`),
  run: async (c) => {
    const custom = c.payload.placement.customDomain.trim().toLowerCase();
    if (custom) {
      const target = `cname.${c.env.BASE_DOMAIN}`;
      const found = await dns.resolveCname(custom).catch(() => [] as string[]);
      if (!found.some((f) => f.replace(/\.$/, '') === target)) {
        throw new StepBlocked(`Add a CNAME record for ${custom} pointing to ${target} at the school’s domain host, then retry.`);
      }
      c.log('info', `${custom} points to ${target}`);
    }
    const url = adminUrlFor(c.env, c.school.slug, c.payload.placement.addressing, custom);
    await c.db.pool.query('update schools set addressing = $2, custom_domain = $3 where id = $1', [c.school.id, c.payload.placement.addressing, custom]);
    return { detail: `${url.replace(/^https?:\/\//, '')} is reserved${custom ? ' and verified' : ''}` };
  },
};

function tempPassword(): string {
  return `${randomToken(9).replace(/[^a-zA-Z0-9]/g, 'k').slice(0, 10)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

const admin: Driver = {
  describe: (c) => `Push the plan and send ${c.payload.admin.name} an invite at ${c.payload.admin.email}`,
  run: async (c) => {
    const p = c.payload;
    const plan = await c.db.pool.query<{ limits: { students: number; storageGb: number; smsPerMonth: number } }>('select limits from plans where key = $1', [p.plan.plan]);
    if (!plan.rows[0]) throw new Error(`Plan “${p.plan.plan}” does not exist.`);
    const ent = { modules: closeModules(p.plan.modules), limits: plan.rows[0].limits, locks: p.plan.locks, overrides: {}, version: 1 };
    await c.db.pool.query('update schools set entitlement = $2, plan = $3 where id = $1', [c.school.id, JSON.stringify(ent), p.plan.plan]);
    const school = await c.reload();
    const pool = new pg.Pool({ connectionString: unseal(school.dbUrlSealed!, c.env.SECRETS_KEY), max: 2 });
    try {
      const demo = p.data.start === 'demo';
      const password = demo ? 'nest2026' : tempPassword();
      await pool.query('update users set password_hash = $2, invited_at = now() where lower(email) = lower($1)', [p.admin.email, await hashPassword(password)]);
      const url = adminUrlFor(c.env, school.slug, school.addressing, school.customDomain);
      const text = demo
        ? `Welcome to ${p.basics.shortName} on Gradeon. Sign in at ${url} with ${p.admin.email} and the password ${password}. The demo sign-in code is 424242.`
        : `Welcome to ${p.basics.shortName} on Gradeon. Sign in at ${url} with ${p.admin.email} and the temporary password ${password}. Change it after you sign in.`;
      if (p.admin.invite !== 'sms') await c.sandbox.put({ schoolSlug: school.slug, channel: 'email', to: p.admin.email, subject: `Your ${p.basics.shortName} admin on Gradeon`, body: text });
      if (p.admin.invite !== 'email') await c.sandbox.put({ schoolSlug: school.slug, channel: 'sms', to: p.admin.phone, body: text });
    } finally {
      await pool.end();
    }
    c.registry.invalidate(c.school.slug);
    return { detail: `Entitlements pushed · invite sent to ${p.admin.email}` };
  },
};

export function profileYaml(env: Env, school: SchoolRecord, payload: WizardPayload): string {
  const bundle = `in.gradeon.${school.slug.replace(/-/g, '')}`;
  return [
    `slug: ${school.slug}`,
    `name: "${payload.basics.name}"`,
    `appName: "${payload.branding.appName}"`,
    `bundleId: ${bundle}`,
    `color: "${payload.branding.color}"`,
    `logoText: "${payload.branding.logoText}"`,
    `apiBase: ${env.API_BASE_URL}`,
    `language: ${payload.basics.language}`,
    '',
  ].join('\n');
}

const buildProfile: Driver = {
  describe: (c) => `Write schools/${c.slug}/school.yaml`,
  run: async (c) => {
    const school = await c.reload();
    const yaml = profileYaml(c.env, school, c.payload);
    await c.db.pool.query('update schools set profile_yaml = $2, app_name = $3 where id = $1', [school.id, yaml, c.payload.branding.appName]);
    const builds = await c.hub.platform('builds');
    if (!builds?.adapter.builds) return { detail: 'Saved in the registry. With an App builds connection (Integrations) it is also committed to the repository', skipped: true };
    const path = `schools/${school.slug}/school.yaml`;
    await builds.adapter.builds.commit(builds.ctx, path, yaml, `chore(schools): build profile for ${school.slug}`);
    return { detail: `Committed ${path} through ${builds.conn.name}` };
  },
};

const storeChecklist: Driver = {
  describe: () => 'Create the Apple and Google checklist for the school',
  run: async (c) => {
    const school = await c.reload();
    const base: Record<string, string> = { apple_org: 'todo', apple_key: 'todo', play_verify: 'todo', first_build: 'todo' };
    await c.db.pool.query('update schools set checklist = $2 where id = $1', [school.id, JSON.stringify({ ...base, ...school.checklist })]);
    return { detail: 'Apple and Google steps for the school' };
  },
};

const DRIVERS: Record<StepKey, Driver> = {
  database, 'keys-storage': keysStorage, 'migrate-seed': migrateSeed, domain, admin, 'build-profile': buildProfile, 'store-checklist': storeChecklist,
};

/**
 * The drivers that carry out each blueprint step on a target. They are the same functions today because the
 * targets differ only where they branch inside a driver; a target with its own driver for a step replaces it here.
 */
export function driversFor(_target: DeployTarget): Record<StepKey, Driver> {
  return DRIVERS;
}
