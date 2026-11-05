import { Body, Controller, Get, Inject, Injectable, Param, Patch, Query } from '@nestjs/common';
import { REGISTRY, POOLS } from './tokens.js';
import { activeModules, closeModules } from '@gradeon/config-engine';
import { type BuildRow, type DeployTarget, type FleetSummary, type SchoolDetail, type SchoolRow, type SchoolStatus } from '@gradeon/contracts';
import { notFound, ApiError } from '@gradeon/nest-kit';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import { unseal } from '@gradeon/security';
import { adminUrlFor } from './provisioning/drivers.js';
import { Provisioner } from './provisioning/provisioner.js';
import { Db, Needs, Me, type ConsoleUser, type reg } from './core.js';
import { ENV, type Env } from './env.js';

type SchoolRecord = typeof reg.schools.$inferSelect;

const CHECKLIST_LABELS: Record<string, string> = {
  apple_org: 'Apple: the school’s organisation account',
  apple_key: 'Apple: Gradeon invited, API key received',
  play_verify: 'Google Play: the school’s account is verified',
  first_build: 'First build to TestFlight and Play testing',
};

@Injectable()
export class Schools {
  constructor(
    private readonly db: Db,
    private readonly provisioner: Provisioner,
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
    @Inject(ENV) private readonly env: Env,
  ) {}

  row(r: SchoolRecord): SchoolRow {
    return {
      id: r.id, slug: r.slug, name: r.name, shortName: r.shortName, color: r.color, logoText: r.logoText, status: r.status as SchoolStatus, plan: r.plan, cell: r.cell, target: r.target as DeployTarget,
      region: r.region, versions: { api: r.apiVersion, admin: r.adminVersion, app: r.appVersion }, configVersion: r.configVersion, students: r.studentsCount, health: r.health as SchoolRow['health'],
      healthMs: r.healthMs, onboarding: { done: r.onboardingDone, total: r.onboardingTotal }, lastIncident: r.lastIncident, adminUrl: adminUrlFor(this.env, r.slug, r.addressing, r.customDomain), createdAt: r.createdAt.toISOString(),
    };
  }

  async raw(id: string): Promise<SchoolRecord> {
    const { rows } = await this.db.query<SchoolRecord>('select * from schools where (id = $1 or slug = $1) and deleted_at is null', [id]);
    if (!rows[0]) throw notFound('That school');
    return rows[0];
  }

  async list(q: { status?: string; cell?: string; query?: string } = {}): Promise<SchoolRow[]> {
    const { rows } = await this.db.query<SchoolRecord>(
      `select * from schools where deleted_at is null and ($1::text is null or status = $1) and ($2::text is null or cell = $2)
       and ($3::text is null or name ilike '%' || $3 || '%' or slug ilike '%' || $3 || '%') order by created_at desc, name`, [q.status ?? null, q.cell ?? null, q.query ?? null]);
    return rows.map((r) => this.row(r));
  }

  async detail(id: string): Promise<SchoolDetail> {
    const r = await this.raw(id);
    const month = new Date();
    month.setUTCDate(1);
    month.setUTCHours(0, 0, 0, 0);
    const [sms, builds, runs] = await Promise.all([
      this.db.pool.query<{ n: string }>("select count(*) n from sandbox_messages where school_slug = $1 and channel = 'sms' and created_at >= $2", [r.slug, month]),
      this.db.pool.query<{ id: string; school_id: string; platform: BuildRow['platform']; version: string; status: BuildRow['status']; url: string | null; note: string; created_at: Date }>('select * from builds where school_id = $1 order by created_at desc limit 10', [r.id]),
      this.provisioner.forSchool(r.id),
    ]);
    let staff = 0;
    if (r.dbUrlSealed && r.status !== 'onboarding') {
      try {
        staff = Number((await this.pools.get(r.slug, unseal(r.dbUrlSealed, this.env.SECRETS_KEY)).query('select count(*) n from staff')).rows[0]?.n ?? 0);
      } catch { /* the database is not answering: the health tab says so */ }
    }
    const ent = r.entitlement;
    return {
      ...this.row(r),
      contact: r.contact, gstin: r.gstin, entitlement: {
        plan: r.plan, modules: closeModules(ent.modules), active: activeModules(ent), features: ent.features ?? {}, dates: ent.dates ?? {}, trialUntil: ent.trialUntil ?? null,
        limits: ent.limits, locks: ent.locks, version: ent.version,
      },
      usage: { students: r.studentsCount, storageGb: 0, sms: Number(sms.rows[0]?.n ?? 0), staff },
      checklist: Object.entries(CHECKLIST_LABELS).map(([key, label]) => ({ key, label, state: (r.checklist[key] as 'done' | 'waiting' | 'todo' | undefined) ?? 'todo' })),
      runs, builds: builds.rows.map((b) => ({ id: b.id, schoolId: b.school_id, platform: b.platform, version: b.version, status: b.status, url: b.url, note: b.note, createdAt: b.created_at.toISOString() })),
    };
  }

