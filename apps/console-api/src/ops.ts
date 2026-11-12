import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Injectable, Logger, Param, Post, Put, Query, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { POOLS } from './tokens.js';
import { MODULES, activeModules, closeModules, moduleByKey } from '@gradeon/config-engine';
import { CellCreate, CellPatch, CONSOLE_PERMISSIONS, DEPLOY_TARGET_LABELS, InvoicePaid, auditLabel, CONSOLE_ROLES, WizardPayload, type AuditRow, type DeployTarget, type ConsoleRole, type FleetSummary, type ConsoleUserRow, type FlagRow, type EntitlementDoc, type EntitlementRow, type InvoiceRowC, type SupportSessionRow, type SupportToken } from '@gradeon/contracts';
import { migrate, newId, pg, scheduleJob } from '@gradeon/db';
import { topUpDemo } from '@gradeon/db/seed';
import { ApiError, ZodPipe, alert, notFound } from '@gradeon/nest-kit';
import { hashPassword, randomToken, sha256, signJwt, unseal } from '@gradeon/security';
import type { PoolManager } from '@gradeon/tenancy';
import { Db, Me, Needs, type ConsoleUser, type reg } from './core.js';
import { ENV, demosAllowed, type Env } from './env.js';
import { adminUrlFor } from './provisioning/drivers.js';
import { PlatformHub } from './platform-hub.js';
import { Blueprints } from './provisioning/provisioner.js';
import { Wizard } from './wizard.js';
import { Actions } from './actions.js';
import { Policy } from './policy.js';
import { Releases } from './releases.js';
import { Schools } from './schools.js';

type SchoolRecord = typeof reg.schools.$inferSelect;

/** Looks at every school on a timer: is its database answering, how fast, and how many students. Opens and closes incidents. */
@Injectable()
export class Health implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Health');
  private stop: (() => void) | undefined;
  private readonly misses = new Map<string, number>();

  constructor(
    private readonly db: Db,
    @Inject(POOLS) private readonly pools: PoolManager,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test' || !this.env.PROBE_SECONDS) return;
    this.stop = scheduleJob(this.db.pool, 'probes', this.env.PROBE_SECONDS * 1000, () => this.probeAll(), () => undefined);
  }

  onApplicationShutdown(): void {
    this.stop?.();
  }

  /** Checks every running school now, or just one (a school's Technical tab). */
  async probeAll(schoolId?: string): Promise<number> {
    const { rows } = await this.db.query<SchoolRecord>("select * from schools where deleted_at is null and db_url_sealed is not null and status in ('live','suspended') and ($1::text is null or id = $1)", [schoolId ?? null]);
    await Promise.all(rows.map((s) => this.probe(s).catch((err) => this.log.warn(`${s.slug}: ${(err as Error).message}`))));
    return rows.length;
  }

  private async probe(s: SchoolRecord): Promise<void> {
    const started = Date.now();
    let ok = true;
    let students = s.studentsCount;
    try {
      const pool = this.pools.get(s.slug, unseal(s.dbUrlSealed!, this.env.SECRETS_KEY));
      students = Number((await pool.query<{ n: string }>('select count(*) n from students')).rows[0]?.n ?? 0);
    } catch {
      ok = false;
    }
    const ms = Date.now() - started;
    const health = !ok ? 'down' : ms > 1500 ? 'degraded' : 'ok';
    await this.db.pool.query('update schools set health = $2, health_ms = $3, health_at = now(), students_count = $4 where id = $1', [s.id, health, ok ? ms : null, students]);
    const missed = ok ? 0 : (this.misses.get(s.id) ?? 0) + 1;
    this.misses.set(s.id, missed);
    if (missed === 2) {
      await this.db.pool.query("insert into incidents (id, title, state, school_id) values ($1,$2,'open',$3)", [newId('inc'), `${s.name} is not answering`, s.id]);
      await this.db.pool.query('update schools set last_incident = $2 where id = $1', [s.id, `${s.name} was unreachable`]);
      alert(`${s.name} (${s.slug}) is not answering: two health checks in a row failed.`);
    }
    if (ok) {
      const r = await this.db.pool.query("update incidents set state = 'resolved', resolved_at = now() where school_id = $1 and state = 'open'", [s.id]);
      if (r.rowCount) alert(`${s.name} (${s.slug}) is answering again.`);
    }
  }
}

@Injectable()
export class Support {
  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private row(r: typeof reg.supportSessions.$inferSelect): SupportSessionRow {
    return { id: r.id, schoolId: r.schoolId, schoolName: r.schoolName, reason: r.reason, status: r.status as SupportSessionRow['status'], expiresAt: r.expiresAt?.toISOString() ?? null, startedBy: r.startedBy };
  }

  async list(): Promise<SupportSessionRow[]> {
    await this.db.pool.query("update support_sessions set status = 'expired' where status = 'active' and expires_at < now()");
    const { rows } = await this.db.query<typeof reg.supportSessions.$inferSelect>('select * from support_sessions order by created_at desc limit 50');
    return rows.map((r) => this.row(r));
  }

