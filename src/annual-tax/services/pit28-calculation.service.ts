import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTaxConfig, roundToFullPLN, roundToGrosze, YearTaxConfig } from './tax-config';

export interface PIT28Input {
  year: number;
  ryczaltRevenue: number;          // Przychod brutto
  ryczaltRateType: string;         // Typ stawki (IT, RENT, TRADE, etc.)
  ryczaltRate?: number;            // Opcjonalna reczna stawka
  zusDeduction: number;            // Skladki spoleczne (odliczane od przychodu)
  healthInsurancePaid: number;     // Skladka zdrowotna zaplacona
  advancesPaid: number;            // Zaliczki na ryczalt
  deductions: {
    fromIncome: Array<{ type: string; amount: number }>;
    // PIT-28 has very limited deductions
  };
}

export interface PIT28Result {
  ryczaltRevenue: number;
  ryczaltRate: number;
  revenueAfterDeductions: number;
  zusDeduction: number;
  healthDeduction: number;
  otherDeductions: number;
  taxBase: number;
  ryczaltTax: number;
  taxDue: number;
  advancesPaid: number;
  finalAmount: number;
  effectiveRate: number;
  breakdown: {
    ryczaltRateType: string;
    ryczaltRateApplied: number;
    healthMonthlyBase: number;
    healthAnnualAmount: number;
    healthDeductionApplied: number;
  };
}

@Injectable()
export class PIT28CalculationService {
  private readonly logger = new Logger(PIT28CalculationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate PIT-28 (ryczalt od przychodow ewidencjonowanych) annual tax.
   *
   * Algorithm:
   * 1. PRZYCHOD - skladki_spoleczne - ulgi_od_przychodu = PODSTAWA
   * 2. PODATEK = PODSTAWA * stawka_ryczaltu
   * 3. Brak kosztow uzyskania, brak kwoty wolnej, ograniczone ulgi
   * 4. ZUS zdrowotna: 9% * (60%/100%/180% przecietnego wynagrodzenia wg progu przychodu)
   * 5. Zdrowotna odliczalna: 50% zaplaconej (od 2022)
   * 6. DO_ZAPLATY = PODATEK - 50% zdrowotnej - zaliczki
   */
  calculate(input: PIT28Input): PIT28Result {
    const config = getTaxConfig(input.year);
    this.logger.debug(`Calculating PIT-28 for year ${input.year}`);

    // Step 1: Determine ryczalt rate
    const ryczaltRate = input.ryczaltRate || this.getRateByType(input.ryczaltRateType, config);

    // Step 2: Deductions from revenue (limited set for ryczalt)
    const otherDeductions = this.calculateDeductionsFromRevenue(
      input.deductions.fromIncome,
      input.ryczaltRevenue,
      config,
    );

    // Step 3: Revenue after ZUS and deductions
    const revenueAfterDeductions = Math.max(
      0,
      input.ryczaltRevenue - input.zusDeduction - otherDeductions,
    );

    // Step 4: Round to full PLN
    const taxBase = roundToFullPLN(revenueAfterDeductions);

    // Step 5: Calculate ryczalt tax
    const ryczaltTax = roundToGrosze(taxBase * ryczaltRate);

    // Step 6: Health insurance deduction (50% of paid, for ryczalt)
    const healthThreshold = this.getHealthThreshold(input.ryczaltRevenue, config);
    const healthAnnualAmount = roundToGrosze(healthThreshold.base * healthThreshold.rate * 12);
    const healthDeduction = roundToGrosze(Math.min(
      input.healthInsurancePaid * 0.5,
      healthAnnualAmount * 0.5,
    ));

    // Step 7: Tax due
    const taxDue = roundToFullPLN(Math.max(0, ryczaltTax - healthDeduction));

    // Step 8: Final amount
    const finalAmount = roundToFullPLN(taxDue - input.advancesPaid);

    // Effective rate
    const effectiveRate =
      input.ryczaltRevenue > 0
        ? roundToGrosze((taxDue / input.ryczaltRevenue) * 100)
        : 0;

    return {
      ryczaltRevenue: input.ryczaltRevenue,
      ryczaltRate,
      revenueAfterDeductions,
      zusDeduction: input.zusDeduction,
      healthDeduction,
      otherDeductions,
      taxBase,
      ryczaltTax,
      taxDue,
      advancesPaid: input.advancesPaid,
      finalAmount,
      effectiveRate,
      breakdown: {
        ryczaltRateType: input.ryczaltRateType,
        ryczaltRateApplied: ryczaltRate,
        healthMonthlyBase: healthThreshold.base,
        healthAnnualAmount,
        healthDeductionApplied: healthDeduction,
      },
    };
  }

  /**
   * Get ryczalt rate by business type.
   */
  private getRateByType(rateType: string, config: YearTaxConfig): number {
    const rateMap: Record<string, number> = {
      IT: config.ryczaltRates.it,
      FREE_PROFESSIONS: config.ryczaltRates.freeProfessions,
      RENT: config.ryczaltRates.rent,
      TRADE: config.ryczaltRates.trade,
      PRODUCTION: config.ryczaltRates.production,
      SERVICES: config.ryczaltRates.services,
      GASTRONOMY: config.ryczaltRates.gastronomy,
      CONSTRUCTION: config.ryczaltRates.construction,
      HEALTH_SERVICES: config.ryczaltRates.healthServices,
      RENT_HIGH: config.ryczaltRates.rentHigh,
    };

    return rateMap[rateType] || config.ryczaltRates.services; // Default to services rate
  }

  /**
   * Get health insurance threshold for ryczalt based on revenue level.
   * 3 tiers based on annual revenue:
   * - up to 60 000 PLN: 60% of average salary
   * - 60 001 - 300 000 PLN: 100% of average salary
   * - above 300 000 PLN: 180% of average salary
   */
  private getHealthThreshold(
    annualRevenue: number,
    config: YearTaxConfig,
  ): { base: number; rate: number } {
    const thresholds = config.health.ryczaltThresholds;

    if (annualRevenue <= thresholds.low.maxRevenue) {
      return { base: thresholds.low.base, rate: thresholds.low.rate };
    } else if (annualRevenue <= thresholds.mid.maxRevenue) {
      return { base: thresholds.mid.base, rate: thresholds.mid.rate };
    } else {
      return { base: thresholds.high.base, rate: thresholds.high.rate };
    }
  }

  /**
   * Calculate limited deductions from revenue for PIT-28.
   * PIT-28 supports: internet, donations, IKZE, thermomodernization, rehabilitation.
   * Does NOT support: child relief, kwota wolna, koszty uzyskania.
   */
  private calculateDeductionsFromRevenue(
    deductions: Array<{ type: string; amount: number }>,
    revenue: number,
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
          amount = Math.min(amount, revenue * config.donationLimit);
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

    return Math.min(total, revenue);
  }
}
