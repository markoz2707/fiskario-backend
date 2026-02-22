import { Injectable, Logger } from '@nestjs/common';
import {
  TaxFormType,
  ZusType,
  CompareFormsDto,
  TaxFormCalculation,
  ZusBreakdown,
  FormComparisonResult,
} from '../dto/tax-optimization.dto';

/**
 * Polish tax constants for 2024-2026.
 * Sources: MF.gov.pl, ZUS.pl
 */
interface TaxConstants {
  // Skala podatkowa (PIT-36)
  skalaFirstBracketRate: number;
  skalaSecondBracketRate: number;
  skalaBracketThreshold: number;
  skalaKwotaWolna: number;
  skalaKwotaZmniejszajaca: number;

  // Liniowy (PIT-36L)
  liniowyRate: number;
  liniowyZdrowotnaDeductionLimit: number;

  // ZUS bases
  zusDuzyBasis: number;
  zusPreferencyjnyBasis: number;

  // ZUS rates (spoleczne)
  zusEmerytalnaRate: number;
  zusRentowaRate: number;
  zusChorobowaRate: number;
  zusWypadkowaRate: number;
  zusFunduszPracyRate: number;

  // ZUS zdrowotna
  zusZdrowotnaSkalaRate: number;
  zusZdrowotnaLiniowyRate: number;
  zusZdrowotnaLiniowyMinMonthly: number;

  // Ryczalt zdrowotna thresholds
  ryczaltZdrowotnaThresholds: Array<{
    maxRevenue: number;
    basisPercent: number;
  }>;
  przecietneWynagrodzenie: number;
  zusZdrowotnaRate: number;

  // Child tax credit (ulga na dzieci) per child per month
  childCreditPerChild: number[];

  // Max internet deduction
  maxInternetDeduction: number;

  // EUR exchange rate for thresholds
  eurRate: number;
}

@Injectable()
export class FormComparisonService {
  private readonly logger = new Logger(FormComparisonService.name);

  /**
   * Tax constants indexed by year. Covers 2024-2026.
   */
  private getConstants(year: number): TaxConstants {
    // Base constants for 2024-2026 (largely stable since 2022 "Polski Lad" reforms)
    const base: TaxConstants = {
      // Skala podatkowa
      skalaFirstBracketRate: 0.12,
      skalaSecondBracketRate: 0.32,
      skalaBracketThreshold: 120_000,
      skalaKwotaWolna: 30_000,
      skalaKwotaZmniejszajaca: 3_600, // 12% * 30000

      // Liniowy
      liniowyRate: 0.19,
      liniowyZdrowotnaDeductionLimit: 11_600,

      // ZUS bases (2024 values, updated below for 2025/2026)
      zusDuzyBasis: 4_694.40, // 60% prognozowanego wynagrodzenia 2024: 7824 * 0.6
      zusPreferencyjnyBasis: 1_272.60, // 30% minimalnego 2024: 4242 * 0.3

      // ZUS rates
      zusEmerytalnaRate: 0.1952,
      zusRentowaRate: 0.08,
      zusChorobowaRate: 0.0245,
      zusWypadkowaRate: 0.0167,
      zusFunduszPracyRate: 0.0245,

      // ZUS zdrowotna
      zusZdrowotnaSkalaRate: 0.09,
      zusZdrowotnaLiniowyRate: 0.049,
      zusZdrowotnaLiniowyMinMonthly: 314.10,

      // Ryczalt zdrowotna brackets
      ryczaltZdrowotnaThresholds: [
        { maxRevenue: 60_000, basisPercent: 0.60 },
        { maxRevenue: 300_000, basisPercent: 1.00 },
        { maxRevenue: Infinity, basisPercent: 1.80 },
      ],
      przecietneWynagrodzenie: 7_767.85, // Q4 2023 for 2024
      zusZdrowotnaRate: 0.09,

      // Ulga na dzieci (annual, per child) - up to 3 children same rate
      childCreditPerChild: [
        1_112.04, // 1st child
        1_112.04, // 2nd child
        2_000.04, // 3rd child
        2_700.00, // 4th+ child
      ],

      maxInternetDeduction: 760,

      eurRate: 4.60,
    };

    // Adjustments for 2025
    if (year >= 2025) {
      base.zusDuzyBasis = 5_203.80; // 60% prognozowanego 2025: 8673 * 0.6
      base.zusPreferencyjnyBasis = 1_399.80; // 30% minimalnego 2025: 4666 * 0.3
      base.przecietneWynagrodzenie = 8_673.00;
      base.zusZdrowotnaLiniowyMinMonthly = 314.10;
    }

    // Adjustments for 2026 (official)
    if (year >= 2026) {
      base.zusDuzyBasis = 5_525.40; // Official: 60% prognozowanego 2026
      base.zusPreferencyjnyBasis = 1_485.00; // Official: 30% minimalnego 2026
      base.przecietneWynagrodzenie = 9_209.00; // Official
      base.zusZdrowotnaLiniowyMinMonthly = 335.00; // Official
    }

    return base;
  }