  /** A read-only look inside one school for 30 minutes, with a reason on record. The token only opens that school. */
  async start(user: ConsoleUser, schoolId: string, reason: string): Promise<SupportToken & { session: SupportSessionRow }> {
    if (reason.trim().length < 5) throw new ApiError('validation', 'Say why you need to look inside, in a few words.', { fields: { reason: 'A reason is required.' } });
    const { rows } = await this.db.query<SchoolRecord>('select * from schools where (id = $1 or slug = $1) and deleted_at is null', [schoolId]);
    const school = rows[0];
    if (!school) throw notFound('That school');
    if (school.status === 'onboarding') throw new ApiError('conflict', 'This school is still being set up.');
    const id = newId('sup');
    const expires = new Date(Date.now() + 30 * 60_000);
    await this.db.pool.query("insert into support_sessions (id, school_id, school_name, reason, status, expires_at, started_by) values ($1,$2,$3,$4,'active',$5,$6)", [id, school.id, school.name, reason.trim(), expires, user.email]);
    await this.db.audit(user.email, 'support.started', 'school', school.id, { reason: reason.trim() });
    const perms = ['students.read', 'attendance.read', 'fees.read', 'notices.read', 'approvals.read', 'timetable.read', 'settings.read', 'staff.read', 'reports.read'];
    const token = signJwt({ sub: `support:${user.id}`, aud: school.slug, sid: id, name: `${user.name} (Gradeon support)`, perms, support: true }, this.env.JWT_SECRET, 30 * 60);
    const row = (await this.db.query<typeof reg.supportSessions.$inferSelect>('select * from support_sessions where id = $1', [id])).rows[0]!;
    return { token, adminUrl: adminUrlFor(this.env, school.slug, school.addressing, school.customDomain), expiresAt: expires.toISOString(), session: this.row(row) };
  }

  async end(user: ConsoleUser, id: string): Promise<void> {
    await this.db.pool.query("update support_sessions set status = 'ended', expires_at = now() where id = $1 and status = 'active'", [id]);
    await this.db.audit(user.email, 'support.ended', 'support', id);
  }
}

/** An invoice is due fifteen days after its month ends. */
const dueFor = (period: string) => { const [y, m] = period.split('-').map(Number) as [number, number]; return new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10); };

@Injectable()
export class Admin {
  constructor(private readonly db: Db) {}

  async flags(): Promise<FlagRow[]> {
    const { rows } = await this.db.pool.query<{ key: string; school_id: string; label: string; enabled: boolean; updated_by: string; updated_at: Date }>('select * from flags order by key, school_id');
    return rows.map((r) => ({ key: r.key, label: r.label, scope: r.school_id === '*' ? 'fleet' : 'school', schoolId: r.school_id === '*' ? null : r.school_id, enabled: r.enabled, updatedBy: r.updated_by, updatedAt: r.updated_at.toISOString() }));
  }

  async setFlag(user: string, key: string, schoolId: string | null, enabled: boolean, label?: string): Promise<void> {
    if (!/^[a-z][a-z0-9._-]{2,60}$/.test(key)) throw new ApiError('validation', 'A flag key is lowercase letters, numbers, dots or dashes.');
    await this.db.pool.query(
      `insert into flags (key, school_id, label, enabled, updated_by) values ($1,$2,$3,$4,$5)
       on conflict (key, school_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`, [key, schoolId ?? '*', label ?? key, enabled, user]);
    await this.db.audit(user, 'flag.set', 'flag', key, { schoolId, enabled });
  }

  /** A flag for one school is cleared (the fleet value applies again); a fleet flag goes with every school's value of it. */
  async removeFlag(user: string, key: string, schoolId: string | null): Promise<void> {
    const r = await this.db.pool.query(schoolId ? 'delete from flags where key = $1 and school_id = $2' : 'delete from flags where key = $1', schoolId ? [key, schoolId] : [key]);
    if (!r.rowCount) throw notFound('That flag');
    await this.db.audit(user, 'flag.removed', 'flag', key, { schoolId });
  }

  async invoices(): Promise<InvoiceRowC[]> {
    const { rows } = await this.db.pool.query<{ id: string; school_id: string; school_name: string; period: string; amount: number; status: InvoiceRowC['status']; lines: InvoiceRowC['lines']; sent_at: Date | null; sent_to: string | null; paid_on: string | null; paid_ref: string | null }>(
      'select id, school_id, school_name, period, amount, status, lines, sent_at, sent_to, paid_on::text, paid_ref from invoices order by period desc, school_name limit 1000');
    const today = new Date().toISOString().slice(0, 10);
    return rows.map((r) => {
      const dueOn = dueFor(r.period);
      return {
        id: r.id, schoolId: r.school_id, schoolName: r.school_name, period: r.period, amount: r.amount, lines: r.lines ?? [], dueOn,
        status: r.status === 'sent' && dueOn < today ? 'overdue' : r.status, sentAt: r.sent_at?.toISOString() ?? null, sentTo: r.sent_to, paidOn: r.paid_on, paidRef: r.paid_ref,
      };
    });
  }

