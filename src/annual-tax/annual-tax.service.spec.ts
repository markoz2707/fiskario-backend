import { Test, TestingModule } from '@nestjs/testing';
import { AnnualTaxService } from './annual-tax.service';
import { PIT36CalculationService } from './services/pit36-calculation.service';
import { PIT36LCalculationService } from './services/pit36l-calculation.service';
import { PIT28CalculationService } from './services/pit28-calculation.service';
import { EmploymentIncomeService } from './services/employment-income.service';
import { DeductionsService } from './services/deductions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { getTaxConfig, roundToFullPLN, roundToGrosze } from './services/tax-config';

describe('AnnualTaxService', () => {
  let service: AnnualTaxService;
  let pit36Service: PIT36CalculationService;
  let pit36lService: PIT36LCalculationService;
  let pit28Service: PIT28CalculationService;

  const mockPrisma = {
    annualTaxReturn: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    taxDeduction: {
      findMany: jest.fn(),
    },
    employmentIncome: {
      findMany: jest.fn(),
    },
    kPiREntry: {
      aggregate: jest.fn(),
    },
  };

  const mockDeductionsService = {
    getForCalculation: jest.fn(),
    getForReturn: jest.fn(),
  };

  const mockEmploymentIncomeService = {
    getAggregatedForTax: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnualTaxService,
        PIT36CalculationService,
        PIT36LCalculationService,
        PIT28CalculationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmploymentIncomeService, useValue: mockEmploymentIncomeService },
        { provide: DeductionsService, useValue: mockDeductionsService },
      ],
    }).compile();

    service = module.get<AnnualTaxService>(AnnualTaxService);
    pit36Service = module.get<PIT36CalculationService>(PIT36CalculationService);
    pit36lService = module.get<PIT36LCalculationService>(PIT36LCalculationService);
    pit28Service = module.get<PIT28CalculationService>(PIT28CalculationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // PIT-36 Calculation Service (skala podatkowa)
  // =========================================================================

  describe('PIT36CalculationService.calculate', () => {
    it('should calculate basic PIT-36 for income below first bracket threshold', () => {
      const input = {
        year: 2026,
        businessIncome: 100000,
        businessCosts: 20000,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 15000,
        healthDeduction: 0,
        advancesPaid: 5000,
        jointFiling: false,
        deductions: { fromIncome: [], fromTax: [] },
      };

      const result = pit36Service.calculate(input);

      expect(result.businessProfit).toBe(80000);
      expect(result.employmentProfit).toBe(0);
      expect(result.totalIncome).toBe(80000);
      expect(result.incomeAfterZus).toBe(65000); // 80000 - 15000

      // Tax base (rounded to full PLN)
      expect(result.taxBase).toBe(roundToFullPLN(65000));

      // 65000 is below 120000 bracket -> 12% - 3600 reduction
      // 65000 * 0.12 = 7800 - 3600 = 4200
      expect(result.taxCalculated).toBe(roundToGrosze(4200));
      expect(result.taxDue).toBe(roundToFullPLN(4200)); // No credits
      expect(result.finalAmount).toBe(roundToFullPLN(4200 - 5000)); // -800 (overpayment)
    });

    it('should calculate PIT-36 for income above second bracket threshold', () => {
      const input = {
        year: 2026,
        businessIncome: 200000,
        businessCosts: 30000,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 10000,
        healthDeduction: 0,
        advancesPaid: 20000,
        jointFiling: false,
        deductions: { fromIncome: [], fromTax: [] },
      };

      const result = pit36Service.calculate(input);

      expect(result.businessProfit).toBe(170000);
      expect(result.incomeAfterZus).toBe(160000); // 170000 - 10000
      expect(result.taxBase).toBe(160000);

      // First bracket: 120000 * 0.12 = 14400
      // Second bracket: (160000 - 120000) * 0.32 = 40000 * 0.32 = 12800
      // Total: 14400 + 12800 = 27200 - 3600 = 23600
      expect(result.taxCalculated).toBe(roundToGrosze(23600));
      expect(result.breakdown.bracket1Tax).toBeGreaterThan(0);
      expect(result.breakdown.bracket2Tax).toBeGreaterThan(0);
    });

    it('should handle joint filing (wspolne rozliczenie)', () => {
      const input = {
        year: 2026,
        businessIncome: 200000,
        businessCosts: 30000,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 10000,
        healthDeduction: 0,
        advancesPaid: 20000,
        jointFiling: true,
        spouseIncome: 50000,
        spouseCosts: 3000,
        spouseTaxAdvances: 2000,
        deductions: { fromIncome: [], fromTax: [] },
      };

      const result = pit36Service.calculate(input);

      // With joint filing, the tax should be lower due to income averaging
      expect(result.taxCalculated).toBeGreaterThan(0);
      // Advances include both JDG and spouse advances
      expect(result.advancesPaid).toBe(roundToGrosze(20000 + 0 + 2000));
    });

    it('should apply child relief from tax', () => {
      const input = {
        year: 2026,
        businessIncome: 80000,
        businessCosts: 10000,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 5000,
        healthDeduction: 500,
        advancesPaid: 3000,
        jointFiling: false,
        deductions: {
          fromIncome: [],
          fromTax: [
            { type: 'CHILD_RELIEF', amount: 1112.04, childMonths: 12 },
          ],
        },
      };

      const result = pit36Service.calculate(input);

      expect(result.breakdown.childReliefTotal).toBeGreaterThan(0);
      expect(result.taxCredits).toBeGreaterThan(0);
    });

    it('should apply deductions from income (internet, IKZE, etc.)', () => {
      const input = {
        year: 2026,
        businessIncome: 100000,
        businessCosts: 10000,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 5000,
        healthDeduction: 0,
        advancesPaid: 5000,
        jointFiling: false,
        deductions: {
          fromIncome: [
            { type: 'INTERNET', amount: 1000 }, // capped at 760
            { type: 'IKZE', amount: 5000 },
          ],
          fromTax: [],
        },
      };

      const result = pit36Service.calculate(input);

      // Internet capped at 760, IKZE at 5000 (below limit)
      expect(result.deductionsFromIncome).toBe(760 + 5000);
    });

    it('should handle employment income combined with business income', () => {
      const input = {
        year: 2026,
        businessIncome: 60000,
        businessCosts: 10000,
        employmentIncome: 80000,
        employmentCosts: 3000,
        employmentTaxPaid: 8000,
        zusDeduction: 5000,
        healthDeduction: 0,
        advancesPaid: 3000,
        jointFiling: false,
        deductions: { fromIncome: [], fromTax: [] },
      };

      const result = pit36Service.calculate(input);

      expect(result.businessProfit).toBe(50000);
      expect(result.employmentProfit).toBe(77000);
      expect(result.totalIncome).toBe(127000);
      // Employment tax paid is included in total advances
      expect(result.advancesPaid).toBe(roundToGrosze(3000 + 8000));
    });

    it('should calculate effective rate', () => {
      const input = {
        year: 2026,
        businessIncome: 100000,
        businessCosts: 20000,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 0,
        healthDeduction: 0,
        advancesPaid: 0,
        jointFiling: false,
        deductions: { fromIncome: [], fromTax: [] },
      };

      const result = pit36Service.calculate(input);

      expect(result.effectiveRate).toBeGreaterThan(0);
      expect(result.effectiveRate).toBeLessThan(100);
      // effectiveRate = (taxDue / totalIncome) * 100
      expect(result.effectiveRate).toBe(
        roundToGrosze((result.taxDue / result.totalIncome) * 100),
      );
    });

    it('should return zero tax for zero income', () => {
      const input = {
        year: 2026,
        businessIncome: 0,
        businessCosts: 0,
        employmentIncome: 0,
        employmentCosts: 0,
        employmentTaxPaid: 0,
        zusDeduction: 0,
        healthDeduction: 0,
        advancesPaid: 0,
        jointFiling: false,
        deductions: { fromIncome: [], fromTax: [] },
      };

      const result = pit36Service.calculate(input);

      expect(result.totalIncome).toBe(0);
      expect(result.taxCalculated).toBe(0);
      expect(result.taxDue).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });
  });

  // =========================================================================
  // PIT-36L Calculation Service (podatek liniowy 19%)
  // =========================================================================

  describe('PIT36LCalculationService.calculate', () => {
    it('should calculate flat 19% tax on business income', () => {
      const input = {
        year: 2026,
        businessIncome: 200000,
        businessCosts: 50000,
        zusDeduction: 15000,
        healthInsurancePaid: 5000,
        advancesPaid: 20000,
        deductions: { fromIncome: [] },
      };

      const result = pit36lService.calculate(input);

      expect(result.businessProfit).toBe(150000);
      expect(result.totalIncome).toBe(150000);
      expect(result.incomeAfterZus).toBe(135000); // 150000 - 15000
      expect(result.taxBase).toBe(roundToFullPLN(135000));

      // 19% flat rate
      expect(result.taxCalculated).toBe(roundToGrosze(135000 * 0.19));
      expect(result.breakdown.linearRate).toBe(0.19);
    });

    it('should cap health deduction at limit (11600 PLN)', () => {
      const input = {
        year: 2026,
        businessIncome: 300000,
        businessCosts: 50000,
        zusDeduction: 15000,
        healthInsurancePaid: 15000, // above limit
        advancesPaid: 30000,
        deductions: { fromIncome: [] },
      };

      const result = pit36lService.calculate(input);

      expect(result.healthDeduction).toBe(11600); // capped
      expect(result.breakdown.healthDeductionLimit).toBe(11600);
      expect(result.breakdown.healthDeductionApplied).toBe(11600);
    });

    it('should not cap health deduction when below limit', () => {
      const input = {
        year: 2026,
        businessIncome: 100000,
        businessCosts: 20000,
        zusDeduction: 10000,
        healthInsurancePaid: 5000, // below limit
        advancesPaid: 10000,
        deductions: { fromIncome: [] },
      };

      const result = pit36lService.calculate(input);
      expect(result.healthDeduction).toBe(5000);
    });

    it('should support limited deductions from income (IKZE, internet)', () => {
      const input = {
        year: 2026,
        businessIncome: 150000,
        businessCosts: 30000,
        zusDeduction: 10000,
        healthInsurancePaid: 5000,
        advancesPaid: 15000,
        deductions: {
          fromIncome: [
            { type: 'INTERNET', amount: 1000 }, // capped at 760
            { type: 'IKZE', amount: 5000 },
          ],
        },
      };

      const result = pit36lService.calculate(input);
      expect(result.deductionsFromIncome).toBe(760 + 5000);
    });

    it('should return negative finalAmount for overpayment', () => {
      const input = {
        year: 2026,
        businessIncome: 100000,
        businessCosts: 90000,
        zusDeduction: 0,
        healthInsurancePaid: 0,
        advancesPaid: 5000,
        deductions: { fromIncome: [] },
      };

      const result = pit36lService.calculate(input);

      // Income = 10000, tax = ~1900, advances = 5000 -> should be negative
      expect(result.finalAmount).toBeLessThan(0);
    });

    it('should have no kwota wolna (no free amount)', () => {
      // Even with low income, PIT-36L does not have kwota wolna
      const input = {
        year: 2026,
        businessIncome: 30000,
        businessCosts: 0,
        zusDeduction: 0,
        healthInsurancePaid: 0,
        advancesPaid: 0,
        deductions: { fromIncome: [] },
      };

      const result = pit36lService.calculate(input);

      // Tax should be exactly 19% of 30000 = 5700
      expect(result.taxCalculated).toBe(roundToGrosze(30000 * 0.19));
    });
  });

  // =========================================================================
  // PIT-28 Calculation Service (ryczalt)
  // =========================================================================

  describe('PIT28CalculationService.calculate', () => {
    it('should calculate ryczalt tax with IT rate (12%)', () => {
      const input = {
        year: 2026,
        ryczaltRevenue: 200000,
        ryczaltRateType: 'IT',
        zusDeduction: 15000,
        healthInsurancePaid: 5000,
        advancesPaid: 10000,
        deductions: { fromIncome: [] },
      };

      const result = pit28Service.calculate(input);

      expect(result.ryczaltRevenue).toBe(200000);
      expect(result.ryczaltRate).toBe(0.12);
      expect(result.revenueAfterDeductions).toBe(Math.max(0, 200000 - 15000));
      expect(result.breakdown.ryczaltRateType).toBe('IT');
    });

    it('should calculate ryczalt tax with trade rate (3%)', () => {
      const input = {
        year: 2026,
        ryczaltRevenue: 100000,
        ryczaltRateType: 'TRADE',
        zusDeduction: 10000,
        healthInsurancePaid: 3000,
        advancesPaid: 1000,
        deductions: { fromIncome: [] },
      };

      const result = pit28Service.calculate(input);
      expect(result.ryczaltRate).toBe(0.03);
    });

    it('should calculate ryczalt with custom rate override', () => {
      const input = {
        year: 2026,
        ryczaltRevenue: 150000,
        ryczaltRateType: 'SERVICES',
        ryczaltRate: 0.10, // custom override
        zusDeduction: 10000,
        healthInsurancePaid: 5000,
        advancesPaid: 5000,
        deductions: { fromIncome: [] },
      };

      const result = pit28Service.calculate(input);
      expect(result.ryczaltRate).toBe(0.10);
    });

    it('should deduct 50% of health insurance for ryczalt', () => {
      const input = {
        year: 2026,
        ryczaltRevenue: 150000,
        ryczaltRateType: 'SERVICES',
        zusDeduction: 10000,
        healthInsurancePaid: 8000,
        advancesPaid: 5000,
        deductions: { fromIncome: [] },
      };

      const result = pit28Service.calculate(input);
      // Health deduction should be 50% of paid (capped at 50% of annual threshold amount)
      expect(result.healthDeduction).toBeGreaterThan(0);
      expect(result.healthDeduction).toBeLessThanOrEqual(8000 * 0.5);
    });

    it('should handle zero revenue', () => {
      const input = {
        year: 2026,
        ryczaltRevenue: 0,
        ryczaltRateType: 'IT',
        zusDeduction: 0,
        healthInsurancePaid: 0,
        advancesPaid: 0,
        deductions: { fromIncome: [] },
      };

      const result = pit28Service.calculate(input);
      expect(result.taxBase).toBe(0);
      expect(result.ryczaltTax).toBe(0);
      expect(result.taxDue).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });

    it('should apply limited deductions from revenue', () => {
      const input = {
        year: 2026,
        ryczaltRevenue: 200000,
        ryczaltRateType: 'SERVICES',
        zusDeduction: 10000,
        healthInsurancePaid: 5000,
        advancesPaid: 5000,
        deductions: {
          fromIncome: [
            { type: 'INTERNET', amount: 1000 }, // capped at 760
            { type: 'THERMOMODERNIZATION', amount: 20000 },
          ],
        },
      };

      const result = pit28Service.calculate(input);
      expect(result.otherDeductions).toBe(760 + 20000);
    });
  });

  // =========================================================================
  // Tax Config
  // =========================================================================

  describe('getTaxConfig', () => {
    it('should return config for 2024', () => {
      const config = getTaxConfig(2024);
      expect(config.scale.brackets[0].rate).toBe(0.12);
      expect(config.scale.brackets[1].rate).toBe(0.32);
      expect(config.scale.reductionAmount).toBe(3600);
      expect(config.linear.rate).toBe(0.19);
    });

    it('should return config for 2025', () => {
      const config = getTaxConfig(2025);
      expect(config.scale.freeAmount).toBe(30000);
    });

    it('should return config for 2026', () => {
      const config = getTaxConfig(2026);
      expect(config.ryczaltRates.it).toBe(0.12);
      expect(config.ryczaltRates.trade).toBe(0.03);
      expect(config.ryczaltRates.services).toBe(0.085);
    });

    it('should fall back to closest year for unsupported year', () => {
      const config = getTaxConfig(2030);
      // Should fall back to 2026 (closest available)
      expect(config).toBeDefined();
      expect(config.scale.brackets.length).toBe(2);
    });
  });

  // =========================================================================
  // Rounding helpers
  // =========================================================================

  describe('roundToFullPLN', () => {
    it('should round to full PLN (no grosze)', () => {
      expect(roundToFullPLN(1234.56)).toBe(1235);
      expect(roundToFullPLN(1234.49)).toBe(1234);
      expect(roundToFullPLN(1234.50)).toBe(1235);
    });
  });

  describe('roundToGrosze', () => {
    it('should round to 2 decimal places', () => {
      expect(roundToGrosze(1234.567)).toBe(1234.57);
      expect(roundToGrosze(1234.561)).toBe(1234.56);
      expect(roundToGrosze(1234.565)).toBe(1234.57);
    });
  });

  // =========================================================================
  // AnnualTaxService CRUD
  // =========================================================================

  describe('createReturn', () => {
    it('should throw ConflictException for duplicate return', async () => {
      mockPrisma.annualTaxReturn.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createReturn('tenant-1', 'company-1', 'user-1', {
          year: 2025,
          formType: 'PIT_36',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for joint filing on PIT-36L', async () => {
      mockPrisma.annualTaxReturn.findUnique.mockResolvedValue(null);

      await expect(
        service.createReturn('tenant-1', 'company-1', 'user-1', {
          year: 2025,
          formType: 'PIT_36L',
          jointFiling: true,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for joint filing on PIT-28', async () => {
      mockPrisma.annualTaxReturn.findUnique.mockResolvedValue(null);

      await expect(
        service.createReturn('tenant-1', 'company-1', 'user-1', {
          year: 2025,
          formType: 'PIT_28',
          jointFiling: true,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a new return successfully', async () => {
      mockPrisma.annualTaxReturn.findUnique.mockResolvedValue(null);
      mockPrisma.annualTaxReturn.create.mockResolvedValue({
        id: 'new-return-id',
        year: 2025,
        formType: 'PIT_36',
        status: 'DRAFT',
      });

      const result = await service.createReturn('tenant-1', 'company-1', 'user-1', {
        year: 2025,
        formType: 'PIT_36',
        businessIncome: 100000,
        businessCosts: 30000,
      } as any);

      expect(result.id).toBe('new-return-id');
      expect(mockPrisma.annualTaxReturn.create).toHaveBeenCalled();
    });
  });

  describe('getReturn', () => {
    it('should throw NotFoundException when return not found', async () => {
      mockPrisma.annualTaxReturn.findFirst.mockResolvedValue(null);

      await expect(
        service.getReturn('tenant-1', 'company-1', 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the tax return when found', async () => {
      const mockReturn = { id: 'return-1', year: 2025, formType: 'PIT_36' };
      mockPrisma.annualTaxReturn.findFirst.mockResolvedValue(mockReturn);

      const result = await service.getReturn('tenant-1', 'company-1', 'return-1');
      expect(result).toEqual(mockReturn);
    });
  });
});
