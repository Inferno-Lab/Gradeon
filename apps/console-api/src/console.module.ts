import { Inject, Injectable, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiExceptionFilter } from '@gradeon/nest-kit';
import { PoolManager, Registry } from '@gradeon/tenancy';
import { Actions, ActionsController, Builds } from './actions.js';
import { Compliance, ComplianceController } from './compliance.js';
import { AuthController, ConsoleAuth } from './auth.js';
import { ConsoleAuthGuard, Db } from './core.js';
import { ENV, type Env } from './env.js';
import { Admin, Bootstrap, Health, OpsController, Support } from './ops.js';
import { Policy, PolicyController } from './policy.js';
import { Blueprints, Provisioner } from './provisioning/provisioner.js';
import { Releases, ReleasesController } from './releases.js';
import { Sandbox, SandboxController } from './sandbox.js';
import { Schools, SchoolsController } from './schools.js';
import { POOLS, REGISTRY } from './tokens.js';
import { Wizard, WizardController } from './wizard.js';
import { Backups, BackupsController, DrillsController } from './backups.js';
import { Migration, MigrationController } from './migration.js';
import { ConfigController, ConfigService } from './config.js';
import { ErrorBook, ErrorsController } from './errors.js';

const OWNS = Symbol('OWNS');

@Injectable()
class Shutdown implements OnApplicationShutdown {
  constructor(
    @Inject(REGISTRY) private readonly registry: Registry,
    @Inject(POOLS) private readonly pools: PoolManager,
    @Inject(OWNS) private readonly owns: boolean,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.owns) return;
    await this.pools.closeAll();
    await this.registry.close();
  }
}

@Module({})
export class ConsoleModule {
  /** Pass the school API's registry and pools to share one set of connections in a single server. */
  static register(env: Env, shared?: { registry: Registry; pools: PoolManager }): DynamicModule {
    const registry = shared?.registry ?? new Registry({ url: env.REGISTRY_DATABASE_URL, secret: env.SECRETS_KEY });
    const pools = shared?.pools ?? new PoolManager({ maxPools: env.TENANT_MAX_POOLS, perPool: env.TENANT_PER_POOL });
    return {
      module: ConsoleModule,
      controllers: [AuthController, SandboxController, SchoolsController, WizardController, ActionsController, ReleasesController, PolicyController, OpsController, ComplianceController, ErrorsController, BackupsController, DrillsController, ConfigController, MigrationController],
      providers: [
        { provide: ENV, useValue: env }, { provide: REGISTRY, useValue: registry }, { provide: POOLS, useValue: pools }, { provide: OWNS, useValue: !shared }, Shutdown,
        Db, Sandbox, ConsoleAuth, Policy, Blueprints, Provisioner, Schools, Wizard, Builds, Actions, Releases, Health, Support, Admin, Bootstrap, Compliance, ErrorBook, Backups, ConfigService, Migration,
        { provide: APP_GUARD, useClass: ConsoleAuthGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    };
  }
}
