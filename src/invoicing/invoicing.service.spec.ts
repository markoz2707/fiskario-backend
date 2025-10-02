import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { PrismaService } from '../prisma/prisma.service';
import { KsefService } from '../ksef/ksef.service';
import * as fs from 'fs';
import * as path from 'path';

describe('InvoicingService', () => {
  let service: InvoicingService;
  let prismaService: PrismaService;
  let ksefService: KsefService;

  const mockPrismaService = {
    invoice: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    taskQueue: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockKsefService = {
    getAuthStatus: jest.fn(),
    submitInvoice: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicingService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: KsefService,
          useValue: mockKsefService,
        },
      ],
    }).compile();

    service = module.get<InvoicingService>(InvoicingService);
    prismaService = module.get<PrismaService>(PrismaService);
    ksefService = module.get<KsefService>(KsefService);

    // Mock fs and path modules
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    jest.spyOn(fs, 'createWriteStream').mockReturnValue({
      on: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvoice', () => {
    const mockInvoiceData = {
      company_id: 'company-id',
      series: 'FV',
      date: '2024-01-15',
      dueDate: '2024-02-15',
      buyerName: 'Test Buyer',
      buyerNip: '1234567890',
      buyerAddress: 'Buyer Address',
      items: [
        {
          description: 'Test Item',
          quantity: 2,
          unitPrice: 100,
          vatRate: 23,
          gtu: 'GTU_01',
        },
      ],
    };

    const mockCreatedInvoice = {
      id: 'invoice-id',
      tenant_id: 'tenant-123',
      number: 'FV/0001',
      series: 'FV',
      date: new Date('2024-01-15'),
      dueDate: new Date('2024-02-15'),
      buyerName: 'Test Buyer',
      buyerNip: '1234567890',
      buyerAddress: 'Buyer Address',
      totalNet: 200,
      totalVat: 46,
      totalGross: 246,
      items: [
        {
          id: 'item-id',
          description: 'Test Item',
          quantity: 2,
          unitPrice: 100,
          vatRate: 23,
          gtu: 'GTU_01',
          netAmount: 200,
          vatAmount: 46,
          grossAmount: 246,
        },
      ],
    };

    beforeEach(() => {
      mockPrismaService.invoice.create.mockResolvedValue(mockCreatedInvoice);
      mockPrismaService.invoice.update.mockResolvedValue({
        ...mockCreatedInvoice,
        pdfUrl: 'invoice-invoice-id.pdf',
      });
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockResolvedValue({ success: true });
    });

    it('should create invoice successfully', async () => {
      const result = await service.createInvoice('tenant-123', mockInvoiceData);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.invoice.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-123',
          company_id: 'company-id',
          number: 'FV/0001',
          series: 'FV',
          date: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          buyerName: 'Test Buyer',
          buyerNip: '1234567890',
          buyerAddress: 'Buyer Address',
          totalNet: 200,
          totalVat: 46,
          totalGross: 246,
          items: {
            create: [
              {
                description: 'Test Item',
                quantity: 2,
                unitPrice: 100,
                vatRate: 23,
                gtu: 'GTU_01',
                netAmount: 200,
                vatAmount: 46,
                grossAmount: 246,
              },
            ],
          },
        },
        include: { items: true },
      });
    });

    it('should handle missing due date', async () => {
      const dataWithoutDueDate = { ...mockInvoiceData } as any;
      delete dataWithoutDueDate.dueDate;

      const result = await service.createInvoice('tenant-123', dataWithoutDueDate);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: null,
          }),
        })
      );
    });

    it('should handle missing buyer NIP', async () => {
      const dataWithoutNip = { ...mockInvoiceData } as any;
      delete dataWithoutNip.buyerNip;

      await expect(service.createInvoice('tenant-123', dataWithoutNip))
        .rejects.toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should handle missing buyer name', async () => {
      const dataWithoutName = { ...mockInvoiceData } as any;
      delete dataWithoutName.buyerName;

      await expect(service.createInvoice('tenant-123', dataWithoutName))
        .rejects.toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should handle database errors during invoice creation', async () => {
      mockPrismaService.invoice.create.mockRejectedValue(new Error('Database error'));

      await expect(service.createInvoice('tenant-123', mockInvoiceData))
        .rejects.toThrow('Database error');
    });

    it('should handle PDF generation errors', async () => {
      const mockFsError = new Error('File system error');
      jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
        throw mockFsError;
      });

      await expect(service.createInvoice('tenant-123', mockInvoiceData))
        .rejects.toThrow('File system error');
    });

    it('should handle KSeF submission errors', async () => {
      mockKsefService.submitInvoice.mockRejectedValue(new Error('KSeF error'));

      const result = await service.createInvoice('tenant-123', mockInvoiceData);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.taskQueue.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-123',
          type: 'ksef_submission_retry',
          payload: { invoiceId: 'invoice-id' },
          status: 'pending',
          retryCount: 0,
        },
      });
    });

    it('should handle missing items array', async () => {
      const dataWithoutItems = { ...mockInvoiceData } as any;
      delete dataWithoutItems.items;

      await expect(service.createInvoice('tenant-123', dataWithoutItems))
        .rejects.toThrow();
    });

    it('should handle empty items array', async () => {
      const dataWithEmptyItems = { ...mockInvoiceData, items: [] };

      await expect(service.createInvoice('tenant-123', dataWithEmptyItems))
        .rejects.toThrow();
    });

    it('should handle items with zero quantity', async () => {
      const dataWithZeroQuantity = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Test Item',
            quantity: 0,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
          },
        ],
      };

      const result = await service.createInvoice('tenant-123', dataWithZeroQuantity);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 0,
            totalVat: 0,
            totalGross: 0,
          }),
        })
      );
    });

    it('should handle items with zero unit price', async () => {
      const dataWithZeroPrice = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 0,
            vatRate: 23,
            gtu: 'GTU_01',
          },
        ],
      };

      const result = await service.createInvoice('tenant-123', dataWithZeroPrice);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 0,
            totalVat: 0,
            totalGross: 0,
          }),
        })
      );
    });

    it('should handle items with zero VAT rate', async () => {
      const dataWithZeroVat = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 0,
            gtu: 'GTU_01',
          },
        ],
      };

      const result = await service.createInvoice('tenant-123', dataWithZeroVat);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 200,
            totalVat: 0,
            totalGross: 200,
          }),
        })
      );
    });

    it('should handle multiple items correctly', async () => {
      const dataWithMultipleItems = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Item 1',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
          },
          {
            description: 'Item 2',
            quantity: 1,
            unitPrice: 50,
            vatRate: 8,
            gtu: 'GTU_02',
          },
        ],
      };

      const result = await service.createInvoice('tenant-123', dataWithMultipleItems);

      expect(result).toEqual(mockCreatedInvoice);
      expect(prismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 250,
            totalVat: 50,
            totalGross: 300,
            items: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  description: 'Item 1',
                  netAmount: 200,
                  vatAmount: 46,
                  grossAmount: 246,
                }),
                expect.objectContaining({
                  description: 'Item 2',
                  netAmount: 50,
                  vatAmount: 4,
                  grossAmount: 54,
                }),
              ]),
            },
          }),
        })
      );
    });

    it('should handle concurrent invoice creation', async () => {
      const invoices = Array.from({ length: 5 }, (_, i) => ({
        ...mockInvoiceData,
        series: `FV${i}`,
      }));

      const results = await Promise.all(
        invoices.map((data, i) =>
          service.createInvoice(`tenant-${i}`, data)
        )
      );

      expect(results).toHaveLength(5);
      expect(prismaService.invoice.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('validateKSeF', () => {
    it('should pass validation with valid data', () => {
      const validData = {
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
      };

      expect(() => (service as any).validateKSeF(validData)).not.toThrow();
    });

    it('should throw error when buyer NIP is missing', () => {
      const invalidData = {
        buyerName: 'Test Buyer',
        // buyerNip is missing
      };

      expect(() => (service as any).validateKSeF(invalidData))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should throw error when buyer name is missing', () => {
      const invalidData = {
        buyerNip: '1234567890',
        // buyerName is missing
      };

      expect(() => (service as any).validateKSeF(invalidData))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should throw error when both buyer NIP and name are missing', () => {
      const invalidData = {
        // Both are missing
      };

      expect(() => (service as any).validateKSeF(invalidData))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should handle empty strings', () => {
      const invalidData = {
        buyerName: '',
        buyerNip: '',
      };

      expect(() => (service as any).validateKSeF(invalidData))
        .toThrow('Buyer NIP and name are required for KSeF');
    });

    it('should handle null values', () => {
      const invalidData = {
        buyerName: null,
        buyerNip: null,
      };

      expect(() => (service as any).validateKSeF(invalidData))
        .toThrow('Buyer NIP and name are required for KSeF');
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should generate first invoice number for new series', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      const result = await (service as any).generateInvoiceNumber('tenant-123', 'FV');

      expect(result).toBe('FV/0001');
      expect(prismaService.invoice.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-123', series: 'FV' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should generate next invoice number for existing series', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        number: 'FV/0005',
      });

      const result = await (service as any).generateInvoiceNumber('tenant-123', 'FV');

      expect(result).toBe('FV/0006');
    });

    it('should handle different series correctly', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      const result1 = await (service as any).generateInvoiceNumber('tenant-123', 'FV');
      const result2 = await (service as any).generateInvoiceNumber('tenant-123', 'FA');

      expect(result1).toBe('FV/0001');
      expect(result2).toBe('FA/0001');
    });

    it('should handle large invoice numbers', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        number: 'FV/9999',
      });

      const result = await (service as any).generateInvoiceNumber('tenant-123', 'FV');

      expect(result).toBe('FV/10000');
    });

    it('should handle database errors', async () => {
      mockPrismaService.invoice.findFirst.mockRejectedValue(new Error('Database error'));

      await expect((service as any).generateInvoiceNumber('tenant-123', 'FV'))
        .rejects.toThrow('Database error');
    });

    it('should handle malformed existing invoice numbers', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        number: 'INVALID_FORMAT',
      });

      await expect((service as any).generateInvoiceNumber('tenant-123', 'FV'))
        .rejects.toThrow();
    });
  });

  describe('calculateTotals', () => {
    it('should calculate totals correctly for single item', () => {
      const items = [
        {
          quantity: 2,
          unitPrice: 100,
          vatRate: 23,
        },
      ];

      const result = (service as any).calculateTotals(items);

      expect(result).toEqual({
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
      });
    });

    it('should calculate totals correctly for multiple items', () => {
      const items = [
        {
          quantity: 2,
          unitPrice: 100,
          vatRate: 23,
        },
        {
          quantity: 1,
          unitPrice: 50,
          vatRate: 8,
        },
      ];

      const result = (service as any).calculateTotals(items);

      expect(result).toEqual({
        totalNet: 250,
        totalVat: 50,
        totalGross: 300,
      });
    });

    it('should handle zero values', () => {
      const items = [
        {
          quantity: 0,
          unitPrice: 100,
          vatRate: 23,
        },
      ];

      const result = (service as any).calculateTotals(items);

      expect(result).toEqual({
        totalNet: 0,
        totalVat: 0,
        totalGross: 0,
      });
    });

    it('should handle empty items array', () => {
      const result = (service as any).calculateTotals([]);

      expect(result).toEqual({
        totalNet: 0,
        totalVat: 0,
        totalGross: 0,
      });
    });

    it('should handle fractional values', () => {
      const items = [
        {
          quantity: 2.5,
          unitPrice: 10.5,
          vatRate: 23,
        },
      ];

      const result = (service as any).calculateTotals(items);

      expect(result.totalNet).toBe(26.25);
      expect(result.totalVat).toBeCloseTo(6.0375, 2);
      expect(result.totalGross).toBeCloseTo(32.2875, 2);
    });

    it('should handle large numbers', () => {
      const items = [
        {
          quantity: 1000000,
          unitPrice: 1000000,
          vatRate: 23,
        },
      ];

      const result = (service as any).calculateTotals(items);

      expect(result.totalNet).toBe(1000000000000);
      expect(result.totalVat).toBe(230000000000);
      expect(result.totalGross).toBe(1230000000000);
    });
  });

  describe('generatePDF', () => {
    it('should generate PDF successfully', async () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
      };

      const result = await (service as any).generatePDF(mockInvoice);

      expect(result).toBe('invoice-invoice-id.pdf');
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should handle file system errors', async () => {
      jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
        throw new Error('File system error');
      });

      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
      };

      await expect((service as any).generatePDF(mockInvoice))
        .rejects.toThrow('File system error');
    });

    it('should handle stream errors', async () => {
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Stream error')), 0);
          }
        }),
      };

      jest.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream as any);

      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
      };

      await expect((service as any).generatePDF(mockInvoice))
        .rejects.toThrow('Stream error');
    });

    it('should create uploads directory if it does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
      };

      await (service as any).generatePDF(mockInvoice);

      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('queueKSeFSubmission', () => {
    it('should submit to KSeF when authenticated', async () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
          },
        ],
      };

      mockPrismaService.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockResolvedValue({ success: true });

      await (service as any).queueKSeFSubmission('invoice-id', 'tenant-123');

      expect(ksefService.submitInvoice).toHaveBeenCalled();
      expect(prismaService.taskQueue.create).not.toHaveBeenCalled();
    });

    it('should queue for later when KSeF not authenticated', async () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [],
      };

      mockPrismaService.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });

      await (service as any).queueKSeFSubmission('invoice-id', 'tenant-123');

      expect(ksefService.submitInvoice).not.toHaveBeenCalled();
      expect(prismaService.taskQueue.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-123',
          type: 'ksef_submission',
          payload: { invoiceId: 'invoice-id' },
        },
      });
    });

    it('should queue for retry when KSeF submission fails', async () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [],
      };

      mockPrismaService.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockRejectedValue(new Error('KSeF error'));

      await (service as any).queueKSeFSubmission('invoice-id', 'tenant-123');

      expect(prismaService.taskQueue.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-123',
          type: 'ksef_submission_retry',
          payload: { invoiceId: 'invoice-id' },
          status: 'pending',
          retryCount: 0,
        },
      });
    });

    it('should handle invoice not found', async () => {
      mockPrismaService.invoice.findUnique.mockResolvedValue(null);

      await expect((service as any).queueKSeFSubmission('invoice-id', 'tenant-123'))
        .rejects.toThrow('Invoice invoice-id not found');
    });

    it('should handle database errors during invoice lookup', async () => {
      mockPrismaService.invoice.findUnique.mockRejectedValue(new Error('Database error'));

      await expect((service as any).queueKSeFSubmission('invoice-id', 'tenant-123'))
        .rejects.toThrow('Database error');
    });

    it('should handle task queue creation errors', async () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [],
      };

      mockPrismaService.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrismaService.taskQueue.create.mockRejectedValue(new Error('Task queue error'));

      await expect((service as any).queueKSeFSubmission('invoice-id', 'tenant-123'))
        .rejects.toThrow('Task queue error');
    });
  });

  describe('convertToKSeFDto', () => {
    it('should convert invoice to KSeF format correctly', () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        dueDate: new Date('2024-02-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
          },
        ],
      };

      const result = (service as any).convertToKSeFDto(mockInvoice);

      expect(result).toEqual({
        invoiceNumber: 'FV/0001',
        issueDate: '2024-01-15',
        dueDate: '2024-02-15',
        sellerName: 'Your Company Name',
        sellerNip: '1234567890',
        sellerAddress: 'Company Address',
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        items: [
          {
            name: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
          },
        ],
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        paymentMethod: 'przelew',
      });
    });

    it('should handle missing due date', () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        // dueDate is missing
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [],
      };

      const result = (service as any).convertToKSeFDto(mockInvoice);

      expect(result.dueDate).toBe('2024-01-15');
    });

    it('should handle missing buyer address', () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        // buyerAddress is missing
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [],
      };

      const result = (service as any).convertToKSeFDto(mockInvoice);

      expect(result.buyerAddress).toBe('');
    });

    it('should handle missing buyer NIP', () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        // buyerNip is missing
        buyerAddress: 'Buyer Address',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [],
      };

      const result = (service as any).convertToKSeFDto(mockInvoice);

      expect(result.buyerNip).toBe('');
    });

    it('should handle multiple items', () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        totalNet: 250,
        totalVat: 50,
        totalGross: 300,
        items: [
          {
            description: 'Item 1',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
          },
          {
            description: 'Item 2',
            quantity: 1,
            unitPrice: 50,
            vatRate: 8,
            gtu: 'GTU_02',
            netAmount: 50,
            vatAmount: 4,
            grossAmount: 54,
          },
        ],
      };

      const result = (service as any).convertToKSeFDto(mockInvoice);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        name: 'Item 1',
        quantity: 2,
        unitPrice: 100,
        vatRate: 23,
        gtu: 'GTU_01',
        netAmount: 200,
        vatAmount: 46,
        grossAmount: 246,
      });
      expect(result.items[1]).toEqual({
        name: 'Item 2',
        quantity: 1,
        unitPrice: 50,
        vatRate: 8,
        gtu: 'GTU_02',
        netAmount: 50,
        vatAmount: 4,
        grossAmount: 54,
      });
    });

    it('should handle items without GTU codes', () => {
      const mockInvoice = {
        id: 'invoice-id',
        number: 'FV/0001',
        date: new Date('2024-01-15'),
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        totalNet: 200,
        totalVat: 46,
        totalGross: 246,
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            // gtu is missing
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
          },
        ],
      };

      const result = (service as any).convertToKSeFDto(mockInvoice);

      expect(result.items[0].gtu).toBeUndefined();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle null tenant_id', async () => {
      const mockInvoiceData = {
        company_id: 'company-id',
        series: 'FV',
        date: '2024-01-15',
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
          },
        ],
      };

      await expect(service.createInvoice(null as any, mockInvoiceData))
        .rejects.toThrow();
    });

    it('should handle undefined tenant_id', async () => {
      const mockInvoiceData = {
        company_id: 'company-id',
        series: 'FV',
        date: '2024-01-15',
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
          },
        ],
      };

      await expect(service.createInvoice(undefined as any, mockInvoiceData))
        .rejects.toThrow();
    });

    it('should handle very large tenant_id', async () => {
      const largeTenantId = 'a'.repeat(1000);

      const mockInvoiceData = {
        company_id: 'company-id',
        series: 'FV',
        date: '2024-01-15',
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address',
        items: [
          {
            description: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
          },
        ],
      };

      const result = await service.createInvoice(largeTenantId, mockInvoiceData);

      expect(result).toBeDefined();
      expect(prismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: largeTenantId,
          }),
        })
      );
    });

    it('should handle special characters in data', async () => {
      const specialData = {
        company_id: 'company-id',
        series: 'FV',
        date: '2024-01-15',
        buyerName: 'Test Buyer ñáéíóú',
        buyerNip: '1234567890',
        buyerAddress: 'Buyer Address!@#$%^&*()',
        items: [
          {
            description: 'Test Item with spëcial çhars',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
          },
        ],
      };

      const result = await service.createInvoice('tenant-123', specialData);

      expect(result).toBeDefined();
    });
  });
});
