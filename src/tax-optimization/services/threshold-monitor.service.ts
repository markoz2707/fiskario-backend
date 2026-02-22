import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TaxFormType,
  ThresholdStatus,
  ThresholdInfo,
  ThresholdMonitorResult,
} from '../dto/tax-optimization.dto';

/**
 * Monitors key tax and business thresholds:
 * - VAT exemption limit (200k PLN)
 * - Ryczalt eligibility limit (2M EUR)
 * - Tax bracket threshold (120k PLN income)
 * - One-time depreciation limit (10k PLN per asset)
 * - De minimis aid limit (300k EUR over 3 years as of 2024)
 */
@Injectable()
export class ThresholdMonitorService {
  private readonly logger = new Logger(ThresholdMonitorService.name);

  // EUR rate for threshold calculations
  private readonly EUR_RATE = 4.60;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get comprehensive threshold monitoring for a company.
   */
  async monitorThresholds(
    tenantId: string,
    companyId: string,
    year?: number,
  ): Promise<ThresholdMonitorResult> {
    const targetYear = year || new Date().getFullYear();

    this.logger.log(
      `Monitoring thresholds for company=${companyId}, year=${targetYear}`,
    );

    // Fetch financial data
    const financialData = await this.getFinancialData(
      tenantId,
      companyId,
      targetYear,
    );

    const thresholds: ThresholdInfo[] = [];

    // 1. VAT exemption threshold
    thresholds.push(
      this.checkVatExemption(financialData.totalRevenue, targetYear),
    );

    // 2. Ryczalt eligibility threshold
    thresholds.push(
      this.checkRyczaltLimit(financialData.totalRevenue, targetYear),
    );

    // 3. Tax bracket threshold (skala podatkowa)
    thresholds.push(
      this.checkTaxBracket(financialData.totalIncome, targetYear),
    );

    // 4. One-time depreciation limit
    thresholds.push(
      this.checkOneTimeDepreciation(
        financialData.oneTimeDepreciationUsed,
        targetYear,
      ),
    );

    // 5. De minimis aid limit
    thresholds.push(
      this.checkDeMinimis(financialData.deMinimisUsed, targetYear),
    );

    // 6. Small ZUS Plus eligibility
    thresholds.push(
      this.checkMalyZusPlus(financialData.totalRevenue, targetYear),
    );

    // 7. Cash register (kasa fiskalna) threshold
    thresholds.push(
      this.checkCashRegisterThreshold(
        financialData.cashSalesRevenue,
        targetYear,
      ),
    );

    const criticalAlerts = thresholds.filter(
      (t) =>
        t.status === ThresholdStatus.EXCEEDED ||
        t.status === ThresholdStatus.WARNING,
    );

    return {
      companyId,
      year: targetYear,
      thresholds,
      criticalAlerts,
      generatedAt: new Date(),
    };
  }

  // ============================================================
  // THRESHOLD CHECKS
  // ============================================================

