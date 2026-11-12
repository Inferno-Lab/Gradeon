import { Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, type OnModuleInit } from '@nestjs/common';
import { enqueue, newId, retryJob } from '@gradeon/db';
import { LogoUpload, type JobRow } from '@gradeon/contracts';
import { ApiError, ZodPipe, notFound } from '@gradeon/nest-kit';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Actions } from './actions.js';
import { ConfigService } from './config.js';
import { Db, Me, Needs, type ConsoleUser } from './core.js';
import { ENV, type Env } from './env.js';
import { Integrations } from './integrations.js';
import { withSchoolDb } from './school-db.js';
import { Provisioner } from './provisioning/provisioner.js';


const Logo = LogoUpload;

/**
 * The console's side of Phase 4 for one school: its logo (Gradeon sets it, schools configure nothing), leavers past the retention
 * period (erased only after a second person approves), and the background jobs every school runs, with Retry.
 */
@Injectable()
export class SchoolData implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly actions: Actions,
    private readonly config: ConfigService,
    private readonly integrations: Integrations,
    @Inject(ENV) private readonly env: Env,
    private readonly provisioner: Provisioner,
  ) {}

  onModuleInit(): void {
    // A logo chosen in the wizard is stored once the school's storage exists.
    this.provisioner.afterSetUp(async (schoolId, payload) => {
      if (payload.branding.logo) await this.logo({ id: 'setup', name: 'Set-up', email: 'set-up', roles: [], permissions: [], sid: 'system' }, schoolId, payload.branding.logo);
    });
    // After two people agree, the school API's worker does the erasing (it holds the school's storage and database).
    this.actions.handle('retention.erase', async (schoolId, _params, by) => {
      const due = await this.retention(schoolId);
      if (!due.due) return 'Nobody is past the retention period any more. Nothing was erased.';
      await enqueue(this.db.pool, 'retention.erase', schoolId, { by });
      return `Queued: ${due.due} leavers past ${due.months} months will be erased in the next minute.`;
    });
  }

  private school(id: string) {
    return this.db.pool.query<{ id: string; slug: string }>('select id, slug from schools where id = $1 and deleted_at is null', [id]).then((r) => {
      if (!r.rows[0]) throw notFound('That school');
      return r.rows[0];
    });
  }

  async retention(schoolId: string): Promise<{ due: number; months: number }> {
    return withSchoolDb(this.db, this.env.SECRETS_KEY, schoolId, async (pool) => {
      const months = Number((await pool.query<{ value: number }>("select value from settings where key = 'privacy.retentionMonths'")).rows[0]?.value ?? 36);
      const n = (await pool.query<{ n: string }>("select count(*) n from students where status = 'left' and erased_at is null and left_on + make_interval(months => $1) <= current_date", [months])).rows[0]!.n;
      return { due: Number(n), months };
    });
  }

  /** Stores the logo in the school's storage, records it as the school's file, and points the brand setting at it. */
  async logo(me: ConsoleUser, schoolId: string, b: z.infer<typeof Logo>): Promise<{ fileId: string }> {
    const s = await this.school(schoolId);
    const data = Buffer.from(b.data, 'base64');
    if (data.length > 2 * 1024 * 1024) throw new ApiError('validation', 'The logo must be 2 MB or smaller.');
    const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = data[0] === 0xff && data[1] === 0xd8;
    if ((b.mime === 'image/png' && !isPng) || (b.mime === 'image/jpeg' && !isJpeg)) throw new ApiError('validation', 'That file is not a PNG or JPEG image.');
    const r = await this.integrations.hub.resolve('storage', s.id, s.slug).catch((e: Error) => { throw new ApiError('school_unavailable', e.message); });
    const id = newId('fil');
    const key = `schools/${s.slug}/logo/${id}/${b.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
    await r.adapter.storage!.put(r.ctx, key, data, b.mime);
    await withSchoolDb(this.db, this.env.SECRETS_KEY, schoolId, (pool) => pool.query(
      "insert into files (id, kind, owner_id, name, mime, bytes, sha256, storage_key, status, created_by) values ($1,'logo',$2,$3,$4,$5,$6,$7,'clean',null)",
      [id, schoolId, b.name, b.mime, data.length, createHash('sha256').update(data).digest('hex'), key]));
    await this.config.apply(schoolId, me.email, { changes: { 'brand.logoFileId': id }, note: 'Logo image' });
    await this.db.audit(me.email, 'school.logo', 'school', schoolId, { bytes: data.length });
    return { fileId: id };
  }

  async jobs(status?: string): Promise<JobRow[]> {
    const { rows } = await this.db.pool.query(
      `select j.*, s.name school_name from job_queue j left join schools s on s.id = j.school_id
       where ($1::text is null and (j.status <> 'done' or j.finished_at > now() - interval '1 day')) or j.status = $1 order by j.run_at desc limit 200`, [status ?? null]);
    return rows.map((j) => ({ id: j.id, schoolId: j.school_id, schoolName: j.school_name, kind: j.kind, status: j.status, attempts: j.attempts, runAt: j.run_at.toISOString(),
      lastError: j.last_error, result: j.result, finishedAt: j.finished_at?.toISOString() ?? null }));
  }

  async retry(me: ConsoleUser, id: string): Promise<void> {
    if (!(await retryJob(this.db.pool, id))) throw new ApiError('conflict', 'Only a failed job can be run again.');
    await this.db.audit(me.email, 'job.retried', 'job', id);
  }
}

@Controller('console/v1')
export class SchoolDataController {
  constructor(private readonly data: SchoolData) {}

  @Get('schools/:id/retention') @Needs('schools.read')
  retention(@Param('id') id: string): Promise<{ due: number; months: number }> { return this.data.retention(id); }

  @Post('schools/:id/logo') @HttpCode(200) @Needs('schools.configure')
  logo(@Me() me: ConsoleUser, @Param('id') id: string, @Body(new ZodPipe(Logo)) b: z.infer<typeof Logo>): Promise<{ fileId: string }> { return this.data.logo(me, id, b); }

  @Get('health/jobs') @Needs('schools.read')
  jobs(): Promise<JobRow[]> { return this.data.jobs(); }

  @Post('health/jobs/:id/retry') @HttpCode(204) @Needs('schools.write')
  retry(@Me() me: ConsoleUser, @Param('id') id: string): Promise<void> { return this.data.retry(me, id); }
}