  /** Emails the invoice to the school's contact through Gradeon's email connection, and says when and to whom. */
  async sendInvoice(user: string, id: string, hub: PlatformHub['hub']): Promise<string> {
    const r = (await this.db.pool.query<{ school_id: string; period: string; amount: number; lines: InvoiceRowC['lines']; status: string }>('select school_id, period, amount, lines, status from invoices where id = $1', [id])).rows[0];
    if (!r) throw notFound('That invoice');
    if (r.status === 'paid') throw new ApiError('conflict', 'That invoice is paid already.');
    const s = (await this.db.pool.query<{ name: string; contact: { name: string; email: string }; gstin: string }>('select name, contact, gstin from schools where id = $1', [r.school_id])).rows[0]!;
    if (!s.contact?.email) throw new ApiError('validation', `${s.name} has no contact email. Add one under its details first.`);
    const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    const body = [`Dear ${s.contact.name},`, '', `Gradeon invoice for ${s.name}, ${r.period}${s.gstin ? ` (GSTIN ${s.gstin})` : ''}:`, ...r.lines.map((l) => `  ${l.label}: ${inr(l.amount)}`), `Total: ${inr(r.amount)}`, `Due by ${dueFor(r.period)}.`, '', 'Thank you.'].join('\n');
    await hub.send({ schoolId: null, schoolSlug: 'console', channel: 'email', to: s.contact.email, subject: `Gradeon invoice ${r.period} · ${s.name}`, body, now: true });
    await this.db.pool.query("update invoices set status = 'sent', sent_at = now(), sent_to = $2 where id = $1", [id, s.contact.email]);
    await this.db.audit(user, 'invoice.sent', 'invoice', id, { to: s.contact.email });
    return s.contact.email;
  }

  async paidInvoice(user: string, id: string, b: InvoicePaid | null): Promise<void> {
    // Paid with its day and reference, or undone back to sent.
    const r = await this.db.pool.query(b ? "update invoices set status = 'paid', paid_on = $2, paid_ref = $3 where id = $1" : "update invoices set status = case when sent_at is null then 'draft' else 'sent' end, paid_on = null, paid_ref = null where id = $1",
      b ? [id, b.paidOn, b.reference] : [id]);
    if (!r.rowCount) throw notFound('That invoice');
    await this.db.audit(user, b ? 'invoice.paid' : 'invoice.unpaid', 'invoice', id, b ? { on: b.paidOn, ref: b.reference } : {});
  }

  /**
   * One invoice per live school for the month, from exactly what it has on the month's last day: students times the plan's yearly
   * price, plus each module added on top of the plan at its add-on price, divided by twelve. A school in its trial pays nothing.
   * Safe to run twice.
   */
  async billMonth(user: string, period: string): Promise<number> {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError('validation', 'Use a month like 2026-10.');
    const [y, mo] = period.split('-').map(Number) as [number, number];
    const lastDay = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    const { rows } = await this.db.pool.query<{ id: string; name: string; students_count: number; per: number; plan_name: string; plan_modules: string[]; entitlement: EntitlementDoc }>(
      "select s.id, s.name, s.students_count, s.entitlement, p.per_student_year per, p.name plan_name, p.modules plan_modules from schools s join plans p on p.key = s.plan where s.status = 'live' and s.deleted_at is null");
    let made = 0;
    for (const s of rows) {
      if (s.entitlement.trialUntil && s.entitlement.trialUntil >= lastDay) continue;
      const exists = await this.db.pool.query('select 1 from invoices where school_id = $1 and period = $2', [s.id, period]);
      if (exists.rowCount) continue;
      const month = (perYear: number) => Math.round((s.students_count * perYear) / 12);
      const inPlan = closeModules(s.plan_modules);
      const lines = [
        { label: `${s.plan_name} plan, ${s.students_count} students`, amount: month(s.per) },
        ...activeModules(s.entitlement, lastDay).filter((k) => !inPlan.includes(k)).map((k) => moduleByKey(k)!).filter((m) => m.addOnPerStudentYear > 0)
          .map((m) => ({ label: `${m.name} (added)`, amount: month(m.addOnPerStudentYear) })),
      ];
      await this.db.pool.query("insert into invoices (id, school_id, school_name, period, amount, status, lines) values ($1,$2,$3,$4,$5,'draft',$6)",
        [newId('inv'), s.id, s.name, period, lines.reduce((a, l) => a + l.amount, 0), JSON.stringify(lines)]);
      made++;
    }
    await this.db.audit(user, 'billing.generated', 'invoice', period, { made });
    return made;
  }

