import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../env.js';
import { POOLS, REGISTRY } from '../tenancy/tenant.js';
import type { PoolManager, Registry } from '@gradeon/tenancy';

const DAY = 24 * 60 * 60 * 1000;

/** Drops used or expired codes and dead sessions from every school database. */
@Injectable()
export class SweepService implements OnModuleInit {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), DAY);
    this.timer.unref();
    void this.run();
  }

  async run(): Promise<void> {
    const { rows } = await this.registry.pool.query<{ slug: string }>(
      "select slug from schools where deleted_at is null and status in ('live','onboarding')",
    );
    for (const row of rows) {
      try {
        const info = await this.registry.school(row.slug);
        if (!info) continue;
        const pool = this.pools.get(row.slug, info.dbUrl);
        await pool.query("delete from otp_challenges where used_at is not null or expires_at < now() - interval '1 day'");
        await pool.query("delete from sessions where expires_at < now() or (revoked_at is not null and revoked_at < now() - interval '30 days')");
      } catch {
        // A school that cannot be reached is left for the next pass.
      }
    }
  }
}
