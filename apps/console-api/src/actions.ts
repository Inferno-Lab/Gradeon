import { Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Param, Post } from '@nestjs/common';
import { POOLS, REGISTRY } from './tokens.js';
import { catalogueName, changeEntitlement, type EntitlementChange } from '@gradeon/config-engine';
import { ActionRequest, appIdFor, type ActionRow, type BuildRow, type ConsoleRole, type EntitlementDoc } from '@gradeon/contracts';
import { migrate, newId, pg, pendingMigrations } from '@gradeon/db';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { constantTimeEqual, randomToken, sha256, unseal } from '@gradeon/security';
import { PlatformHub } from './platform-hub.js';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import dns from 'node:dns/promises';
import { Backups } from './backups.js';
import { Db, Me, Needs, Public, type ConsoleUser, type reg } from './core.js';
import { ENV, type Env } from './env.js';
import { moveSchool } from './move.js';
import { Policy } from './policy.js';
import { Schools } from './schools.js';

type ActionRecord = typeof reg.actions.$inferSelect;

/** What a build workflow needs to sign and publish one school's app, fetched once with the build's own code. */
export interface BuildKit {
  school: string;
  platform: 'android' | 'ios';
  apiBaseUrl: string;
  /** The store listing: the bundle prefix and the school's address, the same on both stores. */
  appId: string;
  appName: string;
  firebase: { android: string | null; ios: string | null };
  android: { keystore: string; storePassword: string; keyAlias: string; keyPassword: string; serviceAccount: string; track: string } | null;
  ios: { teamId: string; issuerId: string; keyId: string; privateKey: string } | null;
}