  /**
   * Compare all three tax forms for the given scenario.
   */
  compareForms(dto: CompareFormsDto): FormComparisonResult {
    const year = dto.year || new Date().getFullYear();
    const zusType = dto.zusType || ZusType.DUZY;
    const ryczaltRate = dto.ryczaltRate || 8.5;
    const constants = this.getConstants(year);

    this.logger.log(
      `Comparing tax forms for revenue=${dto.annualRevenue}, costs=${dto.annualCosts}, year=${year}`,
    );

    const skala = this.calculateSkala(dto, constants, zusType);
    const liniowy = this.calculateLiniowy(dto, constants, zusType);
    const ryczalt = this.calculateRyczalt(dto, constants, zusType, ryczaltRate);

    const forms = [skala, liniowy, ryczalt];
    const cheapest = forms.reduce((prev, curr) =>
      curr.totalBurden < prev.totalBurden ? curr : prev,
    );
    const mostExpensive = forms.reduce((prev, curr) =>
      curr.totalBurden > prev.totalBurden ? curr : prev,
    );

    const recommendation = this.generateFormRecommendation(
      skala,
      liniowy,
      ryczalt,
      dto,
    );

    return {
      year,
      inputRevenue: dto.annualRevenue,
      inputCosts: dto.annualCosts,
      zusType,
      forms,
      cheapestForm: cheapest.formType,
      cheapestBurden: cheapest.totalBurden,
      savingsVsWorst: mostExpensive.totalBurden - cheapest.totalBurden,
      summary: {
        skala: {
          totalBurden: skala.totalBurden,
          netIncome: skala.netIncome,
          effectiveRate: skala.effectiveRate,
        },
        liniowy: {
          totalBurden: liniowy.totalBurden,
          netIncome: liniowy.netIncome,
          effectiveRate: liniowy.effectiveRate,
        },
        ryczalt: {
          totalBurden: ryczalt.totalBurden,
          netIncome: ryczalt.netIncome,
          effectiveRate: ryczalt.effectiveRate,
        },
      },
      recommendation,
      generatedAt: new Date(),
    };
  }

  // ============================================================
  // SKALA PODATKOWA (PIT-36)
  // ============================================================

