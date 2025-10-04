import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CashflowReportDto, CashflowFiltersDto } from '../dto/cashflow-report.dto';

export interface CashflowEntry {
  id: string;
  type: 'income' | 'expense';
  date: Date;
  dueDate?: Date;
  amount: number;
  description: string;
  counterpartyName: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  daysUntilDue?: number;
  category: 'invoice' | 'zus' | 'tax' | 'other';
}

export interface CashflowProjection {
  date: string; // YYYY-MM-DD
  projectedIncome: number;
  projectedExpenses: number;
  netCashflow: number;
  cumulativeBalance: number;
}

export interface CashflowSummary {
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  pendingIncome: number;
  pendingExpenses: number;
  overdueAmount: number;
  projection: CashflowProjection[];
}

@Injectable()
export class CashflowReportService {
  private readonly logger = new Logger(CashflowReportService.name);

  constructor(private prisma: PrismaService) {}

  async generateReport(
    tenantId: string,
    companyId: string,
    filters: CashflowFiltersDto,
  ): Promise<CashflowReportDto> {
    try {
      this.logger.log(`Generating cashflow report for tenant ${tenantId}, company ${companyId}`);

      const { startDate, endDate, period } = this.getDateRange(filters);

      // Get cashflow entries
      const entries = await this.getCashflowEntries(tenantId, companyId, startDate, endDate);

      // Generate summary
      const summary = this.generateSummary(entries);

      // Generate projections for next 3 months
      const projection = await this.generateProjection(tenantId, companyId, endDate);

      return {
        period,
        filters,
        entries,
        summary: {
          ...summary,
          projection,
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error generating cashflow report: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getDateRange(filters: CashflowFiltersDto): { startDate: Date; endDate: Date; period: string } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let period: string;

    if (filters.startDate && filters.endDate) {
      startDate = new Date(filters.startDate);
      endDate = new Date(filters.endDate);
      period = `${filters.startDate}_${filters.endDate}`;
    } else if (filters.months) {
      // Look ahead X months
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + filters.months, 0);
      period = `${filters.months}_months_from_${now.toISOString().slice(0, 7)}`;
    } else {
      // Default to next 3 months
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      period = 'next_3_months';
    }

    return { startDate, endDate, period };
  }

  private async getCashflowEntries(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CashflowEntry[]> {
    const entries: CashflowEntry[] = [];

    // Get sales invoices (income)
    const salesInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        dueDate: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['issued', 'sent'],
        },
      },
      include: {
        buyer: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    for (const invoice of salesInvoices) {
      const daysUntilDue = Math.ceil((invoice.dueDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      entries.push({
        id: `income_${invoice.id}`,
        type: 'income',
        date: invoice.date,
        dueDate: invoice.dueDate || undefined,
        amount: invoice.totalGross,
        description: `Faktura ${invoice.series}${invoice.number}`,
        counterpartyName: invoice.buyer?.name || 'Unknown Buyer',
        status: this.getPaymentStatus(invoice.dueDate),
        daysUntilDue: daysUntilDue > 0 ? daysUntilDue : undefined,
        category: 'invoice',
      });
    }

    // Get purchase invoices (expenses)
    const purchaseInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        dueDate: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['issued', 'sent'],
        },
        // Assuming purchase invoices are those where the company is the buyer
        buyer_id: {
          not: null,
        },
      },
      include: {
        buyer: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    for (const invoice of purchaseInvoices) {
      const daysUntilDue = Math.ceil((invoice.dueDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      entries.push({
        id: `expense_${invoice.id}`,
        type: 'expense',
        date: invoice.date,
        dueDate: invoice.dueDate || undefined,
        amount: invoice.totalGross,
        description: `Faktura ${invoice.series}${invoice.number}`,
        counterpartyName: invoice.buyer?.name || 'Unknown Buyer',
        status: this.getPaymentStatus(invoice.dueDate),
        daysUntilDue: daysUntilDue > 0 ? daysUntilDue : undefined,
        category: 'invoice',
      });
    }

    // Get ZUS contributions (expenses)
    const zusContributions = await this.prisma.zUSContribution.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        contributionDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        employee: true,
      },
      orderBy: { contributionDate: 'asc' },
    });

    for (const zus of zusContributions) {
      const totalZUS = this.calculateZUSAmount(zus);
      const daysUntilDue = Math.ceil((zus.contributionDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

      entries.push({
        id: `zus_${zus.id}`,
        type: 'expense',
        date: zus.contributionDate,
        amount: totalZUS,
        description: `Składki ZUS - ${zus.employee?.firstName} ${zus.employee?.lastName}`,
        counterpartyName: 'ZUS',
        status: this.getPaymentStatus(zus.contributionDate),
        daysUntilDue: daysUntilDue > 0 ? daysUntilDue : undefined,
        category: 'zus',
      });
    }

    // Get tax declarations (expenses)
    const taxDeclarations = await this.prisma.declaration.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        submittedAt: {
          gte: startDate,
          lte: endDate,
        },
        type: {
          in: ['VAT-7', 'JPK_V7M', 'JPK_V7K', 'PIT-36', 'CIT-8'],
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    for (const declaration of taxDeclarations) {
      // Extract tax amount from declaration data (simplified)
      const taxAmount = this.extractTaxAmount(declaration.data as any);

      entries.push({
        id: `tax_${declaration.id}`,
        type: 'expense',
        date: declaration.submittedAt!,
        amount: taxAmount,
        description: `Deklaracja ${declaration.type} - okres ${declaration.period}`,
        counterpartyName: 'Urząd Skarbowy',
        status: 'paid',
        category: 'tax',
      });
    }

    return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private getPaymentStatus(dueDate: Date | null | undefined): 'pending' | 'paid' | 'overdue' | 'cancelled' {
    if (!dueDate) return 'pending';

    const now = new Date();
    const daysDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) return 'overdue';
    if (daysDiff === 0) return 'pending';
    return 'pending';
  }

  private calculateZUSAmount(zus: any): number {
    return (
      (zus.emerytalnaEmployer || 0) +
      (zus.rentowaEmployer || 0) +
      (zus.chorobowaEmployee || 0) +
      (zus.wypadkowaEmployer || 0) +
      (zus.zdrowotnaEmployee || 0) +
      (zus.fpEmployee || 0) +
      (zus.fgspEmployee || 0)
    );
  }

  private extractTaxAmount(declarationData: any): number {
    // Simplified extraction - in reality this would parse the actual declaration structure
    return declarationData?.vatDue || declarationData?.taxDue || 0;
  }

  private generateSummary(entries: CashflowEntry[]): Omit<CashflowSummary, 'projection'> {
    const summary = {
      totalIncome: 0,
      totalExpenses: 0,
      netCashflow: 0,
      pendingIncome: 0,
      pendingExpenses: 0,
      overdueAmount: 0,
    };

    for (const entry of entries) {
      if (entry.type === 'income') {
        summary.totalIncome += entry.amount;
        if (entry.status === 'pending') {
          summary.pendingIncome += entry.amount;
        }
      } else {
        summary.totalExpenses += entry.amount;
        if (entry.status === 'pending') {
          summary.pendingExpenses += entry.amount;
        }
        if (entry.status === 'overdue') {
          summary.overdueAmount += entry.amount;
        }
      }
    }

    summary.netCashflow = summary.totalIncome - summary.totalExpenses;

    return summary;
  }

  private async generateProjection(
    tenantId: string,
    companyId: string,
    endDate: Date,
  ): Promise<CashflowProjection[]> {
    const projections: CashflowProjection[] = [];
    let cumulativeBalance = 0;

    // Generate next 3 months projections
    const currentDate = new Date(endDate);

    for (let i = 1; i <= 3; i++) {
      const projectionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const monthStart = new Date(projectionDate.getFullYear(), projectionDate.getMonth(), 1);
      const monthEnd = new Date(projectionDate.getFullYear(), projectionDate.getMonth() + 1, 0);

      // Get projected income for the month
      const projectedInvoices = await this.prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          dueDate: {
            gte: monthStart,
            lte: monthEnd,
          },
          status: {
            in: ['issued', 'sent'],
          },
        },
      });

      const projectedIncome = projectedInvoices.reduce((sum, inv) => sum + inv.totalGross, 0);

      // Estimate expenses based on historical data (simplified)
      const projectedExpenses = await this.estimateMonthlyExpenses(tenantId, companyId, monthStart);

      const netCashflow = projectedIncome - projectedExpenses;
      cumulativeBalance += netCashflow;

      projections.push({
        date: monthStart.toISOString().slice(0, 10),
        projectedIncome,
        projectedExpenses,
        netCashflow,
        cumulativeBalance,
      });
    }

    return projections;
  }

  private async estimateMonthlyExpenses(
    tenantId: string,
    companyId: string,
    monthStart: Date,
  ): Promise<number> {
    // Simple estimation based on previous months (this would be more sophisticated in reality)
    const previousMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const previousMonthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 0);

    const previousExpenses = await this.prisma.invoice.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        date: {
          gte: previousMonth,
          lte: previousMonthEnd,
        },
        status: {
          in: ['issued', 'sent'],
        },
      },
      _sum: {
        totalGross: true,
      },
    });

    return previousExpenses._sum.totalGross || 0;
  }
}