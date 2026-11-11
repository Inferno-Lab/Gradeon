import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Param, Post, Put } from '@nestjs/common';
import { DEFAULT_PLANS, closeModules } from '@gradeon/config-engine';
import { BlueprintInput, STEP_LABELS, WIZARD_STEPS, WizardPayload, type BlueprintRow, type PlanRow, type ProvisionRunRow, type WizardDraftRow, type WizardReview } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { Db, Me, Needs, type ConsoleUser, type reg } from './core.js';
import { ENV, type Env } from './env.js';
import { driversFor } from './provisioning/drivers.js';
import { Blueprints, Provisioner } from './provisioning/provisioner.js';
import { Policy } from './policy.js';

@Injectable()
export class Wizard {
  constructor(
    private readonly db: Db,
    private readonly blueprints: Blueprints,
    private readonly provisioner: Provisioner,
    private readonly policy: Policy,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async plans(): Promise<PlanRow[]> {
    const { rows } = await this.db.pool.query<{ key: string; name: string; per_student_year: number; modules: string[]; features: Record<string, boolean>; limits: PlanRow['limits'] }>('select * from plans order by per_student_year');
    return rows.map((r) => ({ key: r.key, name: r.name, perStudentYear: r.per_student_year, modules: r.modules, features: r.features ?? {}, limits: r.limits }));
  }

  async ensurePlans(): Promise<void> {
    for (const p of DEFAULT_PLANS) {
      await this.db.pool.query('insert into plans (key, name, per_student_year, modules, features, limits) values ($1,$2,$3,$4,$5,$6) on conflict (key) do nothing', [p.key, p.name, p.perStudentYear, JSON.stringify(p.modules), JSON.stringify(p.features ?? {}), JSON.stringify(p.limits)]);
    }
  }

  private draftRow(r: { id: string; name: string; step: number; data: Record<string, unknown>; updated_by: string; updated_at: Date }): WizardDraftRow {
    return { id: r.id, name: r.name, step: r.step, data: r.data as WizardDraftRow['data'], updatedBy: r.updated_by, updatedAt: r.updated_at.toISOString() };
  }

  async drafts(): Promise<WizardDraftRow[]> {
    const { rows } = await this.db.pool.query('select * from wizard_drafts order by updated_at desc limit 50');
    return rows.map((r) => this.draftRow(r));
  }

  async draft(id: string): Promise<WizardDraftRow> {
    const { rows } = await this.db.pool.query('select * from wizard_drafts where id = $1', [id]);
    if (!rows[0]) throw notFound('That draft');
    return this.draftRow(rows[0]);
  }

  async saveDraft(user: string, id: string | null, body: { name?: string; step?: number; data?: Record<string, unknown> }): Promise<WizardDraftRow> {
    const data = body.data ?? {};
    const name = body.name?.trim() || (data.basics as { name?: string } | undefined)?.name || 'New school';
    if (!id) {
      const nid = newId('wzd');
      await this.db.pool.query('insert into wizard_drafts (id, name, step, data, updated_by) values ($1,$2,$3,$4,$5)', [nid, name, body.step ?? 0, JSON.stringify(data), user]);
      return this.draft(nid);
    }
    await this.draft(id);
    await this.db.pool.query('update wizard_drafts set name = $2, step = $3, data = $4, updated_by = $5, updated_at = now() where id = $1', [id, name, Math.max(0, Math.min(WIZARD_STEPS.length, body.step ?? 0)), JSON.stringify(data), user]);
    return this.draft(id);
  }

  async deleteDraft(id: string): Promise<void> {
    await this.db.pool.query('delete from wizard_drafts where id = $1', [id]);
  }

  /** A plain list of what Launch will do, and anything that would stop it. Nothing is created. */
  async review(payload: WizardPayload): Promise<WizardReview> {
    const problems: string[] = [];
    const taken = await this.db.pool.query('select 1 from schools where slug = $1 and deleted_at is null', [payload.basics.slug]);
    if (taken.rowCount) problems.push(`The address “${payload.basics.slug}” is already used by another school.`);
    const plan = (await this.plans()).find((p) => p.key === payload.plan.plan);
    if (!plan) problems.push(`Plan “${payload.plan.plan}” does not exist.`);
    const cell = await this.db.pool.query<{ key: string; target: string; max_schools: number; accepting: boolean; n: string }>(
      'select c.key, c.target, c.max_schools, c.accepting, (select count(*) from schools s where s.cell = c.key and s.deleted_at is null) n from cells c where c.key = $1', [payload.placement.cell]);
    const c = cell.rows[0];
    if (!c) problems.push(`Cell “${payload.placement.cell}” does not exist.`);
    else if (c.target !== payload.placement.target) problems.push(`Cell ${c.key} runs on ${c.target}, not ${payload.placement.target}.`);
    if (c && !c.accepting) problems.push(`Cell ${c.key} is closed to new schools. Choose another cell.`);
    if (c && Number(c.n) >= c.max_schools) problems.push(`Cell ${c.key} is full (${c.n} of ${c.max_schools} schools).`);
    if (plan) {
      const extra = closeModules(payload.plan.modules).filter((m) => !closeModules(plan.modules).includes(m));
      if (extra.length) problems.push(`Modules outside the ${plan.name} plan: ${extra.join(', ')}. Pick a bigger plan or switch them off.`);
      if (payload.plan.students > plan.limits.students) problems.push(`${payload.plan.students} students is above the ${plan.name} plan’s ${plan.limits.students}.`);
    }
    if (payload.placement.customDomain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(payload.placement.customDomain)) problems.push('That custom domain does not look right.');
    let willDo: WizardReview['willDo'] = [];
    try {
      const bp = await this.blueprints.pick(payload.placement.target, payload.plan.plan);
      const dctx = { env: this.env, slug: payload.basics.slug, payload, target: payload.placement.target };
      const drivers = driversFor(payload.placement.target);
      willDo = bp.steps.filter((s) => s.enabled).map((s) => ({ key: s.key, label: STEP_LABELS[s.key], detail: drivers[s.key].describe(dctx), optional: s.optional }));
    } catch (err) {
      problems.push(err instanceof Error ? err.message : 'No setup blueprint is available.');
    }
    const policy = await this.policy.get();
    return {
      summary: [
        { label: 'School', detail: `${payload.basics.name} · ${payload.basics.slug}` },
        { label: 'Plan', detail: `${plan?.name ?? payload.plan.plan} · ${closeModules(payload.plan.modules).length} modules · up to ${payload.plan.students.toLocaleString('en-IN')} students` },
        { label: 'Where', detail: `${payload.placement.target} · cell ${payload.placement.cell} · ${payload.placement.addressing === 'path' ? 'a path on the test site' : 'its own subdomain'}${payload.placement.customDomain ? ` and ${payload.placement.customDomain}` : ''}` },
        { label: 'First admin', detail: `${payload.admin.name} · ${payload.admin.email}` },
        { label: 'Starting data', detail: payload.data.start === 'demo' ? 'The demo school with sample students' : payload.data.start === 'import' ? 'Empty, ready for an import' : 'Empty' },
      ],
      willDo,
      capacity: { cell: payload.placement.cell, schools: Number(c?.n ?? 0), max: c?.max_schools ?? 0, ok: !!c && Number(c.n) < c.max_schools },
      needsApproval: policy.freeze,
      problems,
    };
  }

  /** Creates the school record and starts its setup. A dry run checks everything and creates nothing. */
  async launch(user: ConsoleUser, payload: WizardPayload, opts: { dryRun: boolean; draftId?: string }): Promise<ProvisionRunRow> {
    const review = await this.review(payload);
    if (review.problems.length) throw new ApiError('validation', review.problems[0]!, { fields: { review: review.problems.join(' ') } });
    if ((await this.policy.get()).freeze) throw new ApiError('locked', 'Changes are frozen right now. A super admin can lift the freeze under Policy.');
    const plan = (await this.plans()).find((p) => p.key === payload.plan.plan)!;
    const bp = await this.blueprints.pick(payload.placement.target, payload.plan.plan);
    const cell = (await this.db.pool.query<{ region: string }>('select region from cells where key = $1', [payload.placement.cell])).rows[0]!;
    const id = newId('sch');
    const entitlement = { modules: closeModules(payload.plan.modules), features: plan.features ?? {}, limits: plan.limits, locks: payload.plan.locks, overrides: {}, version: 1 };
    const school = (await this.db.query<typeof reg.schools.$inferSelect>(
      `insert into schools (id, slug, name, short_name, color, logo_text, status, plan, cell, target, region, entitlement, contact, gstin, board, address, addressing, custom_domain, app_name, created_by, ring, api_version, admin_version, demo)
       values ($1,$2,$3,$4,$5,$6,'onboarding',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'rest',$20,$20,$21) returning *`,
      [id, payload.basics.slug, payload.basics.name, payload.basics.shortName, payload.branding.color, payload.branding.logoText, payload.plan.plan, payload.placement.cell, payload.placement.target, cell.region,
        JSON.stringify(entitlement), JSON.stringify({ name: payload.basics.contactName, phone: payload.basics.contactPhone, email: payload.basics.contactEmail }), payload.basics.gstin, payload.basics.board,
        [payload.basics.address, payload.basics.city].filter(Boolean).join(', '), payload.placement.addressing, payload.placement.customDomain, payload.branding.appName, user.email, this.env.APP_VERSION, payload.data.start === 'demo'])).rows[0]!;
    if (opts.dryRun) {
      // A dry run needs a school record to read from; it is removed as soon as the run has finished.
      try {
        const run = await this.provisioner.start(school, bp, payload, true, user.email);
        return await this.provisioner.settled(run.id);
      } finally {
        await this.db.pool.query('delete from schools where id = $1', [school.id]);
      }
    }
    await this.db.audit(user.email, 'school.created', 'school', school.id, { slug: school.slug, plan: school.plan, target: school.target });
    if (opts.draftId) await this.deleteDraft(opts.draftId);
    return this.provisioner.start(school, bp, payload, false, user.email);
  }
}

@Controller('console/v1')
export class WizardController {
  constructor(
    private readonly wizard: Wizard,
    private readonly provisioner: Provisioner,
    private readonly blueprints: Blueprints,
  ) {}