  private calculateSkala(
    dto: CompareFormsDto,
    c: TaxConstants,
    zusType: ZusType,
  ): TaxFormCalculation {
    const zus = this.calculateZusSpoleczne(c, zusType);
    const annualZusSpoleczne = zus.spoleczneTotal;

    // Dochod z dzialalnosci
    const revenue = dto.annualRevenue;
    const costs = dto.annualCosts;
    const businessIncome = Math.max(0, revenue - costs);

    // ZUS spoleczne is deductible from income
    const incomeAfterZus = Math.max(0, businessIncome - annualZusSpoleczne);

    // ZUS zdrowotna (9% of income, NOT deductible on skala)
    const monthlyIncome = businessIncome / 12;
    const monthlyZdrowotna = Math.max(
      c.zusZdrowotnaSkalaRate * Math.max(monthlyIncome, 0),
      0,
    );
    const annualZdrowotna = monthlyZdrowotna * 12;

    zus.zdrowotna = annualZdrowotna;
    zus.zdrowotnaDeductible = 0; // NOT deductible on skala
    zus.total = annualZusSpoleczne + annualZdrowotna + zus.funduszPracy;
    zus.monthlyTotal = zus.total / 12;

    // Other deductions (from income)
    let otherDeductions = 0;
    const availableDeductions: string[] = [
      'Kwota wolna od podatku (30 000 PLN)',
      'Ulga na dzieci (od podatku)',
      'Ulga na internet (do 760 PLN)',
      'Ulga na darowizny',
      'IKZE',
      'Ulga termomodernizacyjna',
      'Ulga rehabilitacyjna',
    ];

    if (dto.internetDeduction) {
      otherDeductions += Math.min(dto.internetDeduction, c.maxInternetDeduction);
    }
    if (dto.donationsDeduction) {
      const maxDonation = incomeAfterZus * 0.06;
      otherDeductions += Math.min(dto.donationsDeduction, maxDonation);
    }
    if (dto.ikzeDeduction) {
      const maxIKZE = 9_388.80; // 2024-2026 limit
      otherDeductions += Math.min(dto.ikzeDeduction, maxIKZE);
    }
    if (dto.thermomodernizationDeduction) {
      const maxThermo = 53_000;
      otherDeductions += Math.min(
        dto.thermomodernizationDeduction,
        maxThermo,
      );
    }
    if (dto.rehabilitationDeduction) {
      otherDeductions += dto.rehabilitationDeduction;
    }

    // Employment income (if any) - combined taxation on skala
    const employmentIncome = dto.employmentIncome || 0;
    const employmentCosts = dto.employmentCosts || 0;
    const employmentProfit = Math.max(0, employmentIncome - employmentCosts);
    const employmentTaxPaid = dto.employmentTaxPaid || 0;

    // Combined income for skala
    const totalIncome = incomeAfterZus + employmentProfit;
    const taxBase = Math.max(
      0,
      Math.floor(totalIncome - otherDeductions),
    );

    // Tax calculation with progressive rates
    let taxCalculated: number;
    if (taxBase <= c.skalaBracketThreshold) {
      taxCalculated = taxBase * c.skalaFirstBracketRate;
    } else {
      taxCalculated =
        c.skalaBracketThreshold * c.skalaFirstBracketRate +
        (taxBase - c.skalaBracketThreshold) * c.skalaSecondBracketRate;
    }

    // Kwota zmniejszajaca podatek (effectively makes first 30k tax-free)
    taxCalculated = Math.max(0, taxCalculated - c.skalaKwotaZmniejszajaca);

    // Tax credits (ulga na dzieci - deducted from tax, not income)
    let taxCredits = 0;
    const childrenCount = dto.childrenCount || 0;
    if (childrenCount > 0) {
      for (let i = 0; i < childrenCount; i++) {
        const creditIndex = Math.min(i, c.childCreditPerChild.length - 1);
        taxCredits += c.childCreditPerChild[creditIndex];
      }
    }

    const taxDue = Math.max(0, Math.round(taxCalculated - taxCredits));
    const totalTax = Math.max(0, taxDue - employmentTaxPaid);

    const totalBurden = totalTax + zus.total;
    const netIncome = revenue - costs - totalBurden;
    const effectiveRate =
      revenue > 0 ? (totalBurden / revenue) * 100 : 0;

    const warnings: string[] = [];
    const notes: string[] = [];

    if (businessIncome > c.skalaBracketThreshold) {
      warnings.push(
        `Dochod (${businessIncome.toFixed(0)} PLN) przekracza prog ${c.skalaBracketThreshold} PLN - nadwyzka opodatkowana stawka 32%.`,
      );
    }

    if (childrenCount > 0 && taxCredits > taxCalculated) {
      notes.push(
        'Ulga na dzieci przekracza podatek - mozliwy zwrot roznic z ZUS/urzedu skarbowego.',
      );
    }

    if (dto.jointFiling && dto.spouseIncome !== undefined) {
      notes.push(
        'Wspolne rozliczenie z malzonkiem moze dodatkowo obnizyc podatek na skali podatkowej.',
      );
    }

    return {
      formType: TaxFormType.SKALA,
      formName: 'Skala podatkowa (PIT-36)',
      formDescription:
        'Progresywna: 12% do 120 000 PLN, 32% powyzej. Kwota wolna 30 000 PLN. Pelne odliczenia i ulgi.',

      revenue,
      costs,
      income: businessIncome,

      zusSpoleczneDeduction: annualZusSpoleczne,
      healthInsuranceDeduction: 0,
      otherDeductions,
      taxBase,

      taxCalculated,
      taxCredits,
      taxDue,

      zus,

      employmentIncome,
      employmentTaxPaid,

      totalTax,
      totalZus: zus.total,
      totalBurden,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      netIncome: Math.round(netIncome * 100) / 100,

      availableDeductions,
      warnings,
      notes,
    };
  }