  private checkVatExemption(
    totalRevenue: number,
    year: number,
  ): ThresholdInfo {
    const limit = 200_000;
    const remaining = Math.max(0, limit - totalRevenue);
    const usagePercent = (totalRevenue / limit) * 100;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (totalRevenue >= limit) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired =
        'Przekroczono limit zwolnienia z VAT. Nalezy zarejestrowac sie jako czynny podatnik VAT.';
    } else if (usagePercent >= 80) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Pozostalo ${remaining.toFixed(0)} PLN do limitu VAT. Rozwazyc dobrowolna rejestracje VAT.`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Zwolnienie z VAT',
      description:
        'Limit obrotu dla zwolnienia podmiotowego z VAT (art. 113 ustawy o VAT)',
      limitValue: limit,
      limitCurrency: 'PLN',
      currentValue: totalRevenue,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      actionRequired,
      deadline: `${year}-12-31`,
    };
  }

  private checkRyczaltLimit(
    totalRevenue: number,
    year: number,
  ): ThresholdInfo {
    const limitEur = 2_000_000;
    const limitPln = limitEur * this.EUR_RATE;
    const remaining = Math.max(0, limitPln - totalRevenue);
    const usagePercent = (totalRevenue / limitPln) * 100;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (totalRevenue >= limitPln) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired = `Przekroczono limit ryczaltu (2 000 000 EUR = ${limitPln.toFixed(0)} PLN). Od ${year + 1} nalezy zmienic forme opodatkowania.`;
    } else if (usagePercent >= 85) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Zblizasz sie do limitu ryczaltu. Pozostalo ${remaining.toFixed(0)} PLN.`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Limit przychodu dla ryczaltu',
      description:
        'Maksymalny przychod uprawniajacy do opodatkowania ryczaltem (2 000 000 EUR)',
      limitValue: limitPln,
      limitCurrency: 'PLN',
      currentValue: totalRevenue,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.RYCZALT],
      actionRequired,
      deadline: `${year}-12-31`,
    };
  }

  private checkTaxBracket(
    totalIncome: number,
    year: number,
  ): ThresholdInfo {
    const limit = 120_000;
    const remaining = Math.max(0, limit - totalIncome);
    const usagePercent = (totalIncome / limit) * 100;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (totalIncome >= limit) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired = `Dochod przekroczyl prog ${limit.toFixed(0)} PLN. Nadwyzka opodatkowana stawka 32%. Rozwazyc przejscie na liniowy.`;
    } else if (usagePercent >= 75) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Dochod zbliza sie do progu 120 000 PLN (pozostalo ${remaining.toFixed(0)} PLN). Rozwazyc planowanie podatkowe.`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Prog podatkowy (skala)',
      description:
        'Prog dochodu powyzej ktorego obowiazuje stawka 32% na skali podatkowej',
      limitValue: limit,
      limitCurrency: 'PLN',
      currentValue: totalIncome,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.SKALA],
      actionRequired,
      deadline: `${year}-12-31`,
    };
  }

  private checkOneTimeDepreciation(
    usedAmount: number,
    year: number,
  ): ThresholdInfo {
    // Jednorazowa amortyzacja for "small taxpayers" and startups: 50 000 EUR
    const limitEur = 50_000;
    const limitPln = limitEur * this.EUR_RATE;
    const remaining = Math.max(0, limitPln - usedAmount);
    const usagePercent = usedAmount > 0 ? (usedAmount / limitPln) * 100 : 0;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (usedAmount >= limitPln) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired =
        'Wykorzystano pelny limit jednorazowej amortyzacji na ten rok.';
    } else if (usagePercent >= 80) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Pozostalo ${remaining.toFixed(0)} PLN limitu jednorazowej amortyzacji.`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Limit jednorazowej amortyzacji',
      description:
        'Limit jednorazowego odpisu amortyzacyjnego dla malych podatnikow (50 000 EUR rocznie)',
      limitValue: limitPln,
      limitCurrency: 'PLN',
      currentValue: usedAmount,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY],
      actionRequired,
      deadline: `${year}-12-31`,
    };
  }

  private checkDeMinimis(
    usedAmount: number,
    year: number,
  ): ThresholdInfo {
    // De minimis limit: 300 000 EUR over 3 rolling fiscal years (since 2024 regulation)
    const limitEur = 300_000;
    const limitPln = limitEur * this.EUR_RATE;
    const remaining = Math.max(0, limitPln - usedAmount);
    const usagePercent = usedAmount > 0 ? (usedAmount / limitPln) * 100 : 0;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (usedAmount >= limitPln) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired =
        'Wykorzystano limit pomocy de minimis. Brak mozliwosci korzystania z dalszej pomocy publicznej.';
    } else if (usagePercent >= 75) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Zblizasz sie do limitu de minimis. Pozostalo ${remaining.toFixed(0)} PLN (3-letni okres).`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Limit pomocy de minimis',
      description:
        'Limit pomocy de minimis: 300 000 EUR w ciagu 3 lat podatkowych',
      limitValue: limitPln,
      limitCurrency: 'PLN',
      currentValue: usedAmount,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      actionRequired,
      deadline: null,
    };
  }

  private checkMalyZusPlus(
    totalRevenue: number,
    year: number,
  ): ThresholdInfo {
    const limit = 120_000;
    const remaining = Math.max(0, limit - totalRevenue);
    const usagePercent = (totalRevenue / limit) * 100;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (totalRevenue >= limit) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired = `Przychod przekroczyl ${limit.toFixed(0)} PLN. Utrata prawa do Malego ZUS Plus od nastepnego okresu.`;
    } else if (usagePercent >= 80) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Zblizasz sie do limitu Malego ZUS Plus (${remaining.toFixed(0)} PLN pozostalo).`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Limit Maly ZUS Plus',
      description:
        'Limit przychodu uprawniajacy do oplacania skladek na Maly ZUS Plus (120 000 PLN)',
      limitValue: limit,
      limitCurrency: 'PLN',
      currentValue: totalRevenue,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      actionRequired,
      deadline: `${year}-12-31`,
    };
  }

  private checkCashRegisterThreshold(
    cashSalesRevenue: number,
    year: number,
  ): ThresholdInfo {
    const limit = 20_000;
    const remaining = Math.max(0, limit - cashSalesRevenue);
    const usagePercent = cashSalesRevenue > 0 ? (cashSalesRevenue / limit) * 100 : 0;

    let status: ThresholdStatus;
    let actionRequired: string | null = null;

    if (cashSalesRevenue >= limit) {
      status = ThresholdStatus.EXCEEDED;
      actionRequired =
        'Przekroczono limit 20 000 PLN sprzedazy na rzecz osob fizycznych. Obowiazek posiadania kasy fiskalnej.';
    } else if (usagePercent >= 75) {
      status = ThresholdStatus.WARNING;
      actionRequired = `Pozostalo ${remaining.toFixed(0)} PLN do limitu kasy fiskalnej.`;
    } else {
      status = ThresholdStatus.SAFE;
    }

    return {
      name: 'Limit kasy fiskalnej',
      description:
        'Limit obrotu na rzecz osob fizycznych zwalniajacy z obowiazku posiadania kasy fiskalnej',
      limitValue: limit,
      limitCurrency: 'PLN',
      currentValue: cashSalesRevenue,
      remainingValue: remaining,
      usagePercent: Math.round(usagePercent * 100) / 100,
      status,
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      actionRequired,
      deadline: `${year}-12-31`,
    };
  }

  // ============================================================
  // DATA FETCHING
  // ============================================================

  private async getFinancialData(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<{
    totalRevenue: number;
    totalIncome: number;
    cashSalesRevenue: number;
    oneTimeDepreciationUsed: number;
    deMinimisUsed: number;
  }> {
    try {
      // Attempt to read from KPiR entries
      const kpirEntries = await this.prisma.kPiREntry.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          year,
        },
      });

      if (kpirEntries.length > 0) {
        const totalRevenue = kpirEntries.reduce(
          (sum, e) => sum + (e.totalRevenue || 0),
          0,
        );
        const totalExpenses = kpirEntries.reduce(
          (sum, e) => sum + (e.totalExpenses || 0),
          0,
        );
        const totalIncome = Math.max(0, totalRevenue - totalExpenses);

        return {
          totalRevenue,
          totalIncome,
          cashSalesRevenue: 0, // Would need separate tracking
          oneTimeDepreciationUsed: await this.getOneTimeDepreciationUsed(
            tenantId,
            companyId,
            year,
          ),
          deMinimisUsed: 0, // Would need separate tracking
        };
      }

      // Fallback: attempt to read from invoices
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          date: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
          isIncoming: false,
          status: { not: 'cancelled' },
        },
      });

      const totalRevenue = invoices.reduce(
        (sum, inv) => sum + (inv.totalNet || 0),
        0,
      );

      // Incoming invoices as costs
      const purchaseInvoices = await this.prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          date: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
          isIncoming: true,
          status: { not: 'cancelled' },
        },
      });

      const totalCosts = purchaseInvoices.reduce(
        (sum, inv) => sum + (inv.totalNet || 0),
        0,
      );

      const totalIncome = Math.max(0, totalRevenue - totalCosts);

      return {
        totalRevenue,
        totalIncome,
        cashSalesRevenue: 0,
        oneTimeDepreciationUsed: await this.getOneTimeDepreciationUsed(
          tenantId,
          companyId,
          year,
        ),
        deMinimisUsed: 0,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch financial data for company ${companyId}: ${error.message}. Returning zeros.`,
      );
      return {
        totalRevenue: 0,
        totalIncome: 0,
        cashSalesRevenue: 0,
        oneTimeDepreciationUsed: 0,
        deMinimisUsed: 0,
      };
    }
  }

  /**
   * Sum up one-time depreciation used in the given year from DepreciationEntry records.
   */
  private async getOneTimeDepreciationUsed(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<number> {
    try {
      const entries = await this.prisma.depreciationEntry.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          year,
          method: 'ONE_TIME',
        },
      });

      return entries.reduce((sum, e) => sum + (e.amount || 0), 0);
    } catch {
      return 0;
    }
  }
}
