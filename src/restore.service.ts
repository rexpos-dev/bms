import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import { createConnection, type Connection } from 'mysql2/promise';
import { PrismaService } from './prisma.service';
import { BackupsService } from './backups.service';

/** Module id → the real MySQL tables it owns. Mirrors ResetService's modules. */
export const MODULE_TABLES: Record<string, string[]> = {
  jobs: ['jobs', 'installation_proofs'],
  'job-orders': ['job_orders', 'job_order_items'],
  'dev-projects': [
    'dev_projects',
    'dev_project_sessions',
    'dev_project_reports',
    'dev_project_report_feedback',
  ],
  licenses: ['licenses'],
  earnings: ['earnings'],
  withdrawals: ['withdrawals'],
  kpi: ['kpi_results', 'incentives'],
  notifications: ['notifications'],
  'nenpos-clients': ['nenpos_clients'],
  'audit-logs': ['audit_logs'],
};

/** Resolve module ids to a deduped list of table names. Throws on unknown/empty input. */
export function resolveModuleTables(moduleIds: string[]): string[] {
  if (moduleIds.length === 0) {
    throw new BadRequestException('Select at least one module to restore.');
  }
  const tables = new Set<string>();
  for (const id of moduleIds) {
    const t = MODULE_TABLES[id];
    if (!t) throw new BadRequestException(`Unknown module: ${id}`);
    for (const name of t) tables.add(name);
  }
  return [...tables];
}

export interface RestoreResult {
  scope: 'full' | 'modules';
  tables: string[];
}

@Injectable()
export class RestoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
  ) {}

  async restore(
    filename: string,
    userId: string,
    password: string,
    opts: { full: boolean; modules?: string[] },
  ): Promise<RestoreResult> {
    await this.verifyPassword(userId, password);
    const sql = readFileSync(this.backups.getFilePath(filename), 'utf8');

    if (opts.full) {
      await this.runFull(sql);
      return { scope: 'full', tables: [] };
    }
    const tables = resolveModuleTables(opts.modules ?? []);
    const restored = await this.runModules(sql, tables);
    return { scope: 'modules', tables: restored };
  }

  private async verifyPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }
  }

  /** mysql2 connection config from DATABASE_URL, optionally overriding the default schema. */
  private dbConfig(database?: string) {
    const url = new URL(process.env.DATABASE_URL!);
    return {
      host: url.hostname,
      port: Number(url.port || '3306'),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: database ?? url.pathname.replace(/^\//, ''),
      multipleStatements: true,
    };
  }

  private async runFull(sql: string): Promise<void> {
    let conn: Connection | undefined;
    try {
      conn = await createConnection(this.dbConfig());
      await conn.query(sql);
    } catch (err) {
      throw new InternalServerErrorException(`Restore failed: ${(err as Error).message}`);
    } finally {
      await conn?.end();
    }
  }

  private async runModules(sql: string, tables: string[]): Promise<string[]> {
    const liveDb = this.dbConfig().database;
    const scratch = `sdlmp_restore_${Date.now()}`;
    try {
      // Create scratch DB and load the whole dump into it (layout-independent).
      const live = await createConnection(this.dbConfig());
      try {
        await live.query(`CREATE DATABASE \`${scratch}\``);
      } finally {
        await live.end();
      }
      const scratchConn = await createConnection(this.dbConfig(scratch));
      try {
        await scratchConn.query(sql);
      } finally {
        await scratchConn.end();
      }

      // Copy selected tables scratch -> live.
      const copy = await createConnection(this.dbConfig());
      const restored: string[] = [];
      try {
        const [rows] = await copy.query(
          'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
          [scratch],
        );
        const present = new Set((rows as { t: string }[]).map((r) => r.t));
        await copy.query('SET FOREIGN_KEY_CHECKS=0');
        for (const t of tables) {
          if (!present.has(t)) continue;
          await copy.query(`DROP TABLE IF EXISTS \`${liveDb}\`.\`${t}\``);
          await copy.query(`CREATE TABLE \`${liveDb}\`.\`${t}\` LIKE \`${scratch}\`.\`${t}\``);
          await copy.query(`INSERT INTO \`${liveDb}\`.\`${t}\` SELECT * FROM \`${scratch}\`.\`${t}\``);
          restored.push(t);
        }
        await copy.query('SET FOREIGN_KEY_CHECKS=1');
      } finally {
        await copy.end();
      }

      if (restored.length === 0) {
        throw new BadRequestException('None of the selected modules had tables in this backup.');
      }
      return restored;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(`Restore failed: ${(err as Error).message}`);
    } finally {
      // Always drop the scratch DB, best-effort.
      try {
        const c = await createConnection(this.dbConfig());
        await c.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
        await c.end();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
