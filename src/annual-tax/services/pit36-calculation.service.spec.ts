import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PIT36CalculationService,
  PIT36Input,
  PIT36Result,
} from './pit36-calculation.service';

describe('PIT36CalculationService', () => {
  let service: PIT36CalculationService;
  let prisma: PrismaService;

  const mockPrisma = {
    kPiREntry: {
      aggregate: jest.fn(),
    },
    employmentIncome: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PIT36CalculationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PIT36CalculationService>(PIT36CalculationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Helper to create a minimal PIT36Input with sensible defaults.
   */
  function createInput(overrides: Partial<PIT36Input> = {}): PIT36Input {
    return {
      year: 2024,
      businessIncome: 0,
      businessCosts: 0,
      employmentIncome: 0,
      employmentCosts: 0,
      employmentTaxPaid: 0,
      zusDeduction: 0,
      healthDeduction: 0,
      advancesPaid: 0,
      jointFiling: false,
      deductions: {
        fromIncome: [],
        fromTax: [],
      },
      ...overrides,
    };
  }

  // =============================================================
  // Test 1: Income below 120k threshold -> 12% tax
  // =============================================================
  describe('income below 120k threshold (12% bracket only)', () => {
    it('should apply 12% tax on 100,000 PLN income minus kwota zmniejszajaca', () => {
      const input = createInput({
        businessIncome: 100_000,
        businessCosts: 0,
      });

      const result = service.calculate(input);

      // Tax base = 100,000
      // Bracket 1 tax: 100,000 * 0.12 = 12,000
      // After kwota zmniejszajaca: 12,000 - 3,600 = 8,400
      expect(result.taxBase).toBe(100_000);
      expect(result.breakdown.bracket1Tax).toBeCloseTo(12_000, 2);
      expect(result.breakdown.bracket2Tax).toBe(0);
      expect(result.taxCalculated).toBeCloseTo(8_400, 2);
    });

    it('should calculate correct effective rate for 100k income', () => {
      const input = createInput({
        businessIncome: 100_000,
      });

      const result = service.calculate(input);

      expect(result.totalIncome).toBe(100_000);
      // taxDue = round(8400) = 8400, effectiveRate = (8400/100000)*100 = 8.4%
      expect(result.effectiveRate).toBeCloseTo(8.4, 1);
    });

    it('should handle income of exactly 120,000 PLN (boundary)', () => {
      const input = createInput({
        businessIncome: 120_000,
      });

      const result = service.calculate(input);

      // All income is in 12% bracket
      // 120,000 * 0.12 = 14,400 - 3,600 = 10,800
      expect(result.taxBase).toBe(120_000);
      expect(result.breakdown.bracket1Tax).toBeCloseTo(14_400, 2);
      expect(result.breakdown.bracket2Tax).toBe(0);
      expect(result.taxCalculated).toBeCloseTo(10_800, 2);
    });

    it('should result in zero tax when income is very low (covered by kwota wolna)', () => {
      const input = createInput({
        businessIncome: 20_000,
      });

      const result = service.calculate(input);

      // 20,000 * 0.12 = 2,400 - 3,600 = -1,200 -> 0 (max 0)
      expect(result.taxCalculated).toBe(0);
      expect(result.taxDue).toBe(0);
    });
  });

  // =============================================================
  // Test 2: Income above 120k -> split between 12% and 32%
  // =============================================================
  describe('income above 120k threshold (split brackets)', () => {
    it('should apply 12% on first 120k and 32% on excess for 200k income', () => {
      const input = createInput({
        businessIncome: 200_000,
      });

      const result = service.calculate(input);

      // Bracket 1: 120,000 * 0.12 = 14,400
      // Bracket 2: (200,000 - 120,000) * 0.32 = 80,000 * 0.32 = 25,600
      // Gross tax: 14,400 + 25,600 = 40,000
      // After kwota zmniejszajaca: 40,000 - 3,600 = 36,400
      expect(result.taxBase).toBe(200_000);
      expect(result.breakdown.bracket1Tax).toBeCloseTo(14_400, 2);
      expect(result.breakdown.bracket2Tax).toBeCloseTo(25_600, 2);
      expect(result.taxCalculated).toBeCloseTo(36_400, 2);
    });

    it('should handle income just above threshold (120,001 PLN)', () => {
      const input = createInput({
        businessIncome: 120_001,
      });

      const result = service.calculate(input);

      // Bracket 1: 120,000 * 0.12 = 14,400
      // Bracket 2: 1 * 0.32 = 0.32
      // Gross: 14,400.32 - 3,600 = 10,800.32
      expect(result.breakdown.bracket2Tax).toBeCloseTo(0.32, 2);
      expect(result.taxCalculated).toBeCloseTo(10_800.32, 2);
    });

    it('should handle very high income (500k PLN)', () => {
      const input = createInput({
        businessIncome: 500_000,
      });

      const result = service.calculate(input);

      // Bracket 1: 120,000 * 0.12 = 14,400
      // Bracket 2: 380,000 * 0.32 = 121,600
      // Gross: 14,400 + 121,600 = 136,000
      // After reduction: 136,000 - 3,600 = 132,400
      expect(result.breakdown.bracket1Tax).toBeCloseTo(14_400, 2);
      expect(result.breakdown.bracket2Tax).toBeCloseTo(121_600, 2);
      expect(result.taxCalculated).toBeCloseTo(132_400, 2);
    });
  });

  // =============================================================
  // Test 3: Kwota wolna (3,600 PLN deduction)
  // =============================================================
  describe('kwota wolna (kwota zmniejszajaca podatek)', () => {
    it('should subtract 3,600 PLN from calculated tax', () => {
      const input = createInput({
        businessIncome: 50_000,
      });

      const result = service.calculate(input);

      // 50,000 * 0.12 = 6,000 - 3,600 = 2,400
      expect(result.taxCalculated).toBeCloseTo(2_400, 2);
      expect(result.breakdown.reductionAmount).toBe(3_600);
    });

    it('should not produce negative tax when income is below kwota wolna threshold (30k)', () => {
      const input = createInput({
        businessIncome: 25_000,
      });

      const result = service.calculate(input);

      // 25,000 * 0.12 = 3,000 - 3,600 = -600 -> max(0, -600) = 0
      expect(result.taxCalculated).toBe(0);
      expect(result.taxDue).toBe(0);
    });

    it('should result in zero tax at exactly 30,000 PLN income', () => {
      const input = createInput({
        businessIncome: 30_000,
      });

      const result = service.calculate(input);

      // 30,000 * 0.12 = 3,600 - 3,600 = 0
      expect(result.taxCalculated).toBe(0);
    });

    it('should result in positive tax just above 30,000 PLN', () => {
      const input = createInput({
        businessIncome: 31_000,
      });

      const result = service.calculate(input);

      // 31,000 * 0.12 = 3,720 - 3,600 = 120
      expect(result.taxCalculated).toBeCloseTo(120, 2);
    });
  });

  // =============================================================
  // Test 4: ZUS social contribution deduction
  // =============================================================
  describe('ZUS social contribution deduction', () => {
    it('should subtract ZUS social contributions from income before tax calculation', () => {
      const input = createInput({
        businessIncome: 100_000,
        zusDeduction: 15_000,
      });

      const result = service.calculate(input);

      // incomeAfterZus = 100,000 - 15,000 = 85,000
      // taxBase = 85,000
      // Tax: 85,000 * 0.12 = 10,200 - 3,600 = 6,600
      expect(result.incomeAfterZus).toBe(85_000);
      expect(result.taxBase).toBe(85_000);
      expect(result.taxCalculated).toBeCloseTo(6_600, 2);
    });

    it('should not allow negative income after ZUS deduction', () => {
      const input = createInput({
        businessIncome: 10_000,
        zusDeduction: 20_000,
      });

      const result = service.calculate(input);

      // incomeAfterZus = max(0, 10,000 - 20,000) = 0
      expect(result.incomeAfterZus).toBe(0);
      expect(result.taxBase).toBe(0);
      expect(result.taxCalculated).toBe(0);
      expect(result.taxDue).toBe(0);
    });

    it('should deduct ZUS before applying tax brackets (pushing income below 120k)', () => {
      const input = createInput({
        businessIncome: 130_000,
        zusDeduction: 15_000,
      });

      const result = service.calculate(input);

      // incomeAfterZus = 130,000 - 15,000 = 115,000
      // All falls in 12% bracket
      // 115,000 * 0.12 = 13,800 - 3,600 = 10,200
      expect(result.incomeAfterZus).toBe(115_000);
      expect(result.taxBase).toBe(115_000);
      expect(result.breakdown.bracket2Tax).toBe(0);
      expect(result.taxCalculated).toBeCloseTo(10_200, 2);
    });
  });

  // =============================================================
  // Test 5: Joint filing (wspolne rozliczenie)
  // =============================================================
  describe('joint filing (wspolne rozliczenie malzonkow)', () => {
    it('should calculate tax on half income and multiply by 2', () => {
      const input = createInput({
        businessIncome: 200_000,
        jointFiling: true,
        spouseIncome: 0,
        spouseCosts: 0,
      });

      const result = service.calculate(input);

      // taxBase = 200,000 (business only for tax base)
      // jointIncome = 200,000 + 0 - 0 = 200,000
      // halfIncome = round(200,000 / 2) = 100,000
      // Tax on 100k: 100,000 * 0.12 = 12,000 - 3,600 = 8,400
      // Joint tax: 8,400 * 2 = 16,800
      expect(result.taxCalculated).toBeCloseTo(16_800, 2);
    });

    it('should save tax compared to single filing when income is above 120k', () => {
      // Single filing: income 240k
      const singleInput = createInput({
        businessIncome: 240_000,
        jointFiling: false,
      });
      const singleResult = service.calculate(singleInput);

      // Joint filing: same income, non-working spouse
      const jointInput = createInput({
        businessIncome: 240_000,
        jointFiling: true,
        spouseIncome: 0,
        spouseCosts: 0,
      });
      const jointResult = service.calculate(jointInput);

      // Single: 120k*0.12 + 120k*0.32 = 14,400 + 38,400 = 52,800 - 3,600 = 49,200
      // Joint: half = 120k, tax on 120k: 14,400 - 3,600 = 10,800, * 2 = 21,600
      // Joint is much cheaper
      expect(jointResult.taxCalculated).toBeLessThan(singleResult.taxCalculated);
    });

    it('should account for spouse income in joint filing', () => {
      const input = createInput({
        businessIncome: 100_000,
        jointFiling: true,
        spouseIncome: 60_000,
        spouseCosts: 3_000,
      });

      const result = service.calculate(input);

      // taxBase (from business) = 100,000
      // jointIncome = 100,000 + 60,000 - 3,000 = 157,000
      // halfIncome = round(157,000 / 2) = 78,500
      // Tax on 78,500: 78,500 * 0.12 = 9,420 - 3,600 = 5,820
      // Joint tax: 5,820 * 2 = 11,640
      expect(result.taxCalculated).toBeCloseTo(11_640, 2);
    });

    it('should produce same result as single filing when both earn equally under threshold', () => {
      // When each spouse earns 60k (total 120k), the joint half is 60k
      // This is same as individual filing at 60k for one person
      const input = createInput({
        businessIncome: 60_000,
        jointFiling: true,
        spouseIncome: 60_000,
        spouseCosts: 0,
      });

      const result = service.calculate(input);

      // jointIncome = 60,000 + 60,000 = 120,000
      // halfIncome = 60,000
      // Tax on 60k: 60,000 * 0.12 = 7,200 - 3,600 = 3,600
      // * 2 = 7,200
      expect(result.taxCalculated).toBeCloseTo(7_200, 2);
    });
  });

  // =============================================================
  // Additional tests: profit calculation, combined income, edges
  // =============================================================
  describe('profit calculation', () => {
    it('should not produce negative business profit', () => {
      const input = createInput({
        businessIncome: 50_000,
        businessCosts: 80_000,
      });

      const result = service.calculate(input);

      expect(result.businessProfit).toBe(0);
    });

    it('should combine business and employment profit into totalIncome', () => {
      const input = createInput({
        businessIncome: 80_000,
        businessCosts: 20_000,
        employmentIncome: 50_000,
        employmentCosts: 3_000,
      });

      const result = service.calculate(input);

      // businessProfit = 80,000 - 20,000 = 60,000
      // employmentProfit = 50,000 - 3,000 = 47,000
      // totalIncome = 107,000
      expect(result.businessProfit).toBe(60_000);
      expect(result.employmentProfit).toBe(47_000);
      expect(result.totalIncome).toBe(107_000);
    });
  });

  describe('health deduction (from tax)', () => {
    it('should subtract health deduction from calculated tax', () => {
      const input = createInput({
        businessIncome: 100_000,
        healthDeduction: 1_000,
      });

      const result = service.calculate(input);

      // Tax: 12,000 - 3,600 = 8,400
      // Credits: 1,000 (health)
      // taxDue = round(max(0, 8400 - 1000)) = 7,400
      expect(result.breakdown.healthDeduction).toBeCloseTo(1_000, 2);
      expect(result.taxDue).toBe(7_400);
    });
  });

  describe('child relief', () => {
    it('should calculate child relief for one child', () => {
      const input = createInput({
        businessIncome: 100_000,
        deductions: {
          fromIncome: [],
          fromTax: [{ type: 'CHILD_RELIEF', amount: 0, childMonths: 12 }],
        },
      });

      const result = service.calculate(input);

      // 1 child: 1,112.04 PLN per year
      expect(result.breakdown.childReliefTotal).toBeCloseTo(1_112.04, 2);
    });

    it('should prorate child relief by months', () => {
      const input = createInput({
        businessIncome: 100_000,
        deductions: {
          fromIncome: [],
          fromTax: [{ type: 'CHILD_RELIEF', amount: 0, childMonths: 6 }],
        },
      });

      const result = service.calculate(input);

      // 1 child, 6 months: 1,112.04 * 6/12 = 556.02
      expect(result.breakdown.childReliefTotal).toBeCloseTo(556.02, 2);
    });

    it('should calculate relief for multiple children with different annual amounts', () => {
      const input = createInput({
        businessIncome: 200_000,
        deductions: {
          fromIncome: [],
          fromTax: [
            { type: 'CHILD_RELIEF', amount: 0, childMonths: 12 },
            { type: 'CHILD_RELIEF', amount: 0, childMonths: 12 },
            { type: 'CHILD_RELIEF', amount: 0, childMonths: 12 },
          ],
        },
      });

      const result = service.calculate(input);

      // Child 1: 1,112.04
      // Child 2: 2,000.04
      // Child 3: 2,700.00
      // Total: 5,812.08
      expect(result.breakdown.childReliefTotal).toBeCloseTo(5_812.08, 2);
    });
  });

  describe('final amount (do zaplaty / nadplata)', () => {
    it('should calculate positive amount to pay when advances are less than tax due', () => {
      const input = createInput({
        businessIncome: 100_000,
        advancesPaid: 5_000,
      });

      const result = service.calculate(input);

      // taxDue = 8,400
      // finalAmount = round(8,400 - 5,000) = 3,400
      expect(result.finalAmount).toBe(3_400);
    });

    it('should calculate negative amount (refund / nadplata) when advances exceed tax due', () => {
      const input = createInput({
        businessIncome: 100_000,
        advancesPaid: 10_000,
      });

      const result = service.calculate(input);

      // taxDue = 8,400
      // finalAmount = round(8,400 - 10,000) = -1,600
      expect(result.finalAmount).toBe(-1_600);
    });

    it('should include employment tax paid in total advances', () => {
      const input = createInput({
        businessIncome: 100_000,
        advancesPaid: 3_000,
        employmentIncome: 60_000,
        employmentCosts: 3_000,
        employmentTaxPaid: 5_000,
      });

      const result = service.calculate(input);

      // totalAdvances = 3,000 + 5,000 = 8,000
      expect(result.advancesPaid).toBeCloseTo(8_000, 2);
    });
  });

  describe('deductions from income', () => {
    it('should apply internet relief capped at 760 PLN', () => {
      const input = createInput({
        businessIncome: 100_000,
        deductions: {
          fromIncome: [{ type: 'INTERNET', amount: 1_000 }],
          fromTax: [],
        },
      });

      const result = service.calculate(input);

      // Internet capped at 760
      // taxBase = 100,000 - 760 = 99,240
      expect(result.deductionsFromIncome).toBe(760);
      expect(result.taxBase).toBe(99_240);
    });

    it('should apply donation limit of 6% of income after ZUS', () => {
      const input = createInput({
        businessIncome: 100_000,
        zusDeduction: 10_000,
        deductions: {
          fromIncome: [{ type: 'DONATIONS', amount: 10_000 }],
          fromTax: [],
        },
      });

      const result = service.calculate(input);

      // incomeAfterZus = 90,000
      // Donation max = 90,000 * 0.06 = 5,400
      expect(result.deductionsFromIncome).toBe(5_400);
    });

    it('should cap total deductions at incomeAfterZus', () => {
      const input = createInput({
        businessIncome: 50_000,
        zusDeduction: 40_000,
        deductions: {
          fromIncome: [
            { type: 'INTERNET', amount: 760 },
            { type: 'THERMOMODERNIZATION', amount: 53_000 },
          ],
          fromTax: [],
        },
      });

      const result = service.calculate(input);

      // incomeAfterZus = 10,000
      // Total deductions (760 + 53,000 = 53,760) capped at incomeAfterZus = 10,000
      expect(result.deductionsFromIncome).toBe(10_000);
      expect(result.taxBase).toBe(0);
    });
  });

  describe('zero and edge case inputs', () => {
    it('should handle zero income', () => {
      const input = createInput({
        businessIncome: 0,
      });

      const result = service.calculate(input);

      expect(result.totalIncome).toBe(0);
      expect(result.taxBase).toBe(0);
      expect(result.taxCalculated).toBe(0);
      expect(result.taxDue).toBe(0);
      expect(result.finalAmount).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });
  });

  // =============================================================
  // Database methods (getBusinessDataFromKPiR, getEmploymentData)
  // =============================================================
  describe('getBusinessDataFromKPiR', () => {
    it('should aggregate KPiR entries and return income and costs', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: {
          totalRevenue: 150_000,
          totalExpenses: 45_000,
        },
      });

      const result = await service.getBusinessDataFromKPiR('t1', 'c1', 2024);

      expect(result).toEqual({ income: 150_000, costs: 45_000 });
      expect(mockPrisma.kPiREntry.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: 't1',
          company_id: 'c1',
          year: 2024,
          isCorrection: false,
        },
        _sum: {
          totalRevenue: true,
          totalExpenses: true,
        },
      });
    });

    it('should return zeros when no KPiR entries exist', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: {
          totalRevenue: null,
          totalExpenses: null,
        },
      });

      const result = await service.getBusinessDataFromKPiR('t1', 'c1', 2024);

      expect(result).toEqual({ income: 0, costs: 0 });
    });
  });

  describe('getEmploymentData', () => {
    it('should aggregate employment income records', async () => {
      mockPrisma.employmentIncome.findMany.mockResolvedValue([
        {
          grossIncome: 60_000,
          taxDeductibleCosts: 3_000,
          taxAdvancePaid: 5_000,
          zusEmerytalnaEmpl: 2_000,
          zusRentowaEmpl: 800,
          zusChorobowaEmpl: 300,
          zusHealthEmpl: 4_500,
        },
        {
          grossIncome: 12_000,
          taxDeductibleCosts: 600,
          taxAdvancePaid: 900,
          zusEmerytalnaEmpl: 400,
          zusRentowaEmpl: 160,
          zusChorobowaEmpl: 60,
          zusHealthEmpl: 900,
        },
      ]);

      const result = await service.getEmploymentData('t1', 'c1', 'u1', 2024);

      expect(result.income).toBe(72_000);
      expect(result.costs).toBe(3_600);
      expect(result.taxPaid).toBe(5_900);
      expect(result.zusSocial).toBe(2_000 + 800 + 300 + 400 + 160 + 60);
      expect(result.zusHealth).toBe(5_400);
    });

    it('should return zeros when no employment records exist', async () => {
      mockPrisma.employmentIncome.findMany.mockResolvedValue([]);

      const result = await service.getEmploymentData('t1', 'c1', 'u1', 2024);

      expect(result).toEqual({
        income: 0,
        costs: 0,
        taxPaid: 0,
        zusSocial: 0,
        zusHealth: 0,
      });
    });
  });
});