@Injectable()
export class Builds {
  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly platform: PlatformHub,
    private readonly policy: Policy,
  ) {}

  /**
   * Starts the school's app build through the App builds connection (GitHub Actions). Android builds are signed with the Google
   * Play upload key and sent to its track; iPhone builds are signed with the App Store Connect key and sent to TestFlight. Each
   * build gets a code of its own to fetch that kit and report back, so no signing secret is ever stored in the repository.
   */
  async request(schoolId: string, slug: string, platform: BuildRow['platform'], user: string): Promise<BuildRow> {
    const id = newId('bld');
    const version = this.env.APP_VERSION;
    const missing = await this.missing(platform);
    const token = randomToken(24);
    let status: BuildRow['status'] = missing ? 'unavailable' : 'queued';
    let note = missing ?? `Queued on GitHub Actions for ${platform === 'ios' ? 'TestFlight' : 'Google Play'}. The link appears here when the build finishes.`;
    if (!missing) {
      const b = (await this.platform.hub.platform('builds'))!;
      try {
        await b.adapter.builds!.dispatch(b.ctx, { school: slug, build_id: id, platform, token, api: this.env.API_BASE_URL.replace(/\/$/, '') });
      } catch (e) {
        status = 'failed';
        note = `GitHub refused the build: ${(e as Error).message}`;
      }
    }
    await this.db.pool.query('insert into builds (id, school_id, platform, version, status, note, token_hash, store) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, schoolId, platform, version, status, note, status === 'queued' ? sha256(token) : null, await this.appId(schoolId, slug)]);
    await this.db.audit(user, 'build.requested', 'school', schoolId, { platform, status });
    return { id, schoolId, platform, version, status, url: null, note, createdAt: new Date().toISOString() };
  }

  /**
   * The id a school's app is listed under in the stores. It never changes once a build has it (a store listing is tied to it);
   * a school's first build takes the bundle prefix from Mobile builds → Build settings.
   */
  private async appId(schoolId: string, slug: string): Promise<string> {
    const had = (await this.db.pool.query<{ store: string }>("select store from builds where school_id = $1 and store <> '' order by created_at limit 1", [schoolId])).rows[0];
    return had?.store ?? appIdFor(slug, (await this.policy.get()).naming.bundlePrefix);
  }

  /** What is not set up yet for a build on this platform, in words, or null when everything is. */
  async missing(platform: BuildRow['platform']): Promise<string | null> {
    const hub = this.platform.hub;
    if (!(await hub.platform('builds'))) return 'No App builds connection is set up: add GitHub under Integrations.';
    const stores = await this.stores();
    if (platform === 'android' && !stores.android) return 'No Google Play connection is set up under Integrations → App stores.';
    if (platform === 'ios' && !stores.ios) return 'No Apple App Store connection is set up under Integrations → App stores.';
    if (!(await this.fcm())) return 'No Firebase connection is set up under Integrations → Phone notifications: the app could not receive notifications.';
    return null;
  }

  /** The App stores connections (one per store), live or in test. */
  private async stores(): Promise<{ android: string | null; ios: string | null }> {
    const { rows } = await this.db.pool.query<{ id: string; provider: string }>("select id, provider from integration_connections where provider in ('google-play','app-store') and state in ('test','live') and scope = 'platform' order by state = 'live' desc, updated_at desc");
    return { android: rows.find((r) => r.provider === 'google-play')?.id ?? null, ios: rows.find((r) => r.provider === 'app-store')?.id ?? null };
  }

  private async fcm(): Promise<string | null> {
    const { rows } = await this.db.pool.query<{ id: string }>("select id from integration_connections where provider = 'fcm' and state in ('test','live') and scope = 'platform' order by state = 'live' desc, updated_at desc limit 1");
    return rows[0]?.id ?? null;
  }

  /** The build's own code, checked against what was given at dispatch; it works only while the build runs. */
  private async build(id: string, token: string | undefined): Promise<{ school_id: string; platform: BuildRow['platform']; status: string; slug: string; app_name: string; name: string; store: string | null }> {
    const { rows } = await this.db.pool.query('select b.school_id, b.platform, b.status, b.token_hash, b.store, s.slug, s.app_name, s.short_name as name from builds b join schools s on s.id = b.school_id where b.id = $1', [id]);
    const b = rows[0];
    if (!b || !token || !b.token_hash || !constantTimeEqual(sha256(token), b.token_hash) || (b.status !== 'queued' && b.status !== 'building')) throw new ApiError('unauthenticated', 'That build code is not accepted.');
    return b;
  }

  /** The signing kit for one build: Firebase files, the store's keys. Fetching it marks the build as building. */
  async kit(id: string, token: string | undefined): Promise<BuildKit> {
    const b = await this.build(id, token);
    const hub = this.platform.hub;
    const fcmId = await this.fcm();
    const fcm = fcmId ? (await hub.use(fcmId)).conn : null;
    const stores = await this.stores();
    const play = b.platform === 'android' && stores.android ? (await hub.use(stores.android)).conn : null;
    const apple = b.platform === 'ios' && stores.ios ? (await hub.use(stores.ios)).conn : null;
    await this.db.pool.query("update builds set status = 'building', note = 'Building on GitHub Actions.' where id = $1", [id]);
    return {
      school: b.slug, platform: b.platform, apiBaseUrl: this.env.API_BASE_URL.replace(/\/$/, ''), appId: b.store || appIdFor(b.slug), appName: b.app_name || b.name,
      firebase: { android: fcm?.secrets.androidConfig ?? null, ios: fcm?.secrets.iosConfig ?? null },
      android: play ? { keystore: play.secrets.keystore ?? '', storePassword: play.secrets.keystorePassword ?? '', keyAlias: String(play.settings.keyAlias ?? 'upload'), keyPassword: play.secrets.keyPassword ?? '', serviceAccount: play.secrets.serviceAccount ?? '', track: String(play.settings.track ?? 'internal') } : null,
      ios: apple ? { teamId: String(apple.settings.teamId), issuerId: String(apple.settings.issuerId), keyId: String(apple.settings.keyId), privateKey: apple.secrets.privateKey ?? '' } : null,
    };
  }

  /** The workflow reports back once, with where the build went; the code stops working then. */
  async finish(id: string, token: string | undefined, ok: boolean, url: string | null, note: string | null): Promise<void> {
    const b = await this.build(id, token);
    const where = b.platform === 'ios' ? 'Sent to TestFlight' : 'Sent to Google Play';
    await this.db.pool.query('update builds set status = $2, url = $3, note = $4, token_hash = null where id = $1',
      [id, ok ? 'done' : 'failed', url, ok ? `${where}. ${note ?? ''}`.trim() : `The build failed${note ? `: ${note}` : '.'} See the workflow log on GitHub.`]);
  }

  async list(): Promise<BuildRow[]> {
    const { rows } = await this.db.pool.query<{ id: string; school_id: string; platform: BuildRow['platform']; version: string; status: BuildRow['status']; url: string | null; note: string; created_at: Date }>('select * from builds order by created_at desc limit 100');
    return rows.map((b) => ({ id: b.id, schoolId: b.school_id, platform: b.platform, version: b.version, status: b.status, url: b.url, note: b.note, createdAt: b.created_at.toISOString() }));
  }
}

