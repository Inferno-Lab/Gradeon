import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { REGISTRY } from '../tokens.js';
import {
  STEP_KEYS, STEP_LABELS, stepOrderProblem, type BlueprintInput, type BlueprintRow, type DeployTarget, type ProvisionRunRow, type RunStepRow, type RoleTemplate, type StepKey, type WizardPayload,
} from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, notFound } from '@gradeon/nest-kit';
import type { Registry } from '@gradeon/tenancy';
import { Db, type reg } from '../core.js';
import { ENV, type Env } from '../env.js';
import { Sandbox } from '../sandbox.js';
import { PlatformHub } from '../platform-hub.js';
import { RoleTemplates } from '../policy.js';
import { StepBlocked, driversFor, type StepCtx } from './drivers.js';

type RunRecord = typeof reg.provisionRuns.$inferSelect;
type SchoolRecord = typeof reg.schools.$inferSelect;

const DEFAULT_OPTIONAL: Partial<Record<StepKey, boolean>> = { 'keys-storage': true, domain: true, 'build-profile': true, 'store-checklist': true };

export function defaultSteps(): BlueprintInput['steps'] {
  return STEP_KEYS.map((key) => ({ key, label: STEP_LABELS[key], optional: !!DEFAULT_OPTIONAL[key], enabled: true, params: {} }));
}

@Injectable()
export class Blueprints {
  private readonly log = new Logger('Blueprints');

  constructor(private readonly db: Db) {}

  /** One blueprint per target, so a school always has a recipe. Edits create new versions; these are version 1. */
  async ensureDefaults(): Promise<void> {
    for (const target of ['local', 'free-test', 'aws-cell'] as const) {
      const key = `default-${target}`;
      const found = await this.db.pool.query('select 1 from blueprints where key = $1', [key]);
      if (found.rowCount) continue;
      await this.db.pool.query('insert into blueprints (id, key, version, name, target, plan, steps, active, created_by) values ($1,$2,1,$3,$4,null,$5,true,$6)',
        [newId('bpt'), key, `Standard setup (${target})`, target, JSON.stringify(defaultSteps()), 'system']);
      this.log.log(`added blueprint ${key}`);
    }
  }

  private row(r: typeof reg.blueprints.$inferSelect): BlueprintRow {
    return { id: r.id, key: r.key, name: r.name, target: r.target as DeployTarget, plan: r.plan, steps: r.steps as BlueprintRow['steps'], version: r.version, active: r.active, createdBy: r.createdBy, createdAt: r.createdAt.toISOString() };
  }

  async list(): Promise<BlueprintRow[]> {
    const { rows } = await this.db.query<typeof reg.blueprints.$inferSelect>('select * from blueprints order by key, version desc');
    return rows.map((r) => this.row({ ...r, createdAt: new Date(r.createdAt), steps: r.steps }));
  }

  /** The active blueprint for a target and plan: a plan-specific one beats the general one. */
  async pick(target: DeployTarget, plan: string): Promise<BlueprintRow> {
    const { rows } = await this.db.query<typeof reg.blueprints.$inferSelect>(
      "select * from blueprints where active and target = $1 and (plan = $2 or plan is null) order by (plan is not null) desc, version desc limit 1", [target, plan]);
    if (!rows[0]) throw new ApiError('conflict', `There is no setup blueprint for ${target}. Add one under Blueprints.`);
    return this.row(rows[0]);
  }

  async save(user: string, input: BlueprintInput): Promise<BlueprintRow> {
    const problem = stepOrderProblem(input.steps);
    if (problem) throw new ApiError('validation', problem, { fields: { steps: problem } });
    const latest = await this.db.pool.query<{ version: number }>('select coalesce(max(version),0) version from blueprints where key = $1', [input.key]);
    const version = (latest.rows[0]?.version ?? 0) + 1;
    const id = newId('bpt');
    await this.db.pool.query('update blueprints set active = false where key = $1', [input.key]);
    await this.db.pool.query('insert into blueprints (id, key, version, name, target, plan, steps, active, created_by) values ($1,$2,$3,$4,$5,$6,$7,true,$8)',
      [id, input.key, version, input.name, input.target, input.plan, JSON.stringify(input.steps), user]);
    await this.db.audit(user, 'blueprint.saved', 'blueprint', id, { key: input.key, version });
    const { rows } = await this.db.query<typeof reg.blueprints.$inferSelect>('select * from blueprints where id = $1', [id]);
    return this.row(rows[0]!);
  }

  async activate(user: string, id: string): Promise<void> {
    const { rows } = await this.db.pool.query<{ key: string }>('select key from blueprints where id = $1', [id]);
    if (!rows[0]) throw notFound('That blueprint');
    await this.db.pool.query('update blueprints set active = (id = $1) where key = $2', [id, rows[0].key]);
    await this.db.audit(user, 'blueprint.activated', 'blueprint', id);
  }
}

