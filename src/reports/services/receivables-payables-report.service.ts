import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceivablesPayablesReportDto, ReceivablesPayablesFiltersDto } from '../dto/receivables-payables-report.dto';

export interface ReceivablesEntry {
  id: string;
  type: 'receivable';
  invoiceId: string;
  invoiceNumber: string;
  counterpartyName: string;
  counterpartyNIP?: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  agingCategory: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  status: 'pending' | 'overdue' | 'paid' | 'cancelled';
}

export interface PayablesEntry {
  id: string;
  type: 'payable';
  invoiceId: string;
  invoiceNumber: string;
  counterpartyName: string;
  counterpartyNIP?: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  agingCategory: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  status: 'pending' | 'overdue' | 'paid' | 'cancelled';
}

export interface AgingSummary {
  current: { count: number; amount: number };
  '1-30': { count: number; amount: number };
  '31-60': { count: number; amount: number };
  '61-90': { count: number; amount: number };
  '90+': { count: number; amount: number };
  total: { count: number; amount: number };
}

export interface ReceivablesPayablesSummary {
  receivables: {
    total: number;
    pending: number;
    overdue: number;
    aging: AgingSummary;
  };
  payables: {
    total: number;
    pending: number;
    overdue: number;
    aging: AgingSummary;
  };
  netPosition: number; // receivables - payables
}

@Injectable()
export class ReceivablesPayablesReportService {
  private readonly logger = new Logger(ReceivablesPayablesReportService.name);

  constructor(private prisma: PrismaService) {}

  async generateReport(
    tenantId: string,
    companyId: string,
    filters: ReceivablesPayablesFiltersDto,
  ): Promise<ReceivablesPayablesReportDto> {
    try {
      this.logger.log(`Generating receivables/payables report for tenant ${tenantId}, company ${companyId}`);

      const { asOfDate } = this.getDateRange(filters);

      // Get receivables (money owed to company)
      const receivables = await this.getReceivables(tenantId, companyId, asOfDate);

      // Get payables (money company owes)
      const payables = await this.getPayables(tenantId, companyId, asOfDate);

      // Generate summaries
      const receivablesSummary = this.generateAgingSummary(receivables);
      const payablesSummary = this.generateAgingSummary(payables);

      const summary: ReceivablesPayablesSummary = {
        receivables: {
          total: receivablesSummary.total.amount,
          pending: receivables.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.amount, 0),
          overdue: receivables.filter(r => r.status === 'overdue').reduce((sum, r) => sum + r.amount, 0),
          aging: receivablesSummary,
        },
        payables: {
          total: payablesSummary.total.amount,
          pending: payables.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
          overdue: payables.filter(p => p.status === 'overdue').reduce((sum, p) => sum + p.amount, 0),
          aging: payablesSummary,
        },
        netPosition: receivablesSummary.total.amount - payablesSummary.total.amount,
      };

      return {
        asOfDate,
        filters,
        receivables,
        payables,
        summary,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error generating receivables/payables report: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getDateRange(filters: ReceivablesPayablesFiltersDto): { asOfDate: Date } {
    const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();
    return { asOfDate };
  }

  private async getReceivables(
    tenantId: string,
    companyId: string,
    asOfDate: Date,
  ): Promise<ReceivablesEntry[]> {
    // Get issued invoices (money owed to company)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        status: {
          in: ['issued', 'sent'],
        },
        // Only include invoices that are not yet paid (simplified logic)
        // In reality, you'd track payment status separately
      },
      orderBy: { dueDate: 'asc' },
    });

    const receivables: ReceivablesEntry[] = [];

    for (const invoice of invoices) {
      if (!invoice.dueDate) continue;

      const daysOverdue = Math.max(0, Math.ceil((asOfDate.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      const agingCategory = this.getAgingCategory(daysOverdue);
      const status = daysOverdue > 0 ? 'overdue' : 'pending';

      receivables.push({
        id: `rec_${invoice.id}`,
        type: 'receivable',
        invoiceId: invoice.id,
        invoiceNumber: `${invoice.series}${invoice.number}`,
        counterpartyName: invoice.buyerName,
        counterpartyNIP: invoice.buyerNip || undefined,
        amount: invoice.totalGross,
        dueDate: invoice.dueDate,
        daysOverdue,
        agingCategory,
        status,
      });
    }

    return receivables;
  }

  private async getPayables(
    tenantId: string,
    companyId: string,
    asOfDate: Date,
  ): Promise<PayablesEntry[]> {
    // Get purchase invoices where company is the buyer (money company owes)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        status: {
          in: ['issued', 'sent'],
        },
        // Assuming purchase invoices are identified by the company being the buyer
        buyerNip: {
          not: null,
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const payables: PayablesEntry[] = [];

    for (const invoice of invoices) {
      if (!invoice.dueDate) continue;

      const daysOverdue = Math.max(0, Math.ceil((asOfDate.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      const agingCategory = this.getAgingCategory(daysOverdue);
      const status = daysOverdue > 0 ? 'overdue' : 'pending';

      payables.push({
        id: `pay_${invoice.id}`,
        type: 'payable',
        invoiceId: invoice.id,
        invoiceNumber: `${invoice.series}${invoice.number}`,
        counterpartyName: invoice.buyerName,
        counterpartyNIP: invoice.buyerNip || undefined,
        amount: invoice.totalGross,
        dueDate: invoice.dueDate,
        daysOverdue,
        agingCategory,
        status,
      });
    }

    return payables;
  }

  private getAgingCategory(daysOverdue: number): 'current' | '1-30' | '31-60' | '61-90' | '90+' {
    if (daysOverdue === 0) return 'current';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '90+';
  }

  private generateAgingSummary(entries: (ReceivablesEntry | PayablesEntry)[]): AgingSummary {
    const summary: AgingSummary = {
      current: { count: 0, amount: 0 },
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 },
      total: { count: 0, amount: 0 },
    };

    for (const entry of entries) {
      const category = entry.agingCategory;
      summary[category].count += 1;
      summary[category].amount += entry.amount;
      summary.total.count += 1;
      summary.total.amount += entry.amount;
    }

    return summary;
  }
}