import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user.type';
import { PrismaService } from './prisma.service';
import { RecordPaymentDto } from './record-payment.dto';
import { computeBalance, computeGrandTotal } from './job-order-pricing.util';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadJobOrderWithPayments(jobOrderId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id: jobOrderId },
      include: { items: true, payments: { orderBy: { paidAt: 'desc' } } },
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${jobOrderId} not found`);
    return jobOrder;
  }

  async recordPayment(jobOrderId: string, dto: RecordPaymentDto, user: AuthenticatedUser) {
    await this.loadJobOrderWithPayments(jobOrderId);
    return this.prisma.payment.create({
      data: {
        jobOrderId,
        amount: dto.amount,
        method: dto.method,
        referenceNo: dto.referenceNo ?? null,
        proofPhotoUrl: dto.proofPhotoUrl ?? null,
        paidAt: new Date(dto.paidAt),
        recordedById: user.id,
      },
    });
  }

  async listForJobOrder(jobOrderId: string) {
    const jobOrder = await this.loadJobOrderWithPayments(jobOrderId);
    const grandTotal = computeGrandTotal(
      Number(jobOrder.salePrice),
      Number(jobOrder.discount),
      jobOrder.discountType,
      jobOrder.items.map((item) => ({ quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
    );
    const balance = computeBalance(
      grandTotal,
      jobOrder.payments.map((p) => ({ amount: Number(p.amount), voidedAt: p.voidedAt })),
    );
    return { grandTotal, totalPaid: grandTotal - balance, balance, payments: jobOrder.payments };
  }

  async voidPayment(paymentId: string, reason: string, user: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
    if (payment.voidedAt) throw new BadRequestException('Payment is already voided');
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: reason, voidedById: user.id },
    });
  }
}
