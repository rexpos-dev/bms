import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { computeBalance, computeGrandTotal } from './job-order-pricing.util';
import { toCsv } from './csv.util';

export interface CollectionsSummary {
  from: string | null;
  to: string | null;
  totalCollected: number;
  byMethod: { method: PaymentMethod; total: number; count: number }[];
}

export interface OutstandingRow {
  jobOrderId: string;
  clientId: string;
  clientName: string;
  grandTotal: number;
  totalPaid: number;
  balance: number;
  lastPaymentAt: string | null;
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async collectionsSummary(from?: string, to?: string): Promise<CollectionsSummary> {
    const payments = await this.prisma.payment.findMany({
      where: {
        voidedAt: null,
        ...(from || to
          ? { paidAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
    });

    const byMethodMap = new Map<PaymentMethod, { total: number; count: number }>();
    let totalCollected = 0;
    for (const p of payments) {
      const amount = Number(p.amount);
      totalCollected += amount;
      const entry = byMethodMap.get(p.method) ?? { total: 0, count: 0 };
      entry.total += amount;
      entry.count += 1;
      byMethodMap.set(p.method, entry);
    }

    return {
      from: from ?? null,
      to: to ?? null,
      totalCollected,
      byMethod: [...byMethodMap.entries()].map(([method, v]) => ({ method, ...v })),
    };
  }

  async outstandingBalances(): Promise<OutstandingRow[]> {
    const jobOrders = await this.prisma.jobOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: { items: true, payments: { where: { voidedAt: null } }, client: true },
    });

    const rows: OutstandingRow[] = [];
    for (const jo of jobOrders) {
      const grandTotal = computeGrandTotal(
        Number(jo.salePrice),
        Number(jo.discount),
        jo.discountType,
        jo.items.map((item) => ({ quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
      );
      const paymentsForBalance = jo.payments.map((p) => ({ amount: Number(p.amount), voidedAt: p.voidedAt }));
      const balance = computeBalance(grandTotal, paymentsForBalance);
      if (balance <= 0) continue;

      const lastPayment = [...jo.payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];
      rows.push({
        jobOrderId: jo.id,
        clientId: jo.clientId,
        clientName: jo.client.businessName,
        grandTotal,
        totalPaid: grandTotal - balance,
        balance,
        lastPaymentAt: lastPayment ? lastPayment.paidAt.toISOString() : null,
      });
    }
    return rows;
  }

  async clientHistory(clientId: string) {
    const [client, jobOrders] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: clientId } }),
      this.prisma.jobOrder.findMany({
        where: { clientId },
        include: { payments: { where: { voidedAt: null } } },
      }),
    ]);

    const payments = jobOrders
      .flatMap((jo) => jo.payments.map((p) => ({ ...p, jobOrderId: jo.id })))
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    return { clientId, clientName: client?.businessName ?? 'Unknown', payments };
  }

  async collectionsCsv(from?: string, to?: string): Promise<string> {
    const summary = await this.collectionsSummary(from, to);
    return toCsv(summary.byMethod.map((m) => ({ method: m.method, total: m.total, count: m.count })));
  }

  async outstandingCsv(): Promise<string> {
    const rows = await this.outstandingBalances();
    return toCsv(
      rows.map((r) => ({
        jobOrderId: r.jobOrderId,
        client: r.clientName,
        grandTotal: r.grandTotal,
        totalPaid: r.totalPaid,
        balance: r.balance,
        lastPaymentAt: r.lastPaymentAt ?? '',
      })),
    );
  }
}
