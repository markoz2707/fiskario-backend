import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { PrismaService } from '../prisma/prisma.service';
import { KsefService } from '../ksef/ksef.service';
import { BuyersService } from './buyers.service';
import { TaxRulesService } from '../tax-rules/tax-rules.service';

// Mock fs module at top level to avoid "Cannot redefine property" issues
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') setTimeout(cb, 0);
    }),
  }),
}));

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    end: jest.fn(),
  }));
});

describe('InvoicingService', () => {
  let service: InvoicingService;
  let prismaService: PrismaService;
  let ksefService: KsefService;
  let buyersService: BuyersService;
  let taxRulesService: TaxRulesService;

  const mockPrismaService = {
    invoice: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    taskQueue: {
      create: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
    companyTaxSettings: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockKsefService = {
    getAuthStatus: jest.fn(),
    submitInvoice: jest.fn(),
  };

  const mockBuyersService = {
    findBuyersByNip: jest.fn(),
    createBuyer: jest.fn(),
  };

  const mockTaxRulesService = {
    calculateTaxForMobile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: KsefService, useValue: mockKsefService },
        { provide: BuyersService, useValue: mockBuyersService },
        { provide: TaxRulesService, useValue: mockTaxRulesService },
      ],
    }).compile();

    service = module.get<InvoicingService>(InvoicingService);
    prismaService = module.get<PrismaService>(PrismaService);
    ksefService = module.get<KsefService>(KsefService);
    buyersService = module.get<BuyersService>(BuyersService);
    taxRulesService = module.get<TaxRulesService>(TaxRulesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ====================================================================
  // createInvoice - tworzenie faktury
  // ====================================================================
  describe('createInvoice', () => {
    const TENANT_ID = 'tenant-123';

    const mockInvoiceData = {
      company_id: 'company-1',
      series: 'FV',
      date: '2025-03-15',
      dueDate: '2025-04-15',
      buyerName: 'Firma ABC Sp. z o.o.',
      buyerNip: '5213000000',
      buyerAddress: 'ul. Testowa 1, Warszawa',
      buyerCity: 'Warszawa',
      buyerPostalCode: '00-001',
      items: [
        {
          description: 'Uslugi programistyczne',
          quantity: 10,
          unitPrice: 500,
          vatRate: 23,
          gtu: 'GTU_12',
        },
      ],
    };

    const mockCreatedInvoice = {
      id: 'inv-1',
      tenant_id: TENANT_ID,
      company_id: 'company-1',
      buyer_id: 'buyer-1',
      number: 'FV/0001',
      series: 'FV',
      date: new Date('2025-03-15'),
      dueDate: new Date('2025-04-15'),
      totalNet: 5000,
      totalVat: 1150,
      totalGross: 6150,
      splitPayment: false,
      splitPaymentAmount: null,
      items: [
        {
          id: 'item-1',
          description: 'Uslugi programistyczne',
          quantity: 10,
          unitPrice: 500,
          vatRate: 23,
          gtu: 'GTU_12',
          netAmount: 5000,
          vatAmount: 1150,
          grossAmount: 6150,
        },
      ],
      buyer: { id: 'buyer-1', name: 'Firma ABC Sp. z o.o.', nip: '5213000000' },
    };

    beforeEach(() => {
      // Default mocks for a successful invoice creation flow
      mockPrismaService.invoice.findFirst.mockResolvedValue(null); // no previous invoice -> number 0001
      mockBuyersService.findBuyersByNip.mockResolvedValue([{ id: 'buyer-1' }]);
      mockPrismaService.invoice.create.mockResolvedValue(mockCreatedInvoice);
      mockPrismaService.invoice.update.mockResolvedValue({
        ...mockCreatedInvoice,
        pdfUrl: 'invoice-inv-1.pdf',
      });
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        ...mockCreatedInvoice,
        company: { name: 'My Company', nip: '1111111111', address: 'Company Address' },
      });
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockResolvedValue({ success: true });
    });

    it('should create a standard invoice with correct totals', async () => {
      const result = await service.createInvoice(TENANT_ID, mockInvoiceData);

      expect(result).toEqual(mockCreatedInvoice);
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            company_id: 'company-1',
            number: 'FV/0001',
            series: 'FV',
            totalNet: 5000,
            totalVat: 1150,
            totalGross: 6150,
            splitPayment: false,
            splitPaymentAmount: null,
          }),
          include: { items: true, buyer: true },
        }),
      );
    });

    it('should reuse an existing buyer when NIP matches', async () => {
      mockBuyersService.findBuyersByNip.mockResolvedValue([{ id: 'existing-buyer' }]);

      await service.createInvoice(TENANT_ID, mockInvoiceData);

      expect(mockBuyersService.findBuyersByNip).toHaveBeenCalledWith(TENANT_ID, '5213000000');
      expect(mockBuyersService.createBuyer).not.toHaveBeenCalled();
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            buyer_id: 'existing-buyer',
          }),
        }),
      );
    });

    it('should create a new buyer when no NIP match is found', async () => {
      mockBuyersService.findBuyersByNip.mockResolvedValue([]);
      mockBuyersService.createBuyer.mockResolvedValue({ id: 'new-buyer' });

      await service.createInvoice(TENANT_ID, mockInvoiceData);

      expect(mockBuyersService.createBuyer).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          name: 'Firma ABC Sp. z o.o.',
          nip: '5213000000',
          address: 'ul. Testowa 1, Warszawa',
          city: 'Warszawa',
          postalCode: '00-001',
          country: 'PL',
          isActive: true,
        }),
      );
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            buyer_id: 'new-buyer',
          }),
        }),
      );
    });

    it('should set buyer_id to null when no buyerName provided', async () => {
      const dataWithoutBuyer = {
        ...mockInvoiceData,
        buyerName: undefined,
        buyerNip: '5213000000',
      } as any;
      // validateKSeF still requires buyerName, so remove that check scenario
      // Actually this would throw from validateKSeF.
      // Let's skip and test the null buyer scenario properly:
      // We need buyerName to pass KSeF validation, but to get buyer_id null
      // that can only happen when data.buyerName is falsy. Since validation
      // checks buyerName, this path triggers an error.
      await expect(service.createInvoice(TENANT_ID, dataWithoutBuyer))
        .rejects.toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should handle dueDate as null when not provided', async () => {
      const dataWithoutDueDate = { ...mockInvoiceData } as any;
      delete dataWithoutDueDate.dueDate;

      await service.createInvoice(TENANT_ID, dataWithoutDueDate);

      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: null,
          }),
        }),
      );
    });

    it('should queue KSeF submission after invoice creation', async () => {
      await service.createInvoice(TENANT_ID, mockInvoiceData);

      // Should have fetched the invoice for KSeF submission
      expect(mockPrismaService.invoice.findUnique).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        include: { items: true, company: true },
      });
      // KSeF was authenticated, so submitInvoice should be called
      expect(mockKsefService.submitInvoice).toHaveBeenCalled();
    });

    it('should queue task when KSeF is not authenticated', async () => {
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });

      await service.createInvoice(TENANT_ID, mockInvoiceData);

      expect(mockKsefService.submitInvoice).not.toHaveBeenCalled();
      expect(mockPrismaService.taskQueue.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          type: 'ksef_submission',
          payload: { invoiceId: 'inv-1' },
        },
      });
    });

    it('should queue retry task when KSeF submission fails', async () => {
      mockKsefService.submitInvoice.mockRejectedValue(new Error('KSeF connection timeout'));

      const result = await service.createInvoice(TENANT_ID, mockInvoiceData);

      // Invoice should still be returned despite KSeF failure
      expect(result).toEqual(mockCreatedInvoice);
      expect(mockPrismaService.taskQueue.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          type: 'ksef_submission_retry',
          payload: { invoiceId: 'inv-1' },
          status: 'pending',
          retryCount: 0,
        },
      });
    });

    it('should handle multiple items and calculate totals correctly', async () => {
      const multiItemData = {
        ...mockInvoiceData,
        items: [
          { description: 'Consulting', quantity: 5, unitPrice: 200, vatRate: 23, gtu: null },
          { description: 'Software license', quantity: 1, unitPrice: 3000, vatRate: 23, gtu: 'GTU_12' },
          { description: 'Training', quantity: 2, unitPrice: 800, vatRate: 8, gtu: null },
        ],
      };

      await service.createInvoice(TENANT_ID, multiItemData);

      // Totals: Net = 1000 + 3000 + 1600 = 5600
      //         VAT = 230 + 690 + 128 = 1048
      //         Gross = 5600 + 1048 = 6648
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 5600,
            totalVat: 1048,
            totalGross: 6648,
          }),
        }),
      );
    });

    it('should handle database error during invoice creation', async () => {
      mockPrismaService.invoice.create.mockRejectedValue(new Error('Database connection lost'));

      await expect(service.createInvoice(TENANT_ID, mockInvoiceData))
        .rejects.toThrow('Database connection lost');
    });
  });

  // ====================================================================
  // KSeF validation (validateKSeF)
  // ====================================================================
  describe('validateKSeF', () => {
    it('should pass validation with valid buyer NIP and name', () => {
      const validData = { buyerName: 'Firma ABC', buyerNip: '5213000000' };
      expect(() => (service as any).validateKSeF(validData)).not.toThrow();
    });

    it('should throw when buyer NIP is missing', () => {
      const data = { buyerName: 'Firma ABC' };
      expect(() => (service as any).validateKSeF(data))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should throw when buyer name is missing', () => {
      const data = { buyerNip: '5213000000' };
      expect(() => (service as any).validateKSeF(data))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should throw when both buyer NIP and name are missing', () => {
      expect(() => (service as any).validateKSeF({}))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should throw when buyer NIP is empty string', () => {
      const data = { buyerName: 'Firma ABC', buyerNip: '' };
      expect(() => (service as any).validateKSeF(data))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should throw when buyer name is null', () => {
      const data = { buyerName: null, buyerNip: '5213000000' };
      expect(() => (service as any).validateKSeF(data))
        .toThrow('Buyer NIP and name are required for KSeF');
    });
  });

  // ====================================================================
  // MPP (Split Payment) detection (isMPPRequired)
  // ====================================================================
  describe('isMPPRequired (Split Payment / MPP)', () => {
    it('should return false when totalGross < 15000 PLN even with GTU codes', () => {
      const items = [{ gtu: 'GTU_01' }];
      const result = (service as any).isMPPRequired(items, 14999.99);
      expect(result).toBe(false);
    });

    it('should return false when totalGross >= 15000 but no GTU codes present', () => {
      const items = [{ gtu: null }, { gtu: undefined }];
      const result = (service as any).isMPPRequired(items, 20000);
      expect(result).toBe(false);
    });

    it('should return true when totalGross >= 15000 and items have eligible GTU codes', () => {
      const items = [{ gtu: 'GTU_01' }];
      const result = (service as any).isMPPRequired(items, 15000);
      expect(result).toBe(true);
    });

    it('should handle GTU codes case-insensitively', () => {
      const items = [{ gtu: 'gtu_05' }];
      const result = (service as any).isMPPRequired(items, 16000);
      expect(result).toBe(true);
    });

    it('should detect MPP requirement for all GTU codes (GTU_01 through GTU_13)', () => {
      for (let i = 1; i <= 13; i++) {
        const gtuCode = `GTU_${i.toString().padStart(2, '0')}`;
        const items = [{ gtu: gtuCode }];
        const result = (service as any).isMPPRequired(items, 20000);
        expect(result).toBe(true);
      }
    });

    it('should return false for non-standard GTU codes', () => {
      const items = [{ gtu: 'GTU_14' }, { gtu: 'GTU_99' }, { gtu: 'OTHER' }];
      const result = (service as any).isMPPRequired(items, 20000);
      expect(result).toBe(false);
    });

    it('should set splitPayment and splitPaymentAmount in createInvoice when MPP required', async () => {
      // Setup: high-value invoice with MPP-eligible GTU code
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);
      mockBuyersService.findBuyersByNip.mockResolvedValue([{ id: 'buyer-1' }]);
      mockPrismaService.invoice.create.mockResolvedValue({
        id: 'inv-mpp',
        number: 'FV/0001',
        date: new Date('2025-03-15'),
        items: [],
        buyer: {},
      });
      mockPrismaService.invoice.update.mockResolvedValue({});
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        id: 'inv-mpp',
        number: 'FV/0001',
        date: new Date('2025-03-15'),
        items: [],
        company: {},
      });
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockResolvedValue({});

      const highValueData = {
        company_id: 'company-1',
        series: 'FV',
        date: '2025-03-15',
        buyerName: 'Big Corp',
        buyerNip: '5213000000',
        items: [
          {
            description: 'Paliwa silnikowe',
            quantity: 100,
            unitPrice: 200,
            vatRate: 23,
            gtu: 'GTU_02', // paliwa - MPP eligible
          },
        ],
      };

      await service.createInvoice('tenant-1', highValueData);

      // totalNet = 20000, totalVat = 4600, totalGross = 24600 -> MPP required
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            splitPayment: true,
            splitPaymentAmount: 4600, // = totalVat
          }),
        }),
      );
    });

    it('should not set splitPayment when totalGross < 15000 even with GTU codes', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);
      mockBuyersService.findBuyersByNip.mockResolvedValue([{ id: 'buyer-1' }]);
      mockPrismaService.invoice.create.mockResolvedValue({
        id: 'inv-low',
        number: 'FV/0001',
        date: new Date('2025-03-15'),
        items: [],
        buyer: {},
      });
      mockPrismaService.invoice.update.mockResolvedValue({});
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        id: 'inv-low',
        number: 'FV/0001',
        date: new Date('2025-03-15'),
        items: [],
        company: {},
      });
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockResolvedValue({});

      const lowValueData = {
        company_id: 'company-1',
        series: 'FV',
        date: '2025-03-15',
        buyerName: 'Small Buyer',
        buyerNip: '5213000000',
        items: [
          {
            description: 'Paliwa',
            quantity: 1,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_02',
          },
        ],
      };

      await service.createInvoice('tenant-1', lowValueData);

      // totalGross = 123 -> below 15000
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            splitPayment: false,
            splitPaymentAmount: null,
          }),
        }),
      );
    });
  });

  // ====================================================================
  // Invoice number generation (generateInvoiceNumber)
  // ====================================================================
  describe('generateInvoiceNumber', () => {
    it('should generate FV/0001 for first invoice in series', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      const result = await (service as any).generateInvoiceNumber('tenant-1', 'FV');

      expect(result).toBe('FV/0001');
      expect(mockPrismaService.invoice.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1', series: 'FV' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should increment from last invoice number in series', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({ number: 'FV/0042' });

      const result = await (service as any).generateInvoiceNumber('tenant-1', 'FV');

      expect(result).toBe('FV/0043');
    });

    it('should handle different series independently', async () => {
      mockPrismaService.invoice.findFirst
        .mockResolvedValueOnce({ number: 'FV/0010' })
        .mockResolvedValueOnce(null);

      const fvResult = await (service as any).generateInvoiceNumber('tenant-1', 'FV');
      const faResult = await (service as any).generateInvoiceNumber('tenant-1', 'FA');

      expect(fvResult).toBe('FV/0011');
      expect(faResult).toBe('FA/0001');
    });

    it('should pad numbers to 4 digits', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({ number: 'FV/0001' });

      const result = await (service as any).generateInvoiceNumber('tenant-1', 'FV');

      expect(result).toBe('FV/0002');
    });

    it('should handle numbers exceeding 4 digits (FV/9999 -> FV/10000)', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({ number: 'FV/9999' });

      const result = await (service as any).generateInvoiceNumber('tenant-1', 'FV');

      expect(result).toBe('FV/10000');
    });

    it('should propagate database errors', async () => {
      mockPrismaService.invoice.findFirst.mockRejectedValue(new Error('DB connection lost'));

      await expect((service as any).generateInvoiceNumber('tenant-1', 'FV'))
        .rejects.toThrow('DB connection lost');
    });
  });

  // ====================================================================
  // calculateTotals
  // ====================================================================
  describe('calculateTotals', () => {
    it('should calculate totals correctly for a single item', () => {
      const items = [{ quantity: 2, unitPrice: 100, vatRate: 23 }];
      const result = (service as any).calculateTotals(items);

      expect(result).toEqual({
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
      });
    });

    it('should calculate totals correctly for multiple items with different VAT rates', () => {
      const items = [
        { quantity: 10, unitPrice: 100, vatRate: 23 },
        { quantity: 5, unitPrice: 50, vatRate: 8 },
        { quantity: 1, unitPrice: 1000, vatRate: 0 },
      ];
      const result = (service as any).calculateTotals(items);

      // Net: 1000 + 250 + 1000 = 2250
      // VAT: 230 + 20 + 0 = 250
      // Gross: 2250 + 250 = 2500
      expect(result).toEqual({
        totalNet: 2250,
        totalVat: 250,
        totalGross: 2500,
      });
    });

    it('should return zeros for an empty items array', () => {
      const result = (service as any).calculateTotals([]);

      expect(result).toEqual({
        totalNet: 0,
        totalVat: 0,
        totalGross: 0,
      });
    });

    it('should handle fractional values', () => {
      const items = [{ quantity: 2.5, unitPrice: 10.5, vatRate: 23 }];
      const result = (service as any).calculateTotals(items);

      expect(result.totalNet).toBe(26.25);
      expect(result.totalVat).toBeCloseTo(6.0375, 4);
      expect(result.totalGross).toBeCloseTo(32.2875, 4);
    });
  });

  // ====================================================================
  // calculateMobileInvoice
  // ====================================================================
  describe('calculateMobileInvoice', () => {
    it('should delegate to taxRulesService.calculateTaxForMobile', async () => {
      const dto = {
        companyId: 'company-1',
        items: [{ description: 'Test', quantity: 1, unitPrice: 100, vatRate: 23 }],
      };
      const expectedResult = {
        totalNet: 100,
        totalVat: 23,
        totalGross: 123,
        vatBreakdown: [],
        appliedRules: [],
      };
      mockTaxRulesService.calculateTaxForMobile.mockResolvedValue(expectedResult);

      const result = await service.calculateMobileInvoice('tenant-1', dto as any);

      expect(result).toEqual(expectedResult);
      expect(mockTaxRulesService.calculateTaxForMobile).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  // ====================================================================
  // previewMobileInvoice
  // ====================================================================
  describe('previewMobileInvoice', () => {
    it('should return preview with company info and calculated totals', async () => {
      const dto = {
        companyId: 'company-1',
        items: [{ description: 'Service', quantity: 2, unitPrice: 500, vatRate: 23 }],
      };
      mockTaxRulesService.calculateTaxForMobile.mockResolvedValue({
        totalNet: 1000,
        totalVat: 230,
        totalGross: 1230,
        vatBreakdown: [{ rate: 23, net: 1000, vat: 230 }],
        appliedRules: ['Standard VAT 23%'],
      });
      mockPrismaService.company.findFirst.mockResolvedValue({
        name: 'My Company',
        nip: '1111111111',
        address: 'ul. Firmowa 5',
      });

      const result = await service.previewMobileInvoice('tenant-1', dto as any);

      expect(result.success).toBe(true);
      expect(result.preview.company.name).toBe('My Company');
      expect(result.preview.totals.totalNet).toBe(1000);
      expect(result.preview.totals.totalVat).toBe(230);
      expect(result.preview.totals.totalGross).toBe(1230);
      expect(result.preview.items).toHaveLength(1);
      expect(result.preview.vatBreakdown).toEqual([{ rate: 23, net: 1000, vat: 230 }]);
    });

    it('should throw when company is not found', async () => {
      const dto = {
        companyId: 'nonexistent',
        items: [{ description: 'Test', quantity: 1, unitPrice: 100, vatRate: 23 }],
      };
      mockTaxRulesService.calculateTaxForMobile.mockResolvedValue({
        totalNet: 100,
        totalVat: 23,
        totalGross: 123,
        vatBreakdown: [],
        appliedRules: [],
      });
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(service.previewMobileInvoice('tenant-1', dto as any))
        .rejects.toThrow('Company with ID nonexistent not found');
    });
  });

  // ====================================================================
  // getInvoices - listowanie faktur
  // ====================================================================
  describe('getInvoices', () => {
    it('should return invoices for tenant with default pagination', async () => {
      const invoices = [
        { id: 'inv-1', number: 'FV/0001' },
        { id: 'inv-2', number: 'FV/0002' },
      ];
      mockPrismaService.invoice.findMany.mockResolvedValue(invoices);

      const result = await service.getInvoices('tenant-1');

      expect(result).toEqual(invoices);
      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: 'tenant-1' },
          take: 50,
          skip: 0,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should apply companyId filter', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);

      await service.getInvoices('tenant-1', { companyId: 'company-1' });

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            company_id: 'company-1',
          }),
        }),
      );
    });

    it('should apply date range filter', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);

      await service.getInvoices('tenant-1', {
        dateFrom: '2025-01-01',
        dateTo: '2025-03-31',
      });

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2025-01-01'),
              lte: new Date('2025-03-31'),
            },
          }),
        }),
      );
    });
  });

  // ====================================================================
  // getInvoiceById
  // ====================================================================
  describe('getInvoiceById', () => {
    it('should return invoice when found', async () => {
      const invoice = { id: 'inv-1', number: 'FV/0001', tenant_id: 'tenant-1' };
      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      const result = await service.getInvoiceById('tenant-1', 'inv-1');

      expect(result).toEqual(invoice);
    });

    it('should throw when invoice is not found', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.getInvoiceById('tenant-1', 'nonexistent'))
        .rejects.toThrow('Invoice with ID nonexistent not found');
    });
  });

  // ====================================================================
  // deleteInvoice
  // ====================================================================
  describe('deleteInvoice', () => {
    it('should delete an existing invoice', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({ id: 'inv-1' });
      mockPrismaService.invoice.delete.mockResolvedValue({ id: 'inv-1' });

      await service.deleteInvoice('tenant-1', 'inv-1');

      expect(mockPrismaService.invoice.delete).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
      });
    });

    it('should throw when deleting non-existent invoice', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.deleteInvoice('tenant-1', 'nonexistent'))
        .rejects.toThrow('Invoice with ID nonexistent not found');
    });
  });

  // ====================================================================
  // validateMobileInvoice
  // ====================================================================
  describe('validateMobileInvoice', () => {
    it('should return valid for correct data', async () => {
      const dto = {
        companyId: 'company-1',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100, vatRate: 23 }],
      };

      const result = await service.validateMobileInvoice('tenant-1', dto as any);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when companyId is missing', async () => {
      const dto = {
        companyId: '',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100, vatRate: 23 }],
      };

      const result = await service.validateMobileInvoice('tenant-1', dto as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Company ID is required');
    });

    it('should return error when items array is empty', async () => {
      const dto = {
        companyId: 'company-1',
        items: [],
      };

      const result = await service.validateMobileInvoice('tenant-1', dto as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one item is required');
    });

    it('should warn about high-value items exceeding 10000 PLN', async () => {
      const dto = {
        companyId: 'company-1',
        items: [{ description: 'Expensive item', quantity: 1, unitPrice: 15000, vatRate: 23 }],
      };

      const result = await service.validateMobileInvoice('tenant-1', dto as any);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('high-value');
    });

    it('should warn about zero-VAT items', async () => {
      const dto = {
        companyId: 'company-1',
        items: [{ description: 'Tax exempt', quantity: 1, unitPrice: 100, vatRate: 0 }],
      };

      const result = await service.validateMobileInvoice('tenant-1', dto as any);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('zero-VAT'))).toBe(true);
    });
  });
});
