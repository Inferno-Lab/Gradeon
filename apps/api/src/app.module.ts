import { Inject, Injectable, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PoolManager, Registry } from '@gradeon/tenancy';
import { AuthController, MeController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard, PermissionsGuard } from './auth/guards.js';
import { ApiExceptionFilter } from '@gradeon/nest-kit';
import { MetricsInterceptor, MetricsService } from './common/metrics.js';
import { ENV, type Env } from './env.js';
import { ApprovalsService } from './school/approvals.service.js';
import { AttendanceService } from './school/attendance.service.js';
import { DashboardService } from './school/dashboard.service.js';
import { FeesService } from './school/fees.service.js';
import {
  ApprovalsController, AttendanceController, ClassesController, DashboardController, FeesController, HealthController, SettingsController, StudentsController, TimetableController,
} from './school/school.controllers.js';
import { FamilyController } from './school/family.controller.js';
import { FamilyService } from './school/family.service.js';
import { LearningService } from './school/learning.service.js';
import { LearningController, OfficeController, PeopleController } from './school/modules.controllers.js';
import { OfficeService } from './school/office.service.js';
import { PeopleService } from './school/people.service.js';
import { StudentsService } from './school/students.service.js';
import { AuditService, Messenger, SettingsService } from './school/support.js';
import { SweepService } from './school/sweep.service.js';
import { ChangeRequestsController, ErrorReports, ErrorsController } from './school/errors.js';
import { MovingInController, MovingInService } from './school/moving-in.js';
import { SetupController, SetupService } from './school/setup.js';
import { TimetableService } from './school/timetable.service.js';
import {
  ChannelsController, FamilyCampusController, FeesOnlineController, FilesController, FinderController, GalleryController, LibraryController, ReportCardsController, SchoolLogoController, TransportController, YearController,
} from './school/campus.controllers.js';
import { DocumentsService } from './school/documents.service.js';
import { FilesService } from './school/files.service.js';
import { GalleryService } from './school/gallery.service.js';
import { HooksController } from './school/hooks.controller.js';
import { HubService } from './school/hub.service.js';
import { LibraryService } from './school/library.service.js';
import { PaymentsService } from './school/payments.service.js';
import { TransportService } from './school/transport.service.js';
import { YearService } from './school/year.service.js';
import { POOLS, REGISTRY, TenantGuard, TenantService } from './tenancy/tenant.js';

const OWNS = Symbol('OWNS');

/** Closes the connections this app opened. A server that shares them with another app leaves them to its owner. */
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
export class AppModule {
  static register(env: Env, shared?: { registry: Registry; pools: PoolManager }): DynamicModule {
    const registry = shared?.registry ?? new Registry({ url: env.REGISTRY_DATABASE_URL, secret: env.SECRETS_KEY });
    const pools = shared?.pools ?? new PoolManager({ maxPools: env.TENANT_MAX_POOLS, perPool: env.TENANT_PER_POOL });
    return {
      module: AppModule,
      controllers: [
        AuthController, MeController, ClassesController, StudentsController, AttendanceController, FeesController, ApprovalsController,
        TimetableController, DashboardController, SettingsController, HealthController, LearningController, PeopleController, OfficeController, FamilyController, ErrorsController, ChangeRequestsController, SetupController, MovingInController,
        HooksController, FilesController, SchoolLogoController, ChannelsController, FeesOnlineController, ReportCardsController, LibraryController, TransportController, GalleryController, YearController, FamilyCampusController, FinderController,
      ],
      providers: [
        { provide: ENV, useValue: env },
        { provide: REGISTRY, useValue: registry },
        { provide: POOLS, useValue: pools },
        { provide: OWNS, useValue: !shared },
        Shutdown,
        TenantService, AuthService, AuditService, Messenger, SettingsService, StudentsService, AttendanceService, FeesService, ApprovalsService, TimetableService, DashboardService, MetricsService, LearningService, PeopleService, OfficeService, FamilyService, SweepService, ErrorReports, SetupService, MovingInService,
        HubService, FilesService, PaymentsService, DocumentsService, LibraryService, TransportService, GalleryService, YearService,
        // Order matters: find the school, then the person, then what they may do.
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
      ],
      exports: [TenantService, REGISTRY, POOLS],
    };
  }
}
