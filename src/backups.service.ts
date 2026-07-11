import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import mysqldump from 'mysqldump';

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = join(process.cwd(), 'backups');
const FILENAME_RE = /^[\w.-]+\.sql$/;

/** Build a safe, collision-free backup filename from an uploaded file's name. */
export function sanitizeUploadedBackupName(originalname: string): string {
  const base =
    originalname
      .replace(/\.sql$/i, '')
      .replace(/[^\w.-]/g, '_')
      .slice(0, 80) || 'backup';
  return `restored-${Date.now()}-${base}.sql`;
}

function resolveMysqldumpPath(): string {
  if (process.env.MYSQLDUMP_PATH) return process.env.MYSQLDUMP_PATH;

  if (process.platform === 'win32') {
    const mysqlRoot = 'C:\\Program Files\\MySQL';
    try {
      for (const dir of readdirSync(mysqlRoot)) {
        const candidate = join(mysqlRoot, dir, 'bin', 'mysqldump.exe');
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      // MySQL not installed under the default Program Files location — fall back to PATH
    }
  }

  return 'mysqldump';
}

/**
 * Turn a raw dump failure into a human-readable reason — the real cause carried on
 * stderr (native mysqldump) or the error message (JS dumper), so the diagnosis that
 * reaches the client isn't a generic "Internal server error".
 */
export function describeBackupError(err: unknown): string {
  const e = err as (NodeJS.ErrnoException & { stderr?: string | Buffer }) | undefined;
  const stderr = e?.stderr?.toString().trim();
  return stderr || e?.message || 'Unknown error while creating the backup';
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: Date;
}

@Injectable()
export class BackupsService {
  constructor() {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  }

  list(): BackupFile[] {
    return readdirSync(BACKUP_DIR)
      .filter((name) => FILENAME_RE.test(name))
      .map((filename) => {
        const stats = statSync(join(BACKUP_DIR, filename));
        return { filename, size: stats.size, createdAt: stats.birthtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(): Promise<BackupFile> {
    const dbUrl = new URL(process.env.DATABASE_URL!);
    const dbName = dbUrl.pathname.replace(/^\//, '');
    const host = dbUrl.hostname;
    const port = dbUrl.port || '3306';
    const user = decodeURIComponent(dbUrl.username);
    const password = decodeURIComponent(dbUrl.password);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sdlmp-${timestamp}.sql`;
    const outputPath = join(BACKUP_DIR, filename);
    const logger = new Logger(BackupsService.name);
    const bin = resolveMysqldumpPath();

    try {
      await execFileAsync(
        bin,
        [
          '-h', host,
          '-P', port,
          '-u', user,
          '--single-transaction',
          '--routines',
          `--result-file=${outputPath}`,
          dbName,
        ],
        { env: { ...process.env, MYSQL_PWD: password } },
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // No mysqldump binary on this host (e.g. the Railway container, where the
        // MySQL client can't be installed) — fall back to a pure-JS dump that needs
        // no system client. Windows/office-PC keeps using the native binary above.
        logger.warn(`mysqldump binary not found (${bin}); using the built-in JS dumper`);
        await this.dumpWithJs({ host, port, user, password, dbName }, outputPath, logger);
      } else {
        const detail = describeBackupError(err);
        logger.error(`Backup failed: ${detail}`);
        // Clean up any partial/empty result file mysqldump may have left behind.
        if (existsSync(outputPath)) unlinkSync(outputPath);
        throw new InternalServerErrorException(`Backup failed: ${detail}`);
      }
    }

    const stats = statSync(outputPath);
    return { filename, size: stats.size, createdAt: stats.birthtime };
  }

  /**
   * Pure-JavaScript dump (via the `mysqldump` package, backed by mysql2 so it speaks
   * MySQL 8's caching_sha2_password) used when no mysqldump binary is available.
   */
  private async dumpWithJs(
    conn: { host: string; port: string; user: string; password: string; dbName: string },
    outputPath: string,
    logger: Logger,
  ): Promise<void> {
    // mysql2 logs a noisy per-row/per-field "JSON column … interpreted as BINARY"
    // notice; it doesn't affect the dump output, so mute just that line (it would
    // otherwise flood the logs on every backup) and restore console.warn after.
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('typeCast: JSON column')) return;
      originalWarn(...args);
    };
    try {
      await mysqldump({
        connection: {
          host: conn.host,
          port: Number(conn.port),
          user: conn.user,
          password: conn.password,
          database: conn.dbName,
        },
        dumpToFile: outputPath,
        // Match native mysqldump so the dump restores cleanly over an existing schema.
        dump: { schema: { table: { dropIfExist: true } } },
      });
    } catch (err) {
      const detail = describeBackupError(err);
      logger.error(`Backup failed (JS dumper): ${detail}`);
      if (existsSync(outputPath)) unlinkSync(outputPath);
      throw new InternalServerErrorException(`Backup failed: ${detail}`);
    } finally {
      console.warn = originalWarn;
    }
  }

  get(filename: string): BackupFile {
    const filePath = this.getFilePath(filename);
    const stats = statSync(filePath);
    return { filename, size: stats.size, createdAt: stats.birthtime };
  }

  getFilePath(filename: string): string {
    if (!FILENAME_RE.test(filename)) throw new NotFoundException('Backup not found');
    const filePath = join(BACKUP_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Backup not found');
    return filePath;
  }

  remove(filename: string): { filename: string } {
    const filePath = this.getFilePath(filename);
    unlinkSync(filePath);
    return { filename };
  }

  /** Nightly 3 AM backup; keeps the newest 14 dumps and prunes the rest. */
  @Cron('0 3 * * *')
  async scheduledBackup(): Promise<void> {
    const logger = new Logger(BackupsService.name);
    try {
      const file = await this.create();
      logger.log(`Nightly backup created: ${file.filename} (${Math.round(file.size / 1024)} KB)`);
      for (const old of this.list().slice(14)) {
        unlinkSync(join(BACKUP_DIR, old.filename));
        logger.log(`Pruned old backup: ${old.filename}`);
      }
    } catch (err) {
      logger.error(`Nightly backup failed: ${(err as Error).message}`);
    }
  }
}
