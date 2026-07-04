import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EarningStatus, EarningType, IncentiveStatus, JobOrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import type { CreateKpiDefinitionDto } from './create-kpi-definition.dto';
import type { GenerateIncentivesDto } from './generate-incentives.dto';
import type { ManualKpiDto } from './manual-kpi.dto';
import type { UpdateKpiDefinitionDto } from './update-kpi-definition.dto';

// ─── KPI Definitions per role ─────────────────────────────────────────────────

export interface KpiDef {
  name: string;
  weight: number;
  target: number;
  unit: string;
  auto: boolean;
}

// Shape returned by TMS Pro's KPI Export API (GET /api/v1/kpi/export).
interface TmsKpiEmployee {
  employee_id: number;
  employee_name: string;
  employee_email: string;
  total_points: number;
  activity?: Array<{ id: number; points: number; bonus_type: string; order_number: string; task_name: string | null; created_at: string }>;
}

// Roles that have KPI tracking, dashboards, and incentive eligibility.
export const KPI_ROLES: UserRole[] = [
  UserRole.INSTALLER,
  UserRole.DEVELOPER,
  UserRole.DESIGNER,
  UserRole.MACHINE_OPERATOR,
  UserRole.LIAISON,
  UserRole.SALES_STAFF,
  UserRole.ADMIN_STAFF,
];

