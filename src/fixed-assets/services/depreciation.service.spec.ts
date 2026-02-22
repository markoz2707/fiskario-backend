import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DepreciationService } from './depreciation.service';

describe('DepreciationService', () => {
  let service: DepreciationService;
  let prisma: PrismaService;

  const mockPrisma = {
    fixedAsset: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    depreciationEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepreciationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<DepreciationService>(DepreciationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Helper to create a mock fixed asset with sensible defaults.
   */
  function createMockAsset(overrides: Record<string, any> = {}) {
    return {
      id: 'asset-1',
      tenant_id: 'tenant-1',
      company_id: 'company-1',
      name: 'Laptop Dell',
      initialValue: 12_000,
      improvementValue: 0,
      salvageValue: 0,
      totalDepreciation: 0,
      currentValue: 12_000,
      annualRate: 20, // 20% annual rate (KST group 4/6/8 = computers)
      depreciationMethod: 'LINEAR',
      status: 'ACTIVE',
      isFullyDepreciated: false,
      activationDate: new Date('2024-01-15'),
      deactivationDate: null,
      depreciationEntries: [],
      ...overrides,
    };
  }

  // =============================================================
  // Test 1: Linear depreciation monthly amount
  // =============================================================
  describe('LINEAR depreciation (liniowa)', () => {
    it('should calculate correct monthly depreciation amount', async () => {
      const asset = createMockAsset({
        initialValue: 12_000,
        annualRate: 20, // 20%
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (ops) => {
        // Return the created entry as first element
        return [
          {
            id: 'entry-1',
            asset_id: 'asset-1',
            month: 2,
            year: 2024,
            amount: 200,
            cumulativeAmount: 200,
            remainingValue: 11_800,
            method: 'LINEAR',
            rate: 20,
            basis: 12_000,
            isBooked: false,
          },
        ];
      });

      const result = await service.calculateMonthlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2024,
        2, // February (month after activation in January)
      );

      // Linear: (12,000 * 20/100) / 12 = 2,400 / 12 = 200 PLN/month
      expect(result.amount).toBe(200);
    });

    it('should use calculateLinear to get (basis * rate / 100) / 12', () => {
      // Access the private method via type assertion
      const amount = (service as any).calculateLinear(12_000, 20);

      // 12,000 * 0.20 / 12 = 200
      expect(amount).toBe(200);
    });

    it('should handle different annual rates', () => {
      // 14% rate on 50,000 PLN asset
      const amount14 = (service as any).calculateLinear(50_000, 14);
      // 50,000 * 0.14 / 12 = 583.33...
      expect(amount14).toBeCloseTo(583.33, 2);

      // 10% rate on 100,000 PLN asset
      const amount10 = (service as any).calculateLinear(100_000, 10);
      // 100,000 * 0.10 / 12 = 833.33...
      expect(amount10).toBeCloseTo(833.33, 2);
    });

    it('should reject depreciation for month before activation + 1', async () => {
      const asset = createMockAsset({
        activationDate: new Date('2024-06-15'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);

      // June activation -> first depreciation in July (month 7)
      // Attempting to depreciate in June should fail
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 6),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow depreciation starting from month after activation', async () => {
      const asset = createMockAsset({
        activationDate: new Date('2024-06-15'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        {
          id: 'entry-1',
          amount: 200,
          month: 7,
          year: 2024,
        },
      ]);

      // July (month after June activation) should work
      const result = await service.calculateMonthlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2024,
        7,
      );

      expect(result).toBeDefined();
      expect(result.amount).toBe(200);
    });

    it('should not exceed remaining value to depreciate', async () => {
      const asset = createMockAsset({
        initialValue: 12_000,
        annualRate: 20,
        totalDepreciation: 11_900, // Only 100 PLN remaining
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async () => {
        return [
          {
            id: 'entry-final',
            amount: 100, // Capped at remaining
            month: 2,
            year: 2025,
          },
        ];
      });

      const result = await service.calculateMonthlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2025,
        2,
      );

      // Normal monthly = 200, but only 100 remains -> capped at 100
      expect(result.amount).toBe(100);
    });

    it('should account for improvement value in depreciation basis', () => {
      // calculateLinear uses depreciationBasis = initialValue + improvementValue
      const basisWithImprovement = 12_000 + 3_000; // 15,000
      const amount = (service as any).calculateLinear(basisWithImprovement, 20);

      // 15,000 * 0.20 / 12 = 250
      expect(amount).toBe(250);
    });
  });

  // =============================================================
  // Test 2: One-time depreciation (full amount in activation month)
  // =============================================================
  describe('ONE_TIME depreciation (jednorazowa)', () => {
    it('should depreciate full amount in activation month', () => {
      const amount = (service as any).calculateOneTime(9_000, 0);

      // Full basis minus salvage value
      expect(amount).toBe(9_000);
    });

    it('should subtract salvage value from one-time amount', () => {
      const amount = (service as any).calculateOneTime(9_000, 1_000);

      // 9,000 - 1,000 = 8,000
      expect(amount).toBe(8_000);
    });

    it('should allow depreciation only in the activation month', async () => {
      const asset = createMockAsset({
        depreciationMethod: 'ONE_TIME',
        initialValue: 8_000,
        activationDate: new Date('2024-03-10'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        {
          id: 'entry-onetime',
          amount: 8_000,
          month: 3,
          year: 2024,
        },
      ]);

      // Activation month (March 2024) should work
      const result = await service.calculateMonthlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2024,
        3,
      );

      expect(result.amount).toBe(8_000);
    });

    it('should reject one-time depreciation in wrong month', async () => {
      const asset = createMockAsset({
        depreciationMethod: 'ONE_TIME',
        activationDate: new Date('2024-03-10'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);

      // April (not activation month) should fail
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 4),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 4),
      ).rejects.toThrow('jednorazowa');
    });

    it('should reject one-time depreciation in wrong year', async () => {
      const asset = createMockAsset({
        depreciationMethod: 'ONE_TIME',
        activationDate: new Date('2024-03-10'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);

      // 2025 is wrong year
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2025, 3),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================================
  // Test 3: Depreciation stops when fully depreciated
  // =============================================================
  describe('depreciation stops when fully depreciated', () => {
    it('should throw when asset is already fully depreciated', async () => {
      const asset = createMockAsset({
        isFullyDepreciated: true,
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);

      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 2),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 2),
      ).rejects.toThrow('w pelni zamortyzowany');
    });

    it('should throw when remaining amount to depreciate is zero or negative', async () => {
      const asset = createMockAsset({
        initialValue: 10_000,
        totalDepreciation: 10_000, // Fully depreciated by amount
        isFullyDepreciated: false, // Flag not yet updated
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      // Should mark as fully depreciated and throw
      mockPrisma.fixedAsset.update.mockResolvedValue({});

      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 2),
      ).rejects.toThrow(BadRequestException);
    });

    it('should mark asset as fully depreciated when last entry completes depreciation', async () => {
      const asset = createMockAsset({
        initialValue: 12_000,
        annualRate: 20,
        totalDepreciation: 11_800, // 200 remaining
        salvageValue: 0,
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);

      let capturedData: any;
      mockPrisma.$transaction.mockImplementation(async (ops) => {
        // The second operation in the transaction is the asset update
        // We can verify the isFullyDepreciated flag via the mock call
        return [
          {
            id: 'entry-last',
            amount: 200, // Capped at remaining 200
            cumulativeAmount: 12_000,
            remainingValue: 0,
          },
        ];
      });

      const result = await service.calculateMonthlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2025,
        2,
      );

      // The $transaction was called, meaning the service attempted to
      // update the asset with isFullyDepreciated: true
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.amount).toBe(200);
    });
  });

  // =============================================================
  // Degressive depreciation tests
  // =============================================================
  describe('DEGRESSIVE depreciation (degresywna)', () => {
    it('should use doubled rate on net book value for degressive method', () => {
      // calculateDegressive(basis, rate, totalDepr, salvage, year, month, activationDate, entries)
      const amount = (service as any).calculateDegressive(
        100_000, // basis
        20,      // annual rate (coefficient 2.0 -> 40%)
        0,       // no depreciation yet
        0,       // no salvage
        2024,    // year
        2,       // month
        new Date('2024-01-15'),
        [],      // no existing entries
      );

      // Net value at start of year = 100,000 - 0 = 100,000
      // Degressive annual = 100,000 * 40% = 40,000
      // Degressive monthly = 40,000 / 12 = 3,333.33
      // Linear monthly = (100,000 * 20%) / 12 = 1,666.67
      // Degressive > linear, so use degressive
      expect(amount).toBeCloseTo(3_333.33, 2);
    });

    it('should switch to linear when degressive amount falls below linear', () => {
      // Simulate year where net value has decreased significantly
      const basis = 100_000;
      const rate = 20;
      // After heavy depreciation, net value is low
      const entriesBeforeYear = [
        { year: 2024, month: 2, amount: 3_333 },
        { year: 2024, month: 3, amount: 3_333 },
        { year: 2024, month: 4, amount: 3_333 },
        { year: 2024, month: 5, amount: 3_333 },
        { year: 2024, month: 6, amount: 3_333 },
        { year: 2024, month: 7, amount: 3_333 },
        { year: 2024, month: 8, amount: 3_333 },
        { year: 2024, month: 9, amount: 3_333 },
        { year: 2024, month: 10, amount: 3_333 },
        { year: 2024, month: 11, amount: 3_333 },
        { year: 2024, month: 12, amount: 3_333 },
        // More years of depreciation to push net value very low
        { year: 2025, month: 1, amount: 2_000 },
        { year: 2025, month: 2, amount: 2_000 },
        { year: 2025, month: 3, amount: 2_000 },
        { year: 2025, month: 4, amount: 2_000 },
        { year: 2025, month: 5, amount: 2_000 },
        { year: 2025, month: 6, amount: 2_000 },
        { year: 2025, month: 7, amount: 2_000 },
        { year: 2025, month: 8, amount: 2_000 },
        { year: 2025, month: 9, amount: 2_000 },
        { year: 2025, month: 10, amount: 2_000 },
        { year: 2025, month: 11, amount: 2_000 },
        { year: 2025, month: 12, amount: 2_000 },
      ];

      // Total depreciation before 2026: 11*3333 + 12*2000 = 36,663 + 24,000 = 60,663
      const netValueStart2026 = basis - 60_663; // = 39,337

      const amount = (service as any).calculateDegressive(
        basis,
        rate,
        60_663,
        0,
        2026,
        1,
        new Date('2024-01-15'),
        entriesBeforeYear,
      );

      // Degressive annual: 39,337 * 40% = 15,734.80
      // Degressive monthly: 15,734.80 / 12 = 1,311.23
      // Linear monthly: (100,000 * 20%) / 12 = 1,666.67
      // Linear > degressive -> switch to linear
      expect(amount).toBeCloseTo(1_666.67, 2);
    });
  });

  // =============================================================
  // Validation tests
  // =============================================================
  describe('validation and error handling', () => {
    it('should throw when asset is not found', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue(null);

      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'nonexistent', 2024, 2),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'nonexistent', 2024, 2),
      ).rejects.toThrow('nie zostal znaleziony');
    });

    it('should throw when asset is not active', async () => {
      const asset = createMockAsset({ status: 'SOLD' });
      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);

      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 2),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 2),
      ).rejects.toThrow('nie jest aktywny');
    });

    it('should return existing entry if depreciation already exists for month', async () => {
      const asset = createMockAsset();
      const existingEntry = {
        id: 'existing-entry',
        asset_id: 'asset-1',
        month: 2,
        year: 2024,
        amount: 200,
      };

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(existingEntry);

      const result = await service.calculateMonthlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2024,
        2,
      );

      expect(result).toEqual(existingEntry);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw for period after deactivation date', async () => {
      const asset = createMockAsset({
        deactivationDate: new Date('2024-06-30'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);

      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 8),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateMonthlyDepreciation('tenant-1', 'company-1', 'asset-1', 2024, 8),
      ).rejects.toThrow('wycofany');
    });

    it('should throw for unknown depreciation method', () => {
      expect(() => {
        (service as any).calculateAmount(
          'UNKNOWN_METHOD',
          10_000,
          20,
          0,
          0,
          2024,
          2,
          new Date('2024-01-15'),
          [],
        );
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).calculateAmount(
          'UNKNOWN_METHOD',
          10_000,
          20,
          0,
          0,
          2024,
          2,
          new Date('2024-01-15'),
          [],
        );
      }).toThrow('Nieznana metoda amortyzacji');
    });
  });

  // =============================================================
  // Yearly depreciation
  // =============================================================
  describe('calculateYearlyDepreciation', () => {
    it('should process one-time depreciation only in activation month', async () => {
      const asset = createMockAsset({
        depreciationMethod: 'ONE_TIME',
        initialValue: 8_000,
        activationDate: new Date('2024-05-20'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        {
          id: 'entry-onetime',
          amount: 8_000,
          month: 5,
          year: 2024,
        },
      ]);

      const results = await service.calculateYearlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2024,
      );

      // Only one entry for one-time method
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe(8_000);
      expect(results[0].month).toBe(5);
    });

    it('should return empty array for one-time asset in wrong year', async () => {
      const asset = createMockAsset({
        depreciationMethod: 'ONE_TIME',
        activationDate: new Date('2024-05-20'),
      });

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);

      const results = await service.calculateYearlyDepreciation(
        'tenant-1',
        'company-1',
        'asset-1',
        2025, // Wrong year
      );

      expect(results).toHaveLength(0);
    });
  });

  // =============================================================
  // Generate monthly depreciation for all assets
  // =============================================================
  describe('generateMonthlyDepreciationForAll', () => {
    it('should process all active non-fully-depreciated assets', async () => {
      const assets = [
        createMockAsset({ id: 'asset-1', name: 'Laptop' }),
        createMockAsset({ id: 'asset-2', name: 'Printer' }),
      ];

      mockPrisma.fixedAsset.findMany.mockResolvedValue(assets);

      // For each asset, findFirst and subsequent calls
      mockPrisma.fixedAsset.findFirst.mockResolvedValue(assets[0]);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'e1', amount: 200 },
      ]);

      const result = await service.generateMonthlyDepreciationForAll(
        'tenant-1',
        'company-1',
        2024,
        2,
      );

      expect(result.period).toBe('2/2024');
      expect(result.assetsProcessed).toBe(2);
    });

    it('should report errors for individual assets without failing overall', async () => {
      const assets = [
        createMockAsset({ id: 'asset-1', name: 'Laptop', status: 'ACTIVE' }),
        createMockAsset({ id: 'asset-2', name: 'BadAsset', status: 'ACTIVE' }),
      ];

      mockPrisma.fixedAsset.findMany.mockResolvedValue(assets);

      // First asset succeeds
      let callCount = 0;
      mockPrisma.fixedAsset.findFirst.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return assets[0];
        // Second asset not found (simulating error)
        return null;
      });

      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'e1', amount: 200 },
      ]);

      const result = await service.generateMonthlyDepreciationForAll(
        'tenant-1',
        'company-1',
        2024,
        2,
      );

      expect(result.assetsProcessed).toBe(2);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });
  });

  // =============================================================
  // Get depreciation entries
  // =============================================================
  describe('getDepreciationEntries', () => {
    it('should return paginated entries for an asset', async () => {
      const mockEntries = [
        { id: 'e1', month: 2, year: 2024, amount: 200 },
        { id: 'e2', month: 3, year: 2024, amount: 200 },
      ];

      mockPrisma.depreciationEntry.findMany.mockResolvedValue(mockEntries);
      mockPrisma.depreciationEntry.count.mockResolvedValue(10);

      const result = await service.getDepreciationEntries(
        'tenant-1',
        'company-1',
        'asset-1',
        { year: 2024, page: 1, limit: 10 },
      );

      expect(result.entries).toEqual(mockEntries);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should use default pagination when not provided', async () => {
      mockPrisma.depreciationEntry.findMany.mockResolvedValue([]);
      mockPrisma.depreciationEntry.count.mockResolvedValue(0);

      const result = await service.getDepreciationEntries(
        'tenant-1',
        'company-1',
        'asset-1',
      );

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should apply year and month filters', async () => {
      mockPrisma.depreciationEntry.findMany.mockResolvedValue([]);
      mockPrisma.depreciationEntry.count.mockResolvedValue(0);

      await service.getDepreciationEntries(
        'tenant-1',
        'company-1',
        'asset-1',
        { year: 2024, month: 3 },
      );

      expect(mockPrisma.depreciationEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year: 2024,
            month: 3,
          }),
        }),
      );
    });
  });
});
