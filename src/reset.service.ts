import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';
import { BackupsService, type BackupFile } from './backups.service';

interface ResetModuleDef {
  id: string;
  label: string;
  description: string;
  count: (p: PrismaService) => Promise<number>;
  reset: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * Transactional modules only. Master data (Users, Clients, Products, Machines,
 * Company Profile, KPI Definitions) is intentionally NOT resettable here.
 * Each reset nulls out nullable cross-module references first, then deletes
 * children before parents, so referential integrity is always preserved.
 */
const MODULES: ResetModuleDef[] = [
  {
    id: 'jobs',
    label: 'Installation Jobs',
    description: 'All installation jobs and their proof-of-installation records. Unlinks them from job orders and earnings.',
    count: (p) => p.job.count(),
    reset: async (tx) => {
      await tx.jobOrder.updateMany({ where: { jobId: { not: null } }, data: { jobId: null } });
      await tx.earning.updateMany({ where: { jobId: { not: null } }, data: { jobId: null } });
      await tx.installationProof.deleteMany();
      await tx.job.deleteMany();
    },
  },
  {
    id: 'job-orders',
    label: 'Job Orders',
    description: 'All job orders and their line items.',
    count: (p) => p.jobOrder.count(),
    reset: async (tx) => {
      await tx.jobOrderItem.deleteMany();
      await tx.jobOrder.deleteMany();
    },
  },
  {
    id: 'dev-projects',
    label: 'Dev Projects',
    description: 'All development projects, sessions, reports, and report feedback.',
    count: (p) => p.devProject.count(),
    reset: async (tx) => {
      await tx.devProjectReportFeedback.deleteMany();
      await tx.devProjectReport.deleteMany();
      await tx.devProjectSession.deleteMany();
      await tx.devProject.deleteMany();
    },
  },
  {
    id: 'licenses',
    label: 'Licenses',
    description: 'All issued/activated software licenses. Unlinks them from installation jobs.',
    count: (p) => p.license.count(),
    reset: async (tx) => {
      await tx.job.updateMany({ where: { licenseId: { not: null } }, data: { licenseId: null } });
      await tx.license.deleteMany();
    },
  },
  {
    id: 'earnings',
    label: 'Earnings',
    description: 'All staff earning records.',
    count: (p) => p.earning.count(),
    reset: async (tx) => {
      await tx.earning.deleteMany();
    },
  },
  {
    id: 'withdrawals',
    label: 'Withdrawals',
    description: 'All withdrawal requests and their history.',
    count: (p) => p.withdrawal.count(),
    reset: async (tx) => {
      await tx.withdrawal.deleteMany();
    },
  },
  {
    id: 'kpi',
    label: 'KPI Results & Incentives',
    description: 'All computed KPI results and incentive records. Unlinks incentives from earnings. KPI definitions are kept.',
    count: (p) => p.kpiResult.count(),
    reset: async (tx) => {
      await tx.earning.updateMany({ where: { incentiveId: { not: null } }, data: { incentiveId: null } });
      await tx.incentive.deleteMany();
      await tx.kpiResult.deleteMany();
    },
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'All in-app notifications.',
    count: (p) => p.notification.count(),
    reset: async (tx) => {
      await tx.notification.deleteMany();
    },
  },
  {
    id: 'nenpos-clients',
    label: 'Nenpos Clients',
    description: 'All imported Nenpos client records.',
    count: (p) => p.nenposClient.count(),
    reset: async (tx) => {
      await tx.nenposClient.deleteMany();
    },
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    description: 'All system audit-trail entries.',
    count: (p) => p.auditLog.count(),
    reset: async (tx) => {
      await tx.auditLog.deleteMany();
    },
  },
];

export interface ResetResult {
  module: string;
  label: string;
  deleted: number;
  backup: BackupFile;
}

@Injectable()
export class ResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
  ) {}

  async list() {
    return Promise.all(
      MODULES.map(async (m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        count: await m.count(this.prisma),
      })),
    );
  }

  async reset(
    moduleId: string,
    userId: string,
    password: string,
    backupFilename?: string,
  ): Promise<ResetResult> {
    const mod = MODULES.find((m) => m.id === moduleId);
    if (!mod) throw new BadRequestException(`Unknown module: ${moduleId}`);

    // Verify the requester's own login password before anything is touched.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    const deleted = await mod.count(this.prisma);

    // Safety net: reuse the backup the client already downloaded if one was passed
    // (and still exists), otherwise take a fresh full backup. Abort if it fails.
    let backup: BackupFile;
    try {
      backup = backupFilename ? await this.tryReuseBackup(backupFilename) : await this.backups.create();
    } catch {
      throw new BadRequestException(
        'Auto-backup failed (is mysqldump available on the server?). Reset aborted for safety.',
      );
    }

    await this.prisma.$transaction((tx) => mod.reset(tx));

    return { module: mod.id, label: mod.label, deleted, backup };
  }

  /** Reuse an already-created backup by filename; fall back to a fresh dump if it's gone. */
  private async tryReuseBackup(filename: string): Promise<BackupFile> {
    try {
      return this.backups.get(filename);
    } catch {
      return this.backups.create();
    }
  }
}
