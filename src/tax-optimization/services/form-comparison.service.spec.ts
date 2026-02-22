import { Test, TestingModule } from '@nestjs/testing';
import { FormComparisonService } from './form-comparison.service';
import {
  CompareFormsDto,
  TaxFormType,
  ZusType,
} from '../dto/tax-optimization.dto';

describe('FormComparisonService', () => {
  let service: FormComparisonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FormComparisonService],
    }).compile();

    service = module.get<FormComparisonService>(FormComparisonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Helper to create a minimal CompareFormsDto with sensible defaults.
   */
  function createDto(overrides: Partial<CompareFormsDto> = {}): CompareFormsDto {
    const dto = new CompareFormsDto();
    dto.annualRevenue = 100_000;
    dto.annualCosts = 30_000;
    dto.year = 2024;
    dto.zusType = ZusType.DUZY;
    Object.assign(dto, overrides);
    return dto;
  }

  // =============================================================
  // Test 1: Low income (50k) -> skala should be cheapest
  // =============================================================
  describe('low income scenario (50k revenue, 15k costs)', () => {
    it('should recommend skala as cheapest form for low income', () => {
      const dto = createDto({
        annualRevenue: 50_000,
        annualCosts: 15_000,
      });

      const result = service.compareForms(dto);

      // With income of 35k, skala benefits from kwota wolna (30k tax-free)
      // Skala: taxBase ~ 35k - ZUS. 12% on income minus kwota zmniejszajaca (3,600)
      // Liniowy: 19% flat, no kwota wolna
      // For low income, skala should win
      expect(result.cheapestForm).toBe(TaxFormType.SKALA);
    });

    it('should have skala total burden less than liniowy', () => {
      const dto = createDto({
        annualRevenue: 50_000,
        annualCosts: 15_000,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);

      expect(skala).toBeDefined();
      expect(liniowy).toBeDefined();
      expect(skala!.totalBurden).toBeLessThan(liniowy!.totalBurden);
    });

    it('should calculate positive savings vs worst form', () => {
      const dto = createDto({
        annualRevenue: 50_000,
        annualCosts: 15_000,
      });

      const result = service.compareForms(dto);

      expect(result.savingsVsWorst).toBeGreaterThan(0);
    });

    it('should generate a recommendation string', () => {
      const dto = createDto({
        annualRevenue: 50_000,
        annualCosts: 15_000,
      });

      const result = service.compareForms(dto);

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(0);
      expect(result.recommendation).toContain('Najkorzystniejsza forma');
    });
  });

  // =============================================================
  // Test 2: High income (300k) -> liniowy should be cheapest
  // =============================================================
  describe('high income scenario (300k revenue, 50k costs)', () => {
    it('should recommend liniowy as cheapest form for high income', () => {
      const dto = createDto({
        annualRevenue: 300_000,
        annualCosts: 50_000,
      });

      const result = service.compareForms(dto);

      // Income = 250k, well above the 120k threshold
      // Skala: 12% on first 120k + 32% on rest = very high tax
      // Liniowy: flat 19% on everything (with health deduction)
      // For high income, liniowy should be cheaper than skala
      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);

      expect(skala).toBeDefined();
      expect(liniowy).toBeDefined();
      expect(liniowy!.totalBurden).toBeLessThan(skala!.totalBurden);
    });

    it('should show skala generating a warning about exceeding 120k threshold', () => {
      const dto = createDto({
        annualRevenue: 300_000,
        annualCosts: 50_000,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      expect(skala!.warnings.some((w) => w.includes('32%'))).toBe(true);
    });

    it('should apply health deduction limit for liniowy', () => {
      const dto = createDto({
        annualRevenue: 300_000,
        annualCosts: 50_000,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      // The health deduction should be capped at 11,600 PLN
      expect(liniowy!.healthInsuranceDeduction).toBeLessThanOrEqual(11_600);
    });
  });

  // =============================================================
  // Test 3: Correct ZUS calculations for each type
  // =============================================================
  describe('ZUS social contributions calculation', () => {
    it('should calculate ZUS duzy correctly', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 30_000,
        zusType: ZusType.DUZY,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();

      // ZUS duzy basis for 2024: 4,694.40
      // emerytalna: 4694.40 * 0.1952 * 12
      // rentowa: 4694.40 * 0.08 * 12
      // chorobowa: 4694.40 * 0.0245 * 12
      // wypadkowa: 4694.40 * 0.0167 * 12
      const basis = 4_694.40;
      const expectedEmerytalna = Math.round(basis * 0.1952 * 12 * 100) / 100;
      const expectedRentowa = Math.round(basis * 0.08 * 12 * 100) / 100;
      const expectedChorobowa = Math.round(basis * 0.0245 * 12 * 100) / 100;
      const expectedWypadkowa = Math.round(basis * 0.0167 * 12 * 100) / 100;

      expect(skala!.zus.emerytalna).toBeCloseTo(expectedEmerytalna, 2);
      expect(skala!.zus.rentowa).toBeCloseTo(expectedRentowa, 2);
      expect(skala!.zus.chorobowa).toBeCloseTo(expectedChorobowa, 2);
      expect(skala!.zus.wypadkowa).toBeCloseTo(expectedWypadkowa, 2);
      expect(skala!.zus.zusType).toBe(ZusType.DUZY);
      expect(skala!.zus.basis).toBeCloseTo(basis, 2);
    });

    it('should calculate ZUS preferencyjny with lower basis and no fundusz pracy', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 30_000,
        zusType: ZusType.PREFERENCYJNY,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();

      // Preferencyjny basis for 2024: 1,272.60
      expect(skala!.zus.basis).toBeCloseTo(1_272.60, 2);
      expect(skala!.zus.funduszPracy).toBe(0); // No fundusz pracy for preferencyjny
      expect(skala!.zus.zusType).toBe(ZusType.PREFERENCYJNY);
    });

    it('should calculate ZUS maly_zus_plus with 50% of duzy basis', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 30_000,
        zusType: ZusType.MALY_ZUS_PLUS,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();

      // Maly ZUS Plus basis: 50% of duzy = 4,694.40 * 0.5 = 2,347.20
      expect(skala!.zus.basis).toBeCloseTo(2_347.20, 2);
      expect(skala!.zus.zusType).toBe(ZusType.MALY_ZUS_PLUS);
    });

    it('should use same ZUS spoleczne across all three forms', () => {
      const dto = createDto({
        annualRevenue: 150_000,
        annualCosts: 40_000,
        zusType: ZusType.DUZY,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT);

      // ZUS spoleczne should be same across all forms
      expect(skala!.zus.spoleczneTotal).toBe(liniowy!.zus.spoleczneTotal);
      expect(liniowy!.zus.spoleczneTotal).toBe(ryczalt!.zus.spoleczneTotal);
    });

    it('should have different zdrowotna amounts across forms', () => {
      const dto = createDto({
        annualRevenue: 200_000,
        annualCosts: 50_000,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT);

      // Zdrowotna differs: skala 9%, liniowy 4.9%, ryczalt threshold-based
      expect(skala!.zus.zdrowotna).not.toBe(liniowy!.zus.zdrowotna);
      // Skala: zdrowotna is NOT deductible
      expect(skala!.zus.zdrowotnaDeductible).toBe(0);
      // Liniowy: zdrowotna IS partially deductible (up to 11,600)
      expect(liniowy!.zus.zdrowotnaDeductible).toBeGreaterThan(0);
    });

    it('should use 2025 ZUS constants when year is 2025', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 30_000,
        year: 2025,
        zusType: ZusType.DUZY,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();

      // 2025 duzy basis: 5,203.80
      expect(skala!.zus.basis).toBeCloseTo(5_203.80, 2);
    });
  });

  // =============================================================
  // Structure and metadata tests
  // =============================================================
  describe('result structure and metadata', () => {
    it('should return all three forms', () => {
      const dto = createDto();

      const result = service.compareForms(dto);

      expect(result.forms).toHaveLength(3);
      const formTypes = result.forms.map((f) => f.formType);
      expect(formTypes).toContain(TaxFormType.SKALA);
      expect(formTypes).toContain(TaxFormType.LINIOWY);
      expect(formTypes).toContain(TaxFormType.RYCZALT);
    });

    it('should include summary for all three forms', () => {
      const dto = createDto();

      const result = service.compareForms(dto);

      expect(result.summary.skala).toBeDefined();
      expect(result.summary.liniowy).toBeDefined();
      expect(result.summary.ryczalt).toBeDefined();
      expect(result.summary.skala.totalBurden).toBeGreaterThanOrEqual(0);
      expect(result.summary.liniowy.totalBurden).toBeGreaterThanOrEqual(0);
      expect(result.summary.ryczalt.totalBurden).toBeGreaterThanOrEqual(0);
    });

    it('should echo input revenue and costs', () => {
      const dto = createDto({
        annualRevenue: 180_000,
        annualCosts: 45_000,
      });

      const result = service.compareForms(dto);

      expect(result.inputRevenue).toBe(180_000);
      expect(result.inputCosts).toBe(45_000);
    });

    it('should set generatedAt date', () => {
      const dto = createDto();

      const result = service.compareForms(dto);

      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should default year to current year when not specified', () => {
      const dto = createDto();
      delete (dto as any).year;

      const result = service.compareForms(dto);

      expect(result.year).toBe(new Date().getFullYear());
    });

    it('should default zusType to DUZY when not specified', () => {
      const dto = createDto();
      delete (dto as any).zusType;

      const result = service.compareForms(dto);

      expect(result.zusType).toBe(ZusType.DUZY);
    });
  });

  // =============================================================
  // Ryczalt-specific tests
  // =============================================================
  describe('ryczalt calculation', () => {
    it('should use default 8.5% rate when ryczaltRate is not specified', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 30_000,
      });

      const result = service.compareForms(dto);

      const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT);
      expect(ryczalt).toBeDefined();
      expect(ryczalt!.formName).toContain('8.5');
    });

    it('should not deduct costs from revenue for tax base on ryczalt', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 50_000,
      });

      const result = service.compareForms(dto);

      const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT);
      expect(ryczalt).toBeDefined();
      // Revenue (income) is the full revenue, not profit
      expect(ryczalt!.income).toBe(100_000);
    });

    it('should warn about high costs making ryczalt unfavorable', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 40_000, // 40% cost ratio
      });

      const result = service.compareForms(dto);

      const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT);
      expect(ryczalt).toBeDefined();
      expect(ryczalt!.warnings.some((w) => w.toLowerCase().includes('koszty'))).toBe(true);
    });

    it('should use threshold-based zdrowotna for ryczalt', () => {
      const dto = createDto({
        annualRevenue: 50_000, // Below 60k threshold
        annualCosts: 10_000,
      });

      const result = service.compareForms(dto);

      const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT);
      expect(ryczalt).toBeDefined();
      // For revenue <= 60k, uses 60% of average salary as basis
      expect(ryczalt!.zus.zdrowotna).toBeGreaterThan(0);
    });
  });

  // =============================================================
  // Skala-specific tests
  // =============================================================
  describe('skala calculation', () => {
    it('should apply kwota zmniejszajaca (3,600 PLN) to skala tax', () => {
      const dto = createDto({
        annualRevenue: 80_000,
        annualCosts: 0,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      // taxCalculated should be less than raw 12% of taxBase because of kwota zmniejszajaca
      const rawTax = skala!.taxBase * 0.12;
      expect(skala!.taxCalculated).toBeLessThan(rawTax);
    });

    it('should include child tax credit on skala', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 20_000,
        childrenCount: 2,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      // 2 children: 1,112.04 + 1,112.04 = 2,224.08
      expect(skala!.taxCredits).toBeCloseTo(2_224.08, 2);
    });

    it('should not include child tax credit on liniowy', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 20_000,
        childrenCount: 2,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      expect(liniowy!.taxCredits).toBe(0);
    });

    it('should warn about losing child relief when liniowy is recommended with children', () => {
      const dto = createDto({
        annualRevenue: 400_000,
        annualCosts: 50_000,
        childrenCount: 2,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      expect(liniowy!.warnings.some((w) => w.includes('dzieci'))).toBe(true);
    });

    it('should not have health insurance deduction on skala', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 20_000,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      expect(skala!.healthInsuranceDeduction).toBe(0);
      expect(skala!.zus.zdrowotnaDeductible).toBe(0);
    });
  });

  // =============================================================
  // Liniowy-specific tests
  // =============================================================
  describe('liniowy calculation', () => {
    it('should include notes about no kwota wolna and no child relief', () => {
      const dto = createDto();

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      expect(liniowy!.notes.some((n) => n.includes('kwoty wolnej'))).toBe(true);
      expect(liniowy!.notes.some((n) => n.includes('dzieci'))).toBe(true);
    });

    it('should calculate liniowy health insurance at 4.9% of income', () => {
      const dto = createDto({
        annualRevenue: 200_000,
        annualCosts: 0,
        zusType: ZusType.DUZY,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();

      // Zdrowotna is 4.9% of monthly income (min threshold applies)
      // 200,000 / 12 = 16,666.67 monthly
      // 16,666.67 * 0.049 = 816.67 (above min 314.10)
      // Annual: 816.67 * 12 = 9,800
      expect(liniowy!.zus.zdrowotna).toBeCloseTo(9_800, 0);
    });

    it('should warn about no joint filing on liniowy', () => {
      const dto = createDto({
        jointFiling: true,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      expect(liniowy!.warnings.some((w) => w.includes('malzonkiem'))).toBe(true);
    });
  });

  // =============================================================
  // calculateZusSpoleczne (public method)
  // =============================================================
  describe('calculateZusSpoleczne', () => {
    it('should calculate correct breakdown for ZUS duzy', () => {
      const c = (service as any).getConstants(2024);
      const zus = service.calculateZusSpoleczne(c, ZusType.DUZY);

      const basis = 4_694.40;
      expect(zus.basis).toBeCloseTo(basis, 2);
      expect(zus.emerytalna).toBeCloseTo(basis * 0.1952 * 12, 0);
      expect(zus.rentowa).toBeCloseTo(basis * 0.08 * 12, 0);
      expect(zus.chorobowa).toBeCloseTo(basis * 0.0245 * 12, 0);
      expect(zus.wypadkowa).toBeCloseTo(basis * 0.0167 * 12, 0);
      expect(zus.funduszPracy).toBeGreaterThan(0);
      expect(zus.spoleczneTotal).toBeCloseTo(
        zus.emerytalna + zus.rentowa + zus.chorobowa + zus.wypadkowa,
        2,
      );
    });

    it('should set fundusz pracy to 0 for preferencyjny', () => {
      const c = (service as any).getConstants(2024);
      const zus = service.calculateZusSpoleczne(c, ZusType.PREFERENCYJNY);

      expect(zus.funduszPracy).toBe(0);
    });

    it('should have lower spoleczne for preferencyjny than duzy', () => {
      const c = (service as any).getConstants(2024);
      const zusDuzy = service.calculateZusSpoleczne(c, ZusType.DUZY);
      const zusPref = service.calculateZusSpoleczne(c, ZusType.PREFERENCYJNY);

      expect(zusPref.spoleczneTotal).toBeLessThan(zusDuzy.spoleczneTotal);
    });
  });

  // =============================================================
  // Edge cases and deductions
  // =============================================================
  describe('optional deductions', () => {
    it('should apply internet deduction capped at 760 PLN on skala', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 20_000,
        internetDeduction: 1_000,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      expect(skala!.otherDeductions).toBeLessThanOrEqual(760);
    });

    it('should apply IKZE deduction capped at limit', () => {
      const dto = createDto({
        annualRevenue: 200_000,
        annualCosts: 30_000,
        ikzeDeduction: 15_000,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      // IKZE 2024 limit: 9,388.80
      expect(liniowy!.otherDeductions).toBeLessThanOrEqual(9_388.80);
    });
  });

  describe('employment income', () => {
    it('should add employment income to skala tax base', () => {
      const dto = createDto({
        annualRevenue: 80_000,
        annualCosts: 20_000,
        employmentIncome: 60_000,
        employmentCosts: 3_000,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      expect(skala!.employmentIncome).toBe(60_000);
      // Employment profit (57k) is combined with business income on skala
    });

    it('should note separate employment taxation on liniowy', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 20_000,
        employmentIncome: 50_000,
      });

      const result = service.compareForms(dto);

      const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY);
      expect(liniowy).toBeDefined();
      expect(liniowy!.notes.some((n) => n.includes('etatu'))).toBe(true);
    });
  });

  // =============================================================
  // Year-specific constant adjustments
  // =============================================================
  describe('year-specific constants', () => {
    it('should use 2026 ZUS constants for year 2026', () => {
      const dto = createDto({
        annualRevenue: 100_000,
        annualCosts: 30_000,
        year: 2026,
        zusType: ZusType.DUZY,
      });

      const result = service.compareForms(dto);

      const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA);
      expect(skala).toBeDefined();
      // 2026 duzy basis: 5,525.40
      expect(skala!.zus.basis).toBeCloseTo(5_525.40, 2);
    });
  });
});
