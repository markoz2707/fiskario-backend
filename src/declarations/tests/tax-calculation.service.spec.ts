import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaxCalculationService } from '../services/tax-calculation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VATRegisterType, DeclarationType } from '../dto/tax-calculation.dto';

describe('TaxCalculationService', () => {
  let service: TaxCalculationService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    vATRegister: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    taxCalculation: {
      findFirst: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxCalculationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TaxCalculationService>(TaxCalculationService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateVAT7', () => {
    const mockVATRegisters = [
      {
        id: '1',
        type: VATRegisterType.SPRZEDAZ,
        netAmount: 1000,
        vatAmount: 230,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
      },
      {
        id: '2',
        type: VATRegisterType.ZAKUP,
        netAmount: 500,
        vatAmount: 115,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
      },
      {
        id: '3',
        type: VATRegisterType.SPRZEDAZ,
        netAmount: 200,
        vatAmount: 46,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
      },
    ];

    beforeEach(() => {
      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockVATRegisters);
    });

    it('should calculate VAT-7 correctly with multiple entries', async () => {
      const result = await service.calculateVAT7('tenant1', 'company1', '2024-10');

      expect(result).toEqual({
        period: '2024-10',
        declarationType: DeclarationType.VAT_7,
        totalRevenue: 1200, // 1000 + 200
        vatCollectedSales: 276, // 230 + 46
        vatPaidPurchases: 115,
        vatDue: 161, // 276 - 115
        totalCosts: 500,
        details: {
          sales: expect.arrayContaining([
            expect.objectContaining({ type: VATRegisterType.SPRZEDAZ }),
          ]),
          purchases: expect.arrayContaining([
            expect.objectContaining({ type: VATRegisterType.ZAKUP }),
          ]),
          summary: {
            totalSalesNet: 1200,
            totalSalesVAT: 276,
            totalPurchasesNet: 500,
            totalPurchasesVAT: 115,
          },
        },
      });

      expect(prismaService.vATRegister.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          period: '2024-10',
        },
      });
    });

    it('should throw NotFoundException when no VAT register entries found', async () => {
      mockPrismaService.vATRegister.findMany.mockResolvedValue([]);

      await expect(service.calculateVAT7('tenant1', 'company1', '2024-10'))
        .rejects.toThrow(NotFoundException);
      await expect(service.calculateVAT7('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('No VAT register entries found for period 2024-10');
    });

    it('should handle only sales entries', async () => {
      const salesOnlyRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(salesOnlyRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', '2024-10');

      expect(result.totalRevenue).toBe(1000);
      expect(result.vatCollectedSales).toBe(230);
      expect(result.vatPaidPurchases).toBe(0);
      expect(result.vatDue).toBe(230);
      expect(result.totalCosts).toBe(0);
    });

    it('should handle only purchase entries', async () => {
      const purchasesOnlyRegisters = [
        {
          id: '1',
          type: VATRegisterType.ZAKUP,
          netAmount: 500,
          vatAmount: 115,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(purchasesOnlyRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', '2024-10');

      expect(result.totalRevenue).toBe(0);
      expect(result.vatCollectedSales).toBe(0);
      expect(result.vatPaidPurchases).toBe(115);
      expect(result.vatDue).toBe(-115); // Negative means VAT return
      expect(result.totalCosts).toBe(500);
    });

    it('should handle zero amounts', async () => {
      const zeroAmountRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 0,
          vatAmount: 0,
          vatRate: 0,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(zeroAmountRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', '2024-10');

      expect(result.totalRevenue).toBe(0);
      expect(result.vatCollectedSales).toBe(0);
      expect(result.vatPaidPurchases).toBe(0);
      expect(result.vatDue).toBe(0);
      expect(result.totalCosts).toBe(0);
    });

    it('should handle large amounts', async () => {
      const largeAmountRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000000,
          vatAmount: 230000,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
        {
          id: '2',
          type: VATRegisterType.ZAKUP,
          netAmount: 500000,
          vatAmount: 115000,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(largeAmountRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', '2024-10');

      expect(result.totalRevenue).toBe(1000000);
      expect(result.vatCollectedSales).toBe(230000);
      expect(result.vatPaidPurchases).toBe(115000);
      expect(result.vatDue).toBe(115000);
      expect(result.totalCosts).toBe(500000);
    });

    it('should handle database errors', async () => {
      mockPrismaService.vATRegister.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.calculateVAT7('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('Database error');
    });

    it('should handle concurrent calculations', async () => {
      const periods = ['2024-10', '2024-11', '2024-12'];

      const results = await Promise.all(
        periods.map(period => service.calculateVAT7('tenant1', 'company1', period))
      );

      expect(results).toHaveLength(3);
      expect(prismaService.vATRegister.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('calculateJPKV7', () => {
    const mockVATRegisters = [
      {
        id: '1',
        type: VATRegisterType.SPRZEDAZ,
        netAmount: 1000,
        vatAmount: 230,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
        invoiceDate: new Date('2024-10-01'),
      },
      {
        id: '2',
        type: VATRegisterType.ZAKUP,
        netAmount: 500,
        vatAmount: 115,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
        invoiceDate: new Date('2024-10-02'),
      },
      {
        id: '3',
        type: VATRegisterType.SPRZEDAZ,
        netAmount: 200,
        vatAmount: 16,
        vatRate: 8,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
        invoiceDate: new Date('2024-10-03'),
      },
    ];

    beforeEach(() => {
      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockVATRegisters);
    });

    it('should calculate JPK_V7M correctly', async () => {
      const result = await service.calculateJPKV7('tenant1', 'company1', '2024-10', 'M');

      expect(result).toEqual({
        period: '2024-10',
        variant: 'M',
        declarationType: DeclarationType.JPK_V7M,
        totalRevenue: 1200,
        vatCollectedSales: 246,
        vatPaidPurchases: 115,
        vatDue: 131,
        totalCosts: 500,
        details: {
          salesByRate: expect.any(Object),
          purchasesByRate: expect.any(Object),
          vatRegisters: expect.arrayContaining([
            expect.objectContaining({ type: VATRegisterType.SPRZEDAZ }),
            expect.objectContaining({ type: VATRegisterType.ZAKUP }),
          ]),
          summary: {
            totalSalesNet: 1200,
            totalSalesVAT: 246,
            totalPurchasesNet: 500,
            totalPurchasesVAT: 115,
            vatDue: 131,
          },
        },
      });

      expect(prismaService.vATRegister.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          period: '2024-10',
        },
        orderBy: [
          { type: 'asc' },
          { invoiceDate: 'asc' },
        ],
      });
    });

    it('should calculate JPK_V7K correctly', async () => {
      const result = await service.calculateJPKV7('tenant1', 'company1', '2024-10', 'K');

      expect(result.declarationType).toBe(DeclarationType.JPK_V7K);
      expect(result.variant).toBe('K');
    });

    it('should group entries by VAT rate correctly', async () => {
      const result = await service.calculateJPKV7('tenant1', 'company1', '2024-10', 'M');

      expect(result.details.salesByRate).toBeDefined();
      expect(result.details.purchasesByRate).toBeDefined();

      // Check that grouping logic works
      const salesByRate = result.details.salesByRate;
      expect(salesByRate[23]).toBeDefined();
      expect(salesByRate[8]).toBeDefined();
    });

    it('should throw NotFoundException when no entries found', async () => {
      mockPrismaService.vATRegister.findMany.mockResolvedValue([]);

      await expect(service.calculateJPKV7('tenant1', 'company1', '2024-10', 'M'))
        .rejects.toThrow(NotFoundException);
    });

    it('should handle database errors', async () => {
      mockPrismaService.vATRegister.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.calculateJPKV7('tenant1', 'company1', '2024-10', 'M'))
        .rejects.toThrow('Database error');
    });
  });

  describe('calculatePITAdvance', () => {
    const mockTaxCalculation = {
      id: '1',
      tenant_id: 'tenant1',
      company_id: 'company1',
      period: '2024-10',
      declarationType: DeclarationType.PIT_36,
      taxableIncome: 50000,
      previousAdvance: 2000,
    };

    beforeEach(() => {
      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(mockTaxCalculation);
    });

    it('should calculate PIT advance for income in first bracket', async () => {
      const result = await service.calculatePITAdvance('tenant1', 'company1', '2024-10');

      expect(result).toEqual({
        period: '2024-10',
        declarationType: DeclarationType.PIT_36,
        taxableIncome: 50000,
        taxBase: 50000,
        taxDue: 6000, // 50000 * 0.12
        previousAdvance: 2000,
        advanceToPay: 4000, // 6000 - 2000
        details: {
          taxBrackets: [
            { threshold: 120000, rate: 0.12 },
            { threshold: Infinity, rate: 0.32 },
          ],
          calculation: {
            firstBracket: 6000,
            secondBracket: 0,
          },
        },
      });

      expect(prismaService.taxCalculation.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          period: '2024-10',
          declarationType: DeclarationType.PIT_36,
        },
      });
    });

    it('should calculate PIT advance for income in second bracket', async () => {
      const highIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: 150000,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(highIncomeTaxCalc);

      const result = await service.calculatePITAdvance('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(31200); // (120000 * 0.12) + (30000 * 0.32)
      expect(result.advanceToPay).toBe(29200); // 31200 - 2000
      expect(result.details.calculation.firstBracket).toBe(14400); // 120000 * 0.12
      expect(result.details.calculation.secondBracket).toBe(9600); // 30000 * 0.32
    });

    it('should handle zero taxable income', async () => {
      const zeroIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: 0,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(zeroIncomeTaxCalc);

      const result = await service.calculatePITAdvance('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(0);
      expect(result.advanceToPay).toBe(0);
    });

    it('should handle negative taxable income', async () => {
      const negativeIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: -10000,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(negativeIncomeTaxCalc);

      const result = await service.calculatePITAdvance('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(0);
      expect(result.advanceToPay).toBe(0);
    });

    it('should throw NotFoundException when no tax calculation found', async () => {
      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(null);

      await expect(service.calculatePITAdvance('tenant1', 'company1', '2024-10'))
        .rejects.toThrow(NotFoundException);
      await expect(service.calculatePITAdvance('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('No tax calculation found for period 2024-10');
    });

    it('should handle database errors', async () => {
      mockPrismaService.taxCalculation.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.calculatePITAdvance('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('Database error');
    });

    it('should handle missing previous advance', async () => {
      const taxCalcWithoutPreviousAdvance = {
        ...mockTaxCalculation,
        previousAdvance: null,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(taxCalcWithoutPreviousAdvance);

      const result = await service.calculatePITAdvance('tenant1', 'company1', '2024-10');

      expect(result.previousAdvance).toBeNull();
      expect(result.advanceToPay).toBe(6000); // taxDue - null = taxDue
    });

    it('should handle very high income correctly', async () => {
      const veryHighIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: 1000000,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(veryHighIncomeTaxCalc);

      const result = await service.calculatePITAdvance('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(295200); // (120000 * 0.12) + (880000 * 0.32)
      expect(result.advanceToPay).toBe(293200); // 295200 - 2000
    });
  });

  describe('calculateCIT', () => {
    const mockTaxCalculation = {
      id: '1',
      tenant_id: 'tenant1',
      company_id: 'company1',
      period: '2024-10',
      declarationType: DeclarationType.CIT_8,
      taxableIncome: 100000,
    };

    beforeEach(() => {
      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(mockTaxCalculation);
    });

    it('should calculate CIT correctly for standard company', async () => {
      const result = await service.calculateCIT('tenant1', 'company1', '2024-10');

      expect(result).toEqual({
        period: '2024-10',
        declarationType: DeclarationType.CIT_8,
        taxableIncome: 100000,
        taxBase: 100000,
        taxDue: 19000, // 100000 * 0.19
        citRate: 0.19,
        details: {
          standardRate: 0.19,
          smallTaxpayerRate: 0.09,
          appliedRate: 0.19,
        },
      });
    });

    it('should handle zero taxable income', async () => {
      const zeroIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: 0,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(zeroIncomeTaxCalc);

      const result = await service.calculateCIT('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(0);
    });

    it('should handle negative taxable income', async () => {
      const negativeIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: -50000,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(negativeIncomeTaxCalc);

      const result = await service.calculateCIT('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(0);
    });

    it('should throw NotFoundException when no tax calculation found', async () => {
      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(null);

      await expect(service.calculateCIT('tenant1', 'company1', '2024-10'))
        .rejects.toThrow(NotFoundException);
    });

    it('should handle database errors', async () => {
      mockPrismaService.taxCalculation.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.calculateCIT('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('Database error');
    });

    it('should handle very large taxable income', async () => {
      const largeIncomeTaxCalc = {
        ...mockTaxCalculation,
        taxableIncome: 10000000,
      };

      mockPrismaService.taxCalculation.findFirst.mockResolvedValue(largeIncomeTaxCalc);

      const result = await service.calculateCIT('tenant1', 'company1', '2024-10');

      expect(result.taxDue).toBe(1900000); // 10000000 * 0.19
    });
  });

  describe('addVATRegisterEntry', () => {
    const mockCreateDto = {
      type: VATRegisterType.SPRZEDAZ,
      period: '2024-10',
      counterpartyName: 'Test Company',
      counterpartyNIP: '1234567890',
      invoiceNumber: 'FV/001',
      invoiceDate: '2024-10-01',
      netAmount: 1000,
      vatAmount: 230,
      vatRate: 23,
      gtuCode: 'GTU_01',
      documentType: 'invoice',
    };

    const mockCreatedEntry = {
      id: '1',
      tenant_id: 'tenant1',
      company_id: 'company1',
      type: VATRegisterType.SPRZEDAZ,
      period: '2024-10',
      counterpartyName: 'Test Company',
      counterpartyNIP: '1234567890',
      invoiceNumber: 'FV/001',
      invoiceDate: new Date('2024-10-01'),
      netAmount: 1000,
      vatAmount: 230,
      vatRate: 23,
      gtuCode: 'GTU_01',
      documentType: 'invoice',
    };

    beforeEach(() => {
      mockPrismaService.vATRegister.create.mockResolvedValue(mockCreatedEntry);
    });

    it('should add VAT register entry successfully', async () => {
      const result = await service.addVATRegisterEntry('tenant1', 'company1', mockCreateDto);

      expect(result).toEqual(mockCreatedEntry);

      expect(prismaService.vATRegister.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          type: VATRegisterType.SPRZEDAZ,
          period: '2024-10',
          counterpartyName: 'Test Company',
          counterpartyNIP: '1234567890',
          invoiceNumber: 'FV/001',
          invoiceDate: new Date('2024-10-01'),
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          gtuCode: 'GTU_01',
          documentType: 'invoice',
        },
      });
    });

    it('should handle missing optional fields', async () => {
      const dtoWithoutOptionals = {
        type: VATRegisterType.SPRZEDAZ,
        period: '2024-10',
        counterpartyName: 'Test Company',
        counterpartyNIP: '1234567890',
        invoiceNumber: 'FV/001',
        invoiceDate: '2024-10-01',
        netAmount: 1000,
        vatAmount: 230,
        vatRate: 23,
        // gtuCode and documentType are missing
      };

      const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithoutOptionals);

      expect(result).toEqual(mockCreatedEntry);
      expect(prismaService.vATRegister.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gtuCode: undefined,
          documentType: 'invoice', // Should default to 'invoice'
        }),
      });
    });

    it('should throw BadRequestException for invalid period format', async () => {
      const invalidPeriodDto = {
        ...mockCreateDto,
        period: 'invalid-period',
      };

      await expect(service.addVATRegisterEntry('tenant1', 'company1', invalidPeriodDto))
        .rejects.toThrow(BadRequestException);
      await expect(service.addVATRegisterEntry('tenant1', 'company1', invalidPeriodDto))
        .rejects.toThrow('Period must be in YYYY-MM format');
    });

    it('should handle various valid period formats', async () => {
      const validPeriods = ['2024-01', '2024-12', '2023-06'];

      for (const period of validPeriods) {
        const dtoWithPeriod = {
          ...mockCreateDto,
          period,
          invoiceNumber: `FV/001-${period}`,
        };

        mockPrismaService.vATRegister.create.mockResolvedValue({
          ...mockCreatedEntry,
          period,
          invoiceNumber: `FV/001-${period}`,
        });

        const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithPeriod);

        expect(result.period).toBe(period);
      }
    });

    it('should handle database errors during creation', async () => {
      mockPrismaService.vATRegister.create.mockRejectedValue(new Error('Database error'));

      await expect(service.addVATRegisterEntry('tenant1', 'company1', mockCreateDto))
        .rejects.toThrow('Database error');
    });

    it('should handle special characters in counterparty name', async () => {
      const dtoWithSpecialChars = {
        ...mockCreateDto,
        counterpartyName: 'Test Company ñáéíóú 🚀',
      };

      const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithSpecialChars);

      expect(result.counterpartyName).toBe('Test Company ñáéíóú 🚀');
    });

    it('should handle very long counterparty name', async () => {
      const longName = 'A'.repeat(1000);
      const dtoWithLongName = {
        ...mockCreateDto,
        counterpartyName: longName,
      };

      const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithLongName);

      expect(result.counterpartyName).toBe(longName);
    });

    it('should handle zero amounts', async () => {
      const dtoWithZeroAmounts = {
        ...mockCreateDto,
        netAmount: 0,
        vatAmount: 0,
      };

      const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithZeroAmounts);

      expect(result.netAmount).toBe(0);
      expect(result.vatAmount).toBe(0);
    });

    it('should handle negative amounts', async () => {
      const dtoWithNegativeAmounts = {
        ...mockCreateDto,
        netAmount: -1000,
        vatAmount: -230,
      };

      const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithNegativeAmounts);

      expect(result.netAmount).toBe(-1000);
      expect(result.vatAmount).toBe(-230);
    });

    it('should handle fractional amounts', async () => {
      const dtoWithFractions = {
        ...mockCreateDto,
        netAmount: 1000.5,
        vatAmount: 230.115,
        vatRate: 23.01,
      };

      const result = await service.addVATRegisterEntry('tenant1', 'company1', dtoWithFractions);

      expect(result.netAmount).toBe(1000.5);
      expect(result.vatAmount).toBe(230.115);
      expect(result.vatRate).toBe(23.01);
    });

    it('should handle concurrent entry creation', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        ...mockCreateDto,
        invoiceNumber: `FV/00${i}`,
      }));

      const results = await Promise.all(
        entries.map(entry => service.addVATRegisterEntry('tenant1', 'company1', entry))
      );

      expect(results).toHaveLength(5);
      expect(prismaService.vATRegister.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('getVATRegisters', () => {
    const mockVATRegisters = [
      {
        id: '1',
        type: VATRegisterType.SPRZEDAZ,
        netAmount: 1000,
        vatAmount: 230,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
        invoiceDate: new Date('2024-10-01'),
      },
      {
        id: '2',
        type: VATRegisterType.ZAKUP,
        netAmount: 500,
        vatAmount: 115,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
        invoiceDate: new Date('2024-10-02'),
      },
    ];

    beforeEach(() => {
      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockVATRegisters);
    });

    it('should get all VAT registers for period', async () => {
      const result = await service.getVATRegisters('tenant1', 'company1', '2024-10');

      expect(result).toEqual(mockVATRegisters);
      expect(result).toHaveLength(2);

      expect(prismaService.vATRegister.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          period: '2024-10',
        },
        orderBy: [
          { type: 'asc' },
          { invoiceDate: 'asc' },
        ],
      });
    });

    it('should get VAT registers filtered by type', async () => {
      const result = await service.getVATRegisters('tenant1', 'company1', '2024-10', VATRegisterType.SPRZEDAZ);

      expect(result).toEqual([mockVATRegisters[0]]);

      expect(prismaService.vATRegister.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          period: '2024-10',
          type: VATRegisterType.SPRZEDAZ,
        },
        orderBy: [
          { type: 'asc' },
          { invoiceDate: 'asc' },
        ],
      });
    });

    it('should return empty array when no registers found', async () => {
      mockPrismaService.vATRegister.findMany.mockResolvedValue([]);

      const result = await service.getVATRegisters('tenant1', 'company1', '2024-10');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrismaService.vATRegister.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getVATRegisters('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('Database error');
    });

    it('should handle multiple periods', async () => {
      const periods = ['2024-10', '2024-11', '2024-12'];

      const results = await Promise.all(
        periods.map(period => service.getVATRegisters('tenant1', 'company1', period))
      );

      expect(results).toHaveLength(3);
      expect(prismaService.vATRegister.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('groupByVATRate', () => {
    it('should group registers by VAT rate correctly', () => {
      const registers = [
        {
          id: '1',
          vatRate: 23,
          netAmount: 1000,
          vatAmount: 230,
        },
        {
          id: '2',
          vatRate: 23,
          netAmount: 500,
          vatAmount: 115,
        },
        {
          id: '3',
          vatRate: 8,
          netAmount: 200,
          vatAmount: 16,
        },
      ];

      const result = (service as any).groupByVATRate(registers);

      expect(result).toEqual({
        23: {
          rate: 23,
          netAmount: 1500,
          vatAmount: 345,
          count: 2,
          entries: expect.arrayContaining([
            expect.objectContaining({ id: '1' }),
            expect.objectContaining({ id: '2' }),
          ]),
        },
        8: {
          rate: 8,
          netAmount: 200,
          vatAmount: 16,
          count: 1,
          entries: expect.arrayContaining([
            expect.objectContaining({ id: '3' }),
          ]),
        },
      });
    });

    it('should handle empty registers array', () => {
      const result = (service as any).groupByVATRate([]);

      expect(result).toEqual({});
    });

    it('should handle registers with zero VAT rate', () => {
      const registers = [
        {
          id: '1',
          vatRate: 0,
          netAmount: 1000,
          vatAmount: 0,
        },
      ];

      const result = (service as any).groupByVATRate(registers);

      expect(result[0]).toEqual({
        rate: 0,
        netAmount: 1000,
        vatAmount: 0,
        count: 1,
        entries: expect.arrayContaining([
          expect.objectContaining({ id: '1' }),
        ]),
      });
    });

    it('should handle fractional VAT rates', () => {
      const registers = [
        {
          id: '1',
          vatRate: 23.5,
          netAmount: 1000,
          vatAmount: 235,
        },
      ];

      const result = (service as any).groupByVATRate(registers);

      expect(result[23.5]).toBeDefined();
      expect(result[23.5].rate).toBe(23.5);
    });
  });

  describe('populateVATRegistersFromKSeF', () => {
    const mockInvoices = [
      {
        id: '1',
        series: 'FV',
        number: '001',
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        date: new Date('2024-10-01'),
        totalNet: 1000,
        totalVat: 230,
        items: [
          {
            vatRate: 23,
          },
        ],
      },
      {
        id: '2',
        series: 'FV',
        number: '002',
        buyerName: 'Another Buyer',
        buyerNip: '9876543210',
        date: new Date('2024-10-02'),
        totalNet: 500,
        totalVat: 115,
        items: [
          {
            vatRate: 23,
          },
        ],
      },
    ];

    const mockCreatedRegisters = [
      {
        id: 'reg-1',
        tenant_id: 'tenant1',
        company_id: 'company1',
        type: VATRegisterType.SPRZEDAZ,
        period: '2024-10',
        counterpartyName: 'Test Buyer',
        counterpartyNIP: '1234567890',
        invoiceNumber: 'FV001',
        invoiceDate: new Date('2024-10-01'),
        netAmount: 1000,
        vatAmount: 230,
        vatRate: 23,
        documentType: 'invoice',
      },
      {
        id: 'reg-2',
        tenant_id: 'tenant1',
        company_id: 'company1',
        type: VATRegisterType.SPRZEDAZ,
        period: '2024-10',
        counterpartyName: 'Another Buyer',
        counterpartyNIP: '9876543210',
        invoiceNumber: 'FV002',
        invoiceDate: new Date('2024-10-02'),
        netAmount: 500,
        vatAmount: 115,
        vatRate: 23,
        documentType: 'invoice',
      },
    ];

    beforeEach(() => {
      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.vATRegister.create
        .mockResolvedValueOnce(mockCreatedRegisters[0])
        .mockResolvedValueOnce(mockCreatedRegisters[1]);
    });

    it('should populate VAT registers from KSeF invoices successfully', async () => {
      const result = await service.populateVATRegistersFromKSeF('tenant1', 'company1', '2024-10');

      expect(result).toEqual(mockCreatedRegisters);
      expect(result).toHaveLength(2);

      expect(prismaService.invoice.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant1',
          company_id: 'company1',
          date: {
            gte: new Date('2024-10-01'),
            lt: new Date('2024-11-01'),
          },
        },
        include: {
          items: true,
        },
      });

      expect(prismaService.vATRegister.create).toHaveBeenCalledTimes(2);
    });

    it('should handle invoices with zero VAT', async () => {
      const invoicesWithZeroVat = [
        {
          ...mockInvoices[0],
          totalVat: 0,
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(invoicesWithZeroVat);

      const result = await service.populateVATRegistersFromKSeF('tenant1', 'company1', '2024-10');

      expect(result).toHaveLength(0); // Should not create register for zero VAT
    });

    it('should handle invoices without items', async () => {
      const invoicesWithoutItems = [
        {
          ...mockInvoices[0],
          items: [],
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(invoicesWithoutItems);

      const result = await service.populateVATRegistersFromKSeF('tenant1', 'company1', '2024-10');

      expect(result).toHaveLength(1);
      expect(prismaService.vATRegister.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vatRate: 23, // Default VAT rate
        }),
      });
    });

    it('should handle empty invoices array', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);

      const result = await service.populateVATRegistersFromKSeF('tenant1', 'company1', '2024-10');

      expect(result).toEqual([]);
      expect(prismaService.vATRegister.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during invoice fetch', async () => {
      mockPrismaService.invoice.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.populateVATRegistersFromKSeF('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during register creation', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.vATRegister.create.mockRejectedValue(new Error('Creation error'));

      await expect(service.populateVATRegistersFromKSeF('tenant1', 'company1', '2024-10'))
        .rejects.toThrow('Creation error');
    });

    it('should handle different date periods correctly', async () => {
      const periods = ['2024-01', '2024-06', '2024-12'];

      for (const period of periods) {
        mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);

        const result = await service.populateVATRegistersFromKSeF('tenant1', 'company1', period);

        expect(result).toHaveLength(2);
        expect(prismaService.invoice.findMany).toHaveBeenCalledWith({
          where: {
            tenant_id: 'tenant1',
            company_id: 'company1',
            date: {
              gte: new Date(`${period}-01`),
              lt: new Date(new Date(`${period}-01`).getFullYear(), new Date(`${period}-01`).getMonth() + 1, 1),
            },
          },
          include: {
            items: true,
          },
        });
      }
    });

    it('should handle concurrent population requests', async () => {
      const periods = ['2024-10', '2024-11'];

      const results = await Promise.all(
        periods.map(period => service.populateVATRegistersFromKSeF('tenant1', 'company1', period))
      );

      expect(results).toHaveLength(2);
      expect(prismaService.invoice.findMany).toHaveBeenCalledTimes(2);
      expect(prismaService.vATRegister.create).toHaveBeenCalledTimes(4); // 2 invoices × 2 periods
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null tenant_id in calculateVAT7', async () => {
      const mockRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockRegisters);

      await expect(service.calculateVAT7(null as any, 'company1', '2024-10'))
        .rejects.toThrow();
    });

    it('should handle undefined tenant_id in calculateVAT7', async () => {
      const mockRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockRegisters);

      await expect(service.calculateVAT7(undefined as any, 'company1', '2024-10'))
        .rejects.toThrow();
    });

    it('should handle null company_id in calculateVAT7', async () => {
      const mockRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          period: '2024-10',
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockRegisters);

      await expect(service.calculateVAT7('tenant1', null as any, '2024-10'))
        .rejects.toThrow();
    });

    it('should handle very long period strings', async () => {
      const longPeriod = 'A'.repeat(1000);

      const mockRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          period: longPeriod,
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', longPeriod);

      expect(result.period).toBe(longPeriod);
    });

    it('should handle special characters in period', async () => {
      const specialPeriod = '2024-ñáéíóú';

      const mockRegisters = [
        {
          id: '1',
          type: VATRegisterType.SPRZEDAZ,
          netAmount: 1000,
          vatAmount: 230,
          vatRate: 23,
          period: specialPeriod,
          tenant_id: 'tenant1',
          company_id: 'company1',
        },
      ];

      mockPrismaService.vATRegister.findMany.mockResolvedValue(mockRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', specialPeriod);

      expect(result.period).toBe(specialPeriod);
    });

    it('should handle very large number of VAT registers', async () => {
      const largeNumberOfRegisters = Array.from({ length: 10000 }, (_, i) => ({
        id: `reg-${i}`,
        type: i % 2 === 0 ? VATRegisterType.SPRZEDAZ : VATRegisterType.ZAKUP,
        netAmount: 100,
        vatAmount: 23,
        vatRate: 23,
        period: '2024-10',
        tenant_id: 'tenant1',
        company_id: 'company1',
      }));

      mockPrismaService.vATRegister.findMany.mockResolvedValue(largeNumberOfRegisters);

      const result = await service.calculateVAT7('tenant1', 'company1', '2024-10');

      expect(result.totalRevenue).toBe(500000); // 5000 sales entries * 100
      expect(result.totalCosts).toBe(500000); // 5000 purchase entries * 100
      expect(result.vatCollectedSales).toBe(115000); // 5000 * 23
      expect(result.vatPaidPurchases).toBe(115000); // 5000 * 23
      expect(result.vatDue).toBe(0);
    });
  });
});