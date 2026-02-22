import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTaxConfig, roundToFullPLN, roundToGrosze, YearTaxConfig } from './tax-config';

export interface PIT36Input {
  year: number;
  businessIncome: number;
  businessCosts: number;
  employmentIncome: number;
  employmentCosts: number;
  employmentTaxPaid: number;
  zusDeduction: number;
  healthDeduction: number;
  advancesPaid: number; // Zaliczki JDG
  jointFiling: boolean;
  spouseIncome?: number;
  spouseCosts?: number;
  spouseTaxAdvances?: number;
  deductions: {
    fromIncome: Array<{ type: string; amount: number; childMonths?: number }>;
    fromTax: Array<{ type: string; amount: number; childMonths?: number }>;
  };
}

export interface PIT36Result {
  businessProfit: number;
  employmentProfit: number;
  totalIncome: number;
  incomeAfterZus: number;
  deductionsFromIncome: number;
  taxBase: number;
  taxCalculated: number;
  taxCredits: number;
  taxDue: number;
  advancesPaid: number;
  finalAmount: number;
  effectiveRate: number;
  breakdown: {
    bracket1Tax: number;
    bracket2Tax: number;
    reductionAmount: number;
    childReliefTotal: number;
    healthDeduction: number;
    otherDeductionsFromIncome: number;
    otherCreditsFromTax: number;
  };
}

@Injectable()
export class PIT36CalculationService {
  private readonly logger = new Logger(PIT36CalculationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate PIT-36 (skala podatkowa) annual tax.
   *
   * Algorithm:
   * 1. DOCHOD = Przychod_JDG - Koszty_JDG + Przychod_etat - Koszty_etat
   * 2. DOCHOD_PO_ZUS = DOCHOD - skladki_spoleczne
   * 3. PODSTAWA = DOCHOD_PO_ZUS - ulgi_od_dochodu
   * 4. Zaokraglenie do pelnych zlotych
   * 5. PODATEK wg skali: 12% do 120k, 32% powyzej; minus kwota zmniejszajaca 3600 PLN
   * 6. PODATEK_PO_ULGACH = PODATEK - ulgi_od_podatku (dzieci, zdrowotna)
   * 7. DO_ZAPLATY = PODATEK_PO_ULGACH - zaliczki_jdg - zaliczki_etat
   *
   * Wspolne rozliczenie: policz podatek od (dochod/2), pomnoz x2
   */
  calculate(input: PIT36Input): PIT36Result {
    const config = getTaxConfig(input.year);
    this.logger.debug(`Calculating PIT-36 for year ${input.year}`);

    // Step 1: Calculate profits
    const businessProfit = Math.max(0, input.businessIncome - input.businessCosts);
    const employmentProfit = Math.max(0, input.employmentIncome - input.employmentCosts);
    const totalIncome = businessProfit + employmentProfit;

    // Step 2: Subtract ZUS social contributions
    const incomeAfterZus = Math.max(0, totalIncome - input.zusDeduction);

    // Step 3: Subtract deductions from income
    const deductionsFromIncome = this.calculateDeductionsFromIncome(
      input.deductions.fromIncome,
      incomeAfterZus,
      config,
    );
    const taxBaseRaw = Math.max(0, incomeAfterZus - deductionsFromIncome);

    // Step 4: Round to full PLN
    const taxBase = roundToFullPLN(taxBaseRaw);

    // Step 5: Calculate tax on scale
    let taxCalculated: number;
    let bracket1Tax: number;
    let bracket2Tax: number;
    const reductionAmount = config.scale.reductionAmount;

    if (input.jointFiling) {
      // Joint filing: calculate on half income, multiply by 2
      const jointIncome = taxBase + (input.spouseIncome || 0) - (input.spouseCosts || 0);
      const halfIncome = roundToFullPLN(Math.max(0, jointIncome / 2));
      const halfResult = this.calculateScaleTax(halfIncome, config);
      taxCalculated = roundToGrosze(halfResult.total * 2);
      bracket1Tax = roundToGrosze(halfResult.bracket1 * 2);
      bracket2Tax = roundToGrosze(halfResult.bracket2 * 2);
    } else {
      const result = this.calculateScaleTax(taxBase, config);
      taxCalculated = roundToGrosze(result.total);
      bracket1Tax = roundToGrosze(result.bracket1);
      bracket2Tax = roundToGrosze(result.bracket2);
    }

    // Step 6: Subtract credits from tax (ulgi od podatku)
    const childReliefTotal = this.calculateChildRelief(input.deductions.fromTax, config);
    const healthDed = roundToGrosze(input.healthDeduction);
    const otherCreditsFromTax = this.calculateOtherTaxCredits(input.deductions.fromTax);

    const taxCredits = roundToGrosze(childReliefTotal + healthDed + otherCreditsFromTax);
    const taxDue = roundToFullPLN(Math.max(0, taxCalculated - taxCredits));

    // Step 7: Calculate final amount (do zaplaty / nadplata)
    const totalAdvances = roundToGrosze(
      input.advancesPaid + input.employmentTaxPaid + (input.spouseTaxAdvances || 0),
    );
    const finalAmount = roundToFullPLN(taxDue - totalAdvances);

    // Effective rate
    const effectiveRate = totalIncome > 0 ? roundToGrosze((taxDue / totalIncome) * 100) : 0;

    return {
      businessProfit,
      employmentProfit,
      totalIncome,
      incomeAfterZus,
      deductionsFromIncome,
      taxBase,
      taxCalculated,
      taxCredits,
      taxDue,
      advancesPaid: totalAdvances,
      finalAmount,
      effectiveRate,
      breakdown: {
        bracket1Tax,
        bracket2Tax,
        reductionAmount,
        childReliefTotal,
        healthDeduction: healthDed,
        otherDeductionsFromIncome: deductionsFromIncome,
        otherCreditsFromTax,
      },
    };
  }

  /**
   * Calculate progressive tax on the scale (skala podatkowa).
   */
  private calculateScaleTax(
    taxBase: number,
    config: YearTaxConfig,
  ): { total: number; bracket1: number; bracket2: number } {
    const brackets = config.scale.brackets;
    let bracket1 = 0;
    let bracket2 = 0;

    for (const bracket of brackets) {
      const taxableInBracket = Math.max(
        0,
        Math.min(taxBase, bracket.to) - bracket.from,
      );
      const taxInBracket = taxableInBracket * bracket.rate;

      if (bracket.rate === brackets[0].rate) {
        bracket1 = taxInBracket;
      } else {
        bracket2 = taxInBracket;
      }
    }

    const grossTax = bracket1 + bracket2;
    // Subtract the reduction amount (kwota zmniejszajaca podatek)
    const total = Math.max(0, grossTax - config.scale.reductionAmount);

    return { total, bracket1, bracket2 };
  }

  /**
   * Calculate deductions from income (ulgi od dochodu).
   * Applies limits per deduction type.
   */
  private calculateDeductionsFromIncome(
    deductions: Array<{ type: string; amount: number }>,
    incomeAfterZus: number,
    config: YearTaxConfig,
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
          // Max 6% of income
          amount = Math.min(amount, incomeAfterZus * config.donationLimit);
          break;
        case 'IKZE':
          amount = Math.min(amount, config.ikzeLimit);
          break;
        case 'THERMOMODERNIZATION':
          amount = Math.min(amount, config.thermomodernizationLimit);
          break;
        case 'REHABILITATION':
          // The limit applies per specific sub-type, simplified here
          break;
        default:
          // OTHER - use full amount
          break;
      }

      total += amount;
    }

