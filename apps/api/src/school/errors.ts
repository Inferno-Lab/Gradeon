import { Body, Controller, Get, HttpCode, Inject, Injectable, Post, Req, type OnModuleInit } from '@nestjs/common';
import { ChangeRequestCreate, ClientError, type ChangeRequestRow } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { Limiter, ZodPipe, alerts, errorSink, recordError } from '@gradeon/nest-kit';
import { ENV, type Env } from '../env.js';
import type { Registry } from '@gradeon/tenancy';
import type { FastifyRequest } from 'fastify';
import { NoTenant, REGISTRY, Tenant, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { Core, CurrentUser, Public, Require } from '../auth/guards.js';

const limit = new Limiter(process.env.NODE_ENV === 'test' ? 10_000 : 60, 60_000);

/** Errors are kept in the registry, where the console's Health page lists them. */
@Injectable()
export class ErrorReports implements OnModuleInit {
  constructor(@Inject(REGISTRY) private readonly registry: Registry, @Inject(ENV) private readonly env: Env) {}

  onModuleInit(): void {
    alerts.url ??= this.env.ALERT_WEBHOOK_URL;
    errorSink.report = (e) => void recordError(this.registry.pool, e).catch(() => undefined);
  }
}

@Controller('v1/errors')
export class ErrorsController {
  constructor(@Inject(REGISTRY) private readonly registry: Registry) {}

  /** The admin and the app report what broke on the screen. No sign-in: a crash on the sign-in page matters too. */
  @Public() @NoTenant() @Post() @HttpCode(204)
  async report(@Body(new ZodPipe(ClientError)) body: ClientError, @Req() req: FastifyRequest): Promise<void> {
    limit.check(req.ip);
    const school = req.headers['x-school'];
    await recordError(this.registry.pool, { ...body, schoolSlug: typeof school === 'string' ? school.slice(0, 40) : null });
  }
}

/** "Ask Gradeon to change this": the school's configuration is Gradeon's, so the school asks and the console answers. */
@Controller('v1/change-requests')
@Core()
export class ChangeRequestsController {
  constructor(@Inject(REGISTRY) private readonly registry: Registry) {}

  @Get() @Require('settings.read')
  async list(@Tenant() t: TenantCtx): Promise<ChangeRequestRow[]> {
    const { rows } = await this.registry.pool.query<{ id: string; school_id: string; school_slug: string; school_name: string; area: string; message: string; requested_by: string; status: ChangeRequestRow['status']; answer: string; answered_by: string | null; created_at: Date; closed_at: Date | null }>(
      'select * from change_requests where school_id = $1 order by created_at desc limit 50', [t.info.id]);
    return rows.map((r) => ({
      id: r.id, schoolId: r.school_id, schoolSlug: r.school_slug, schoolName: r.school_name, area: r.area, message: r.message, requestedBy: r.requested_by,
      status: r.status, answer: r.answer, answeredBy: r.answered_by ? 'Gradeon' : null, createdAt: r.created_at.toISOString(), closedAt: r.closed_at?.toISOString() ?? null,
    }));
  }

  @Post() @Require('settings.read')
  async create(@Tenant() t: TenantCtx, @CurrentUser() u: AuthedUser, @Body(new ZodPipe(ChangeRequestCreate)) body: ChangeRequestCreate): Promise<ChangeRequestRow[]> {
    await this.registry.pool.query('insert into change_requests (id, school_id, school_slug, school_name, area, message, requested_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [newId('chq'), t.info.id, t.info.slug, t.info.name, body.area, body.message, u.name]);
    return this.list(t);
  }
}