  // ============================================================
  // PODATEK LINIOWY (PIT-36L)
  // ============================================================

  private calculateLiniowy(
    dto: CompareFormsDto,
    c: TaxConstants,
    zusType: ZusType,
  ): TaxFormCalculation {
    const zus = this.calculateZusSpoleczne(c, zusType);
    const annualZusSpoleczne = zus.spoleczneTotal;

    const revenue = dto.annualRevenue;
    const costs = dto.annualCosts;
    const businessIncome = Math.max(0, revenue - costs);

    // ZUS spoleczne deduction
    const incomeAfterZus = Math.max(0, businessIncome - annualZusSpoleczne);

    // ZUS zdrowotna (4.9% of income, partially deductible)
    const monthlyIncome = businessIncome / 12;
    const monthlyZdrowotna = Math.max(
      monthlyIncome * c.zusZdrowotnaLiniowyRate,
      c.zusZdrowotnaLiniowyMinMonthly,
    );
    const annualZdrowotna = monthlyZdrowotna * 12;
    const healthDeductible = Math.min(
      annualZdrowotna,
      c.liniowyZdrowotnaDeductionLimit,
    );

    zus.zdrowotna = annualZdrowotna;
    zus.zdrowotnaDeductible = healthDeductible;
    zus.total = annualZusSpoleczne + annualZdrowotna + zus.funduszPracy;
    zus.monthlyTotal = zus.total / 12;

    // Other deductions (limited on liniowy)
    let otherDeductions = 0;
    const availableDeductions: string[] = [
      'Skladka zdrowotna (do limitu 11 600 PLN)',
      'IKZE',
      'Ulga termomodernizacyjna',
      'Ulga rehabilitacyjna',
      'Ulga na darowizny (ograniczona)',
    ];

    if (dto.ikzeDeduction) {
      const maxIKZE = 9_388.80;
      otherDeductions += Math.min(dto.ikzeDeduction, maxIKZE);
    }
    if (dto.thermomodernizationDeduction) {
      const maxThermo = 53_000;
      otherDeductions += Math.min(
        dto.thermomodernizationDeduction,
        maxThermo,
      );
    }
    if (dto.rehabilitationDeduction) {
      otherDeductions += dto.rehabilitationDeduction;
    }
    if (dto.donationsDeduction) {
      const maxDonation = incomeAfterZus * 0.06;
      otherDeductions += Math.min(dto.donationsDeduction, maxDonation);
    }

    // Employment income is taxed separately on skala (not combined with liniowy)
    const employmentIncome = dto.employmentIncome || 0;
    const employmentTaxPaid = dto.employmentTaxPaid || 0;

    // Tax base for liniowy (business only, no kwota wolna)
    const taxBase = Math.max(
      0,
      Math.floor(incomeAfterZus - healthDeductible - otherDeductions),
    );

    const taxCalculated = taxBase * c.liniowyRate;
    const taxCredits = 0; // No child credit on liniowy

    const taxDue = Math.max(0, Math.round(taxCalculated));

    // If employment income exists, that tax is handled separately
    const totalTax = taxDue;
    const totalBurden = totalTax + zus.total;
    const netIncome = revenue - costs - totalBurden;
    const effectiveRate =
      revenue > 0 ? (totalBurden / revenue) * 100 : 0;

    const warnings: string[] = [];
    const notes: string[] = [];

    notes.push('Brak kwoty wolnej od podatku.');
    notes.push('Brak mozliwosci rozliczenia ulgi na dzieci.');

    if (dto.childrenCount && dto.childrenCount > 0) {
      warnings.push(
        `Utracisz ulge na ${dto.childrenCount} dzieci - dostepna tylko na skali podatkowej.`,
      );
    }

    if (dto.jointFiling) {
      warnings.push(
        'Brak mozliwosci wspolnego rozliczenia z malzonkiem na podatku liniowym.',
      );
    }

    if (employmentIncome > 0) {
      notes.push(
        `Dochod z etatu (${employmentIncome.toFixed(0)} PLN) jest rozliczany oddzielnie na skali podatkowej.`,
      );
    }

    return {
      formType: TaxFormType.LINIOWY,
      formName: 'Podatek liniowy (PIT-36L)',
      formDescription:
        'Stala stawka 19%. Skladka zdrowotna 4.9% (odliczalna do 11 600 PLN). Brak kwoty wolnej i ulgi na dzieci.',

      revenue,
      costs,
      income: businessIncome,

      zusSpoleczneDeduction: annualZusSpoleczne,
      healthInsuranceDeduction: healthDeductible,
      otherDeductions,
      taxBase,

      taxCalculated,
      taxCredits,
      taxDue,

      zus,

      employmentIncome,
      employmentTaxPaid,

      totalTax,
      totalZus: zus.total,
      totalBurden,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      netIncome: Math.round(netIncome * 100) / 100,

      availableDeductions,
      warnings,
      notes,
    };
  }

