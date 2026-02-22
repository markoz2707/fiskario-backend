import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTaxConfig, roundToFullPLN, roundToGrosze } from './tax-config';

export interface PIT36LInput {
  year: number;
  businessIncome: number;
  businessCosts: number;
  zusDeduction: number;      // Skladki spoleczne
  healthInsurancePaid: number; // Calkowita skladka zdrowotna zaplacona (4.9% dochodu)
  advancesPaid: number;      // Zaliczki JDG
  deductions: {
    fromIncome: Array<{ type: string; amount: number }>;
    // PIT-36L does NOT support child relief or most credits from tax
  };
}

export interface PIT36LResult {
  businessProfit: number;
  totalIncome: number;
  incomeAfterZus: number;
  deductionsFromIncome: number;
  healthDeduction: number;
  taxBase: number;
  taxCalculated: number;
  taxDue: number;
  advancesPaid: number;
  finalAmount: number;
  effectiveRate: number;
  breakdown: {
    linearRate: number;
    healthDeductionLimit: number;
    healthDeductionApplied: number;
    zusDeduction: number;
  };
}

@Injectable()
export class PIT36LCalculationService {
  private readonly logger = new Logger(PIT36LCalculationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate PIT-36L (podatek liniowy 19%) annual tax.
   *
   * Algorithm:
   * 1. DOCHOD = Przychod_JDG - Koszty_JDG (TYLKO JDG, bez etatu!)
   * 2. PODSTAWA = DOCHOD - skladki_spoleczne - ulgi_od_dochodu (ograniczone)
   * 3. PODATEK = PODSTAWA * 19%
   * 4. Brak kwoty wolnej, brak ulgi na dzieci
   * 5. Zdrowotna: 4.9% dochodu, odliczalna do limitu (11 600 PLN w 2024)
   * 6. DO_ZAPLATY = PODATEK - zdrowotna_odliczenie - zaliczki_jdg
   */
  calculate(input: PIT36LInput): PIT36LResult {
    const config = getTaxConfig(input.year);
    this.logger.debug(`Calculating PIT-36L for year ${input.year}`);

    // Step 1: Business profit only (no employment income on PIT-36L)
    const businessProfit = Math.max(0, input.businessIncome - input.businessCosts);
    const totalIncome = businessProfit;

    // Step 2: Subtract ZUS social contributions
    const incomeAfterZus = Math.max(0, totalIncome - input.zusDeduction);

    // Step 3: Subtract limited deductions from income
    const deductionsFromIncome = this.calculateDeductionsFromIncome(
      input.deductions.fromIncome,
      incomeAfterZus,
      config,
    );
    const taxBaseRaw = Math.max(0, incomeAfterZus - deductionsFromIncome);

    // Step 4: Round to full PLN
    const taxBase = roundToFullPLN(taxBaseRaw);

    // Step 5: Calculate flat 19% tax
    const taxCalculated = roundToGrosze(taxBase * config.linear.rate);

    // Step 6: Health insurance deduction (limited)
    const healthDeduction = Math.min(
      input.healthInsurancePaid,
      config.linear.healthDeductionLimit,
    );

    // Step 7: Tax due (no child relief, no kwota wolna)
    const taxDue = roundToFullPLN(Math.max(0, taxCalculated - healthDeduction));

    // Step 8: Final amount
    const finalAmount = roundToFullPLN(taxDue - input.advancesPaid);

    // Effective rate
    const effectiveRate =
      totalIncome > 0 ? roundToGrosze((taxDue / totalIncome) * 100) : 0;

    return {
      businessProfit,
      totalIncome,
      incomeAfterZus,
      deductionsFromIncome,
      healthDeduction,
      taxBase,
      taxCalculated,
      taxDue,
      advancesPaid: input.advancesPaid,
      finalAmount,
      effectiveRate,
      breakdown: {
        linearRate: config.linear.rate,
        healthDeductionLimit: config.linear.healthDeductionLimit,
        healthDeductionApplied: healthDeduction,
        zusDeduction: input.zusDeduction,
      },
    };
  }

  /**
   * Calculate limited deductions from income for PIT-36L.
   * PIT-36L supports: IKZE, internet, donations (limited), thermomodernization, rehabilitation.
   * Does NOT support: child relief (ulga na dzieci), kwota wolna.
   */
  private calculateDeductionsFromIncome(
    deductions: Array<{ type: string; amount: number }>,
    incomeAfterZus: number,
    config: ReturnType<typeof getTaxConfig>,
  ): number {
    let total = 0;

    for (const ded of deductions) {
      let amount = ded.amount;

      switch (ded.type) {
        case 'INTERNET':
          amount = Math.min(amount, config.internetRelief);
          break;
        case 'DONATIONS':
        case 'BLOOD_DONATION':
          amount = Math.min(amount, incomeAfterZus * config.donationLimit);
          break;
        case 'IKZE':
          amount = Math.min(amount, config.ikzeLimit);
          break;
        case 'THERMOMODERNIZATION':
          amount = Math.min(amount, config.thermomodernizationLimit);
          break;
        case 'REHABILITATION':
          break; // Use full amount (simplified)
        default:
          break;
      }

      total += amount;
    }

    return Math.min(total, incomeAfterZus);
  }

  /**
   * Auto-populate business income from KPiR data for a given year.
   */
  async getBusinessDataFromKPiR(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<{ income: number; costs: number }> {
    const aggregation = await this.prisma.kPiREntry.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
        isCorrection: false,
      },
      _sum: {
        totalRevenue: true,
        totalExpenses: true,
      },
    });

    return {
      income: Number(aggregation._sum.totalRevenue) || 0,
      costs: Number(aggregation._sum.totalExpenses) || 0,
    };
  }
}