    // Total deductions cannot exceed income
    return Math.min(total, incomeAfterZus);
  }

  /**
   * Calculate child relief (ulga na dzieci).
   * Per child: 1st=1112.04, 2nd=2000.04, 3rd+=2700.00 (annual, full 12 months).
   * Prorated by months of care.
   */
  private calculateChildRelief(
    deductions: Array<{ type: string; amount: number; childMonths?: number }>,
    config: YearTaxConfig,
  ): number {
    const childDeductions = deductions.filter((d) => d.type === 'CHILD_RELIEF');
    if (childDeductions.length === 0) return 0;

    // Sort by amount to determine child order (or use provided amounts directly)
    let total = 0;
    const childCount = childDeductions.length;

    for (let i = 0; i < childCount; i++) {
      const months = childDeductions[i].childMonths || 12;
      const monthFraction = months / 12;
      let annualRelief: number;

      if (i === 0 && childCount === 1) {
        // Only 1 child - income limit applies, use config.childRelief.one
        annualRelief = config.childRelief.one;
      } else if (i === 0) {
        annualRelief = config.childRelief.one;
      } else if (i === 1) {
        annualRelief = config.childRelief.two;
      } else {
        // 3rd child and beyond
        annualRelief = config.childRelief.three;
      }

      total += roundToGrosze(annualRelief * monthFraction);
    }

    return roundToGrosze(total);
  }

  /**
   * Calculate other tax credits (not child relief or health).
   */
  private calculateOtherTaxCredits(
    deductions: Array<{ type: string; amount: number }>,
  ): number {
    return deductions
      .filter((d) => d.type !== 'CHILD_RELIEF' && d.type !== 'HEALTH_INSURANCE')
      .reduce((sum, d) => sum + d.amount, 0);
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

  /**
   * Auto-populate employment income from EmploymentIncome records.
   */
  async getEmploymentData(
    tenantId: string,
    companyId: string,
    userId: string,
    year: number,
  ): Promise<{
    income: number;
    costs: number;
    taxPaid: number;
    zusSocial: number;
    zusHealth: number;
  }> {
    const records = await this.prisma.employmentIncome.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        year,
      },
    });

    return records.reduce(
      (acc, r) => ({
        income: acc.income + r.grossIncome,
        costs: acc.costs + r.taxDeductibleCosts,
        taxPaid: acc.taxPaid + r.taxAdvancePaid,
        zusSocial:
          acc.zusSocial + r.zusEmerytalnaEmpl + r.zusRentowaEmpl + r.zusChorobowaEmpl,
        zusHealth: acc.zusHealth + r.zusHealthEmpl,
      }),
      { income: 0, costs: 0, taxPaid: 0, zusSocial: 0, zusHealth: 0 },
    );
  }
}
