import { Test, TestingModule } from '@nestjs/testing';
import { FixedAssetsService } from './fixed-assets.service';
import { DepreciationService } from './services/depreciation.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KST_GROUPS } from './dto/create-fixed-asset.dto';

describe('FixedAssetsService', () => {
  let service: FixedAssetsService;
  let depreciationService: DepreciationService;

  const mockPrisma = {
    fixedAsset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    depreciationEntry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FixedAssetsService,
        DepreciationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FixedAssetsService>(FixedAssetsService);
    depreciationService = module.get<DepreciationService>(DepreciationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // createAsset
  // =========================================================================

  describe('createAsset', () => {
    it('should create a fixed asset with LINEAR depreciation', async () => {
      const dto = {
        name: 'Laptop Dell XPS',
        inventoryNumber: 'IT-001',
        kstGroup: '4',
        acquisitionDate: '2026-01-15',
        activationDate: '2026-01-20',
        initialValue: 8000,
        depreciationMethod: 'LINEAR' as const,
        annualRate: 14,
      };

      const expectedData = {
        id: 'asset-1',
        ...dto,
        monthlyRate: 14 / 12,
        currentValue: 8000,
        totalDepreciation: 0,
        isFullyDepreciated: false,
        status: 'ACTIVE',
      };

      mockPrisma.fixedAsset.create.mockResolvedValue(expectedData);

      const result = await service.createAsset('tenant-1', 'company-1', dto);

      expect(result.id).toBe('asset-1');
      expect(mockPrisma.fixedAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: 'tenant-1',
            company_id: 'company-1',
            name: 'Laptop Dell XPS',
            depreciationMethod: 'LINEAR',
            annualRate: 14,
            monthlyRate: 14 / 12,
            totalDepreciation: 0,
            isFullyDepreciated: false,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should reject ONE_TIME depreciation for assets over 10,000 PLN', async () => {
      const dto = {
        name: 'Drogi sprzet',
        inventoryNumber: 'EQ-001',
        acquisitionDate: '2026-01-01',
        activationDate: '2026-01-05',
        initialValue: 15000,
        depreciationMethod: 'ONE_TIME' as const,
        annualRate: 100,
      };

      await expect(
        service.createAsset('tenant-1', 'company-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow ONE_TIME depreciation for assets at 10,000 PLN', async () => {
      const dto = {
        name: 'Komputer',
        inventoryNumber: 'IT-002',
        acquisitionDate: '2026-01-01',
        activationDate: '2026-01-05',
        initialValue: 10000,
        depreciationMethod: 'ONE_TIME' as const,
        annualRate: 100,
      };

      mockPrisma.fixedAsset.create.mockResolvedValue({ id: 'asset-2', ...dto });

      const result = await service.createAsset('tenant-1', 'company-1', dto);
      expect(result.id).toBe('asset-2');
    });

    it('should allow ONE_TIME depreciation for assets below 10,000 PLN', async () => {
      const dto = {
        name: 'Drukarka',
        inventoryNumber: 'IT-003',
        acquisitionDate: '2026-02-01',
        activationDate: '2026-02-05',
        initialValue: 5000,
        depreciationMethod: 'ONE_TIME' as const,
        annualRate: 100,
      };

      mockPrisma.fixedAsset.create.mockResolvedValue({ id: 'asset-3', ...dto });

      const result = await service.createAsset('tenant-1', 'company-1', dto);
      expect(result.id).toBe('asset-3');
    });

    it('should reject depreciation for KST group 0 (Grunty) with annualRate > 0', async () => {
      const dto = {
        name: 'Dzialka budowlana',
        inventoryNumber: 'GR-001',
        kstGroup: '0',
        acquisitionDate: '2026-01-01',
        activationDate: '2026-01-01',
        initialValue: 200000,
        depreciationMethod: 'LINEAR' as const,
        annualRate: 5,
      };

      await expect(
        service.createAsset('tenant-1', 'company-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject depreciation for KST group 9 (Inwentarz zywy) with annualRate > 0', async () => {
      const dto = {
        name: 'Konie sluzbowe',
        inventoryNumber: 'IZ-001',
        kstGroup: '9',
        acquisitionDate: '2026-01-01',
        activationDate: '2026-01-01',
        initialValue: 50000,
        depreciationMethod: 'LINEAR' as const,
        annualRate: 10,
      };

      await expect(
        service.createAsset('tenant-1', 'company-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include improvement value in currentValue', async () => {
      const dto = {
        name: 'Budynek biurowy',
        inventoryNumber: 'BD-001',
        kstGroup: '1',
        acquisitionDate: '2026-01-01',
        activationDate: '2026-02-01',
        initialValue: 500000,
        improvementValue: 50000,
        depreciationMethod: 'LINEAR' as const,
        annualRate: 2.5,
      };

      mockPrisma.fixedAsset.create.mockResolvedValue({ id: 'asset-4', ...dto });

      await service.createAsset('tenant-1', 'company-1', dto);

      expect(mockPrisma.fixedAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentValue: 550000, // 500000 + 50000
          }),
        }),
      );
    });
  });

  // =========================================================================
  // getAsset
  // =========================================================================

  describe('getAsset', () => {
    it('should return the asset when found', async () => {
      const mockAsset = {
        id: 'asset-1',
        name: 'Laptop',
        initialValue: 5000,
        depreciationEntries: [],
      };
      mockPrisma.fixedAsset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.getAsset('tenant-1', 'company-1', 'asset-1');
      expect(result).toEqual(mockAsset);
    });

    it('should throw NotFoundException when asset is not found', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue(null);

      await expect(
        service.getAsset('tenant-1', 'company-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // listAssets
  // =========================================================================

  describe('listAssets', () => {
    it('should return paginated assets list', async () => {
      const mockAssets = [
        { id: 'asset-1', name: 'Laptop' },
        { id: 'asset-2', name: 'Samochod' },
      ];
      mockPrisma.fixedAsset.findMany.mockResolvedValue(mockAssets);
      mockPrisma.fixedAsset.count.mockResolvedValue(2);

      const result = await service.listAssets('tenant-1', 'company-1', {
        page: 1,
        limit: 10,
      });

      expect(result.assets).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('should apply status filter', async () => {
      mockPrisma.fixedAsset.findMany.mockResolvedValue([]);
      mockPrisma.fixedAsset.count.mockResolvedValue(0);

      await service.listAssets('tenant-1', 'company-1', {
        status: 'ACTIVE',
      });

      expect(mockPrisma.fixedAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // updateAsset
  // =========================================================================

  describe('updateAsset', () => {
    it('should prevent changing depreciation method when entries exist', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        depreciationMethod: 'LINEAR',
        depreciationEntries: [],
      });
      mockPrisma.depreciationEntry.count.mockResolvedValue(5); // entries exist

      await expect(
        service.updateAsset('tenant-1', 'company-1', 'asset-1', {
          depreciationMethod: 'DEGRESSIVE',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow update when no depreciation entries exist', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        depreciationMethod: 'LINEAR',
        initialValue: 5000,
        improvementValue: 0,
        totalDepreciation: 0,
        depreciationEntries: [],
      });
      mockPrisma.depreciationEntry.count.mockResolvedValue(0);
      mockPrisma.fixedAsset.update.mockResolvedValue({
        id: 'asset-1',
        depreciationMethod: 'DEGRESSIVE',
      });

      const result = await service.updateAsset('tenant-1', 'company-1', 'asset-1', {
        depreciationMethod: 'DEGRESSIVE',
      });

      expect(result.depreciationMethod).toBe('DEGRESSIVE');
    });

    it('should update name and description without issues', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        name: 'Old Name',
        depreciationMethod: 'LINEAR',
        depreciationEntries: [],
      });
      mockPrisma.fixedAsset.update.mockResolvedValue({
        id: 'asset-1',
        name: 'New Name',
        description: 'New description',
      });

      const result = await service.updateAsset('tenant-1', 'company-1', 'asset-1', {
        name: 'New Name',
        description: 'New description',
      });

      expect(result.name).toBe('New Name');
    });
  });

  // =========================================================================
  // deleteAsset (soft delete)
  // =========================================================================

  describe('deleteAsset', () => {
    it('should soft-delete by setting status to LIQUIDATED', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        name: 'Laptop',
        status: 'ACTIVE',
        depreciationEntries: [],
      });
      mockPrisma.fixedAsset.update.mockResolvedValue({
        id: 'asset-1',
        status: 'LIQUIDATED',
      });

      const result = await service.deleteAsset('tenant-1', 'company-1', 'asset-1');

      expect(mockPrisma.fixedAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'LIQUIDATED',
          }),
        }),
      );
      expect(result.status).toBe('LIQUIDATED');
    });
  });

  // =========================================================================
  // getAssetSummary
  // =========================================================================

  describe('getAssetSummary', () => {
    it('should return correct totals for multiple assets', async () => {
      mockPrisma.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'a1',
          initialValue: 10000,
          currentValue: 8000,
          totalDepreciation: 2000,
          improvementValue: 0,
          status: 'ACTIVE',
          isFullyDepreciated: false,
          kstGroup: '4',
          category: 'IT',
          depreciationMethod: 'LINEAR',
        },
        {
          id: 'a2',
          initialValue: 50000,
          currentValue: 40000,
          totalDepreciation: 10000,
          improvementValue: 5000,
          status: 'ACTIVE',
          isFullyDepreciated: false,
          kstGroup: '7',
          category: 'Transport',
          depreciationMethod: 'LINEAR',
        },
        {
          id: 'a3',
          initialValue: 3000,
          currentValue: 0,
          totalDepreciation: 3000,
          improvementValue: 0,
          status: 'ACTIVE',
          isFullyDepreciated: true,
          kstGroup: '8',
          category: 'IT',
          depreciationMethod: 'ONE_TIME',
        },
      ]);

      const result = await service.getAssetSummary('tenant-1', 'company-1');

      expect(result.totalAssets).toBe(3);
      expect(result.totalInitialValue).toBe(63000);
      expect(result.totalCurrentValue).toBe(48000);
      expect(result.totalDepreciation).toBe(15000);
      expect(result.totalImprovementValue).toBe(5000);
      expect(result.fullyDepreciatedCount).toBe(1);
      expect(result.statusCounts.ACTIVE).toBe(3);
      expect(result.statusCounts.SOLD).toBe(0);
    });

    it('should group by KST group', async () => {
      mockPrisma.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'a1',
          initialValue: 10000,
          currentValue: 8000,
          totalDepreciation: 2000,
          improvementValue: 0,
          status: 'ACTIVE',
          isFullyDepreciated: false,
          kstGroup: '4',
          category: 'IT',
          depreciationMethod: 'LINEAR',
        },
        {
          id: 'a2',
          initialValue: 5000,
          currentValue: 4000,
          totalDepreciation: 1000,
          improvementValue: 0,
          status: 'ACTIVE',
          isFullyDepreciated: false,
          kstGroup: '4',
          category: 'IT',
          depreciationMethod: 'LINEAR',
        },
      ]);

      const result = await service.getAssetSummary('tenant-1', 'company-1');

      expect(result.byKstGroup).toHaveLength(1);
      expect(result.byKstGroup[0].group).toBe('4');
      expect(result.byKstGroup[0].count).toBe(2);
      expect(result.byKstGroup[0].initialValue).toBe(15000);
    });

    it('should calculate depreciation percentage', async () => {
      mockPrisma.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'a1',
          initialValue: 100000,
          currentValue: 50000,
          totalDepreciation: 50000,
          improvementValue: 0,
          status: 'ACTIVE',
          isFullyDepreciated: false,
          kstGroup: '1',
          category: 'Building',
          depreciationMethod: 'LINEAR',
        },
      ]);

      const result = await service.getAssetSummary('tenant-1', 'company-1');

      expect(result.depreciationPercentage).toBe(50);
    });

    it('should handle empty asset list', async () => {
      mockPrisma.fixedAsset.findMany.mockResolvedValue([]);

      const result = await service.getAssetSummary('tenant-1', 'company-1');

      expect(result.totalAssets).toBe(0);
      expect(result.totalInitialValue).toBe(0);
      expect(result.depreciationPercentage).toBe(0);
    });
  });

  // =========================================================================
  // DepreciationService - calculateAmount logic
  // =========================================================================

  describe('DepreciationService - calculation methods', () => {
    it('should calculate LINEAR depreciation correctly', () => {
      // Access private method via any
      const calculateLinear = (depreciationService as any).calculateLinear.bind(depreciationService);

      const basis = 60000;
      const annualRate = 20;

      // Annual: 60000 * 20% = 12000, monthly = 1000
      const monthlyAmount = calculateLinear(basis, annualRate);
      expect(monthlyAmount).toBe(1000);
    });

    it('should calculate LINEAR depreciation for low rate', () => {
      const calculateLinear = (depreciationService as any).calculateLinear.bind(depreciationService);

      const basis = 500000;
      const annualRate = 2.5;

      // Annual: 500000 * 2.5% = 12500, monthly = ~1041.67
      const monthlyAmount = calculateLinear(basis, annualRate);
      expect(monthlyAmount).toBeCloseTo(1041.67, 1);
    });

    it('should calculate ONE_TIME depreciation as full amount', () => {
      const calculateOneTime = (depreciationService as any).calculateOneTime.bind(depreciationService);

      const basis = 8000;
      const salvageValue = 0;

      const amount = calculateOneTime(basis, salvageValue);
      expect(amount).toBe(8000);
    });

    it('should calculate ONE_TIME depreciation minus salvage value', () => {
      const calculateOneTime = (depreciationService as any).calculateOneTime.bind(depreciationService);

      const basis = 8000;
      const salvageValue = 500;

      const amount = calculateOneTime(basis, salvageValue);
      expect(amount).toBe(7500);
    });

    it('should calculate DEGRESSIVE depreciation with coefficient 2.0', () => {
      const calculateDegressive = (depreciationService as any).calculateDegressive.bind(depreciationService);

      const basis = 60000;
      const annualRate = 20;
      const totalDepreciation = 0;
      const salvageValue = 0;
      const year = 2026;
      const month = 1;
      const activationDate = new Date(2025, 11, 1); // Dec 2025
      const existingEntries: any[] = [];

      // First year: netValue = 60000, degressiveRate = 20*2 = 40%
      // Annual degressive: 60000 * 40% = 24000, monthly = 2000
      const monthlyAmount = calculateDegressive(
        basis, annualRate, totalDepreciation, salvageValue,
        year, month, activationDate, existingEntries,
      );

      expect(monthlyAmount).toBe(2000);
    });

    it('should switch to linear when degressive amount drops below linear', () => {
      const calculateDegressive = (depreciationService as any).calculateDegressive.bind(depreciationService);

      const basis = 60000;
      const annualRate = 20;
      const salvageValue = 0;
      const activationDate = new Date(2024, 0, 1);

      // Simulate entries from previous years that bring net value very low
      // After heavy depreciation, net value at start of year becomes small
      const existingEntries = [
        // Year 2024 entries totaling 24000 (degressive first year: 60000 * 40% = 24000)
        ...Array(12).fill(null).map((_, i) => ({
          year: 2024,
          month: i + 1,
          amount: 2000,
        })),
        // Year 2025 entries totaling 14400 (degressive second year: 36000 * 40% = 14400)
        ...Array(12).fill(null).map((_, i) => ({
          year: 2025,
          month: i + 1,
          amount: 1200,
        })),
      ];

      const totalDepreciation = 38400;
      // Net value at start of 2026 = 60000 - 38400 = 21600
      // Degressive: 21600 * 40% / 12 = 720
      // Linear: 60000 * 20% / 12 = 1000
      // Since linear (1000) > degressive (720), should switch to linear
      const monthlyAmount = calculateDegressive(
        basis, annualRate, totalDepreciation, salvageValue,
        2026, 1, activationDate, existingEntries,
      );

      const linearMonthly = (basis * annualRate / 100) / 12; // 1000
      expect(monthlyAmount).toBe(linearMonthly);
    });
  });

  // =========================================================================
  // DepreciationService - calculateMonthlyDepreciation
  // =========================================================================

  describe('DepreciationService - calculateMonthlyDepreciation', () => {
    it('should throw for non-existent asset', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue(null);

      await expect(
        depreciationService.calculateMonthlyDepreciation(
          'tenant-1', 'company-1', 'nonexistent', 2026, 1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for inactive asset', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        status: 'LIQUIDATED',
        isFullyDepreciated: false,
        depreciationEntries: [],
      });

      await expect(
        depreciationService.calculateMonthlyDepreciation(
          'tenant-1', 'company-1', 'asset-1', 2026, 1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for fully depreciated asset', async () => {
      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        status: 'ACTIVE',
        isFullyDepreciated: true,
        depreciationEntries: [],
      });

      await expect(
        depreciationService.calculateMonthlyDepreciation(
          'tenant-1', 'company-1', 'asset-1', 2026, 1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return existing entry if already calculated for the month', async () => {
      const existingEntry = { id: 'entry-1', amount: 1000, month: 3, year: 2026 };

      mockPrisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        status: 'ACTIVE',
        isFullyDepreciated: false,
        depreciationEntries: [],
      });
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(existingEntry);

      const result = await depreciationService.calculateMonthlyDepreciation(
        'tenant-1', 'company-1', 'asset-1', 2026, 3,
      );

      expect(result).toEqual(existingEntry);
    });

    it('should calculate and create entry for LINEAR depreciation', async () => {
      const asset = {
        id: 'asset-1',
        name: 'Laptop',
        status: 'ACTIVE',
        isFullyDepreciated: false,
        depreciationMethod: 'LINEAR',
        initialValue: 12000,
        improvementValue: 0,
        salvageValue: 0,
        totalDepreciation: 0,
        currentValue: 12000,
        annualRate: 20,
        activationDate: new Date(2025, 11, 1), // Dec 2025
        deactivationDate: null,
        depreciationEntries: [],
      };

      mockPrisma.fixedAsset.findFirst.mockResolvedValue(asset);
      mockPrisma.depreciationEntry.findUnique.mockResolvedValue(null);

      const createdEntry = {
        id: 'entry-1',
        amount: 200, // 12000 * 20% / 12 = 200
        month: 1,
        year: 2026,
      };
      mockPrisma.$transaction.mockResolvedValue([createdEntry]);

      const result = await depreciationService.calculateMonthlyDepreciation(
        'tenant-1', 'company-1', 'asset-1', 2026, 1,
      );

      expect(result.amount).toBe(200);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // KST_GROUPS constants
  // =========================================================================

  describe('KST_GROUPS', () => {
    it('should have 10 groups (0-9)', () => {
      expect(Object.keys(KST_GROUPS)).toHaveLength(10);
    });

    it('should have group 0 (Grunty) with zero depreciation', () => {
      expect(KST_GROUPS['0'].name).toBe('Grunty');
      expect(KST_GROUPS['0'].maxRate).toBe(0);
      expect(KST_GROUPS['0'].defaultRate).toBe(0);
    });

    it('should have group 7 (Srodki transportu) with 20% default rate', () => {
      expect(KST_GROUPS['7'].name).toBe('Srodki transportu');
      expect(KST_GROUPS['7'].defaultRate).toBe(20);
    });

    it('should have group 9 (Inwentarz zywy) with zero depreciation', () => {
      expect(KST_GROUPS['9'].name).toBe('Inwentarz zywy');
      expect(KST_GROUPS['9'].maxRate).toBe(0);
    });
  });
});
