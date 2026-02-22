import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KPiRMonthlySummary, KPiRYearlySummary } from '../dto/kpir-summary.dto';

const MONTH_NAMES_PL = [
  'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien',
];

@Injectable()
export class KPiRSummaryService {
  private readonly logger = new Logger(KPiRSummaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get monthly summary for KPiR (podsumowanie miesieczne).
   */
  async getMonthlySummary(
    tenantId: string,
    companyId: string,
    year: number,
    month: number,
  ): Promise<KPiRMonthlySummary> {
    const aggregation = await this.prisma.kPiREntry.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
        month,
      },
      _sum: {
        salesRevenue: true,
        otherRevenue: true,
        totalRevenue: true,
        purchaseCost: true,
        sideExpenses: true,
        salaries: true,
        otherExpenses: true,
        totalExpenses: true,
        researchCosts: true,
      },
      _count: true,
    });

    const totalRevenue = aggregation._sum.totalRevenue || 0;
    const totalExpenses = aggregation._sum.totalExpenses || 0;

    return {
      year,
      month,
      monthName: MONTH_NAMES_PL[month - 1],
      salesRevenue: aggregation._sum.salesRevenue || 0,
      otherRevenue: aggregation._sum.otherRevenue || 0,
      totalRevenue,
      purchaseCost: aggregation._sum.purchaseCost || 0,
      sideExpenses: aggregation._sum.sideExpenses || 0,
      salaries: aggregation._sum.salaries || 0,
      otherExpenses: aggregation._sum.otherExpenses || 0,
      totalExpenses,
      researchCosts: aggregation._sum.researchCosts || 0,
      income: totalRevenue - totalExpenses,
      entryCount: aggregation._count,
    };
  }

  /**
   * Get yearly summary with monthly breakdown (podsumowanie roczne).
   * Includes remanent (spis z natury) adjustments.
   */
  async getYearlySummary(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<KPiRYearlySummary> {
    // Get all monthly summaries
    const months: KPiRMonthlySummary[] = [];
    for (let m = 1; m <= 12; m++) {
      const summary = await this.getMonthlySummary(tenantId, companyId, year, m);
      months.push(summary);
    }

    // Get remanent values
    const openingRemanent = await this.prisma.remanent.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
        type: 'OPENING',
      },
      select: { totalValue: true },
    });

    const closingRemanent = await this.prisma.remanent.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
        type: 'CLOSING',
      },
      select: { totalValue: true },
    });

    // Aggregate yearly totals
    const totals = months.reduce(
      (acc, m) => ({
        totalSalesRevenue: acc.totalSalesRevenue + m.salesRevenue,
        totalOtherRevenue: acc.totalOtherRevenue + m.otherRevenue,
        totalRevenue: acc.totalRevenue + m.totalRevenue,
        totalPurchaseCost: acc.totalPurchaseCost + m.purchaseCost,
        totalSideExpenses: acc.totalSideExpenses + m.sideExpenses,
        totalSalaries: acc.totalSalaries + m.salaries,
        totalOtherExpenses: acc.totalOtherExpenses + m.otherExpenses,
        totalExpenses: acc.totalExpenses + m.totalExpenses,
        totalResearchCosts: acc.totalResearchCosts + m.researchCosts,
        totalEntries: acc.totalEntries + m.entryCount,
      }),
      {
        totalSalesRevenue: 0,
        totalOtherRevenue: 0,
        totalRevenue: 0,
        totalPurchaseCost: 0,
        totalSideExpenses: 0,
        totalSalaries: 0,
        totalOtherExpenses: 0,
        totalExpenses: 0,
        totalResearchCosts: 0,
        totalEntries: 0,
      },
    );

    const openVal = openingRemanent?.totalValue || 0;
    const closeVal = closingRemanent?.totalValue || 0;

    // Dochod = Przychod - Koszty + Remanent poczatkowy - Remanent koncowy
    const annualIncome =
      totals.totalRevenue - totals.totalExpenses + openVal - closeVal;

    return {
      year,
      months,
      ...totals,
      openingRemanent: openVal,
      closingRemanent: closeVal,
      annualIncome,
    };
  }

  /**
   * Get cumulative summary from start of year up to a given month.
   * Used for tax advance calculations.
   */
  async getCumulativeSummary(
    tenantId: string,
    companyId: string,
    year: number,
    upToMonth: number,
  ): Promise<{ totalRevenue: number; totalExpenses: number; income: number }> {
    const aggregation = await this.prisma.kPiREntry.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
        month: { lte: upToMonth },
      },
      _sum: {
        totalRevenue: true,
        totalExpenses: true,
      },
    });

    const totalRevenue = aggregation._sum.totalRevenue || 0;
    const totalExpenses = aggregation._sum.totalExpenses || 0;

    return {
      totalRevenue,
      totalExpenses,
      income: totalRevenue - totalExpenses,
    };
  }

  // --- Remanent (Inventory/Stock-taking) Management ---

  async createRemanent(
    tenantId: string,
    companyId: string,
    data: { date: Date; type: string; totalValue: number; items: any; year: number; notes?: string },
  ) {
    return this.prisma.remanent.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        date: data.date,
        type: data.type,
        totalValue: data.totalValue,
        items: data.items,
        year: data.year,
        notes: data.notes || null,
      },
    });
  }

  async getRemanents(tenantId: string, companyId: string, year: number) {
    return this.prisma.remanent.findMany({
      where: { tenant_id: tenantId, company_id: companyId, year },
      orderBy: { date: 'asc' },
    });
  }

  async updateRemanent(id: string, data: { totalValue?: number; items?: any; notes?: string }) {
    return this.prisma.remanent.update({
      where: { id },
      data,
    });
  }

  async deleteRemanent(id: string) {
    return this.prisma.remanent.delete({ where: { id } });
  }
}
