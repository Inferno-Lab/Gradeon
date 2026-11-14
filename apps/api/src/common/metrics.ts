import { Inject, Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor, type OnApplicationShutdown } from '@nestjs/common';
import type { Registry } from '@tangent/tenancy';
import type { FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { REGISTRY } from '../tenancy/tenant.js';

interface Bucket { requests: number; errors: number; samples: number[] }

/** Counts requests, errors and latency per school per minute and writes them to the registry for the console's charts. */
@Injectable()
export class MetricsService implements OnApplicationShutdown {
  private readonly log = new Logger('Metrics');
  private buckets = new Map<string, Bucket>();
  private readonly timer: NodeJS.Timeout;

  constructor(@Inject(REGISTRY) private readonly registry: Registry) {
    this.timer = setInterval(() => void this.flush(), 60_000);
    this.timer.unref();
  }

  record(slug: string, ms: number, failed: boolean): void {
    const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
    const key = `${minute}|${slug}`;
    const b = this.buckets.get(key) ?? { requests: 0, errors: 0, samples: [] };
    b.requests++;
    if (failed) b.errors++;
    if (b.samples.length < 500) b.samples.push(ms);
    this.buckets.set(key, b);
  }

  async flush(): Promise<void> {
    const current = this.buckets;
    this.buckets = new Map();
    for (const [key, b] of current) {
      const [at, slug] = key.split('|') as [string, string];
      const sorted = [...b.samples].sort((x, y) => x - y);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      try {
        await this.registry.pool.query(
          `insert into metrics_minute (at, school_slug, requests, errors, p95_ms) values ($1,$2,$3,$4,$5)
           on conflict (at, school_slug) do update set requests = metrics_minute.requests + excluded.requests, errors = metrics_minute.errors + excluded.errors, p95_ms = greatest(metrics_minute.p95_ms, excluded.p95_ms)`,
          [at, slug, b.requests, b.errors, Math.round(p95)]);
      } catch (err) {
        this.log.warn(`Could not store metrics: ${(err as Error).message}`);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => req.tenant && this.metrics.record(req.tenant.info.slug, Date.now() - started, false),
        error: () => req.tenant && this.metrics.record(req.tenant.info.slug, Date.now() - started, true),
      }),
    );
  }
}
