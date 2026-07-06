import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, LicenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { AssignInstallerDto } from './assign-installer.dto';
import { CreateJobDto } from './create-job.dto';
import { SubmitProofDto } from './submit-proof.dto';
import { UpdateJobStatusDto } from './update-job-status.dto';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateJobDto) {
    const job = await this.prisma.job.create({
      data: {
        ...dto,
        jobStatus: dto.installerId ? JobStatus.ASSIGNED : undefined,
      },
      include: { client: true },
    });
    if (job.installerId) {
      await this.notifyAssignment(job.id, job.installerId, job.client.businessName);
    }
    return job;
  }

  findAll(userId?: string, role?: string) {
    const where: Prisma.JobWhereInput = {};
    if (userId) {
      if (role === 'INSTALLER') {
        where.installerId = userId;
      }
    }

    return this.prisma.job.findMany({
      where,
      orderBy: { scheduleDate: 'desc' },
      include: { client: true, installer: true, license: true, proof: true },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { client: true, installer: true, license: true, proof: true, jobOrder: true },
    });

    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return job;
  }

  async assignInstaller(id: string, dto: AssignInstallerDto) {
    const job = await this.findOne(id);
    const updated = await this.prisma.job.update({
      where: { id },
      data: { installerId: dto.installerId, jobStatus: JobStatus.ASSIGNED },
    });
    await this.notifyAssignment(id, dto.installerId, job.client.businessName);
    return updated;
  }

  private notifyAssignment(jobId: string, installerId: string, clientName: string) {
    return this.notifications.notify({
      userId: installerId,
      title: 'New installation job assigned',
      body: `You've been assigned an installation job for ${clientName}.`,
      eventType: 'job_assigned',
      data: { jobId, route: '/jobs' },
    });
  }

  async updateStatus(id: string, userId: string, role: string, dto: UpdateJobStatusDto) {
    const job = await this.findOne(id);
    
    // Authorization check
    if (role === 'INSTALLER' && job.installerId !== userId) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    // Operators can update any job status for now (usually those they are working on)

    // A job cannot be completed until its license has been activated. Jobs are
    // not always linked to a specific license, so accept either the directly
    // linked license OR any activated license belonging to the job's client.
    if (dto.jobStatus === JobStatus.COMPLETED) {
      let hasActivatedLicense = job.license?.status === LicenseStatus.ACTIVATED;
      if (!hasActivatedLicense) {
        const activatedCount = await this.prisma.license.count({
          where: { clientId: job.clientId, status: LicenseStatus.ACTIVATED },
        });
        hasActivatedLicense = activatedCount > 0;
      }
      if (!hasActivatedLicense) {
        throw new BadRequestException(
          'Cannot complete this job: the license has not been activated yet. ' +
            'Please wait for the license to be activated before completing the task.',
        );
      }
    }

    return this.prisma.job.update({
      where: { id },
      data: { jobStatus: dto.jobStatus, remarks: dto.remarks ?? job.remarks },
    });
  }

  /**
   * Installer uploads proof of installation (signature, photos, device info, GPS,
   * timestamp) and the job moves to WAITING_ACTIVATION so a developer can pick it up.
   */
  async submitProof(id: string, installerId: string, dto: SubmitProofDto) {
    const job = await this.assertOwnedByInstaller(id, installerId);
    const deviceInfo = dto.deviceInfo as Prisma.InputJsonValue | undefined;
    const photoUrls = dto.photoUrls as Prisma.InputJsonValue;

    await this.prisma.installationProof.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        clientSignature: dto.clientSignature,
        photoUrls,
        deviceInfo,
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
      },
      update: {
        clientSignature: dto.clientSignature,
        photoUrls,
        deviceInfo,
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
        capturedAt: new Date(),
      },
    });

    return this.prisma.job.update({
      where: { id: job.id },
      data: { jobStatus: JobStatus.WAITING_ACTIVATION },
      include: { proof: true },
    });
  }

  findByMonth(month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    return this.prisma.job.findMany({
      where: {
        scheduleDate: { gte: start, lt: end },
      },
      select: {
        id: true,
        scheduleDate: true,
        jobStatus: true,
      },
      orderBy: { scheduleDate: 'asc' },
    });
  }

  findByDate(date: string) {
    const day = new Date(date);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    return this.prisma.job.findMany({
      where: {
        scheduleDate: { gte: day, lt: next },
      },
      orderBy: { scheduleDate: 'asc' },
      include: { client: true, installer: true, license: true, proof: true },
    });
  }

  private async assertOwnedByInstaller(id: string, installerId: string) {
    const job = await this.findOne(id);
    if (job.installerId !== installerId) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    return job;
  }
}
