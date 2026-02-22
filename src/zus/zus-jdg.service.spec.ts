import { Test, TestingModule } from '@nestjs/testing';
import { ZusService } from './zus.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ZUS_RATES,
  ZUS_JDG_TIERS,
  ZUS_REFERENCE_VALUES_2026,
  JDGTierType,
} from './dto/zus-contribution.dto';

describe('ZusService - JDG Tiers & Contributions', () => {
  let service: ZusService;
  let prisma: PrismaService;

  const mockPrisma = {
    zUSEmployee: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    zUSContribution: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    zUSRegistration: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    zUSReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZusService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ZusService>(ZusService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // determineJDGTier
  // =========================================================================

  describe('determineJDGTier', () => {
    it('should return ulga_na_start for registration < 6 months ago', () => {
      const now = new Date();
      // 3 months ago
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      const tier = service.determineJDGTier(registrationDate);
      expect(tier).toBe('ulga_na_start');
    });

    it('should return ulga_na_start for registration 0 months ago (just registered)', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const tier = service.determineJDGTier(registrationDate);
      expect(tier).toBe('ulga_na_start');
    });

    it('should return ulga_na_start for registration 5 months ago', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 5, now.getDate());
      const tier = service.determineJDGTier(registrationDate);
      expect(tier).toBe('ulga_na_start');
    });

    it('should return preferencyjny for registration exactly 6 months ago', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      const tier = service.determineJDGTier(registrationDate);
      expect(tier).toBe('preferencyjny');
    });

    it('should return preferencyjny for registration 7-29 months ago', () => {
      const now = new Date();
      const registrationDate7 = new Date(now.getFullYear(), now.getMonth() - 7, now.getDate());
      expect(service.determineJDGTier(registrationDate7)).toBe('preferencyjny');

      const registrationDate15 = new Date(now.getFullYear(), now.getMonth() - 15, now.getDate());
      expect(service.determineJDGTier(registrationDate15)).toBe('preferencyjny');

      const registrationDate29 = new Date(now.getFullYear(), now.getMonth() - 29, now.getDate());
      expect(service.determineJDGTier(registrationDate29)).toBe('preferencyjny');
    });

    it('should return maly_zus_plus for registration > 30 months with revenue < 120000', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 36, now.getDate());
      const tier = service.determineJDGTier(registrationDate, 100000);
      expect(tier).toBe('maly_zus_plus');
    });

    it('should return maly_zus_plus for registration exactly 30 months with low revenue', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 30, now.getDate());
      const tier = service.determineJDGTier(registrationDate, 50000);
      expect(tier).toBe('maly_zus_plus');
    });

    it('should return pelny for registration > 30 months with revenue >= 120000', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 36, now.getDate());
      const tier = service.determineJDGTier(registrationDate, 120000);
      expect(tier).toBe('pelny');
    });

    it('should return pelny for registration exactly 30 months with high revenue', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 30, now.getDate());
      const tier = service.determineJDGTier(registrationDate, 200000);
      expect(tier).toBe('pelny');
    });

    it('should return pelny for registration > 30 months with no revenue provided', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 40, now.getDate());
      const tier = service.determineJDGTier(registrationDate);
      expect(tier).toBe('pelny');
    });

    it('should return pelny for registration > 30 months with revenue exactly at 120000 threshold', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 31, now.getDate());
      // 120000 is NOT < 120000, so should be pelny
      const tier = service.determineJDGTier(registrationDate, 120000);
      expect(tier).toBe('pelny');
    });

    it('should return maly_zus_plus for revenue just below 120000 threshold', () => {
      const now = new Date();
      const registrationDate = new Date(now.getFullYear(), now.getMonth() - 31, now.getDate());
      const tier = service.determineJDGTier(registrationDate, 119999.99);
      expect(tier).toBe('maly_zus_plus');
    });
  });

  // =========================================================================
  // calculateJDGContributions
  // =========================================================================

  describe('calculateJDGContributions', () => {
    describe('ulga_na_start tier', () => {
      it('should have zero social contributions and only health insurance', () => {
        const result = service.calculateJDGContributions('ulga_na_start');

        expect(result.tier).toBe('ulga_na_start');
        expect(result.basis).toBe(0);
        expect(result.emerytalnaEmployer).toBe(0);
        expect(result.emerytalnaEmployee).toBe(0);
        expect(result.rentowaEmployer).toBe(0);
        expect(result.rentowaEmployee).toBe(0);
        expect(result.chorobowaEmployee).toBe(0);
        expect(result.wypadkowaEmployer).toBe(0);
        expect(result.fpEmployee).toBe(0);
        expect(result.fgspEmployee).toBe(0);

        // Health insurance should be calculated on minimum wage
        expect(result.healthBasis).toBe(ZUS_REFERENCE_VALUES_2026.minimumWage);
        const expectedZdrowotna = Math.round(
          (ZUS_REFERENCE_VALUES_2026.minimumWage * ZUS_RATES.zdrowotna.employee) / 100 * 100,
        ) / 100;
        expect(result.zdrowotnaEmployee).toBe(expectedZdrowotna);

        // Total should be only health insurance (employee part, since social is 0)
        expect(result.totalEmployer).toBe(0);
        expect(result.totalEmployee).toBe(expectedZdrowotna);
        expect(result.totalContribution).toBe(expectedZdrowotna);
      });

      it('should have the correct tier info label', () => {
        const result = service.calculateJDGContributions('ulga_na_start');
        expect(result.tierInfo).toBe(ZUS_JDG_TIERS.ulga_na_start.label);
      });
    });

    describe('preferencyjny tier', () => {
      it('should use 30% minimum wage as social basis', () => {
        const result = service.calculateJDGContributions('preferencyjny');

        expect(result.tier).toBe('preferencyjny');
        expect(result.basis).toBe(ZUS_REFERENCE_VALUES_2026.minBasisPreferencyjny);
        expect(result.healthBasis).toBe(ZUS_REFERENCE_VALUES_2026.minimumWage);
      });

      it('should have social contributions based on reduced basis', () => {
        const result = service.calculateJDGContributions('preferencyjny');
        const basis = ZUS_REFERENCE_VALUES_2026.minBasisPreferencyjny;

        const expectedEmerytalna = Math.round((basis * ZUS_RATES.emerytalna.employer) / 100 * 100) / 100;
        expect(result.emerytalnaEmployer).toBe(expectedEmerytalna);

        const expectedRentowa = Math.round((basis * ZUS_RATES.rentowa.employer) / 100 * 100) / 100;
        expect(result.rentowaEmployer).toBe(expectedRentowa);

        const expectedChorobowa = Math.round((basis * ZUS_RATES.chorobowa.employee) / 100 * 100) / 100;
        expect(result.chorobowaEmployee).toBe(expectedChorobowa);
      });

      it('should be exempt from FP and FGSP', () => {
        const result = service.calculateJDGContributions('preferencyjny');
        expect(result.fpEmployee).toBe(0);
        expect(result.fgspEmployee).toBe(0);
      });

      it('should have non-zero total contributions', () => {
        const result = service.calculateJDGContributions('preferencyjny');
        expect(result.totalContribution).toBeGreaterThan(0);
        expect(result.totalEmployer).toBeGreaterThan(0);
        expect(result.totalEmployee).toBeGreaterThan(0);
      });
    });

    describe('maly_zus_plus tier', () => {
      it('should use proportional basis when annualIncome is provided', () => {
        const annualIncome = 60000;
        const result = service.calculateJDGContributions('maly_zus_plus', annualIncome);

        const monthlyIncome = annualIncome / 12;
        const calculatedBasis = monthlyIncome * 0.5;
        const expectedBasis = Math.max(
          ZUS_REFERENCE_VALUES_2026.malyZusPlusMinBasis,
          Math.min(calculatedBasis, ZUS_REFERENCE_VALUES_2026.malyZusPlusMaxBasis),
        );

        expect(result.tier).toBe('maly_zus_plus');
        expect(result.basis).toBe(expectedBasis);
      });

      it('should use minimum basis when annualIncome is not provided', () => {
        const result = service.calculateJDGContributions('maly_zus_plus');
        expect(result.basis).toBe(ZUS_REFERENCE_VALUES_2026.malyZusPlusMinBasis);
      });

      it('should cap basis at malyZusPlusMaxBasis', () => {
        const highIncome = 500000;
        const result = service.calculateJDGContributions('maly_zus_plus', highIncome);

        // 50% of monthly = 500000/12*0.5 = 20833.33 which exceeds maxBasis
        expect(result.basis).toBe(ZUS_REFERENCE_VALUES_2026.malyZusPlusMaxBasis);
      });

      it('should floor basis at malyZusPlusMinBasis', () => {
        const lowIncome = 5000; // Very low income
        const result = service.calculateJDGContributions('maly_zus_plus', lowIncome);

        // 50% of monthly = 5000/12*0.5 = ~208 which is below minBasis
        expect(result.basis).toBe(ZUS_REFERENCE_VALUES_2026.malyZusPlusMinBasis);
      });

      it('should be exempt from FP and FGSP', () => {
        const result = service.calculateJDGContributions('maly_zus_plus', 80000);
        expect(result.fpEmployee).toBe(0);
        expect(result.fgspEmployee).toBe(0);
      });
    });

    describe('pelny tier', () => {
      it('should use 60% of projected average wage as basis', () => {
        const result = service.calculateJDGContributions('pelny');
        expect(result.tier).toBe('pelny');
        expect(result.basis).toBe(ZUS_REFERENCE_VALUES_2026.minBasisPelny);
      });

      it('should NOT be exempt from FP and FGSP', () => {
        const result = service.calculateJDGContributions('pelny');
        expect(result.fpEmployee).toBeGreaterThan(0);
        expect(result.fgspEmployee).toBeGreaterThan(0);
      });

      it('should calculate all social contributions correctly', () => {
        const result = service.calculateJDGContributions('pelny');
        const basis = ZUS_REFERENCE_VALUES_2026.minBasisPelny;

        const round = (v: number) => Math.round(v * 100) / 100;

        expect(result.emerytalnaEmployer).toBe(round((basis * ZUS_RATES.emerytalna.employer) / 100));
        expect(result.emerytalnaEmployee).toBe(round((basis * ZUS_RATES.emerytalna.employee) / 100));
        expect(result.rentowaEmployer).toBe(round((basis * ZUS_RATES.rentowa.employer) / 100));
        expect(result.rentowaEmployee).toBe(round((basis * ZUS_RATES.rentowa.employee) / 100));
        expect(result.chorobowaEmployee).toBe(round((basis * ZUS_RATES.chorobowa.employee) / 100));
        expect(result.wypadkowaEmployer).toBe(round((basis * ZUS_RATES.wypadkowa.employer) / 100));
        expect(result.fpEmployee).toBe(round((basis * ZUS_RATES.fp.employer) / 100));
        expect(result.fgspEmployee).toBe(round((basis * ZUS_RATES.fgsp.employer) / 100));
      });

      it('should have totalContribution = totalEmployer + totalEmployee', () => {
        const result = service.calculateJDGContributions('pelny');
        expect(result.totalContribution).toBe(result.totalEmployer + result.totalEmployee);
      });

      it('should always have health insurance based on minimum wage', () => {
        const result = service.calculateJDGContributions('pelny');
        expect(result.healthBasis).toBe(ZUS_REFERENCE_VALUES_2026.minimumWage);

        const expectedZdrowotna = Math.round(
          (ZUS_REFERENCE_VALUES_2026.minimumWage * ZUS_RATES.zdrowotna.employee) / 100 * 100,
        ) / 100;
        expect(result.zdrowotnaEmployee).toBe(expectedZdrowotna);
      });
    });
  });

  // =========================================================================
  // calculateContributions (standard employee)
  // =========================================================================

  describe('calculateContributions', () => {
    it('should calculate all contribution amounts for a given basis', () => {
      const basis = 5000;
      const result = service.calculateContributions(basis);

      expect(result.basis).toBe(basis);

      // Verify each rate
      const round = (v: number) => Math.round((basis * v) / 100 * 100) / 100;

      expect(result.emerytalnaEmployer).toBe(round(ZUS_RATES.emerytalna.employer));
      expect(result.emerytalnaEmployee).toBe(round(ZUS_RATES.emerytalna.employee));
      expect(result.rentowaEmployer).toBe(round(ZUS_RATES.rentowa.employer));
      expect(result.rentowaEmployee).toBe(round(ZUS_RATES.rentowa.employee));
      expect(result.chorobowaEmployee).toBe(round(ZUS_RATES.chorobowa.employee));
      expect(result.wypadkowaEmployer).toBe(round(ZUS_RATES.wypadkowa.employer));
      expect(result.zdrowotnaEmployee).toBe(round(ZUS_RATES.zdrowotna.employee));
      expect(result.zdrowotnaDeductible).toBe(round(ZUS_RATES.zdrowotna.deductible));
      expect(result.fpEmployee).toBe(round(ZUS_RATES.fp.employer));
      expect(result.fgspEmployee).toBe(round(ZUS_RATES.fgsp.employer));
    });

    it('should correctly sum totalEmployer', () => {
      const basis = 7000;
      const result = service.calculateContributions(basis);

      const expectedTotal =
        result.emerytalnaEmployer +
        result.rentowaEmployer +
        result.wypadkowaEmployer +
        result.fpEmployee +
        result.fgspEmployee;

      expect(result.totalEmployer).toBe(expectedTotal);
    });

    it('should correctly sum totalEmployee', () => {
      const basis = 7000;
      const result = service.calculateContributions(basis);

      const expectedTotal =
        result.emerytalnaEmployee +
        result.rentowaEmployee +
        result.chorobowaEmployee +
        result.zdrowotnaEmployee;

      expect(result.totalEmployee).toBe(expectedTotal);
    });

    it('should correctly sum totalContribution', () => {
      const basis = 7000;
      const result = service.calculateContributions(basis);
      expect(result.totalContribution).toBe(result.totalEmployer + result.totalEmployee);
    });

    it('should handle zero basis', () => {
      const result = service.calculateContributions(0);
      expect(result.totalContribution).toBe(0);
      expect(result.totalEmployer).toBe(0);
      expect(result.totalEmployee).toBe(0);
    });

    it('should handle known basis value (minimum wage 2026 = 4666 PLN)', () => {
      const basis = 4666;
      const result = service.calculateContributions(basis);

      // Verify a specific calculation
      // emerytalnaEmployer = 4666 * 9.76 / 100 = 455.36
      expect(result.emerytalnaEmployer).toBe(
        Math.round((4666 * 9.76) / 100 * 100) / 100,
      );

      // All amounts should be non-negative
      expect(result.emerytalnaEmployer).toBeGreaterThanOrEqual(0);
      expect(result.emerytalnaEmployee).toBeGreaterThanOrEqual(0);
      expect(result.rentowaEmployer).toBeGreaterThanOrEqual(0);
      expect(result.rentowaEmployee).toBeGreaterThanOrEqual(0);
      expect(result.chorobowaEmployee).toBeGreaterThanOrEqual(0);
      expect(result.wypadkowaEmployer).toBeGreaterThanOrEqual(0);
      expect(result.zdrowotnaEmployee).toBeGreaterThanOrEqual(0);
      expect(result.zdrowotnaDeductible).toBeGreaterThanOrEqual(0);
      expect(result.fpEmployee).toBeGreaterThanOrEqual(0);
      expect(result.fgspEmployee).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // JDG tier constants validation
  // =========================================================================

  describe('ZUS_JDG_TIERS constants', () => {
    it('should have ulga_na_start as healthOnly and fpExempt', () => {
      expect(ZUS_JDG_TIERS.ulga_na_start.healthOnly).toBe(true);
      expect(ZUS_JDG_TIERS.ulga_na_start.fpExempt).toBe(true);
      expect(ZUS_JDG_TIERS.ulga_na_start.durationMonths).toBe(6);
    });

    it('should have preferencyjny with 24 months duration and fpExempt', () => {
      expect(ZUS_JDG_TIERS.preferencyjny.healthOnly).toBe(false);
      expect(ZUS_JDG_TIERS.preferencyjny.fpExempt).toBe(true);
      expect(ZUS_JDG_TIERS.preferencyjny.durationMonths).toBe(24);
    });

    it('should have maly_zus_plus with 36 months and fpExempt', () => {
      expect(ZUS_JDG_TIERS.maly_zus_plus.healthOnly).toBe(false);
      expect(ZUS_JDG_TIERS.maly_zus_plus.fpExempt).toBe(true);
      expect(ZUS_JDG_TIERS.maly_zus_plus.durationMonths).toBe(36);
    });

    it('should have pelny with unlimited duration and NOT fpExempt', () => {
      expect(ZUS_JDG_TIERS.pelny.healthOnly).toBe(false);
      expect(ZUS_JDG_TIERS.pelny.fpExempt).toBe(false);
      expect(ZUS_JDG_TIERS.pelny.durationMonths).toBeNull();
    });
  });

  // =========================================================================
  // ZUS reference values
  // =========================================================================

  describe('ZUS_REFERENCE_VALUES_2026', () => {
    it('should have consistent preferencyjny basis (30% of minimum wage)', () => {
      expect(ZUS_REFERENCE_VALUES_2026.minBasisPreferencyjny).toBe(
        ZUS_REFERENCE_VALUES_2026.minimumWage * 0.3,
      );
    });

    it('should have consistent pelny basis (60% of average wage)', () => {
      expect(ZUS_REFERENCE_VALUES_2026.minBasisPelny).toBe(
        ZUS_REFERENCE_VALUES_2026.averageWage * 0.6,
      );
    });

    it('should have maly ZUS plus max revenue at 120000', () => {
      expect(ZUS_REFERENCE_VALUES_2026.malyZusPlusMaxRevenue).toBe(120000);
    });
  });

  // =========================================================================
  // Ordering of JDG contributions (ulga < preferencyjny < maly_zus < pelny)
  // =========================================================================

  describe('JDG contribution ordering', () => {
    it('should produce increasing total contributions: ulga < preferencyjny < pelny', () => {
      const ulga = service.calculateJDGContributions('ulga_na_start');
      const pref = service.calculateJDGContributions('preferencyjny');
      const pelny = service.calculateJDGContributions('pelny');

      expect(ulga.totalContribution).toBeLessThan(pref.totalContribution);
      expect(pref.totalContribution).toBeLessThan(pelny.totalContribution);
    });
  });
});