  @Get('plans') @Needs('schools.read')
  plans(): Promise<PlanRow[]> {
    return this.wizard.plans();
  }

  @Get('wizard/drafts') @Needs('schools.write')
  drafts(): Promise<WizardDraftRow[]> {
    return this.wizard.drafts();
  }

  @Get('wizard/drafts/:id') @Needs('schools.write')
  draft(@Param('id') id: string): Promise<WizardDraftRow> {
    return this.wizard.draft(id);
  }

  @Post('wizard/drafts') @Needs('schools.write')
  create(@Me() me: ConsoleUser, @Body() body: { name?: string; step?: number; data?: Record<string, unknown> }): Promise<WizardDraftRow> {
    return this.wizard.saveDraft(me.email, null, body ?? {});
  }

  @Put('wizard/drafts/:id') @Needs('schools.write')
  save(@Me() me: ConsoleUser, @Param('id') id: string, @Body() body: { name?: string; step?: number; data?: Record<string, unknown> }): Promise<WizardDraftRow> {
    return this.wizard.saveDraft(me.email, id, body ?? {});
  }

  @Delete('wizard/drafts/:id') @HttpCode(204) @Needs('schools.write')
  async remove(@Param('id') id: string): Promise<void> {
    await this.wizard.deleteDraft(id);
  }

