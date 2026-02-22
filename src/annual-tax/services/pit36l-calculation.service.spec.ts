import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PIT36LCalculationService,
  PIT36LInput,
  PIT36LResult,
} from './pit36l-calculation.service';

describe('PIT36LCalculationService', () => {
  let service: PIT36LCalculationService;
  let prisma: PrismaService;

  const mockPrisma = {
    kPiREntry: {
      aggregate: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PIT36LCalculationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PIT36LCalculationService>(PIT36LCalculationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Helper to create a minimal PIT36LInput with sensible defaults.
   */
  function createInput(overrides: Partial<PIT36LInput> = {}): PIT36LInput {
    return {
      year: 2024,
      businessIncome: 0,
      businessCosts: 0,
      zusDeduction: 0,
      healthInsurancePaid: 0,
      advancesPaid: 0,
      deductions: {
        fromIncome: [],
      },
      ...overrides,
    };
  }

  // =============================================================
  // Test 1: Basic 19% tax on income
  // =============================================================
  describe('basic 19% flat tax', () => {
    it('should apply 19% flat rate on 100,000 PLN income', () => {
      const input = createInput({
        businessIncome: 100_000,
        businessCosts: 0,
      });

      const result = service.calculate(input);

      // taxBase = 100,000
      // taxCalculated = 100,000 * 0.19 = 19,000
      expect(result.taxBase).toBe(100_000);
      expect(result.taxCalculated).toBeCloseTo(19_000, 2);
      expect(result.breakdown.linearRate).toBe(0.19);
    });

    it('should apply 19% flat rate on 500,000 PLN income', () => {
      const input = createInput({
        businessIncome: 500_000,
        businessCosts: 0,
      });

      const result = service.calculate(input);

      // taxBase = 500,000
      // taxCalculated = 500,000 * 0.19 = 95,000
      expect(result.taxBase).toBe(500_000);
      expect(result.taxCalculated).toBeCloseTo(95_000, 2);
    });

    it('should correctly calculate business profit (revenue minus costs)', () => {
      const input = createInput({
        businessIncome: 200_000,
        businessCosts: 50_000,
      });

      const result = service.calculate(input);

      // businessProfit = 200,000 - 50,000 = 150,000
      // taxBase = 150,000
      // taxCalculated = 150,000 * 0.19 = 28,500
      expect(result.businessProfit).toBe(150_000);
      expect(result.totalIncome).toBe(150_000);
      expect(result.taxBase).toBe(150_000);
      expect(result.taxCalculated).toBeCloseTo(28_500, 2);
    });

    it('should not produce negative profit', () => {
      const input = createInput({
        businessIncome: 30_000,
        businessCosts: 50_000,
      });

      const result = service.calculate(input);

      expect(result.businessProfit).toBe(0);
      expect(result.taxBase).toBe(0);
      expect(result.taxCalculated).toBe(0);
    });

    it('should handle zero income', () => {
      const input = createInput({
        businessIncome: 0,
      });

      const result = service.calculate(input);

      expect(result.taxBase).toBe(0);
      expect(result.taxCalculated).toBe(0);
      expect(result.taxDue).toBe(0);
      expect(result.finalAmount).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });
  });

  // =============================================================
  // Test 2: No kwota wolna
  // =============================================================
  describe('no kwota wolna (no free amount)', () => {
    it('should tax even low income at 19% with no free amount deduction', () => {
      const input = createInput({
        businessIncome: 10_000,
      });

      const result = service.calculate(input);

      // No kwota wolna! 10,000 * 0.19 = 1,900
      expect(result.taxCalculated).toBeCloseTo(1_900, 2);
      expect(result.taxDue).toBe(1_900);
    });

    it('should produce higher tax than PIT-36 skala for income of 20,000 PLN (where kwota wolna helps on skala)', () => {
      const input = createInput({
        businessIncome: 20_000,
      });

      const result = service.calculate(input);

      // PIT-36L: 20,000 * 0.19 = 3,800
      // PIT-36 would be: 20,000 * 0.12 = 2,400 - 3,600 = 0 (kwota wolna covers it)
      expect(result.taxCalculated).toBeCloseTo(3_800, 2);
      expect(result.taxDue).toBe(3_800);
    });

    it('should apply same 19% rate at 30,000 PLN income (no free amount break)', () => {
      const input = createInput({
        businessIncome: 30_000,
      });

      const result = service.calculate(input);

      // 30,000 * 0.19 = 5,700 (on PIT-36 this would be 0 due to kwota wolna)
      expect(result.taxCalculated).toBeCloseTo(5_700, 2);
      expect(result.taxDue).toBe(5_700);
    });
  });

  // =============================================================
  // Test 3: Health insurance deduction (4.9%, max 11,600 PLN)
  // =============================================================
  describe('health insurance deduction', () => {
    it('should deduct health insurance up to the limit (11,600 PLN)', () => {
      const input = createInput({
        businessIncome: 300_000,
        healthInsurancePaid: 14_700, // 300k * 0.049 = 14,700
      });

      const result = service.calculate(input);

      // healthDeduction = min(14,700, 11,600) = 11,600
      expect(result.healthDeduction).toBe(11_600);
      expect(result.breakdown.healthDeductionLimit).toBe(11_600);
      expect(result.breakdown.healthDeductionApplied).toBe(11_600);
    });

    it('should use full health insurance when below the limit', () => {
      const input = createInput({
        businessIncome: 100_000,
        healthInsurancePaid: 4_900, // 100k * 0.049 = 4,900
      });

      const result = service.calculate(input);

      // healthDeduction = min(4,900, 11,600) = 4,900
      expect(result.healthDeduction).toBe(4_900);
      expect(result.breakdown.healthDeductionApplied).toBe(4_900);
    });

    it('should reduce tax due by health deduction amount', () => {
      const input = createInput({
        businessIncome: 100_000,
        healthInsurancePaid: 4_900,
      });

      const result = service.calculate(input);

      // taxCalculated = 100,000 * 0.19 = 19,000
      // taxDue = round(max(0, 19,000 - 4,900)) = 14,100
      expect(result.taxCalculated).toBeCloseTo(19_000, 2);
      expect(result.taxDue).toBe(14_100);
    });

    it('should not produce negative tax due even with large health deduction', () => {
      const input = createInput({
        businessIncome: 5_000,
        healthInsurancePaid: 11_600,
      });

      const result = service.calculate(input);

      // taxCalculated = 5,000 * 0.19 = 950
      // taxDue = max(0, 950 - 11,600) = 0
      expect(result.taxDue).toBe(0);
    });

    it('should handle zero health insurance paid', () => {
      const input = createInput({
        businessIncome: 100_000,
        healthInsurancePaid: 0,
      });

      const result = service.calculate(input);

      expect(result.healthDeduction).toBe(0);
      // taxDue = round(19,000 - 0) = 19,000
      expect(result.taxDue).toBe(19_000);
    });
  });

  // =============================================================
  // ZUS social deduction
  // =============================================================
  describe('ZUS social contribution deduction', () => {
    it('should subtract ZUS social contributions from income', () => {
      const input = createInput({
        businessIncome: 100_000,
        zusDeduction: 15_000,
      });

      const result = service.calculate(input);

      // incomeAfterZus = 100,000 - 15,000 = 85,000
      // taxBase = 85,000
      expect(result.incomeAfterZus).toBe(85_000);
      expect(result.taxBase).toBe(85_000);
      expect(result.breakdown.zusDeduction).toBe(15_000);
    });

    it('should not allow negative income after ZUS deduction', () => {
      const input = createInput({
        businessIncome: 10_000,
        zusDeduction: 20_000,
      });

      const result = service.calculate(input);

      expect(result.incomeAfterZus).toBe(0);
      expect(result.taxBase).toBe(0);
      expect(result.taxCalculated).toBe(0);
    });
  });

  // =============================================================
  // Deductions from income (limited set)
  // =============================================================
  describe('deductions from income (limited on PIT-36L)', () => {
    it('should apply IKZE deduction capped at yearly limit', () => {
      const input = createInput({
        businessIncome: 200_000,
        deductions: {
          fromIncome: [{ type: 'IKZE', amount: 15_000 }],
        },
      });

      const result = service.calculate(input);

      // IKZE limit for 2024: 9,388.80
      // deductionsFromIncome = min(15,000, 9,388.80) = 9,388.80
      expect(result.deductionsFromIncome).toBeCloseTo(9_388.80, 2);
    });

    it('should apply internet relief capped at 760 PLN', () => {
      const input = createInput({
        businessIncome: 100_000,
        deductions: {
          fromIncome: [{ type: 'INTERNET', amount: 1_200 }],
        },
      });

      const result = service.calculate(input);

      expect(result.deductionsFromIncome).toBe(760);
    });

    it('should apply donation limit of 6% of income after ZUS', () => {
      const input = createInput({
        businessIncome: 100_000,
        zusDeduction: 10_000,
        deductions: {
          fromIncome: [{ type: 'DONATIONS', amount: 10_000 }],
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
        zusDeduction: 45_000,
        deductions: {
          fromIncome: [
            { type: 'INTERNET', amount: 760 },
            { type: 'THERMOMODERNIZATION', amount: 53_000 },
          ],
        },
      });

      const result = service.calculate(input);

      // incomeAfterZus = 5,000
      // Total deductions (760 + 53,000) capped at 5,000
      expect(result.deductionsFromIncome).toBe(5_000);
    });
  });

  // =============================================================
  // Final amount and advances
  // =============================================================
  describe('final amount (do zaplaty / nadplata)', () => {
    it('should calculate amount to pay when advances are less than tax due', () => {
      const input = createInput({
        businessIncome: 100_000,
        advancesPaid: 10_000,
      });

      const result = service.calculate(input);

      // taxDue = 19,000
      // finalAmount = round(19,000 - 10,000) = 9,000
      expect(result.advancesPaid).toBe(10_000);
      expect(result.finalAmount).toBe(9_000);
    });

    it('should calculate refund (nadplata) when advances exceed tax due', () => {
      const input = createInput({
        businessIncome: 100_000,
        advancesPaid: 25_000,
      });

      const result = service.calculate(input);

      // taxDue = 19,000
      // finalAmount = round(19,000 - 25,000) = -6,000
      expect(result.finalAmount).toBe(-6_000);
    });
  });

  // =============================================================
  // Effective rate
  // =============================================================
  describe('effective rate', () => {
    it('should calculate effective rate as percentage of total income', () => {
      const input = createInput({
        businessIncome: 200_000,
        businessCosts: 0,
      });

      const result = service.calculate(input);

      // taxDue = round(200,000 * 0.19) = 38,000
      // effectiveRate = (38,000 / 200,000) * 100 = 19%
      expect(result.effectiveRate).toBe(19);
    });

    it('should show lower effective rate when health deduction applies', () => {
      const input = createInput({
        businessIncome: 200_000,
        healthInsurancePaid: 9_800, // 200k * 0.049
      });

      const result = service.calculate(input);

      // taxCalculated = 200,000 * 0.19 = 38,000
      // taxDue = round(38,000 - 9,800) = 28,200
      // effectiveRate = (28,200 / 200,000) * 100 = 14.1%
      expect(result.effectiveRate).toBeCloseTo(14.1, 1);
    });

    it('should return 0 effective rate for zero income', () => {
      const input = createInput({
        businessIncome: 0,
      });

      const result = service.calculate(input);

      expect(result.effectiveRate).toBe(0);
    });
  });

  // =============================================================
  // Database method: getBusinessDataFromKPiR
  // =============================================================
  describe('getBusinessDataFromKPiR', () => {
    it('should aggregate KPiR entries', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: {
          totalRevenue: 250_000,
          totalExpenses: 80_000,
        },
      });

      const result = await service.getBusinessDataFromKPiR('t1', 'c1', 2024);

      expect(result).toEqual({ income: 250_000, costs: 80_000 });
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

    it('should return zeros when no records exist', async () => {
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
});
