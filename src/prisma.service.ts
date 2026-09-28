import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { isDesktopMode } from './app-mode';

/**
 * Desktop builds run on SQLite through a separately generated client
 * (`npm run gen:sqlite`) with the same models minus the server-only sync tables,
 * so it is API-compatible with the MySQL client this class is typed against.
 */
function clientClass(): typeof PrismaClient {
  if (!isDesktopMode()) return PrismaClient;
  /* eslint-disable @typescript-eslint/no-require-imports */
  return (
    require('../generated/sqlite-client') as {
      PrismaClient: typeof PrismaClient;
    }
  ).PrismaClient;
  /* eslint-enable @typescript-eslint/no-require-imports */
}

@Injectable()
export class PrismaService
  extends clientClass()
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(
      isDesktopMode()
        ? { datasourceUrl: process.env.DESKTOP_DATABASE_URL }
        : undefined,
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
