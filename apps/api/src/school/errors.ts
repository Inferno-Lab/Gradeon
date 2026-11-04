import { Body, Controller, HttpCode, Inject, Injectable, Post, Req, type OnModuleInit } from '@nestjs/common';
import { ClientError } from '@gradeon/contracts';
import { Limiter, ZodPipe, errorSink, recordError } from '@gradeon/nest-kit';
import type { Registry } from '@gradeon/tenancy';
import type { FastifyRequest } from 'fastify';
import { NoTenant, REGISTRY } from '../tenancy/tenant.js';
import { Public } from '../auth/guards.js';

const limit = new Limiter(process.env.NODE_ENV === 'test' ? 10_000 : 60, 60_000);

/** Errors are kept in the registry, where the console's Health page lists them. */
@Injectable()
export class ErrorReports implements OnModuleInit {
  constructor(@Inject(REGISTRY) private readonly registry: Registry) {}

  onModuleInit(): void {
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
