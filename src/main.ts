import { execFileSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * Apply any outstanding Prisma migrations before the app serves traffic.
 *
 * Railway builds this service with Railpack, which ignores `nixpacks.toml` —
 * so the DB migrations never run at deploy time there and the schema drifts
 * (e.g. the job_orders type/camera_count/doc_type columns missing → 500 on
 * GET /job-orders). Running `prisma migrate deploy` here is builder-agnostic:
 * it happens no matter how the process is launched, and is a no-op when the DB
 * is already up to date (so the office-PC/PM2 deploy is unaffected).
 */
function runMigrations() {
  try {
    console.log('Running prisma migrate deploy…');
    const out = execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    console.log(out);
  } catch (err) {
    // Don't crash-loop the whole app if migrations fail — log loudly and boot
    // anyway so unaffected endpoints keep serving; the failure is visible in
    // the deploy logs for follow-up.
    console.error('prisma migrate deploy failed:', err instanceof Error ? err.message : err);
  }
}

async function bootstrap() {
  runMigrations();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Offline-sync push batches (up to 200 ops incl. job order rows) exceed Express's 100 KB default.
  app.useBodyParser('json', { limit: '5mb' });

  // Behind the Tailscale Funnel proxy the socket peer is loopback; trust its
  // X-Forwarded-For so req.ip (and per-IP rate limiting) sees the real client.
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');

  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  const server = await app.listen(port);

  // Enable graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await app.close();
    server.close(() => process.exit(0));
  });

  console.log(`Application listening on port ${port}`);
}
bootstrap();
