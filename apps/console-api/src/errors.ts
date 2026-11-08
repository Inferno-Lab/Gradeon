import { Body, Controller, Get, HttpCode, Inject, Injectable, Post, Query, Req, type OnModuleInit } from '@nestjs/common';
import { ClientError, type ErrorGroup } from '@gradeon/contracts';
import { Limiter, ZodPipe, alerts, errorSink, recordError } from '@gradeon/nest-kit';
import { ENV, type Env } from './env.js';
import type { FastifyRequest } from 'fastify';
import { Db, Needs, Public } from './core.js';

const limit = new Limiter(process.env.NODE_ENV === 'test' ? 10_000 : 60, 60_000);

@Injectable()
export class ErrorBook implements OnModuleInit {
  constructor(private readonly db: Db, @Inject(ENV) private readonly env: Env) {}

  onModuleInit(): void {
    alerts.url ??= this.env.ALERT_WEBHOOK_URL;
    errorSink.report ??= (e) => void recordError(this.db.pool, e).catch(() => undefined);
  }

  async list(days: number): Promise<ErrorGroup[]> {
    const { rows } = await this.db.pool.query<{ fingerprint: string; source: ErrorGroup['source']; school_slug: string | null; message: string; stack: string | null; url: string | null; release: string | null; count: number; first_at: Date; last_at: Date }>(
      "select * from error_reports where last_at > now() - make_interval(days => $1) order by last_at desc limit 200", [days]);
    return rows.map((r) => ({
      fingerprint: r.fingerprint, source: r.source, schoolSlug: r.school_slug, message: r.message, stack: r.stack, url: r.url, release: r.release,
      count: r.count, firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString(),
    }));
  }
}

@Controller('console/v1/errors')
export class ErrorsController {
  constructor(private readonly book: ErrorBook, private readonly db: Db) {}

  @Get() @Needs('schools.read')
  list(@Query('days') days?: string): Promise<ErrorGroup[]> {
    return this.book.list(Math.min(90, Math.max(1, Number(days) || 7)));
  }

  /** The console reports what broke in the browser. */
  @Public() @Post() @HttpCode(204)
  async report(@Body(new ZodPipe(ClientError)) body: ClientError, @Req() req: FastifyRequest): Promise<void> {
    limit.check(req.ip);
    await recordError(this.db.pool, body);
  }
}