@Injectable()
export class Actions {
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly db: Db,
    private readonly policy: Policy,
    private readonly schools: Schools,
    private readonly builds: Builds,
    private readonly backups: Backups,
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
    @Inject(ENV) private readonly env: Env,
    private readonly platform: PlatformHub,
  ) {}

  /** Actions owned by other services (config.apply), registered at start-up so this file does not import them. */
  private readonly handlers = new Map<string, (schoolId: string, params: Record<string, unknown>, by: string) => Promise<string>>();

  handle(action: string, fn: (schoolId: string, params: Record<string, unknown>, by: string) => Promise<string>): void {
    this.handlers.set(action, fn);
  }

  private row(r: ActionRecord): ActionRow {
    return {
      id: r.id, action: r.action as ActionRow['action'], schoolId: r.schoolId, schoolName: r.schoolName, status: r.status as ActionRow['status'], requestedBy: r.requestedBy, approvedBy: r.approvedBy,
      dryRun: r.dryRun, summary: r.summary, asked: r.asked || r.summary, note: String((r.params as { note?: unknown }).note ?? ''), decisionNote: r.decisionNote,
      changes: ((r.params as { diff?: ActionRow['changes'] }).diff ?? []), createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }

  async list(): Promise<ActionRow[]> {
    const { rows } = await this.db.query<ActionRecord>('select * from actions order by created_at desc limit 100');
    return rows.map((r) => this.row(r));
  }

  async request(user: ConsoleUser, body: ActionRequest): Promise<ActionRow> {
    // Taking a platform connection live, and switching the platform to live messages, are the actions about no school.
    if (!body.schoolId && body.action !== 'integration.live' && body.action !== 'integration.mode') throw new ApiError('validation', 'Choose the school this is for.');
    const school = body.schoolId ? await this.schools.raw(body.schoolId) : null;
    const pol = await this.policy.get();
    if (pol.freeze && body.action !== 'school.suspend') throw new ApiError('locked', `Changes are frozen${pol.freezeReason ? `: ${pol.freezeReason}` : ''}. A super admin can lift the freeze under Console settings.`);
    const busy = school ? await this.db.pool.query("select 1 from actions where school_id = $1 and status = 'running'", [school.id]) : { rowCount: 0 };
    if (busy.rowCount) throw new ApiError('conflict', 'Another action is already running for this school.');
    if (school && (body.action === 'school.erase' || body.action === 'retention.erase') && !body.dryRun && body.confirmCode?.trim() !== school.slug) {
      throw new ApiError('validation', 'That does not match. Nothing was erased.', { fields: { confirmCode: `Type ${school.slug} exactly.` } });
    }
    let needs = pol.approvals[body.action]?.needed && !body.dryRun;
    let summary = this.describe(body.action, school?.name ?? 'every school', body.params);
    if (school && body.action === 'entitlements.push') {
      // Checked now, so a bad change never waits for approval; taking anything away from a school always needs a second person.
      const c = await this.entitlementChange(school, body.params);
      if (c.problems.length) throw new ApiError('validation', c.problems.join(' '));
      if (c.removed.length && !body.dryRun) needs = true;
      summary = `${school.name}: ${[c.added.length ? `adds ${c.added.map(catalogueName).join(', ')}` : '', c.removed.length ? `takes away ${c.removed.map(catalogueName).join(', ')}` : ''].filter(Boolean).join('; ') || 'limits, dates or locks only'}`;
    }
    const id = newId('act');
    await this.db.pool.query(
      'insert into actions (id, action, school_id, school_name, params, status, requested_by, dry_run, summary, asked) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
      [id, body.action, school?.id ?? null, school?.name ?? null, JSON.stringify(body.params), needs ? 'pending_approval' : 'running', user.email, body.dryRun, summary]);
    await this.db.audit(user.email, `action.${body.action}.requested`, school ? 'school' : 'integration', school?.id ?? String(body.params.connectionId ?? ''), { dryRun: body.dryRun, needsApproval: !!needs });
    if (!needs) await this.run(id);
    return this.get(id);
  }

  async get(id: string): Promise<ActionRow> {
    const { rows } = await this.db.query<ActionRecord>('select * from actions where id = $1', [id]);
    if (!rows[0]) throw notFound('That action');
    return this.row(rows[0]);
  }

  /** A second person says yes. Nobody can approve their own request, and the role must be one the policy names. */
  async approve(user: ConsoleUser, id: string, yes: boolean, note = ''): Promise<ActionRow> {
    const a = await this.get(id);
    if (a.status !== 'pending_approval') throw new ApiError('conflict', 'This request is not waiting for approval.');
    if (a.requestedBy === user.email) throw new ApiError('forbidden', 'A second person has to approve this. You cannot approve your own request.');
    const pol = (await this.policy.get()).approvals[a.action];
    if (pol && !user.roles.some((r) => (pol.roles as ConsoleRole[]).includes(r))) throw new ApiError('forbidden', 'Your role cannot approve this action.');
    if (!yes) {
      if (note.trim().length < 5) throw new ApiError('validation', 'Say why, so the person who asked knows what to change.', { fields: { note: 'Say why.' } });
      await this.db.pool.query("update actions set status = 'rejected', approved_by = $2, decision_note = $3, finished_at = now() where id = $1", [id, user.email, note.trim()]);
      await this.db.audit(user.email, `action.${a.action}.rejected`, 'school', a.schoolId, { note: note.trim() });
      return this.get(id);
    }
    await this.db.pool.query("update actions set status = 'running', approved_by = $2 where id = $1", [id, user.email]);
    await this.run(id);
    return this.get(id);
  }

  private describe(action: ActionRequest['action'], school: string, params: Record<string, unknown> = {}): string {
    return ({
      'integration.live': `Take ${String(params.name ?? 'a connection')} live for ${school}`,
      'integration.mode': 'Switch every school to live messages (real providers, no Test inbox)',
      'retention.erase': `Erase the records of people who left ${school} past the retention period`,
      'school.golive': `Take ${school} live (moving in ends)`, 'school.suspend': `Pause ${school}`, 'school.resume': `Resume ${school}`, 'school.erase': `Erase ${school}`, 'entitlements.push': `Push the plan and locks to ${school}`,
      'migration.run': `Run pending migrations for ${school}`, 'domain.set': `Change the address of ${school}`, 'build.app': `Build the app for ${school}`, 'backup.take': `Back up ${school}`, 'backup.restore': `Put ${school} back as it was in a backup`, 'config.apply': `Change risky settings for ${school}`, 'school.move': `Move ${school} to another cell`,
    } as const)[action];
  }

  private async run(id: string): Promise<void> {
    const { rows } = await this.db.query<ActionRecord>('select * from actions where id = $1', [id]);
    const a = rows[0]!;
    try {
      const summary = a.dryRun ? `Dry run: ${a.summary}. Nothing was changed.` : await this.execute(a);
      await this.db.pool.query("update actions set status = 'done', summary = $2, finished_at = now() where id = $1", [id, summary]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.pool.query("update actions set status = 'failed', summary = $2, finished_at = now() where id = $1", [id, msg]);
    }
    await this.db.audit(a.approvedBy ?? a.requestedBy, `action.${a.action}.finished`, 'school', a.schoolId);
  }

  private async execute(a: ActionRecord): Promise<string> {
    const params = a.params as Record<string, unknown>;
    if (!a.schoolId) {
      const handler = this.handlers.get(a.action);
      if (!handler) throw new Error(`Unknown action ${a.action}.`);
      return handler('', params, a.requestedBy);
    }
    const school = await this.schools.raw(a.schoolId);
    const done = () => this.registry.invalidate(school.slug);
    switch (a.action as ActionRequest['action']) {
      case 'school.suspend':
        await this.db.pool.query("update schools set status = 'suspended' where id = $1", [school.id]);
        done();
        return `${school.name} is paused. Its apps show a pause message.`;
      case 'school.resume':
        await this.db.pool.query("update schools set status = 'live' where id = $1 and status = 'suspended'", [school.id]);
        done();
        return `${school.name} is live again.`;
      case 'school.erase':
        await this.erase(school);
        done();
        this.pools.evict(school.slug);
        return `${school.name} was erased: its database is dropped and its record archived.`;
      case 'entitlements.push': {
        // Applied to the entitlement as it is now, not as it was when the request was made.
        const c = await this.entitlementChange(school, params);
        if (c.problems.length) throw new Error(c.problems.join(' '));
        const next = { ...c.next, overrides: (params.overrides as Record<string, unknown> | undefined) ?? c.next.overrides };
        const { plan: _plan, ...doc } = next;
        await this.db.pool.query('update schools set plan = $2, entitlement = $3, config_version = config_version + 1 where id = $1', [school.id, next.plan, JSON.stringify(doc)]);
        done();
        const what = [c.added.length ? `added ${c.added.map(catalogueName).join(', ')}` : '', c.removed.length ? `took away ${c.removed.map(catalogueName).join(', ')}` : ''].filter(Boolean).join('; ');
        return `${next.plan} plan pushed${what ? `: ${what}` : ''}. It applies within 15 seconds; the school's data is kept either way.`;
      }
      case 'domain.set': {
        const custom = String(params.customDomain ?? '').trim().toLowerCase();
        // The Hosting connection adds the address at the host (which issues its certificate) and says where DNS must point;
        // without one, the platform's own name is the target. The DNS record is checked before the school switches to it.
        const host = await this.platform.hub.platform('hosting');
        if (school.customDomain && school.customDomain !== custom && host?.adapter.hosting) await host.adapter.hosting.removeDomain(host.ctx, school.customDomain).catch(() => undefined);
        let state: Record<string, unknown> = {};
        if (custom) {
          const atHost = host?.adapter.hosting ? await host.adapter.hosting.addDomain(host.ctx, custom) : null;
          const target = atHost?.target || `cname.${this.env.BASE_DOMAIN}`;
          const found = await dns.resolveCname(custom).catch(() => [] as string[]);
          if (!found.some((f) => f.replace(/\.$/, '') === target)) throw new Error(`Add a CNAME record for ${custom} pointing to ${target} at the school’s DNS host, then run this again.`);
          state = { verified: atHost?.verified ?? true, certificate: atHost?.certificate ?? 'issued', target, checkedAt: new Date().toISOString() };
        }
        await this.db.pool.query('update schools set custom_domain = $2, addressing = $3, domain_state = $4 where id = $1', [school.id, custom, params.addressing === 'subdomain' ? 'subdomain' : 'path', JSON.stringify(state)]);
        return custom ? `${custom} now points at ${school.name}${state.certificate === 'waiting' ? '; the certificate is being issued (a few minutes)' : ''}.` : `${school.name} uses its platform address.`;
      }
      case 'migration.run': {
        if (!school.dbUrlSealed) throw new Error('This school has no database yet.');
        const pool = new pg.Pool({ connectionString: unseal(school.dbUrlSealed, this.env.SECRETS_KEY), max: 2 });
        try {
          const applied = await migrate(pool, 'school');
          for (const m of applied) await this.recordMigration(m.tag, m.kind, school.id, 'applied', m.ms, null);
          return applied.length ? `Applied ${applied.map((m) => m.tag).join(', ')}.` : 'Nothing was pending. The school is up to date.';
        } finally {
          await pool.end();
        }
      }
      case 'school.move': {
        const to = String(params.cell ?? '');
        const target = (await this.db.pool.query<{ key: string; target: string; accepting: boolean; max_schools: number; n: string }>(
          'select c.key, c.target, c.accepting, c.max_schools, (select count(*) from schools s where s.cell = c.key and s.deleted_at is null) n from cells c where c.key = $1', [to])).rows[0];
        if (!target) throw new Error(`Cell “${to}” does not exist.`);
        if (to === school.cell) throw new Error(`${school.name} already runs in ${to}.`);
        if (!target.accepting) throw new Error(`Cell ${to} is closed to new schools.`);
        if (Number(target.n) >= target.max_schools) throw new Error(`Cell ${to} is full.`);
        const moved = await moveSchool({
          db: this.db, env: this.env, hub: this.platform, school: { ...school, dbName: school.dbName ?? null }, to,
          backup: () => this.backups.take(school.id, 'manual', `${a.requestedBy} (before moving)`), log: () => done(),
        });
        done();
        return moved;
      }
      case 'build.app': {
        const b = await this.builds.request(school.id, school.slug, params.platform === 'ios' ? 'ios' : 'android', a.requestedBy);
        if (b.status === 'unavailable' || b.status === 'failed') throw new Error(b.note);
        return b.note;
      }
      case 'backup.take': {
        const b = await this.backups.take(school.id, 'manual', a.requestedBy);
        return `Backed up ${school.name}: ${Math.max(1, Math.round(b.bytes / 1024))} KB, kept with the daily backups.`;
      }
      case 'backup.restore': {
        return this.backups.restore(school.id, String(params.backupId ?? ''), a.requestedBy);
      }
      default: {
        const handler = this.handlers.get(a.action);
        if (!handler) throw new Error(`Unknown action ${a.action}.`);
        return handler(school.id, params, a.requestedBy);
      }
    }
  }

  /** The change a push would make, read from its parameters. A new plan brings its limits unless limits are given too. */
  private async entitlementChange(school: { plan: string; entitlement: Omit<EntitlementDoc, 'plan'> }, params: Record<string, unknown>) {
    const change = params as EntitlementChange;
    let planLimits: EntitlementDoc['limits'] | undefined;
    if (change.plan && change.plan !== school.plan) {
      planLimits = (await this.db.pool.query<{ limits: EntitlementDoc['limits'] }>('select limits from plans where key = $1', [change.plan])).rows[0]?.limits;
      if (!planLimits) return { next: { ...school.entitlement, plan: school.plan }, removed: [], added: [], problems: [`Plan “${change.plan}” does not exist.`] };
    }
    const cur = { ...school.entitlement, plan: school.plan, locks: school.entitlement.locks ?? [], overrides: school.entitlement.overrides ?? {} };
    return changeEntitlement(cur, change, planLimits);
  }

  async recordMigration(tag: string, kind: string, schoolId: string, state: string, ms: number | null, error: string | null): Promise<void> {
    await this.db.pool.query(
      `insert into migration_runs (id, tag, kind, school_id, state, ms, error) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (tag, school_id) do update set state = excluded.state, ms = excluded.ms, error = excluded.error, at = now()`, [newId('mig'), tag, kind, schoolId, state, ms, error]);
  }

  private async erase(school: typeof reg.schools.$inferSelect): Promise<void> {
    if (school.dbName) {
      this.pools.evict(school.slug);
      // The cell's School databases connection made it, so it removes it; a cell without one used the registry's own server.
      const cell = (await this.db.pool.query<{ connection_id: string | null }>('select connection_id from cells where key = $1', [school.cell])).rows[0];
      if (cell?.connection_id) {
        const { adapter, ctx } = await this.platform.hub.use(cell.connection_id);
        await adapter.databases!.drop(ctx, school.dbName);
      } else {
        if (!/^[a-z][a-z0-9_]{0,62}$/.test(school.dbName)) throw new Error('Unsafe database name.');
        const c = new pg.Client({ connectionString: this.env.REGISTRY_DATABASE_URL });
        await c.connect();
        try {
          await c.query(`drop database if exists ${school.dbName} with (force)`);
          await c.query(`drop role if exists ${school.dbName}_app`).catch(() => undefined);
        } finally {
          await c.end().catch(() => undefined);
        }
      }
    }
    await this.db.pool.query("update schools set status = 'archived', deleted_at = now(), db_url_sealed = null where id = $1", [school.id]);
  }

  /** Asks the host again about the school's own address (certificate issued yet?) and checks its DNS record. */
  async checkDomain(schoolId: string): Promise<Record<string, unknown>> {
    const school = await this.schools.raw(schoolId);
    if (!school.customDomain) return {};
    const host = await this.platform.hub.platform('hosting');
    const atHost = host?.adapter.hosting ? await host.adapter.hosting.domain(host.ctx, school.customDomain).catch((e: Error) => ({ error: e.message })) : null;
    const target = (atHost && 'target' in atHost && atHost.target) || `cname.${this.env.BASE_DOMAIN}`;
    const found = await dns.resolveCname(school.customDomain).catch(() => [] as string[]);
    const state = {
      verified: found.some((f) => f.replace(/\.$/, '') === target) && (!atHost || ('verified' in atHost && atHost.verified)),
      certificate: atHost && 'certificate' in atHost ? atHost.certificate : 'issued', target, checkedAt: new Date().toISOString(),
      ...(atHost && 'error' in atHost ? { error: atHost.error } : {}),
    };
    await this.db.pool.query('update schools set domain_state = $2 where id = $1', [schoolId, JSON.stringify(state)]);
    return state;
  }

  async pending(school: typeof reg.schools.$inferSelect): Promise<string[]> {
    if (!school.dbUrlSealed) return [];
    const pool = this.pools.get(school.slug, unseal(school.dbUrlSealed, this.env.SECRETS_KEY));
    return (await pendingMigrations(pool, 'school')).map((m) => m.tag);
  }
}

@Controller('console/v1')
export class ActionsController {
  constructor(
    private readonly actions: Actions,
    private readonly builds: Builds,
  ) {}

  @Post('schools/:id/domain/check') @HttpCode(200) @Needs('schools.read')
  checkDomain(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.actions.checkDomain(id);
  }

  @Get('actions') @Needs('schools.read')
  list(): Promise<ActionRow[]> {
    return this.actions.list();
  }

  @Post('actions') @HttpCode(200) @Needs('schools.write')
  request(@Me() me: ConsoleUser, @Body(new ZodPipe(ActionRequest)) body: ActionRequest): Promise<ActionRow> {
    if (['school.erase'].includes(body.action) && !me.permissions.includes('schools.danger')) throw new ApiError('forbidden', 'Only a super admin can do this.');
    return this.actions.request(me, body);
  }

  @Post('actions/:id/approve') @HttpCode(200) @Needs('schools.danger')
  approve(@Me() me: ConsoleUser, @Param('id') id: string): Promise<ActionRow> {
    return this.actions.approve(me, id, true);
  }

  @Post('actions/:id/reject') @HttpCode(200) @Needs('schools.danger')
  reject(@Me() me: ConsoleUser, @Param('id') id: string, @Body() body: { note?: string } | undefined): Promise<ActionRow> {
    return this.actions.approve(me, id, false, String(body?.note ?? '').slice(0, 500));
  }

  @Get('builds') @Needs('schools.read')
  buildsList(): Promise<BuildRow[]> {
    return this.builds.list();
  }

  /** The build workflow fetches its signing kit with the build's own code (given at dispatch, good only while the build runs). */
  @Public() @Get('builds/:id/kit')
  buildKit(@Param('id') id: string, @Headers('x-build-token') token: string | undefined): Promise<BuildKit> {
    return this.builds.kit(id, token);
  }

  /** The build workflow reports back here, once, with the same code. */
  @Public() @Post('builds/:id/finish') @HttpCode(204)
  async buildFinished(@Param('id') id: string, @Headers('x-build-token') token: string | undefined, @Body() body: { ok?: boolean; url?: string; note?: string }): Promise<void> {
    await this.builds.finish(id, token, body?.ok !== false, typeof body?.url === 'string' ? body.url.slice(0, 500) : null, typeof body?.note === 'string' ? body.note.slice(0, 300) : null);
  }
}