// Built-in defaults, used to seed the kpi_definitions table the first time
// each role's KPIs are loaded. After seeding, the database is the source of
// truth — admins can add, edit, or remove KPIs per role from Settings.
const DEFAULT_KPI_DEFS: Partial<Record<UserRole, KpiDef[]>> = {
  [UserRole.INSTALLER]: [
    { name: 'Installation Completion Rate', weight: 35, target: 90,  unit: '%',    auto: true  },
    { name: 'Proof Submission Rate',        weight: 30, target: 100, unit: '%',    auto: true  },
    { name: 'Monthly Activity',             weight: 15, target: 100, unit: '%',    auto: true  },
    { name: 'Customer Satisfaction',        weight: 15, target: 90,  unit: '/100', auto: false },
    { name: 'Safety Compliance',            weight: 5,  target: 100, unit: '%',    auto: false },
  ],
  [UserRole.DEVELOPER]: [
    { name: 'License Activations',     weight: 40, target: 10, unit: 'count', auto: true  },
    { name: 'Activation Quality',      weight: 30, target: 90, unit: '%',     auto: true  },
    { name: 'On-Time Activation Rate', weight: 20, target: 95, unit: '%',     auto: false },
    { name: 'Quality Score',           weight: 10, target: 90, unit: '/100',  auto: false },
  ],
  [UserRole.DESIGNER]: [
    { name: 'On-Time Design Completion',   weight: 35, target: 90,  unit: '%',    auto: true  },
    { name: 'Monthly Activity',             weight: 25, target: 100, unit: '%',    auto: true  },
    { name: 'First Approval Rate',         weight: 20, target: 80,  unit: '%',    auto: false },
    { name: 'Design Quality Score',        weight: 20, target: 90,  unit: '/100', auto: false },
  ],
  [UserRole.MACHINE_OPERATOR]: [
    { name: 'Production Output',      weight: 40, target: 20,  unit: 'count', auto: true  },
    { name: 'On-Time Production',     weight: 40, target: 90,  unit: '%',     auto: true  },
    { name: 'Quality Control',        weight: 20, target: 95,  unit: '%',     auto: false },
  ],
  [UserRole.LIAISON]: [
    { name: 'Project Completion Rate',   weight: 30, target: 95,  unit: '%',    auto: false },
    { name: 'On-Time Permit Processing', weight: 20, target: 100, unit: '%',    auto: false },
    { name: 'Client Satisfaction',       weight: 20, target: 90,  unit: '/100', auto: false },
    { name: 'Documentation Accuracy',    weight: 15, target: 98,  unit: '%',    auto: false },
    { name: 'Response Time',             weight: 15, target: 90,  unit: '/100', auto: false },
  ],
  [UserRole.SALES_STAFF]: [
    { name: 'Sales Target Achievement',  weight: 35, target: 100, unit: '%',    auto: false },
    { name: 'Job Orders Closed',         weight: 25, target: 10,  unit: 'count', auto: false },
    { name: 'New Client Acquisitions',   weight: 20, target: 5,   unit: 'count', auto: false },
    { name: 'Client Satisfaction',       weight: 20, target: 90,  unit: '/100', auto: false },
  ],
  [UserRole.ADMIN_STAFF]: [
    { name: 'Task Completion Rate',      weight: 30, target: 95,  unit: '%',    auto: false },
    { name: 'Documentation Accuracy',    weight: 25, target: 98,  unit: '%',    auto: false },
    { name: 'Attendance & Punctuality',  weight: 25, target: 100, unit: '%',    auto: false },
    { name: 'Supervisor Rating',         weight: 20, target: 90,  unit: '/100', auto: false },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kpiScore(actual: number, target: number, weight: number): number {
  if (target <= 0) return 0;
  return Math.min(actual / target, 1) * weight;
}

function incentivePct(totalScore: number): number {
  if (totalScore >= 95) return 1.0;
  if (totalScore >= 90) return 0.75;
  if (totalScore >= 85) return 0.5;
  if (totalScore >= 80) return 0.25;
  if (totalScore >= 75) return 0.1;
  return 0;
}

function monthRange(month: number, year: number) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

// Incentive status maps 1:1 onto the matching earning status.
const INCENTIVE_TO_EARNING_STATUS: Record<IncentiveStatus, EarningStatus> = {
  [IncentiveStatus.PENDING]: EarningStatus.PENDING,
  [IncentiveStatus.APPROVED]: EarningStatus.APPROVED,
  [IncentiveStatus.PAID]: EarningStatus.PAID,
};

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class KpisService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  // Seed kpi_definitions for each role once at startup, sequentially, so
  // concurrent requests (e.g. getTeam's Promise.all) never race to seed
  // the same role and deadlock on the (role, name) unique index.
  async onModuleInit() {
    for (const role of KPI_ROLES) {
      await this.ensureSeeded(role);
    }
  }

  // ── Auto KPIs: INSTALLER ───────────────────────────────────────────────────

  private async installerAutoKpis(userId: string, start: Date, end: Date) {
    const where = { installerId: userId, scheduleDate: { gte: start, lt: end } };
    const [total, completed, withProof, completedOrLater] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.count({ where: { ...where, jobStatus: 'COMPLETED' } }),
      this.prisma.job.count({
        where: { ...where, jobStatus: { in: ['WAITING_ACTIVATION', 'COMPLETED'] }, proof: { isNot: null } },
      }),
      this.prisma.job.count({
        where: { ...where, jobStatus: { in: ['WAITING_ACTIVATION', 'COMPLETED'] } },
      }),
    ]);

    return {
      'Installation Completion Rate': total > 0 ? (completed / total) * 100 : 0,
      'Proof Submission Rate': completedOrLater > 0 ? (withProof / completedOrLater) * 100 : 0,
      'Monthly Activity': Math.min(total / 10, 1) * 100,
    } as Record<string, number>;
  }

  // ── Auto KPIs: DEVELOPER ───────────────────────────────────────────────────

  private async developerAutoKpis(userId: string, start: Date, end: Date) {
    const [activationsThisMonth, total, activated] = await Promise.all([
      this.prisma.license.count({ where: { activatedById: userId, activationDate: { gte: start, lt: end } } }),
      this.prisma.license.count({ where: { activatedById: userId } }),
      this.prisma.license.count({ where: { activatedById: userId, status: 'ACTIVATED' } }),
    ]);

    return {
      'License Activations': activationsThisMonth,
      'Activation Quality': total > 0 ? (activated / total) * 100 : 0,
    } as Record<string, number>;
  }

  // ── Auto KPIs: DESIGNER ────────────────────────────────────────────────────

  private async designerAutoKpis(userId: string, start: Date, end: Date) {
    const jobs = await this.prisma.designJob.findMany({
      where: { designerId: userId, createdAt: { gte: start, lt: end } },
      include: { updates: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'COMPLETED').length;
    const onTime = jobs.filter(j => {
      if (j.status !== 'COMPLETED' || !j.dueDate || j.updates.length === 0) return false;
      return new Date(j.updates[0].createdAt) <= new Date(j.dueDate);
    }).length;

    return {
      'On-Time Design Completion': completed > 0 ? (onTime / completed) * 100 : 0,
      'Monthly Activity': Math.min(total / 10, 1) * 100,
    } as Record<string, number>;
  }

  // ── Auto KPIs: MACHINE_OPERATOR ────────────────────────────────────────────

  private async operatorAutoKpis(userId: string, start: Date, end: Date) {
    const jobs = await this.prisma.designJob.findMany({
      where: { operatorId: userId, updatedAt: { gte: start, lt: end }, status: 'COMPLETED' },
      include: { updates: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    const completed = jobs.length;
    const onTime = jobs.filter(j => {
      if (!j.dueDate || j.updates.length === 0) return false;
      return new Date(j.updates[0].createdAt) <= new Date(j.dueDate);
    }).length;

    return {
      'Production Output': completed,
      'On-Time Production': completed > 0 ? (onTime / completed) * 100 : 0,
    } as Record<string, number>;
  }

  // ── Dashboard: single user ─────────────────────────────────────────────────

  async getDashboard(userId: string, role: UserRole, month: number, year: number, baseBonusInput?: number) {
    const defs = await this.getRoleDefs(role);
    if (defs.length === 0) return { kpis: [], totalScore: 0, baseBonus: 0, incentiveEstimate: 0, incentiveStatus: null, incentiveAmount: null };

    const { start, end } = monthRange(month, year);

    let autoValues: Record<string, number> = {};
    if (role === UserRole.INSTALLER) autoValues = await this.installerAutoKpis(userId, start, end);
    else if (role === UserRole.DEVELOPER) autoValues = await this.developerAutoKpis(userId, start, end);
    else if (role === UserRole.DESIGNER) autoValues = await this.designerAutoKpis(userId, start, end);
    else if (role === UserRole.MACHINE_OPERATOR) autoValues = await this.operatorAutoKpis(userId, start, end);

    const manuals = await this.prisma.kpiResult.findMany({ where: { userId, month, year, isManual: true } });
    const manualMap = Object.fromEntries(manuals.map((m) => [m.kpiName, m]));

    const kpis = defs.map((def) => {
      let actual = 0;
      let isManual = false;
      const saved = manualMap[def.name];
      if (saved) {
        // An explicit manual entry / external sync overrides auto computation.
        actual = Number(saved.actualValue);
        isManual = true;
      } else if (def.auto) {
        actual = autoValues[def.name] ?? 0;
      }
      return {
        name: def.name,
        actual: Math.round(actual * 10) / 10,
        target: def.target,
        weight: def.weight,
        unit: def.unit,
        score: Math.round(kpiScore(actual, def.target, def.weight) * 100) / 100,
        isManual,
      };
    });

    const totalScore = Math.round(kpis.reduce((s, k) => s + k.score, 0) * 100) / 100;

    // Per-user base bonus (salary grade) drives the incentive estimate.
    let baseBonus = baseBonusInput;
    if (baseBonus === undefined) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { baseBonus: true } });
      baseBonus = u ? Number(u.baseBonus) : 10000;
    }

    const incentiveEstimate = baseBonus * incentivePct(totalScore);
    const incentive = await this.prisma.incentive.findUnique({ where: { userId_month_year: { userId, month, year } } });

    return {
      kpis,
      totalScore,
      baseBonus,
      incentiveEstimate,
      incentiveStatus: incentive?.status ?? null,
      incentiveAmount: incentive ? Number(incentive.bonusAmount) : null,
    };
  }

  // ── Dashboard by userId (admin lookup) ────────────────────────────────────

  async getDashboardForUser(userId: string, month: number, year: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, baseBonus: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.getDashboard(userId, user.role, month, year, Number(user.baseBonus));
  }

  // ── Team KPI (admin) ───────────────────────────────────────────────────────

  async getTeam(month: number, year: number) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: KPI_ROLES }, isActive: true },
      select: { id: true, fullName: true, role: true, baseBonus: true },
    });

    const results = await Promise.all(
      users.map(async (u) => {
        const d = await this.getDashboard(u.id, u.role, month, year, Number(u.baseBonus));
        return { userId: u.id, fullName: u.fullName, role: u.role, ...d };
      }),
    );

    return results.sort((a, b) => b.totalScore - a.totalScore);
  }

  // ── KPI definitions (DB-backed, seeded from defaults) ──────────────────────

  private async ensureSeeded(role: UserRole) {
    const defaults = DEFAULT_KPI_DEFS[role];
    if (!defaults) return;

    const count = await this.prisma.kpiDefinition.count({ where: { role } });
    if (count > 0) return;

    await this.prisma.kpiDefinition.createMany({
      data: defaults.map((d, i) => ({
        role,
        name: d.name,
        weight: d.weight,
        target: d.target,
        unit: d.unit,
        auto: d.auto,
        isCustom: false,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
  }

  async getRoleDefs(role: UserRole) {
    await this.ensureSeeded(role);
    const rows = await this.prisma.kpiDefinition.findMany({ where: { role }, orderBy: { sortOrder: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      weight: Number(r.weight),
      target: Number(r.target),
      unit: r.unit,
      auto: r.auto,
      isCustom: r.isCustom,
    }));
  }

  getDefinitions(role: UserRole) {
    return this.getRoleDefs(role);
  }

  async createDefinition(dto: CreateKpiDefinitionDto) {
    if (!KPI_ROLES.includes(dto.role)) {
      throw new BadRequestException(`Role ${dto.role} does not have KPI tracking`);
    }
    await this.ensureSeeded(dto.role);

    const existing = await this.prisma.kpiDefinition.findUnique({ where: { role_name: { role: dto.role, name: dto.name } } });
    if (existing) throw new ConflictException(`KPI "${dto.name}" already exists for ${dto.role}`);

    const count = await this.prisma.kpiDefinition.count({ where: { role: dto.role } });
    return this.prisma.kpiDefinition.create({
      data: {
        role: dto.role,
        name: dto.name,
        weight: dto.weight,
        target: dto.target,
        unit: dto.unit,
        auto: false,
        isCustom: true,
        sortOrder: count,
      },
    });
  }

  async updateDefinition(id: string, dto: UpdateKpiDefinitionDto) {
    const def = await this.prisma.kpiDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('KPI definition not found');

    if (dto.name && dto.name !== def.name) {
      if (def.auto) throw new BadRequestException('Cannot rename a system-tracked KPI');
      const existing = await this.prisma.kpiDefinition.findUnique({ where: { role_name: { role: def.role, name: dto.name } } });
      if (existing) throw new ConflictException(`KPI "${dto.name}" already exists for ${def.role}`);
    }

    return this.prisma.kpiDefinition.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        weight: dto.weight ?? undefined,
        target: dto.target ?? undefined,
        unit: dto.unit ?? undefined,
      },
    });
  }

  async deleteDefinition(id: string) {
    const def = await this.prisma.kpiDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('KPI definition not found');
    await this.prisma.kpiDefinition.delete({ where: { id } });
    return { success: true };
  }

  // ── Manual KPI input (admin) ───────────────────────────────────────────────

  async setManual(dto: ManualKpiDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const defs = await this.getRoleDefs(user.role);
    const def = defs.find((d) => d.name === dto.kpiName);
    if (!def) throw new NotFoundException(`KPI "${dto.kpiName}" not found for role ${user.role}`);

    const score = kpiScore(dto.actualValue, def.target, def.weight);
    return this.prisma.kpiResult.upsert({
      where: { userId_month_year_kpiName: { userId: dto.userId, month: dto.month, year: dto.year, kpiName: dto.kpiName } },
      create: { userId: dto.userId, month: dto.month, year: dto.year, kpiName: dto.kpiName, actualValue: dto.actualValue, targetValue: def.target, weight: def.weight, score, isManual: true },
      update: { actualValue: dto.actualValue, score, isManual: true },
    });
  }

  // ── Incentive generation ───────────────────────────────────────────────────

  async generateIncentives(dto: GenerateIncentivesDto) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: KPI_ROLES }, isActive: true },
      select: { id: true, role: true, baseBonus: true },
    });

    return Promise.all(
      users.map(async (u) => {
        // Each user's own base bonus (salary grade) is the basis. An optional
        // dto.baseBonus acts only as a fallback when a user has none set.
        const base = Number(u.baseBonus) || dto.baseBonus || 10000;
        const { totalScore } = await this.getDashboard(u.id, u.role, dto.month, dto.year, base);
        const bonus = base * incentivePct(totalScore);
        const incentive = await this.prisma.incentive.upsert({
          where: { userId_month_year: { userId: u.id, month: dto.month, year: dto.year } },
          create: { userId: u.id, month: dto.month, year: dto.year, totalScore, baseBonus: base, bonusAmount: bonus, status: IncentiveStatus.PENDING },
          update: { totalScore, baseBonus: base, bonusAmount: bonus },
          include: { user: { select: { fullName: true, role: true } } },
        });
        // Keep the developer/member's earnings ledger in sync with the incentive.
        await this.syncIncentiveEarning(incentive);
        return incentive;
      }),
    );
  }

  /**
   * Mirror an incentive into the user's earnings ledger so generated/approved/
   * paid bonuses actually show up (and count toward the withdrawable balance).
   * Linked 1:1 via Earning.incentiveId so repeated calls stay idempotent.
   */
  private async syncIncentiveEarning(incentive: {
    id: string;
    userId: string;
    bonusAmount: unknown;
    status: IncentiveStatus;
  }) {
    const amount = Number(incentive.bonusAmount);
    if (!(amount > 0)) {
      // No bonus earned — drop any stale linked earning.
      await this.prisma.earning.deleteMany({ where: { incentiveId: incentive.id } });
      return;
    }
    const status = INCENTIVE_TO_EARNING_STATUS[incentive.status];
    await this.prisma.earning.upsert({
      where: { incentiveId: incentive.id },
      create: { incentiveId: incentive.id, userId: incentive.userId, amount, type: EarningType.BONUS, status },
      update: { amount, status },
    });
  }

  // ── Incentive queries ──────────────────────────────────────────────────────

  async getIncentives(month?: number, year?: number) {
    return this.prisma.incentive.findMany({
      where: month && year ? { month, year } : {},
      include: { user: { select: { fullName: true, role: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { bonusAmount: 'desc' }],
    });
  }

  async getMyIncentives(userId: string) {
    return this.prisma.incentive.findMany({
      where: { userId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async approveIncentive(id: string) {
    const incentive = await this.prisma.incentive.update({ where: { id }, data: { status: IncentiveStatus.APPROVED } });
    await this.syncIncentiveEarning(incentive);
    return incentive;
  }

  async payIncentive(id: string) {
    const incentive = await this.prisma.incentive.update({ where: { id }, data: { status: IncentiveStatus.PAID } });
    await this.syncIncentiveEarning(incentive);
    return incentive;
  }

  // ── Financial summary (admin dashboard) ───────────────────────────────────

  async getFinancialSummary() {
    const jobOrders = await this.prisma.jobOrder.findMany({
      where: { status: JobOrderStatus.FINALIZED },
      include: { product: true },
    });

    const totalRevenue = jobOrders.reduce((sum, o) => sum + Number(o.salePrice), 0);

    const now = new Date();
    const cm = now.getMonth();
    const cy = now.getFullYear();
    const pm = cm === 0 ? 11 : cm - 1;
    const py = cm === 0 ? cy - 1 : cy;

    const filter = (m: number, y: number) =>
      jobOrders.filter((o) => { const d = new Date(o.createdAt); return d.getMonth() === m && d.getFullYear() === y; });

    const currentMonthRevenue = filter(cm, cy).reduce((s, o) => s + Number(o.salePrice), 0);
    const prevMonthRevenue = filter(pm, py).reduce((s, o) => s + Number(o.salePrice), 0);
    const growth = prevMonthRevenue === 0 ? (currentMonthRevenue > 0 ? 100 : 0) : ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;

    const byProduct = jobOrders.reduce((acc, o) => {
      const name = o.product?.productName || 'Design / Other';
      acc[name] = (acc[name] || 0) + Number(o.salePrice);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRevenue,
      currentMonthRevenue,
      prevMonthRevenue,
      growth,
      revenueByProduct: Object.entries(byProduct).map(([label, value]) => ({ label, value })),
    };
  }

  async getRevenueTrend() {
    const now = new Date();
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { month: d.getMonth(), year: d.getFullYear(), label: d.toLocaleString('default', { month: 'short' }) };
    }).reverse();

    const jobOrders = await this.prisma.jobOrder.findMany({ where: { status: JobOrderStatus.FINALIZED } });

    return last6Months.map((m) => ({
      label: m.label,
      value: jobOrders
        .filter((o) => { const d = new Date(o.createdAt); return d.getMonth() === m.month && d.getFullYear() === m.year; })
        .reduce((s, o) => s + Number(o.salePrice), 0),
    }));
  }

  // ── Designer KPI: external TMS Pro integration ─────────────────────────────

  private async fetchTmsDesignerPoints(from?: string, to?: string): Promise<TmsKpiEmployee[]> {
    const base = process.env.TMS_KPI_API_URL ?? 'https://tmspro.up.railway.app';
    const token = process.env.TMS_KPI_API_TOKEN;
    if (!token) throw new BadRequestException('TMS_KPI_API_TOKEN is not configured on the server.');

    const url = new URL('/api/v1/kpi/export', base);
    if (from) url.searchParams.set('from', from);
    if (to) url.searchParams.set('to', to);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }).catch(() => {
      throw new BadRequestException('Could not reach the TMS KPI API.');
    });
    if (res.status === 401) throw new BadRequestException('TMS KPI API rejected the token (401 Unauthorized).');
    if (!res.ok) throw new BadRequestException(`TMS KPI API returned HTTP ${res.status}.`);

    // Unauthenticated requests are redirected to an HTML login page rather than
    // a 401 JSON, so guard against a non-JSON body (invalid/expired token).
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new BadRequestException('TMS KPI API did not return JSON — the token may be invalid or lack the kpi:read ability.');
    }

    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as TmsKpiEmployee[]) : [];
  }

  private designerUsers() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ role: UserRole.DESIGNER }, { additionalRoles: { some: { role: UserRole.DESIGNER } } }],
      },
      select: { id: true, fullName: true, email: true },
    });
  }

  /**
   * Read-only: total points per designer, matched to our users by email first,
   * then by normalized full name as a fallback (so all designers can match even
   * when the two systems store slightly different emails).
   */
  async getDesignerPoints(from?: string, to?: string) {
    const [tms, designers] = await Promise.all([this.fetchTmsDesignerPoints(from, to), this.designerUsers()]);
    const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();

    const byEmail = new Map<string, TmsKpiEmployee>();
    const byName = new Map<string, TmsKpiEmployee>();
    for (const t of tms) {
      if (t.employee_email) byEmail.set(norm(t.employee_email), t);
      if (t.employee_name) byName.set(norm(t.employee_name), t);
    }

    const matched = designers.map((d) => {
      const t = byEmail.get(norm(d.email)) ?? byName.get(norm(d.fullName));
      return {
        userId: d.id,
        fullName: d.fullName,
        email: d.email,
        matched: !!t,
        matchedBy: t ? (byEmail.get(norm(d.email)) ? 'email' : 'name') : null,
        totalPoints: t?.total_points ?? 0,
        tmsEmployeeId: t?.employee_id ?? null,
        tmsName: t?.employee_name ?? null,
      };
    });

    // Also surface the raw TMS roster so admins can see exactly who/what TMS
    // returned (name, email, id) and diagnose any unmatched designers.
    const tmsEmployees = tms.map((t) => ({
      employeeId: t.employee_id,
      name: t.employee_name,
      email: t.employee_email,
      totalPoints: t.total_points,
    }));

    return { designers: matched, tmsEmployees };
  }

  /**
   * Pull designer total points from TMS Pro and distribute each designer's
   * points across their DESIGNER KPI definitions proportionally to weight,
   * storing them as manual KpiResults so the existing weighted score generates.
   */
  async syncDesignerKpis(month: number, year: number, from?: string, to?: string) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const f = from ?? `${year}-${pad(month)}-01`;
    const t = to ?? `${year}-${pad(month)}-${pad(lastDay)}`;

    const { designers: points } = await this.getDesignerPoints(f, t);
    const defs = await this.getRoleDefs(UserRole.DESIGNER);
    const totalWeight = defs.reduce((sum, d) => sum + d.weight, 0) || 1;

    const designers: Array<Record<string, unknown>> = [];
    for (const p of points) {
      if (!p.matched) {
        designers.push({ ...p, applied: false, totalScore: 0 });
        continue;
      }
      for (const def of defs) {
        const allocated = p.totalPoints * (def.weight / totalWeight);
        const score = kpiScore(allocated, def.target, def.weight);
        await this.prisma.kpiResult.upsert({
          where: { userId_month_year_kpiName: { userId: p.userId, month, year, kpiName: def.name } },
          create: { userId: p.userId, month, year, kpiName: def.name, actualValue: allocated, targetValue: def.target, weight: def.weight, score, isManual: true },
          update: { actualValue: allocated, score, isManual: true },
        });
      }
      const dash = await this.getDashboard(p.userId, UserRole.DESIGNER, month, year);
      designers.push({ ...p, applied: true, totalScore: dash.totalScore });
    }

    return { month, year, from: f, to: t, matched: designers.filter((d) => d.matched).length, designers };
  }
}