const now = () => new Date().toISOString();

@Injectable()
export class Provisioner implements OnApplicationBootstrap {
  private readonly log = new Logger('Provisioner');
  private readonly whenSetUp: ((schoolId: string, payload: WizardPayload) => Promise<unknown>)[] = [];

  /** Work that waits until a school's set-up has finished (its storage and database exist). */
  afterSetUp(fn: (schoolId: string, payload: WizardPayload) => Promise<unknown>): void {
    this.whenSetUp.push(fn);
  }
  private readonly active = new Set<string>();
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly db: Db,
    private readonly sandbox: Sandbox,
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(ENV) private readonly env: Env,
    private readonly platform: PlatformHub,
    private readonly roles: RoleTemplates,
  ) {}

  /** A restart can interrupt a run. Mark it failed so a person can retry it from the step it stopped on. */
  async onApplicationBootstrap(): Promise<void> {
    const { rows } = await this.db.query<RunRecord>("select * from provision_runs where status in ('running','queued')");
    for (const r of rows) {
      const steps = (r.steps as RunStepRow[]).map((s) => (s.status === 'running' ? { ...s, status: 'failed' as const, error: 'Stopped by a restart. Retry to continue.', finishedAt: now() } : s));
      await this.db.pool.query("update provision_runs set status = 'failed', steps = $2 where id = $1", [r.id, JSON.stringify(steps)]);
    }
  }

  private toRow(r: RunRecord): ProvisionRunRow {
    return {
      id: r.id, schoolId: r.schoolId, schoolName: r.schoolName, blueprintKey: r.blueprintKey, blueprintVersion: r.blueprintVersion, target: r.target as DeployTarget, dryRun: r.dryRun,
      status: r.status as ProvisionRunRow['status'], startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, steps: r.steps as RunStepRow[],
    };
  }

  async get(id: string): Promise<ProvisionRunRow> {
    const { rows } = await this.db.query<RunRecord>('select * from provision_runs where id = $1', [id]);
    if (!rows[0]) throw notFound('That setup run');
    return this.toRow(rows[0]);
  }

  async forSchool(schoolId: string): Promise<ProvisionRunRow[]> {
    const { rows } = await this.db.query<RunRecord>('select * from provision_runs where school_id = $1 order by started_at desc limit 10', [schoolId]);
    return rows.map((r) => this.toRow(r));
  }

  async start(school: SchoolRecord, blueprint: BlueprintRow, payload: WizardPayload, dryRun: boolean, user: string): Promise<ProvisionRunRow> {
    const running = await this.db.pool.query("select 1 from provision_runs where school_id = $1 and status in ('running','queued') and not dry_run", [school.id]);
    if (running.rowCount && !dryRun) throw new ApiError('conflict', 'This school is already being set up.');
    const steps: RunStepRow[] = blueprint.steps.filter((s) => s.enabled).map((s) => ({ key: s.key, label: s.label, status: 'pending', optional: s.optional, startedAt: null, finishedAt: null, log: [], error: null }));
    const id = newId('run');
    await this.db.pool.query(
      'insert into provision_runs (id, school_id, school_name, blueprint_key, blueprint_version, target, dry_run, status, payload, steps) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, school.id, school.name, blueprint.key, blueprint.version, blueprint.target, dryRun, 'queued', JSON.stringify({ wizard: payload, params: Object.fromEntries(blueprint.steps.map((s) => [s.key, s.params])), roles: await this.roles.get() }), JSON.stringify(steps)]);
    await this.db.audit(user, dryRun ? 'provision.dry_run' : 'provision.started', 'school', school.id, { blueprint: `${blueprint.key}@${blueprint.version}` });
    void this.execute(id);
    return this.get(id);
  }

  async retry(id: string, user: string): Promise<ProvisionRunRow> {
    const run = await this.get(id);
    if (run.status !== 'failed') throw new ApiError('conflict', 'Only a stopped run can be retried.');
    const steps = run.steps.map((s) => (s.status === 'failed' ? { ...s, status: 'pending' as const, error: null } : s));
    await this.db.pool.query("update provision_runs set status = 'queued', steps = $2, finished_at = null where id = $1", [id, JSON.stringify(steps)]);
    await this.db.audit(user, 'provision.retried', 'school', run.schoolId);
    void this.execute(id);
    return this.get(id);
  }

  async skip(id: string, key: StepKey, user: string): Promise<ProvisionRunRow> {
    const run = await this.get(id);
    const step = run.steps.find((s) => s.key === key);
    if (!step) throw notFound('That step');
    if (!step.optional) throw new ApiError('conflict', 'This step is required and cannot be skipped.');
    if (step.status !== 'failed') throw new ApiError('conflict', 'Only a step that stopped can be skipped.');
    step.status = 'skipped';
    step.error = null;
    step.log.push({ at: now(), level: 'warn', text: `skipped by ${user}` });
    await this.db.pool.query("update provision_runs set steps = $2, status = 'queued' where id = $1", [id, JSON.stringify(run.steps)]);
    await this.db.audit(user, 'provision.step_skipped', 'school', run.schoolId, { step: key });
    void this.execute(id);
    return this.get(id);
  }

  /** Runs the steps in order. Each step is saved as it changes, so the live view and a restart both see the truth. */
  private async execute(id: string): Promise<void> {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      const { rows } = await this.db.query<RunRecord>('select * from provision_runs where id = $1', [id]);
      const r = rows[0];
      if (!r) return;
      // The starting roles as they were when the run began, so a retry sets up the same school.
      const payload = r.payload as { wizard: WizardPayload; params: Record<string, Record<string, unknown>>; roles?: RoleTemplate[] };
      const steps = r.steps as RunStepRow[];
      const save = async (status?: string) => {
        await this.db.pool.query('update provision_runs set steps = $2, status = coalesce($3, status), finished_at = case when $3 in (\'succeeded\',\'failed\') then now() else finished_at end where id = $1', [id, JSON.stringify(steps), status ?? null]);
      };
      await save('running');
      const loadSchool = async () => (await this.db.query<SchoolRecord>('select * from schools where id = $1', [r.schoolId])).rows[0]!;
      const drivers = driversFor(r.target as DeployTarget);
      for (const step of steps) {
        if (step.status === 'done' || step.status === 'skipped') continue;
        const driver = drivers[step.key];
        step.status = 'running';
        step.startedAt = now();
        step.finishedAt = null;
        await save();
        const school = await loadSchool();
        const ctx: StepCtx = {
          env: this.env, db: this.db, hub: this.platform.hub, registry: this.registry, sandbox: this.sandbox, fetch: this.fetchImpl, school, slug: school.slug, payload: payload.wizard, target: r.target as DeployTarget,
          params: payload.params[step.key] ?? {}, roles: payload.roles ?? [], reload: loadSchool,
          log: (level, text) => { step.log.push({ at: now(), level, text }); if (step.log.length > 100) step.log.shift(); },
        };
        try {
          if (r.dryRun) {
            ctx.log('info', `would: ${driver.describe(ctx)}`);
            step.status = 'done';
          } else {
            const res = await driver.run(ctx);
            ctx.log('info', res.detail);
            step.status = res.skipped ? 'skipped' : 'done';
          }
          step.finishedAt = now();
          await save();
          if (this.env.STEP_PAUSE_MS) await new Promise((ok) => setTimeout(ok, this.env.STEP_PAUSE_MS));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!(err instanceof StepBlocked)) this.log.warn(`run ${id} step ${step.key}: ${msg}`);
          step.status = 'failed';
          step.error = msg;
          step.finishedAt = now();
          ctx.log('error', msg);
          await save('failed');
          return;
        }
      }
      if (!r.dryRun) await this.activate(r.schoolId);
      await save('succeeded');
      // What waits for a set-up school: the wizard's logo goes into its storage. A failure here is logged, the school is fine.
      if (!r.dryRun) for (const fn of this.whenSetUp) await fn(r.schoolId, payload.wizard).catch((e: Error) => this.log.warn(`after set-up of ${r.schoolId}: ${e.message}`));
    } finally {
      this.active.delete(id);
    }
  }

  private async activate(schoolId: string): Promise<void> {
    const { rows } = await this.db.pool.query<{ slug: string; checklist: Record<string, string> }>('select slug, checklist from schools where id = $1', [schoolId]);
    const done = 5 + Object.values(rows[0]?.checklist ?? {}).filter((v) => v === 'done').length;
    await this.db.pool.query("update schools set status = 'live', onboarding_done = $2, onboarding_total = 9 where id = $1 and status = 'onboarding'", [schoolId, done]);
    if (rows[0]) this.registry.invalidate(rows[0].slug);
  }

  /** Waits for a run to finish. Tests and the wizard's “Launch and wait” use it; the UI polls instead. */
  async settled(id: string, timeoutMs = 120_000): Promise<ProvisionRunRow> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const run = await this.get(id);
      if (run.status === 'succeeded' || run.status === 'failed') return run;
      if (Date.now() > until) throw new Error('The setup run took too long.');
      await new Promise((ok) => setTimeout(ok, 120));
    }
  }
}
