import { Inject, Injectable } from '@nestjs/common';
import { Hub } from '@tangent/integrations';
import { Db } from './core.js';
import { ENV, type Env } from './env.js';

/** The Hub for the console's own work (alerts, builds, databases, backups, domains): one instance, nothing it depends on but the registry. */
@Injectable()
export class PlatformHub {
  readonly hub: Hub;
  constructor(db: Db, @Inject(ENV) env: Env) {
    this.hub = new Hub({ pool: db.pool, secretsKey: env.SECRETS_KEY, baseUrl: env.API_BASE_URL.replace(/\/$/, '') });
  }
}

