import { basename, join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
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
import { JobOrdersModule } from './job-orders.module';
import { JobsModule } from './jobs.module';
import { KpisModule } from './kpis.module';
import { LicensesModule } from './licenses.module';
import { NotificationsModule } from './notifications.module';
import { PaymentsModule } from './payments.module';
import { PrismaModule } from './prisma.module';
import { SoftwareProductsModule } from './software-products.module';
import { DownloadLeadsModule } from './download-leads.module';
import { UploadsModule } from './uploads.module';
import { UsersModule } from './users.module';
import { WithdrawalsModule } from './withdrawals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global per-IP rate limit; stricter limits sit on sensitive endpoints
    // via @Throttle. Requires trust-proxy (set in main.ts) so the client IP
    // survives the Tailscale Funnel proxy.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
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
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'admin-web', 'dist'),
      exclude: ['/api/{*path}', '/downloads/{*path}'],
    }),
    PrismaModule,
    AuthModule,
    EventsModule,
    NotificationsModule,
    UsersModule,
    ClientsModule,
    SoftwareProductsModule,
    LicensesModule,
    JobsModule,
    JobOrdersModule,
    PaymentsModule,
    InventoryModule,
    EarningsModule,
    WithdrawalsModule,
    AuditLogsModule,
    KpisModule,
    CompanyProfileModule,
    BackupsModule,
    UploadsModule,
    DownloadLeadsModule,
    DevProjectsModule,
    NenposClientsModule,
  ],
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