  // ============================================================
  // RYCZALT (PIT-28)
  // ============================================================

  private calculateRyczalt(
    dto: CompareFormsDto,
    c: TaxConstants,
    zusType: ZusType,
    ryczaltRate: number,
  ): TaxFormCalculation {
    const zus = this.calculateZusSpoleczne(c, zusType);
    const annualZusSpoleczne = zus.spoleczneTotal;

    const revenue = dto.annualRevenue;
    const costs = dto.annualCosts; // Not deductible on ryczalt, but tracked for comparison

    // ZUS zdrowotna for ryczalt - depends on revenue thresholds
    let zdrowotnaMonthlyBasis: number;
    const threshold = c.ryczaltZdrowotnaThresholds.find(
      (t) => revenue <= t.maxRevenue,
    );
    if (threshold) {
      zdrowotnaMonthlyBasis =
        c.przecietneWynagrodzenie * threshold.basisPercent;
    } else {
      zdrowotnaMonthlyBasis =
        c.przecietneWynagrodzenie *
        c.ryczaltZdrowotnaThresholds[c.ryczaltZdrowotnaThresholds.length - 1]
          .basisPercent;
    }
    const monthlyZdrowotna = zdrowotnaMonthlyBasis * c.zusZdrowotnaRate;
    const annualZdrowotna = monthlyZdrowotna * 12;

    // Ryczalt health insurance can be partially deducted (50%)
    const healthDeductible = annualZdrowotna * 0.5;

    zus.zdrowotna = annualZdrowotna;
    zus.zdrowotnaDeductible = healthDeductible;
    zus.total = annualZusSpoleczne + annualZdrowotna + zus.funduszPracy;
    zus.monthlyTotal = zus.total / 12;

    // Deductions from revenue
    let otherDeductions = 0;
    const availableDeductions: string[] = [
      'Skladki ZUS spoleczne (od przychodu)',
      'Skladka zdrowotna (50% od przychodu)',
      'IKZE (ograniczone)',
      'Ulga termomodernizacyjna',
    ];

    if (dto.ikzeDeduction) {
      const maxIKZE = 9_388.80;
      otherDeductions += Math.min(dto.ikzeDeduction, maxIKZE);
    }
    if (dto.thermomodernizationDeduction) {
      const maxThermo = 53_000;
      otherDeductions += Math.min(
        dto.thermomodernizationDeduction,
        maxThermo,
      );
    }

    // Tax base for ryczalt = revenue - ZUS spoleczne - health deductible - deductions
    const taxBase = Math.max(
      0,
      Math.floor(revenue - annualZusSpoleczne - healthDeductible - otherDeductions),
    );

    const taxCalculated = taxBase * (ryczaltRate / 100);
    const taxCredits = 0; // Very limited credits on ryczalt
    const taxDue = Math.max(0, Math.round(taxCalculated));

    const employmentIncome = dto.employmentIncome || 0;
    const employmentTaxPaid = dto.employmentTaxPaid || 0;

    const totalTax = taxDue;
    const totalBurden = totalTax + zus.total;
    // For ryczalt comparison we compute netIncome as: revenue - actual costs - totalBurden
    // Even though costs are not tax-deductible, they still represent real expenses
    const netIncome = revenue - costs - totalBurden;
    const effectiveRate =
      revenue > 0 ? (totalBurden / revenue) * 100 : 0;

    const warnings: string[] = [];
    const notes: string[] = [];

    notes.push(
      `Stawka ryczaltu: ${ryczaltRate}%. Koszty (${costs.toFixed(0)} PLN) NIE sa odliczalne.`,
    );
    notes.push('Brak kwoty wolnej od podatku.');
    notes.push('Brak ulgi na dzieci.');

    if (costs > revenue * 0.3) {
      warnings.push(
        `Wysokie koszty (${((costs / revenue) * 100).toFixed(1)}% przychodu) - ryczalt moze byc niekorzystny, bo koszty nie sa odliczalne.`,
      );
    }

    if (dto.childrenCount && dto.childrenCount > 0) {
      warnings.push(
        `Utracisz ulge na ${dto.childrenCount} dzieci - dostepna tylko na skali podatkowej.`,
      );
    }

    if (revenue > 2_000_000 * c.eurRate) {
      warnings.push(
        `Przychod przekracza limit ryczaltu (2 000 000 EUR = ~${(2_000_000 * c.eurRate).toFixed(0)} PLN). Ryczalt niedostepny!`,
      );
    }

    if (employmentIncome > 0) {
      notes.push(
        `Dochod z etatu (${employmentIncome.toFixed(0)} PLN) jest rozliczany oddzielnie na skali podatkowej.`,
      );
    }

    return {
      formType: TaxFormType.RYCZALT,
      formName: `Ryczalt ${ryczaltRate}% (PIT-28)`,
      formDescription: `Podatek ${ryczaltRate}% od przychodu. Brak odliczenia kosztow. Skladka zdrowotna zalezna od progow przychodu.`,

      revenue,
      costs,
      income: revenue, // For ryczalt, "income" is revenue (no cost deduction)

      zusSpoleczneDeduction: annualZusSpoleczne,
      healthInsuranceDeduction: healthDeductible,
      otherDeductions,
      taxBase,

      taxCalculated,
      taxCredits,
      taxDue,

      zus,

      employmentIncome,
      employmentTaxPaid,

      totalTax,
      totalZus: zus.total,
      totalBurden,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      netIncome: Math.round(netIncome * 100) / 100,

      availableDeductions,
      warnings,
      notes,
    };
  }

