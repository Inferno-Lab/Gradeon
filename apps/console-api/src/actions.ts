import { Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Param, Post } from '@nestjs/common';
import { POOLS, REGISTRY } from './tokens.js';
import { closeModules } from '@gradeon/config-engine';
import { ActionRequest, type ActionRow, type BuildRow, type ConsoleRole } from '@gradeon/contracts';
import { migrate, newId, pg, pendingMigrations } from '@gradeon/db';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { constantTimeEqual, unseal } from '@gradeon/security';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import dns from 'node:dns/promises';
import { Backups } from './backups.js';
import { Db, Me, Needs, Public, type ConsoleUser, type reg } from './core.js';
import { ENV, type Env } from './env.js';
import { Policy } from './policy.js';
import { Schools } from './schools.js';

type ActionRecord = typeof reg.actions.$inferSelect;

@Injectable()
export class Builds {
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Asks GitHub to build the school's app. With no token it records that it could not, so the screen says why. */
  async request(schoolId: string, slug: string, platform: BuildRow['platform'], user: string): Promise<BuildRow> {
    const id = newId('bld');
    const version = this.env.APP_VERSION;
    let status: BuildRow['status'] = 'unavailable';
    let note = 'GitHub is not connected, so no build was started. Set GITHUB_TOKEN and GITHUB_REPO on the console server.';
    if (platform === 'ios') note = 'iPhone builds need the school’s Apple account and a Mac runner. They are not available yet.';
    else if (this.env.GITHUB_TOKEN && this.env.GITHUB_REPO) {
      const res = await this.fetchImpl(`https://api.github.com/repos/${this.env.GITHUB_REPO}/actions/workflows/mobile-build.yml/dispatches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'gradeon-console' },
        body: JSON.stringify({ ref: this.env.GITHUB_BRANCH, inputs: { school: slug, build_id: id } }),
      });
      status = res.ok ? 'queued' : 'failed';
      note = res.ok ? 'Queued on GitHub Actions. The install link appears here when the build finishes.' : `GitHub refused the request (${res.status}).`;
    }
    await this.db.pool.query('insert into builds (id, school_id, platform, version, status, note) values ($1,$2,$3,$4,$5,$6)', [id, schoolId, platform, version, status, note]);
    await this.db.audit(user, 'build.requested', 'school', schoolId, { platform, status });
    return { id, schoolId, platform, version, status, url: null, note, createdAt: new Date().toISOString() };
  }

  /** The workflow calls this when it finishes, with the install link. */
  async finish(id: string, ok: boolean, url: string | null): Promise<void> {
    await this.db.pool.query('update builds set status = $2, url = $3, note = $4 where id = $1', [id, ok ? 'done' : 'failed', url, ok ? 'Ready to install.' : 'The build failed. See the workflow log on GitHub.']);
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
  ) {}

  private row(r: ActionRecord): ActionRow {
    return {
      id: r.id, action: r.action as ActionRow['action'], schoolId: r.schoolId, schoolName: r.schoolName, status: r.status as ActionRow['status'], requestedBy: r.requestedBy, approvedBy: r.approvedBy,
      dryRun: r.dryRun, summary: r.summary, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }

  async list(): Promise<ActionRow[]> {
    const { rows } = await this.db.query<ActionRecord>('select * from actions order by created_at desc limit 100');
    return rows.map((r) => this.row(r));
  }

  async request(user: ConsoleUser, body: ActionRequest): Promise<ActionRow> {
    const school = await this.schools.raw(body.schoolId);
    const pol = await this.policy.get();
    if (pol.freeze && body.action !== 'school.suspend') throw new ApiError('locked', 'Changes are frozen. A super admin can lift the freeze under Policy.');
    const busy = await this.db.pool.query("select 1 from actions where school_id = $1 and status = 'running'", [school.id]);
    if (busy.rowCount) throw new ApiError('conflict', 'Another action is already running for this school.');
    if (body.action === 'school.erase' && !body.dryRun && body.confirmCode?.trim() !== school.slug) {
      throw new ApiError('validation', 'That does not match. Nothing was erased.', { fields: { confirmCode: `Type ${school.slug} exactly.` } });
    }
    const needs = pol.approvals[body.action]?.needed && !body.dryRun;
    const id = newId('act');
    await this.db.pool.query(
      'insert into actions (id, action, school_id, school_name, params, status, requested_by, dry_run, summary) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, body.action, school.id, school.name, JSON.stringify(body.params), needs ? 'pending_approval' : 'running', user.email, body.dryRun, this.describe(body.action, school.name)]);
    await this.db.audit(user.email, `action.${body.action}.requested`, 'school', school.id, { dryRun: body.dryRun, needsApproval: !!needs });
    if (!needs) await this.run(id);
    return this.get(id);
  }

  async get(id: string): Promise<ActionRow> {
    const { rows } = await this.db.query<ActionRecord>('select * from actions where id = $1', [id]);
    if (!rows[0]) throw notFound('That action');
    return this.row(rows[0]);
  }

  /** A second person says yes. Nobody can approve their own request, and the role must be one the policy names. */
  async approve(user: ConsoleUser, id: string, yes: boolean): Promise<ActionRow> {
    const a = await this.get(id);
    if (a.status !== 'pending_approval') throw new ApiError('conflict', 'This request is not waiting for approval.');
    if (a.requestedBy === user.email) throw new ApiError('forbidden', 'A second person has to approve this. You cannot approve your own request.');
    const pol = (await this.policy.get()).approvals[a.action];
    if (pol && !user.roles.some((r) => (pol.roles as ConsoleRole[]).includes(r))) throw new ApiError('forbidden', 'Your role cannot approve this action.');
    if (!yes) {
      await this.db.pool.query("update actions set status = 'rejected', approved_by = $2, finished_at = now() where id = $1", [id, user.email]);
      await this.db.audit(user.email, `action.${a.action}.rejected`, 'school', a.schoolId);
      return this.get(id);
    }
    await this.db.pool.query("update actions set status = 'running', approved_by = $2 where id = $1", [id, user.email]);
    await this.run(id);
    return this.get(id);
  }

  private describe(action: ActionRequest['action'], school: string): string {
    return ({
      'school.suspend': `Pause ${school}`, 'school.resume': `Resume ${school}`, 'school.erase': `Erase ${school}`, 'entitlements.push': `Push the plan and locks to ${school}`,
      'migration.run': `Run pending migrations for ${school}`, 'domain.set': `Change the address of ${school}`, 'build.app': `Build the app for ${school}`, 'backup.take': `Back up ${school}`, 'backup.restore': `Put ${school} back as it was in a backup`, 'school.move': `Move ${school} to another cell`,
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
    const school = await this.schools.raw(a.schoolId!);
    const params = a.params as Record<string, unknown>;
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
        const ent = school.entitlement;
        const modules = Array.isArray(params.modules) ? closeModules(params.modules as string[]) : ent.modules;
        const locks = Array.isArray(params.locks) ? (params.locks as string[]) : ent.locks;
        const plan = typeof params.plan === 'string' ? params.plan : school.plan;
        const limits = (await this.db.pool.query<{ limits: typeof ent.limits }>('select limits from plans where key = $1', [plan])).rows[0]?.limits;
        if (!limits) throw new Error(`Plan “${plan}” does not exist.`);
        await this.db.pool.query('update schools set plan = $2, entitlement = $3, config_version = config_version + 1 where id = $1', [school.id, plan, JSON.stringify({ modules, locks, limits, overrides: (params.overrides as Record<string, unknown> | undefined) ?? ent.overrides, version: ent.version + 1 })]);
        done();
        return `Plan ${plan}, ${modules.length} modules and ${locks.length} locks pushed. They apply within 15 seconds.`;
      }
      case 'domain.set': {
        const custom = String(params.customDomain ?? '').trim().toLowerCase();
        if (custom) {
          const target = `cname.${this.env.BASE_DOMAIN}`;
          const found = await dns.resolveCname(custom).catch(() => [] as string[]);
          if (!found.some((f) => f.replace(/\.$/, '') === target)) throw new Error(`Add a CNAME record for ${custom} pointing to ${target}, then run this again.`);
        }
        await this.db.pool.query('update schools set custom_domain = $2, addressing = $3 where id = $1', [school.id, custom, params.addressing === 'subdomain' ? 'subdomain' : 'path']);
        return custom ? `${custom} now points at ${school.name}.` : `${school.name} uses its platform address.`;
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
        if (target.target !== school.target) throw new Error(`Cell ${to} runs on ${target.target}, but ${school.name} runs on ${school.target}. Moving between kinds of cell needs a database copy, which only the aws-cell target performs.`);
        await this.db.pool.query('update schools set cell = $2, region = (select region from cells where key = $2), config_version = config_version + 1 where id = $1', [school.id, to]);
        done();
        // shortcut: cells of one kind share a database server on the test track, so a move is a change of record, not a copy. On aws-cell this step becomes replicate, freeze, switch and verify.
        return `${school.name} now runs in ${to}. On the test track its database stays where it is.`;
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
      default:
        throw new Error(`Unknown action ${a.action}.`);
    }
  }

  async recordMigration(tag: string, kind: string, schoolId: string, state: string, ms: number | null, error: string | null): Promise<void> {
    await this.db.pool.query(
      `insert into migration_runs (id, tag, kind, school_id, state, ms, error) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (tag, school_id) do update set state = excluded.state, ms = excluded.ms, error = excluded.error, at = now()`, [newId('mig'), tag, kind, schoolId, state, ms, error]);
  }

  private async erase(school: typeof reg.schools.$inferSelect): Promise<void> {
    if (school.dbName?.startsWith('neon:')) {
      const res = await this.fetchImpl(`https://console.neon.tech/api/v2/projects/${school.dbName.slice(5)}`, { method: 'DELETE', headers: { authorization: `Bearer ${this.env.NEON_API_KEY}` } });
      if (!res.ok && res.status !== 404) throw new Error(`Neon refused to delete the project (${res.status}).`);
    } else if (school.dbName) {
      const admin = process.env[`CELL_${school.cell.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ADMIN_URL`] ?? this.env.SHARED_PG_ADMIN_URL ?? this.env.REGISTRY_DATABASE_URL;
      this.pools.evict(school.slug);
      const c = new pg.Client({ connectionString: admin });
      await c.connect();
      try {
        if (!/^[a-z][a-z0-9_]{0,62}$/.test(school.dbName)) throw new Error('Unsafe database name.');
        await c.query(`drop database if exists ${school.dbName} with (force)`);
        await c.query(`drop role if exists ${school.dbName}_app`).catch(() => undefined);
      } finally {
        await c.end().catch(() => undefined);
      }
    }
    await this.db.pool.query("update schools set status = 'archived', deleted_at = now(), db_url_sealed = null where id = $1", [school.id]);
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
    @Inject(ENV) private readonly env: Env,
  ) {}

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
  reject(@Me() me: ConsoleUser, @Param('id') id: string): Promise<ActionRow> {
    return this.actions.approve(me, id, false);
  }

  @Get('builds') @Needs('schools.read')
  buildsList(): Promise<BuildRow[]> {
    return this.builds.list();
  }

  /** The build workflow reports back here with the install link. It proves itself with the shared token; without one set, this is closed. */
  @Public() @Post('builds/:id/finish') @HttpCode(204)
  async buildFinished(@Param('id') id: string, @Headers('x-build-token') token: string | undefined, @Body() body: { ok?: boolean; url?: string }): Promise<void> {
    const want = this.env.BUILD_CALLBACK_TOKEN;
    if (!want || !token || !constantTimeEqual(token, want)) throw new ApiError('unauthenticated', 'That build token is not accepted.');
    await this.builds.finish(id, body?.ok !== false, typeof body?.url === 'string' ? body.url.slice(0, 500) : null);
  }
}