  async team(): Promise<ConsoleUserRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; name: string; email: string; roles: ConsoleRole[]; status: ConsoleUserRow['status']; last_seen_at: Date | null; authenticator: boolean }>(
      'select id, name, email, roles, status, last_seen_at, totp_secret is not null authenticator from console_users order by name');
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, roles: r.roles, status: r.status, lastSeenAt: r.last_seen_at?.toISOString() ?? null, authenticator: r.authenticator }));
  }

  /** Invites a person: a link by email (through Gradeon's email connection) where they choose their own password. */
  async addMember(user: string, body: { name: string; email: string; roles: string[] }, hub: PlatformHub['hub'], consoleUrl: string): Promise<{ link: string }> {
    const roles = body.roles.filter((r): r is ConsoleRole => (CONSOLE_ROLES as readonly string[]).includes(r));
    if (!roles.length) throw new ApiError('validation', 'Choose at least one role.');
    if (String(body.name ?? '').trim().length < 2) throw new ApiError('validation', 'Enter their name.', { fields: { name: 'Enter their name.' } });
    if (!/^\S+@\S+\.\S+$/.test(body.email)) throw new ApiError('validation', 'Enter a valid email.', { fields: { email: 'Enter a valid email.' } });
    const dupe = await this.db.pool.query('select 1 from console_users where lower(email) = lower($1)', [body.email]);
    if (dupe.rowCount) throw new ApiError('conflict', 'That email already has an account.');
    const id = newId('cus');
    await this.db.pool.query("insert into console_users (id, name, email, roles, status) values ($1,$2,$3,$4,'invited')", [id, body.name.trim(), body.email.trim().toLowerCase(), JSON.stringify(roles)]);
    await this.db.audit(user, 'team.invited', 'user', body.email, { roles });
    return this.invite(id, hub, consoleUrl);
  }

  /** A new invitation link (an earlier one stops working), valid for seven days. */
  async invite(id: string, hub: PlatformHub['hub'], consoleUrl: string): Promise<{ link: string }> {
    const m = (await this.db.pool.query<{ name: string; email: string; status: string }>('select name, email, status from console_users where id = $1', [id])).rows[0];
    if (!m) throw notFound('That person');
    if (m.status !== 'invited') throw new ApiError('conflict', `${m.name} has an account already. Change their password or authenticator instead.`);
    const token = randomToken(24);
    await this.db.pool.query("update console_users set invite_hash = $2, invite_expires = now() + interval '7 days' where id = $1", [id, sha256(token)]);
    const link = `${consoleUrl.replace(/\/$/, '')}/join?token=${token}`;
    await hub.send({ schoolId: null, schoolSlug: 'console', channel: 'email', to: m.email, subject: 'You are invited to the Gradeon console', body: `Hello ${m.name.split(' ')[0]},\n\nYou have been added to the Gradeon console. Choose your password here (the link works for seven days):\n${link}\n\nAt your first sign-in you add the console to an authenticator app.`, now: true }).catch(() => undefined);
    return { link };
  }

  /** Someone invited who never signed in can be removed; anyone who did is switched off instead, so their history stays theirs. */
  async removeMember(user: string, id: string): Promise<void> {
    const r = await this.db.pool.query("delete from console_users where id = $1 and status = 'invited' and last_seen_at is null", [id]);
    if (!r.rowCount) throw new ApiError('conflict', 'Only someone who never signed in can be removed. Switch them off instead.');
    await this.db.audit(user, 'team.removed', 'user', id);
  }

  async setMember(user: string, id: string, patch: { roles?: string[]; status?: string; resetAuthenticator?: boolean }): Promise<void> {
    const { rows } = await this.db.pool.query<{ email: string; roles: ConsoleRole[]; status: string }>('select email, roles, status from console_users where id = $1', [id]);
    const m = rows[0];
    if (!m) throw notFound('That person');
    const roles = patch.roles ? patch.roles.filter((r): r is ConsoleRole => (CONSOLE_ROLES as readonly string[]).includes(r)) : m.roles;
    const status = patch.status && ['active', 'disabled'].includes(patch.status) ? patch.status : m.status;
    const losesSuper = (m.roles.includes('super_admin') && m.status === 'active') && (!roles.includes('super_admin') || status !== 'active');
    if (losesSuper) {
      const others = await this.db.pool.query("select count(*) n from console_users where id <> $1 and status = 'active' and roles ? 'super_admin'", [id]);
      if (Number(others.rows[0]!.n) === 0) throw new ApiError('conflict', 'There must always be one active super admin.');
    }
    await this.db.pool.query('update console_users set roles = $2, status = $3, token_version = token_version + 1 where id = $1', [id, JSON.stringify(roles), status]);
    // A lost phone: the person adds a new authenticator at their next sign-in, and every open session ends. A forgotten password
    // is reset by the person themself ("Forgot it?"), so no one else ever knows it.
    if (patch.resetAuthenticator) await this.db.pool.query('update console_users set totp_secret = null where id = $1', [id]);
    if (status !== 'active' || patch.resetAuthenticator) {
      await this.db.pool.query('update console_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
    }
    await this.db.audit(user, 'team.changed', 'user', id, { roles, status, ...(patch.resetAuthenticator ? { authenticator: 'reset' } : {}) });
  }

  /** Console history, newest first, a page at a time (`before` is the last entry's time); filtered by school, person, action and dates. */
  async audit(limit = 100, entityId?: string, f: { actor?: string; action?: string; from?: string; to?: string; before?: string } = {}): Promise<AuditRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; at: Date; actor: string; action: string; entity: string; detail: Record<string, unknown> }>(
      `select id, at, actor, action, entity, detail from console_audit where ($2::text is null or entity_id = $2) and ($3::text is null or actor = $3) and ($4::text is null or action like $4 || '%')
         and ($5::date is null or at >= $5::date) and ($6::date is null or at < $6::date + 1) and ($7::timestamptz is null or at < $7) order by at desc limit $1`,
      [Math.min(500, limit), entityId ?? null, f.actor || null, f.action || null, f.from || null, f.to || null, f.before || null]);
    return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actor: r.actor, action: r.action, entity: r.entity, detail: Object.entries(r.detail).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') }));
  }

  catalog(): CatalogResponse {
    return {
      modules: MODULES.map((m) => ({ key: m.key, name: m.name, blurb: m.blurb, requires: m.requires, backend: m.backend, core: !!m.core, state: m.state, addOnPerStudentYear: m.addOnPerStudentYear, features: m.features })),
    };
  }

  /** Every school against the catalogue, for the module grid. */
  async entitlements(): Promise<EntitlementRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; name: string; slug: string; status: string; plan: string; entitlement: EntitlementDoc }>(
      'select id, name, slug, status, plan, entitlement from schools where deleted_at is null order by name');
    return rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug, status: r.status, plan: r.plan, modules: closeModules(r.entitlement.modules), active: activeModules(r.entitlement),
      features: r.entitlement.features ?? {}, dates: r.entitlement.dates ?? {}, trialUntil: r.entitlement.trialUntil ?? null, limits: r.entitlement.limits, locks: r.entitlement.locks ?? [],
    }));
  }
}

