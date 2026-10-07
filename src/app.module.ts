import { basename, join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppInfoController } from './app-info.controller';
import { isDesktopMode } from './app-mode';
import { AgreementTemplateModule } from './agreement-template.module';
import { AppVersionModule } from './app-version.module';
import { AuditLogsModule } from './audit-logs.module';
import { EventsModule } from './events.module';
import { NenposClientsModule } from './nenpos-clients.module';
import { AuthModule } from './auth.module';
import { BackupsModule } from './backups.module';
import { ClientsModule } from './clients.module';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { CompanyProfileModule } from './company-profile.module';
import { DevProjectsModule } from './dev-projects.module';
import { EarningsModule } from './earnings.module';
import { InventoryModule } from './inventory.module';
import { ItemCategoriesModule } from './item-categories.module';
import { ItemPackagesModule } from './item-packages.module';
import { JobOrdersModule } from './job-orders.module';
import { JobsModule } from './jobs.module';
import { KpisModule } from './kpis.module';
import { LicensesModule } from './licenses.module';
import { NotificationsModule } from './notifications.module';
import { PaymentsModule } from './payments.module';
import { PrismaModule } from './prisma.module';
import { SoftwareProductsModule } from './software-products.module';
import { SyncModule } from './sync.module';
import { SyncAgentModule } from './sync-agent.module';
import { DownloadLeadsModule } from './download-leads.module';
import { UploadsModule } from './uploads.module';
import { UsersModule } from './users.module';
import { WithdrawalsModule } from './withdrawals.module';

/**
 * Desktop (offline) mode only carries the core modules that sync with the server
 * (see sync-tables.ts). Everything else stays online-only on the server, and the
 * cron jobs / push / backups never run on a PC.
 */
const desktop = isDesktopMode();

const serverOnlyImports = desktop
  ? []
  : [
      ScheduleModule.forRoot(),
      // Installer downloads (e.g. the mobile APK) live outside git in <cwd>/downloads.
      ServeStaticModule.forRoot({
        rootPath: join(process.cwd(), 'downloads'),
        serveRoot: '/downloads',
        serveStaticOptions: {
          index: false,
          fallthrough: false,
          setHeaders: (res, path) => {
            res.setHeader('Content-Disposition', `attachment; filename="${basename(path)}"`);
          },
        },
      }),
      NotificationsModule,
      UsersModule,
      JobsModule,
      EarningsModule,
      WithdrawalsModule,
      KpisModule,
      BackupsModule,
      DownloadLeadsModule,
      DevProjectsModule,
      AppVersionModule,
      SyncModule,
    ];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global per-IP rate limit; stricter limits sit on sensitive endpoints
    // via @Throttle. Requires trust-proxy (set in main.ts) so the client IP
    // survives the Tailscale Funnel proxy.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'admin-web', 'dist'),
      exclude: ['/api/{*path}', '/downloads/{*path}'],
    }),
    PrismaModule,
    AuthModule,
    EventsModule,
    ClientsModule,
    SoftwareProductsModule,
    LicensesModule,
    JobOrdersModule,
    PaymentsModule,
    InventoryModule,
    ItemCategoriesModule,
    ItemPackagesModule,
    AgreementTemplateModule,
    AuditLogsModule,
    CompanyProfileModule,
    UploadsModule,
    NenposClientsModule,
    ...serverOnlyImports,
    ...(desktop ? [SyncAgentModule] : []),
  ],
  controllers: [AppInfoController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