  // ============================================================
  // ZUS SPOLECZNE (common for all forms)
  // ============================================================

  calculateZusSpoleczne(c: TaxConstants, zusType: ZusType): ZusBreakdown {
    let basis: number;
    switch (zusType) {
      case ZusType.PREFERENCYJNY:
        basis = c.zusPreferencyjnyBasis;
        break;
      case ZusType.MALY_ZUS_PLUS:
        // Maly ZUS Plus - simplified: use 50% of duzy basis
        basis = c.zusDuzyBasis * 0.5;
        break;
      case ZusType.DUZY:
      default:
        basis = c.zusDuzyBasis;
        break;
    }

    const monthlyEmerytalna = basis * c.zusEmerytalnaRate;
    const monthlyRentowa = basis * c.zusRentowaRate;
    const monthlyChorobowa = basis * c.zusChorobowaRate;
    const monthlyWypadkowa = basis * c.zusWypadkowaRate;
    const monthlyFunduszPracy =
      zusType === ZusType.PREFERENCYJNY ? 0 : basis * c.zusFunduszPracyRate;

    const monthlySpoleczne =
      monthlyEmerytalna + monthlyRentowa + monthlyChorobowa + monthlyWypadkowa;

    return {
      emerytalna: Math.round(monthlyEmerytalna * 12 * 100) / 100,
      rentowa: Math.round(monthlyRentowa * 12 * 100) / 100,
      chorobowa: Math.round(monthlyChorobowa * 12 * 100) / 100,
      wypadkowa: Math.round(monthlyWypadkowa * 12 * 100) / 100,
      spoleczneTotal: Math.round(monthlySpoleczne * 12 * 100) / 100,
      zdrowotna: 0, // Set by each form's calculation
      zdrowotnaDeductible: 0, // Set by each form's calculation
      funduszPracy: Math.round(monthlyFunduszPracy * 12 * 100) / 100,
      total: 0, // Set after zdrowotna calculation
      monthlyTotal: 0, // Set after zdrowotna calculation
      basis: Math.round(basis * 100) / 100,
      zusType,
    };
  }