type CatalogResponse = { modules: { key: string; name: string; blurb: string; requires: string[]; backend: boolean; core: boolean; state: string; addOnPerStudentYear: number; features: { key: string; name: string; state: string }[] }[] };

/** First start: the cell, the plans, the setup recipes, and the first super admin. Does nothing the second time. */
@Injectable()
export class Bootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger('Bootstrap');

  constructor(
    private readonly db: Db,
    private readonly wizard: Wizard,
    private readonly blueprints: Blueprints,
    private readonly policy: Policy,
    private readonly actions: Actions,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    await this.wizard.ensurePlans();
    await this.blueprints.ensureDefaults();
    const cells = await this.db.pool.query('select count(*) n from cells');
    if (Number(cells.rows[0]!.n) === 0) {
      const target = this.env.NODE_ENV === 'production' ? 'free-test' : 'local';
      await this.db.pool.query('insert into cells (key, target, region, max_schools) values ($1,$2,$3,$4)', [target === 'local' ? 'local-1' : 'test-1', target, target === 'local' ? 'this computer' : 'test track', 25]);
      this.log.log(`created the first cell on ${target}`);
    }
    const users = await this.db.pool.query('select count(*) n from console_users');
    if (Number(users.rows[0]!.n) === 0) {
      await this.db.pool.query('insert into console_users (id, name, email, password_hash, roles) values ($1,$2,$3,$4,$5)', [newId('cus'), this.env.BOOTSTRAP_NAME, this.env.BOOTSTRAP_EMAIL.toLowerCase(), await hashPassword(this.env.BOOTSTRAP_PASSWORD), JSON.stringify(['super_admin'])]);
      this.log.log(`created the first super admin ${this.env.BOOTSTRAP_EMAIL}`);
    }
    await this.policy.get();
    await this.upgradeSchools();
    if (this.env.SEED_DEMO === 'true') void this.seedDemo().catch((err) => this.log.error(`could not create the demo school: ${(err as Error).message}`));
  }

  /**
   * Every school runs this process's code, so every school's database is brought up to date before the server takes requests
   * (Nest awaits this hook before listening). Migrations are expand-first, so the previous code still running during a deploy is safe.
   * A school that fails is logged in the migration runs and skipped, so one broken database cannot keep the others offline.
   * Four schools at a time: start-up stays short as schools are added, and four pools of two fit any database's connection limit.
   */
  async upgradeSchools(): Promise<void> {
    const { rows } = await this.db.pool.query<{ id: string; slug: string; db_url_sealed: string }>(
      'select id, slug, db_url_sealed from schools where deleted_at is null and db_url_sealed is not null order by slug');
    const queue = [...rows];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { for (let s = queue.shift(); s; s = queue.shift()) await this.upgradeSchool(s); }));
  }

  private async upgradeSchool(s: { id: string; slug: string; db_url_sealed: string }): Promise<void> {
    const started = Date.now();
    const pool = new pg.Pool({ connectionString: unseal(s.db_url_sealed, this.env.SECRETS_KEY), max: 2, connectionTimeoutMillis: 20_000 });
    try {
      const applied = await migrate(pool, 'school');
      for (const m of applied) await this.actions.recordMigration(m.tag, m.kind, s.id, 'applied', m.ms, null);
      const filled = this.env.SEED_DEMO === 'true' && s.slug === 'greenfield' ? await topUpDemo(pool) : [];
      if (applied.length || filled.length) this.log.log(`${s.slug}: ${applied.length} migrations applied${filled.length ? `, sample content added for ${filled.join(', ')}` : ''}`);
    } catch (err) {
      alert(`${s.slug}: could not bring the database up to date at start-up: ${(err as Error).message}`);
      await this.actions.recordMigration('start-up', 'expand', s.id, 'failed', Date.now() - started, (err as Error).message.slice(0, 500)).catch(() => undefined);
    } finally {
      await pool.end();
    }
  }

  /** Test tracks start with the Greenfield demo school already live, so the admin and the app have something to show. Runs in the background. */
  async seedDemo(): Promise<void> {
    // A Greenfield made before schools carried the demo flag (registry migration 0013 only caught schools with a matching
    // provision run) would refuse the demo code and hide the demo buttons: it is the demo school, so say so.
    const there = await this.db.pool.query("update schools set demo = true where slug = 'greenfield' and deleted_at is null returning 1");
    if (there.rowCount) return;
    const cell = (await this.db.pool.query<{ key: string; target: DeployTarget }>('select key, target from cells order by key limit 1')).rows[0];
    if (!cell) return;
    const payload = WizardPayload.parse({
      basics: { name: 'Greenfield International School', shortName: 'Greenfield', slug: 'greenfield', board: 'International', address: '42, Baner Road, Baner', city: 'Pune', contactName: 'Neha Menon', contactPhone: '+91 98220 41200', contactEmail: 'neha.menon@greenfield.edu.in', language: 'en' },
      plan: { plan: 'premium', modules: ['people', 'attendance', 'fees', 'notices', 'timetable', 'homework', 'events', 'exams', 'chat', 'transport', 'library', 'gallery'], students: 1500 },
      branding: { color: '#6A4CF5', logoText: 'G', appName: 'Greenfield', tagline: 'Curiosity first. Kindness always.' },
      placement: { target: cell.target, cell: cell.key, addressing: 'path' },
      admin: { name: 'Neha Menon', email: 'neha.menon@greenfield.edu.in', phone: '+91 98220 41200', invite: 'both', roles: ['principal'] },
      data: { start: 'demo' },
    });
    this.log.log('creating the Greenfield demo school');
    const system: ConsoleUser = { id: 'system', name: 'Gradeon', email: 'system@gradeon.app', roles: ['super_admin'], permissions: [...CONSOLE_PERMISSIONS], sid: 'system' };
    await this.wizard.launch(system, payload, { dryRun: false });
  }
}