  async setChecklist(user: string, id: string, key: string, state: string): Promise<void> {
    if (!(key in CHECKLIST_LABELS)) throw new ApiError('validation', 'That is not a checklist item.');
    if (!['done', 'waiting', 'todo'].includes(state)) throw new ApiError('validation', 'State must be done, waiting or todo.');
    const r = await this.raw(id);
    const next = { ...r.checklist, [key]: state };
    const done = Object.values(next).filter((v) => v === 'done').length;
    await this.db.pool.query('update schools set checklist = $2, onboarding_done = case when status = $4 then least(onboarding_total, 5 + $3) else onboarding_done end where id = $1', [r.id, JSON.stringify(next), done, 'live']);
    await this.db.audit(user, 'checklist.changed', 'school', r.id, { key, state });
  }

  async fleet(): Promise<FleetSummary> {
    const [schools, cells, series, p95, incident] = await Promise.all([
      this.db.pool.query<{ status: string; health: string; cell: string; slug: string; name: string; id: string; created_at: Date }>('select id, slug, name, status, health, cell, created_at from schools where deleted_at is null'),
      this.db.pool.query<{ key: string; target: DeployTarget; region: string; max_schools: number }>('select key, target, region, max_schools from cells order by key'),
      this.db.pool.query<{ hour: number; day: string; per_min: number }>(
        `select extract(hour from m.at at time zone 'Asia/Kolkata')::int as hour, case when (m.at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date then 'today' else 'previous' end as day,
           sum(m.requests)::float / 60 as per_min
         from metrics_minute m where m.at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '1 day') at time zone 'Asia/Kolkata' group by 1, 2`),
      this.db.pool.query<{ p95: number | null }>("select max(p95_ms) p95 from metrics_minute where at >= now() - interval '1 hour'"),
      this.db.pool.query<{ id: string; title: string; state: 'open' | 'resolved'; started_at: Date; school_id: string | null; school_name: string | null }>(
        `select i.id, i.title, i.state, i.started_at, i.school_id, s.name school_name from incidents i left join schools s on s.id = i.school_id
         where i.state = 'open' or i.resolved_at > now() - interval '1 hour' order by i.started_at desc limit 1`),
    ]);
    const list = schools.rows;
    const by = (h: string) => list.filter((s) => s.health === h).length;
    const today = new Map<number, number>();
    const prev = new Map<number, number>();
    for (const r of series.rows) (r.day === 'today' ? today : prev).set(r.hour, Number(r.per_min));
    const inc = incident.rows[0];
    const soon = list.filter((s) => s.status === 'onboarding').slice(0, 2).map((s) => ({ name: s.name, id: s.id }));
    return {
      schools: list.length, live: list.filter((s) => s.status === 'live').length, onboarding: list.filter((s) => s.status === 'onboarding').length,
      healthy: by('ok') + by('unknown'), degraded: by('degraded'),
      requests24h: Array.from({ length: 24 }, (_, hour) => ({ hour, value: Math.round((today.get(hour) ?? 0) * 100) / 100, previous: Math.round((prev.get(hour) ?? 0) * 100) / 100 })),
      p95Ms: p95.rows[0]?.p95 ?? 0,
      cells: cells.rows.map((c) => ({ key: c.key, target: c.target, schools: list.filter((s) => s.cell === c.key).length, max: c.max_schools, region: c.region })),
      incident: inc ? { id: inc.id, title: inc.title, body: inc.state === 'open' ? 'We are looking at it. Schools may see slower pages for a moment.' : 'It cleared by itself. No data was lost.', state: inc.state, startedAt: inc.started_at.toISOString(), schoolName: inc.school_name } : null,
      upcoming: soon,
      release: null,
    };
  }

}

@Controller('console/v1/schools')
export class SchoolsController {
  constructor(private readonly schools: Schools) {}

  @Get() @Needs('schools.read')
  list(@Query() q: { status?: string; cell?: string; query?: string }): Promise<SchoolRow[]> {
    return this.schools.list(q);
  }

  @Get(':id') @Needs('schools.read')
  detail(@Param('id') id: string): Promise<SchoolDetail> {
    return this.schools.detail(id);
  }

  @Patch(':id/checklist') @Needs('schools.write')
  async checklist(@Me() me: ConsoleUser, @Param('id') id: string, @Body() body: { key: string; state: string }): Promise<{ ok: true }> {
    await this.schools.setChecklist(me.email, id, body.key, body.state);
    return { ok: true };
  }
}
