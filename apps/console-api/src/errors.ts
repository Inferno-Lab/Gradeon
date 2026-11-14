import { Body, Controller, Get, HttpCode, Injectable, Param, Post, Query, Req, type OnModuleInit } from '@nestjs/common';
import { ClientError, type ErrorGroup } from '@tangent/contracts';
import { Limiter, ZodPipe, alerts, errorSink, recordError } from '@tangent/nest-kit';
import { PlatformHub } from './platform-hub.js';
import type { FastifyRequest } from 'fastify';
import { Db, Me, Needs, Public, type ConsoleUser } from './core.js';

const limit = new Limiter(process.env.NODE_ENV === 'test' ? 10_000 : 60, 60_000);

@Injectable()
export class ErrorBook implements OnModuleInit {
  constructor(private readonly db: Db, private readonly platform: PlatformHub) {}

  onModuleInit(): void {
    alerts.send ??= (title, text) => this.platform.hub.alert(title, text);
    errorSink.report ??= (e) => void recordError(this.db.pool, e).catch(() => undefined);
  }

  async list(days: number, handled: boolean): Promise<ErrorGroup[]> {
    const { rows } = await this.db.pool.query<{ fingerprint: string; source: ErrorGroup['source']; school_slug: string | null; message: string; stack: string | null; url: string | null; release: string | null; count: number; first_at: Date; last_at: Date; handled_at: Date | null; handled_by: string | null }>(
      `select * from error_reports where last_at > now() - make_interval(days => $1)
         and ($2 or handled_at is null or last_at > handled_at) order by last_at desc limit 200`, [days, handled]);
    return rows.map((r) => ({
      fingerprint: r.fingerprint, source: r.source, schoolSlug: r.school_slug, message: r.message, stack: r.stack, url: r.url, release: r.release,
      count: r.count, firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString(),
      ...(r.handled_at && r.last_at <= r.handled_at ? { handledAt: r.handled_at.toISOString(), handledBy: r.handled_by } : { handledAt: null, handledBy: null }),
    }));
  }
}

@Controller('console/v1/errors')
export class ErrorsController {
  constructor(private readonly book: ErrorBook, private readonly db: Db) {}

  @Get() @Needs('schools.read')
  list(@Query('days') days?: string, @Query('handled') handled?: string): Promise<ErrorGroup[]> {
    return this.book.list(Math.min(90, Math.max(1, Number(days) || 7)), handled === 'true');
  }

  @Post(':fingerprint/handled') @HttpCode(204) @Needs('schools.write')
  async handled(@Me() me: ConsoleUser, @Param('fingerprint') fp: string): Promise<void> {
    await this.db.pool.query('update error_reports set handled_at = now(), handled_by = $2 where fingerprint = $1', [fp, me.email]);
  }

  /** The console reports what broke in the browser. */
  @Public() @Post() @HttpCode(204)
  async report(@Body(new ZodPipe(ClientError)) body: ClientError, @Req() req: FastifyRequest): Promise<void> {
    limit.check(req.ip);
    await recordError(this.db.pool, body);
  }
}