@Controller('console/v1')
export class OpsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly platform: PlatformHub,
    private readonly support: Support,
    private readonly admin: Admin,
    private readonly health: Health,
    private readonly releases: Releases,
    private readonly schools: Schools,
    private readonly db: Db,
  ) {}

  @Get('fleet') @Needs('schools.read')
  async fleet(@Me() me: ConsoleUser): Promise<FleetSummary> {
    return { ...(await this.schools.fleet(me.id)), release: await this.releases.latest() };
  }

  @Post('fleet/incident/:id/dismiss') @HttpCode(204) @Needs('schools.read')
  async dismiss(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> {
    await this.db.pool.query('update console_users set dismissed_incident = $2 where id = $1', [me.id, id]);
  }

  @Get('cells') @Needs('schools.read')
  async cells(): Promise<{ key: string; target: string; region: string; maxSchools: number; schools: number; accepting: boolean; connectionId: string | null; connectionName: string | null }[]> {
    const { rows } = await this.db.pool.query<{ key: string; target: string; region: string; max_schools: number; accepting: boolean; n: string; connection_id: string | null; connection_name: string | null }>(
      `select c.key, c.target, c.region, c.max_schools, c.accepting, c.connection_id, ic.name connection_name, (select count(*) from schools s where s.cell = c.key and s.deleted_at is null) n
       from cells c left join integration_connections ic on ic.id = c.connection_id order by c.key`);
    return rows.map((r) => ({ key: r.key, target: r.target, region: r.region, maxSchools: r.max_schools, schools: Number(r.n), accepting: r.accepting, connectionId: r.connection_id, connectionName: r.connection_name }));
  }

  /** The places a new cell can run on this deployment: this computer only in development, the free track only where demos are allowed. */
  @Get('cells/targets') @Needs('schools.read')
  targets(): { key: string; label: string; note: string }[] {
    return [
      ...(this.env.NODE_ENV !== 'production' ? [{ key: 'local', label: DEPLOY_TARGET_LABELS.local, note: 'Databases on this machine’s PostgreSQL.' }] : []),
      ...(demosAllowed(this.env) ? [{ key: 'free-test', label: DEPLOY_TARGET_LABELS['free-test'], note: 'Databases on the registry’s own server, or a School databases connection.' }] : []),
      { key: 'aws-cell', label: DEPLOY_TARGET_LABELS['aws-cell'], note: 'Databases made through a School databases connection (Integrations → Databases).' },
    ];
  }

  @Delete('cells/:key') @HttpCode(204) @Needs('policy.write')
  async removeCell(@Me() me: ConsoleUser, @Param('key') key: string): Promise<void> {
    const n = (await this.db.pool.query<{ n: string }>('select count(*) n from schools where cell = $1', [key])).rows[0]!.n;
    if (Number(n)) throw new ApiError('conflict', `${n} ${n === '1' ? 'school is' : 'schools are'} on this cell (archived ones too). Move them first.`);
    const r = await this.db.pool.query('delete from cells where key = $1', [key]);
    if (!r.rowCount) throw notFound('That cell');
    await this.db.audit(me.email, 'cell.removed', 'cell', key);
  }

  /** The connection must exist and make databases. */
  private async databasesConnection(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const { rows } = await this.db.pool.query<{ provider: string }>('select provider from integration_connections where id = $1', [id]);
    if (!rows[0] || !['postgres-server', 'neon'].includes(rows[0].provider)) throw new ApiError('validation', 'Choose a School databases connection.', { fields: { connectionId: 'Choose a School databases connection.' } });
  }

  /** A new cell. On the test track it is a name and a limit; on aws-cell the database server it points at must be configured first. */
  @Post('cells') @HttpCode(200) @Needs('policy.write')
  async createCell(@Me() me: ConsoleUser, @Body(new ZodPipe(CellCreate)) body: CellCreate): Promise<{ key: string; note: string }> {
    if ((await this.db.pool.query('select 1 from cells where key = $1', [body.key])).rowCount) throw new ApiError('validation', 'There is already a cell with that name.', { fields: { key: 'There is already a cell with that name.' } });
    await this.databasesConnection(body.connectionId);
    await this.db.pool.query('insert into cells (key, target, region, max_schools, connection_id) values ($1,$2,$3,$4,$5)', [body.key, body.target, body.region, body.maxSchools, body.connectionId]);
    await this.db.audit(me.email, 'cell.created', 'cell', body.key, { target: body.target, connectionId: body.connectionId });
    return { key: body.key, note: body.connectionId ? 'Ready. New schools placed here get their database through its connection.' : 'Ready. New schools placed here get a database on the registry’s own server.' };
  }

  @Put('cells/:key') @HttpCode(200) @Needs('policy.write')
  async patchCell(@Me() me: ConsoleUser, @Param('key') key: string, @Body(new ZodPipe(CellPatch)) body: CellPatch): Promise<{ ok: true }> {
    const cur = (await this.db.pool.query<{ n: string }>('select (select count(*) from schools s where s.cell = c.key and s.deleted_at is null) n from cells c where c.key = $1', [key])).rows[0];
    if (!cur) throw notFound('That cell');
    if (body.maxSchools !== undefined && body.maxSchools < Number(cur.n)) throw new ApiError('validation', `${cur.n} schools already run here, so the limit cannot go below that.`, { fields: { maxSchools: `At least ${cur.n}.` } });
    if (body.connectionId !== undefined) {
      await this.databasesConnection(body.connectionId);
      if (Number(cur.n) > 0) throw new ApiError('conflict', `${cur.n} schools already run on this cell’s server, so its database connection stays. Move them to another cell first.`);
      await this.db.pool.query('update cells set connection_id = $2 where key = $1', [key, body.connectionId]);
    }
    await this.db.pool.query('update cells set region = coalesce($2, region), max_schools = coalesce($3, max_schools), accepting = coalesce($4, accepting) where key = $1', [key, body.region ?? null, body.maxSchools ?? null, body.accepting ?? null]);
    await this.db.audit(me.email, 'cell.changed', 'cell', key, { ...body });
    return { ok: true };
  }

  @Post('health/probe') @HttpCode(200) @Needs('schools.read')
  async probe(@Query('school') school?: string): Promise<{ probed: number }> {
    return { probed: await this.health.probeAll(school) };
  }

  @Get('support') @Needs('support.access')
  sessions(): Promise<SupportSessionRow[]> {
    return this.support.list();
  }

  @Post('support') @HttpCode(200) @Needs('support.access')
  startSupport(@Me() me: ConsoleUser, @Body() body: { schoolId: string; reason: string }): Promise<SupportToken & { session: SupportSessionRow }> {
    return this.support.start(me, String(body?.schoolId ?? ''), String(body?.reason ?? ''));
  }

  @Delete('support/:id') @HttpCode(204) @Needs('support.access')
  async endSupport(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> {
    await this.support.end(me, id);
  }

  @Get('flags') @Needs('schools.read')
  flags(): Promise<FlagRow[]> {
    return this.admin.flags();
  }

  @Put('flags/:key') @HttpCode(204) @Needs('flags.write')
  async setFlag(@Me() me: ConsoleUser, @Param('key') key: string, @Body() body: { enabled: boolean; schoolId?: string | null; label?: string }): Promise<void> {
    await this.admin.setFlag(me.email, key, body.schoolId ?? null, !!body.enabled, body.label);
  }

  @Delete('flags/:key') @HttpCode(204) @Needs('flags.write')
  async removeFlag(@Me() me: ConsoleUser, @Param('key') key: string, @Query('school') school?: string): Promise<void> {
    await this.admin.removeFlag(me.email, key, school || null);
  }

  @Get('billing/invoices') @Needs('billing.read')
  invoices(): Promise<InvoiceRowC[]> {
    return this.admin.invoices();
  }

  @Post('billing/generate') @HttpCode(200) @Needs('billing.write')
  async generate(@Me() me: ConsoleUser, @Body() body: { period: string }): Promise<{ created: number }> {
    return { created: await this.admin.billMonth(me.email, String(body?.period ?? '')) };
  }

  @Post('billing/invoices/:id/send') @HttpCode(200) @Needs('billing.write')
  async sendInvoice(@Me() me: ConsoleUser, @Param('id') id: string): Promise<{ to: string }> {
    return { to: await this.admin.sendInvoice(me.email, id, this.platform.hub) };
  }

  @Post('billing/invoices/:id/paid') @HttpCode(204) @Needs('billing.write')
  async paid(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(InvoicePaid)) body: InvoicePaid): Promise<void> {
    await this.admin.paidInvoice(me.email, id, body);
  }

  @Delete('billing/invoices/:id/paid') @HttpCode(204) @Needs('billing.write')
  async unpaid(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> {
    await this.admin.paidInvoice(me.email, id, null);
  }

  /** Texts and other messages per school and month, for billing (moved from Integrations → Activity). */
  @Get('billing/usage') @Needs('billing.read')
  async usage(): Promise<{ schoolSlug: string; channel: string; month: string; count: number; costPaise: number }[]> {
    const { rows } = await this.db.pool.query<{ school_slug: string; channel: string; mon: string; n: number; cost: number }>(
      `select school_slug, channel, to_char(date_trunc('month', created_at), 'YYYY-MM') mon, count(*)::int n, coalesce(sum(cost_paise), 0)::int cost
       from message_log where created_at >= date_trunc('month', now()) - interval '11 months' and status not in ('refused') and school_slug <> 'console'
       group by 1, 2, 3 order by 3 desc, 1, 2`);
    return rows.map((t) => ({ schoolSlug: t.school_slug, channel: t.channel, month: t.mon, count: t.n, costPaise: t.cost }));
  }

  @Get('team') @Needs('schools.read')
  team(): Promise<ConsoleUserRow[]> {
    return this.admin.team();
  }

  @Post('team') @HttpCode(200) @Needs('team.write')
  add(@Me() me: ConsoleUser, @Body() body: { name: string; email: string; roles: string[] }): Promise<{ link: string }> {
    return this.admin.addMember(me.email, body, this.platform.hub, this.env.CONSOLE_URL);
  }

  @Post('team/:id/invite') @HttpCode(200) @Needs('team.write')
  reinvite(@Param('id') id: string): Promise<{ link: string }> {
    return this.admin.invite(id, this.platform.hub, this.env.CONSOLE_URL);
  }

  @Delete('team/:id') @HttpCode(204) @Needs('team.write')
  async remove(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> {
    await this.admin.removeMember(me.email, id);
  }

  @Put('team/:id') @HttpCode(204) @Needs('team.write')
  async change(@Me() me: ConsoleUser, @Param('id') id: string, @Body() body: { roles?: string[]; status?: string; resetAuthenticator?: boolean }): Promise<void> {
    await this.admin.setMember(me.email, id, body);
  }

  @Get('audit') @Needs('audit.read')
  audit(@Query('school') school?: string, @Query('actor') actor?: string, @Query('action') action?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('before') before?: string): Promise<AuditRow[]> {
    return this.admin.audit(50, school, { actor, action, from, to, before });
  }

  @Get('audit/export') @Needs('audit.read') @Header('content-type', 'text/csv; charset=utf-8')
  async auditCsv(@Query('school') school?: string, @Query('actor') actor?: string, @Query('action') action?: string, @Query('from') from?: string, @Query('to') to?: string): Promise<string> {
    const rows = await this.admin.audit(500, school, { actor, action, from, to });
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return ['when,who,what,details', ...rows.map((r) => [r.at, r.actor, auditLabel(r.action), r.detail].map(q).join(','))].join('\n');
  }

  @Get('catalog') @Needs('schools.read')
  catalog(): ReturnType<Admin['catalog']> {
    return this.admin.catalog();
  }

  @Get('entitlements') @Needs('schools.read')
  entitlements(): Promise<EntitlementRow[]> {
    return this.admin.entitlements();
  }

  @Get('current-release') @Needs('schools.read')
  current(): ReturnType<Releases['current']> {
    return this.releases.current();
  }
}