  @Post('wizard/review') @HttpCode(200) @Needs('schools.write')
  review(@Body(new ZodPipe(WizardPayload)) body: WizardPayload): Promise<WizardReview> {
    return this.wizard.review(body);
  }

  @Post('wizard/launch') @HttpCode(200) @Needs('schools.write')
  launch(@Me() me: ConsoleUser, @Body() body: { payload: unknown; dryRun?: boolean; draftId?: string }): Promise<ProvisionRunRow> {
    const payload = new ZodPipe(WizardPayload).transform(body?.payload);
    return this.wizard.launch(me, payload, { dryRun: !!body.dryRun, draftId: body.draftId });
  }

  @Get('runs/:id') @Needs('schools.read')
  run(@Param('id') id: string): Promise<ProvisionRunRow> {
    return this.provisioner.get(id);
  }

  @Post('runs/:id/retry') @HttpCode(200) @Needs('schools.write')
  retry(@Me() me: ConsoleUser, @Param('id') id: string): Promise<ProvisionRunRow> {
    return this.provisioner.retry(id, me.email);
  }

  @Post('runs/:id/skip/:step') @HttpCode(200) @Needs('schools.write')
  skip(@Me() me: ConsoleUser, @Param('id') id: string, @Param('step') step: string): Promise<ProvisionRunRow> {
    return this.provisioner.skip(id, step as never, me.email);
  }

  @Get('blueprints') @Needs('schools.read')
  listBlueprints(): Promise<BlueprintRow[]> {
    return this.blueprints.list();
  }

  @Post('blueprints') @HttpCode(200) @Needs('blueprints.write')
  saveBlueprint(@Me() me: ConsoleUser, @Body(new ZodPipe(BlueprintInput)) body: BlueprintInput): Promise<BlueprintRow> {
    return this.blueprints.save(me.email, body);
  }

  @Post('blueprints/:id/activate') @HttpCode(204) @Needs('blueprints.write')
  async activateBlueprint(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> {
    await this.blueprints.activate(me.email, id);
  }
}
