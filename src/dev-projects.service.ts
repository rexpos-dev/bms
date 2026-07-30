import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevProjectStatus,
  DevReportStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { AddReportFeedbackDto } from './add-report-feedback.dto';
import { CreateDevProjectDto } from './create-dev-project.dto';
import { CreateDevReportDto } from './create-dev-report.dto';
import { UpdateChecklistItemDto } from './update-checklist-item.dto';
import { UpdateDevProjectDto } from './update-dev-project.dto';
import { UpdateProgressDto } from './update-progress.dto';

/** Shape of one entry in DevProjectReport.checklist (stored as JSON). */
type StoredChecklistItem = {
  label: string;
  done: boolean;
  /** ISO timestamp of when the item was last ticked; null while unticked. */
  doneAt?: string | null;
  /** Full name of whoever ticked it; null while unticked. */
  doneBy?: string | null;
  note?: string | null;
};

const INCLUDE_LIST = {
  developer: { select: { id: true, fullName: true } },
};

const INCLUDE_DETAIL = {
  developer: { select: { id: true, fullName: true } },
  sessions: { orderBy: { startedAt: 'desc' as const } },
  reports: {
    include: {
      author: { select: { id: true, fullName: true, role: true } },
      taggedAdmin: { select: { id: true, fullName: true } },
      feedback: {
        include: {
          author: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class DevProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateDevProjectDto, user: { id: string; role: UserRole }) {
    let developerId = dto.developerId;
    if (user.role === UserRole.DEVELOPER) {
      developerId = user.id;
    } else if (!developerId) {
      throw new ForbiddenException('developerId is required');
    }
    await this.assertDeveloper(developerId);

    return this.prisma.devProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        developerId,
        targetHours: dto.targetHours ?? null,
      },
      include: INCLUDE_DETAIL,
    });
  }

  findAll(user: { id: string; role: UserRole }) {
    const where: Prisma.DevProjectWhereInput = {};
    if (user.role === UserRole.DEVELOPER) {
      where.developerId = user.id;
    }

    return this.prisma.devProject.findMany({
      where,
      include: INCLUDE_LIST,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, user: { id: string; role: UserRole }) {
    const project = await this.prisma.devProject.findUnique({
      where: { id },
      include: INCLUDE_DETAIL,
    });
    if (!project) {
      throw new NotFoundException(`Development project ${id} not found`);
    }
    this.assertVisible(project, user);
    return project;
  }

  /** The current user's running project, for the floating timer widget. */
  findActive(user: { id: string }) {
    return this.prisma.devProject.findFirst({
      where: { developerId: user.id, status: DevProjectStatus.IN_PROGRESS },
      select: {
        id: true,
        name: true,
        startedAt: true,
        totalMinutes: true,
        runSeconds: true,
      },
    });
  }

  async update(id: string, dto: UpdateDevProjectDto) {
    const project = await this.findRaw(id);
    if (dto.developerId && dto.developerId !== project.developerId) {
      await this.assertDeveloper(dto.developerId);
    }

    return this.prisma.devProject.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        developerId: dto.developerId,
        ...(dto.targetHours !== undefined && { targetHours: dto.targetHours }),
        ...(dto.projectStart !== undefined && { projectStart: dto.projectStart ? new Date(dto.projectStart) : null }),
        ...(dto.projectDeadline !== undefined && { projectDeadline: dto.projectDeadline ? new Date(dto.projectDeadline) : null }),
      },
      include: INCLUDE_DETAIL,
    });
  }

  async start(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (project.status === DevProjectStatus.IN_PROGRESS) {
      throw new ForbiddenException('This project is already being worked on');
    }
    if (project.status === DevProjectStatus.COMPLETED) {
      throw new ForbiddenException('This project is already completed');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // One active timer per developer: auto-stop any other running project
      // first, saving its tracked time, then start the requested one.
      const running = await tx.devProject.findFirst({
        where: {
          developerId: project.developerId,
          status: DevProjectStatus.IN_PROGRESS,
          id: { not: id },
        },
      });
      if (running) {
        const seconds = await this.closeOpenSession(tx, running, now);
        await tx.devProject.update({
          where: { id: running.id },
          data: {
            status: DevProjectStatus.PENDING,
            startedAt: null,
            totalMinutes: this.endRunMinutes(running, seconds),
            runSeconds: 0,
          },
        });
      }

      await tx.devProjectSession.create({
        data: { projectId: id, startedAt: now },
      });
      await tx.devProject.update({
        where: { id },
        data: { status: DevProjectStatus.IN_PROGRESS, startedAt: now, runSeconds: 0 },
      });
    });

    return this.findOne(id, user);
  }

  /**
   * Pause the running timer: bank the open session's minutes but keep the
   * project IN_PROGRESS (startedAt null = paused) so the widget stays up.
   */
  async pause(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (project.status !== DevProjectStatus.IN_PROGRESS || !project.startedAt) {
      throw new ForbiddenException('This project is not currently running');
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Pause banks exact seconds into runSeconds only; totalMinutes grows
      // once, when the run ends, so paused time is never double-counted.
      const seconds = await this.closeOpenSession(tx, project, now);
      await tx.devProject.update({
        where: { id },
        data: { startedAt: null, runSeconds: { increment: seconds } },
      });
    });

    return this.findOne(id, user);
  }

  async resume(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (project.status !== DevProjectStatus.IN_PROGRESS || project.startedAt) {
      throw new ForbiddenException('This project is not currently paused');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.devProjectSession.create({
        data: { projectId: id, startedAt: now },
      }),
      this.prisma.devProject.update({
        where: { id },
        data: { startedAt: now },
      }),
    ]);

    return this.findOne(id, user);
  }

  async stop(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    // A paused project (IN_PROGRESS, startedAt null) can also be stopped;
    // closeOpenSession is a no-op in that case since its minutes are banked.
    if (project.status !== DevProjectStatus.IN_PROGRESS) {
      throw new ForbiddenException('This project is not currently running');
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const seconds = await this.closeOpenSession(tx, project, now);

      await tx.devProject.update({
        where: { id },
        data: {
          status: DevProjectStatus.PENDING,
          startedAt: null,
          totalMinutes: this.endRunMinutes(project, seconds),
          runSeconds: 0,
        },
      });
    });

    return this.findOne(id, user);
  }

  async updateProgress(
    id: string,
    dto: UpdateProgressDto,
    user: { id: string; role: UserRole },
  ) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const data: Prisma.DevProjectUpdateInput = {
        progressPercent: dto.progressPercent,
      };

      if (dto.progressPercent >= 100) {
        data.status = DevProjectStatus.COMPLETED;
        // Completing ends the run: bank the open segment (if running) plus
        // any paused seconds into totalMinutes.
        const seconds = await this.closeOpenSession(tx, project, now);
        data.totalMinutes = this.endRunMinutes(project, seconds);
        data.runSeconds = 0;
        data.startedAt = null;
      } else if (project.status === DevProjectStatus.COMPLETED) {
        data.status = DevProjectStatus.PENDING;
      }

      await tx.devProject.update({ where: { id }, data });
    });

    return this.findOne(id, user);
  }

  async addReport(
    id: string,
    dto: CreateDevReportDto,
    user: { id: string; role: UserRole; fullName: string },
  ) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (dto.taggedAdminId) {
      await this.assertReviewer(dto.taggedAdminId);
    }

    // Items posted already ticked get their completion stamp now.
    const now = new Date().toISOString();
    const checklist: StoredChecklistItem[] = dto.checklist.map((item) => ({
      label: item.label,
      done: item.done,
      doneAt: item.done ? now : null,
      doneBy: item.done ? user.fullName : null,
      note: item.note?.trim() || null,
    }));

    await this.prisma.devProjectReport.create({
      data: {
        projectId: id,
        authorId: user.id,
        title: dto.title,
        comment: dto.comment,
        checklist: checklist,
        taggedAdminId: dto.taggedAdminId,
      },
    });

    if (dto.taggedAdminId) {
      await this.notifications.notify({
        userId: dto.taggedAdminId,
        title: 'New dev report to review',
        body: `A report "${dto.title}" on "${project.name}" was tagged for your review.`,
        eventType: 'dev_report_tagged',
        data: { projectId: id, route: '/dev-projects' },
      });
    }

    return this.findOne(id, user);
  }

  /**
   * Tick/untick a single checklist item on an already-posted report, or set its
   * note. Only the report's author (the developer) or a super admin may edit;
   * the completion timestamp and name are recorded server-side.
   */
  async updateChecklistItem(
    reportId: string,
    dto: UpdateChecklistItemDto,
    user: { id: string; role: UserRole; fullName: string },
  ) {
    const report = await this.prisma.devProjectReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && report.authorId !== user.id) {
      throw new ForbiddenException(
        'Only the report author can edit this checklist',
      );
    }

    const items = (
      Array.isArray(report.checklist) ? report.checklist : []
    ) as StoredChecklistItem[];
    const current = items[dto.index];
    if (!current) {
      throw new NotFoundException(`Checklist item ${dto.index} not found`);
    }

    const updated: StoredChecklistItem = { ...current };

    if (dto.done !== undefined && dto.done !== current.done) {
      updated.done = dto.done;
      updated.doneAt = dto.done ? new Date().toISOString() : null;
      updated.doneBy = dto.done ? user.fullName : null;
    }

    if (dto.note !== undefined) {
      updated.note = dto.note.trim() || null;
    }

    const checklist = items.map((item, i) =>
      i === dto.index ? updated : item,
    );

    await this.prisma.devProjectReport.update({
      where: { id: reportId },
      data: { checklist },
    });

    return this.findOne(report.projectId, user);
  }

  async addFeedback(
    reportId: string,
    dto: AddReportFeedbackDto,
    user: { id: string; role: UserRole },
  ) {
    const report = await this.prisma.devProjectReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    if (
      user.role !== UserRole.SUPER_ADMIN &&
      report.taggedAdminId !== user.id
    ) {
      throw new ForbiddenException('You were not tagged on this report');
    }

    await this.prisma.$transaction([
      this.prisma.devProjectReportFeedback.create({
        data: { reportId, authorId: user.id, message: dto.message },
      }),
      this.prisma.devProjectReport.update({
        where: { id: reportId },
        data: { status: DevReportStatus.REVIEWED },
      }),
    ]);

    if (report.authorId !== user.id) {
      await this.notifications.notify({
        userId: report.authorId,
        title: 'Feedback on your report',
        body: `Your report "${report.title}" received feedback.`,
        eventType: 'dev_report_feedback',
        data: { projectId: report.projectId, route: '/dev-projects' },
      });
    }

    return this.findOne(report.projectId, user);
  }

  listDevelopers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.DEVELOPER, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  listReviewers() {
    return this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF] },
        isActive: true,
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * Close the open session row (if any) and return the exact seconds it
   * lasted. Callers decide how to bank that time: pauses accumulate it in
   * runSeconds; run-ending transitions fold runSeconds into totalMinutes.
   */
  private async closeOpenSession(
    tx: Prisma.TransactionClient,
    project: { id: string; startedAt: Date | null },
    now: Date,
  ): Promise<number> {
    if (!project.startedAt) return 0;

    const seconds = Math.max(
      0,
      Math.round((now.getTime() - project.startedAt.getTime()) / 1000),
    );
    const openSession = await tx.devProjectSession.findFirst({
      where: { projectId: project.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (openSession) {
      await tx.devProjectSession.update({
        where: { id: openSession.id },
        data: { endedAt: now, minutes: Math.round(seconds / 60) },
      });
    }

    return seconds;
  }

  /** Total minutes after ending the current run (banked pauses + last segment). */
  private endRunMinutes(
    project: { totalMinutes: number; runSeconds: number },
    lastSegmentSeconds: number,
  ): number {
    return (
      project.totalMinutes +
      Math.round((project.runSeconds + lastSegmentSeconds) / 60)
    );
  }

  private async assertDeveloper(developerId: string) {
    const developer = await this.prisma.user.findUnique({
      where: { id: developerId },
    });
    if (!developer || developer.role !== UserRole.DEVELOPER) {
      throw new NotFoundException('Developer not found');
    }
    return developer;
  }

  private async assertReviewer(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (
      !admin ||
      (admin.role !== UserRole.SUPER_ADMIN &&
        admin.role !== UserRole.ADMIN_STAFF)
    ) {
      throw new NotFoundException('Reviewer not found');
    }
    return admin;
  }

  private findRaw(id: string) {
    return this.prisma.devProject
      .findUnique({ where: { id } })
      .then((project) => {
        if (!project) {
          throw new NotFoundException(`Development project ${id} not found`);
        }
        return project;
      });
  }

  private assertVisible(
    project: { developerId: string },
    user: { id: string; role: UserRole },
  ) {
    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN_STAFF
    )
      return;
    if (project.developerId === user.id) return;
    throw new ForbiddenException(
      'You do not have access to this development project',
    );
  }

  private assertOwner(
    project: { developerId: string },
    user: { id: string; role: UserRole },
  ) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (project.developerId === user.id) return;
    throw new ForbiddenException(
      'You do not have access to this development project',
    );
  }
}