  // ============================================================
  // RECOMMENDATION GENERATION
  // ============================================================

  private generateFormRecommendation(
    skala: TaxFormCalculation,
    liniowy: TaxFormCalculation,
    ryczalt: TaxFormCalculation,
    dto: CompareFormsDto,
  ): string {
    const forms = [
      { calc: skala, name: 'skala podatkowa' },
      { calc: liniowy, name: 'podatek liniowy' },
      { calc: ryczalt, name: 'ryczalt' },
    ];

    forms.sort((a, b) => a.calc.totalBurden - b.calc.totalBurden);
    const best = forms[0];
    const worst = forms[forms.length - 1];
    const savings = worst.calc.totalBurden - best.calc.totalBurden;

    let recommendation = `Najkorzystniejsza forma: ${best.name.toUpperCase()} `;
    recommendation += `(obciazenie: ${best.calc.totalBurden.toFixed(2)} PLN, `;
    recommendation += `stawka efektywna: ${best.calc.effectiveRate.toFixed(1)}%). `;
    recommendation += `Oszczednosc wobec najdrozszej formy (${worst.name}): ${savings.toFixed(2)} PLN rocznie.`;

    if (dto.childrenCount && dto.childrenCount > 0 && best.calc.formType !== TaxFormType.SKALA) {
      const childSavings = skala.taxCredits;
      if (childSavings > 0) {
        recommendation += ` UWAGA: Ulga na dzieci (${childSavings.toFixed(0)} PLN) dostepna tylko na skali - warto rozwazyc.`;
      }
    }

    const costRatio = dto.annualCosts / dto.annualRevenue;
    if (costRatio > 0.4 && best.calc.formType === TaxFormType.RYCZALT) {
      recommendation += ` UWAGA: Przy kosztach stanowiacych ${(costRatio * 100).toFixed(0)}% przychodu, ryczalt moze nie byc optymalny w praktyce.`;
    }

    return recommendation;
  }
}
