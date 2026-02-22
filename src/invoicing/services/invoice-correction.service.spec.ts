import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceCorrectionService } from './invoice-correction.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KsefService } from '../../ksef/ksef.service';
import { CreateCorrectionInvoiceDto } from '../dto/correction-invoice.dto';

describe('InvoiceCorrectionService', () => {
  let service: InvoiceCorrectionService;
  let prisma: PrismaService;
  let ksefService: KsefService;

  const TENANT_ID = 'tenant-1';
  const COMPANY_ID = 'company-1';
  const ORIGINAL_INVOICE_ID = 'inv-original';

  const mockPrisma = {
    invoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    taskQueue: {
      create: jest.fn(),
    },
  };

  const mockKsefService = {
    getAuthStatus: jest.fn(),
    submitInvoice: jest.fn(),
  };

  // A standard original invoice for test reuse
  const mockOriginalInvoice = {
    id: ORIGINAL_INVOICE_ID,
    tenant_id: TENANT_ID,
    company_id: COMPANY_ID,
    buyer_id: 'buyer-1',
    number: 'FV/0001',
    series: 'FV',
    type: 'standard',
    date: new Date('2025-03-01'),
    dueDate: new Date('2025-04-01'),
    totalNet: 5000,
    totalVat: 1150,
    totalGross: 6150,
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
    buyer: { id: 'buyer-1', name: 'Firma ABC', nip: '5213000000', address: 'Warszawa' },
    company: { name: 'My Company', nip: '1111111111', address: 'Company Address' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceCorrectionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KsefService, useValue: mockKsefService },
      ],
    }).compile();

    service = module.get<InvoiceCorrectionService>(InvoiceCorrectionService);
    prisma = module.get<PrismaService>(PrismaService);
    ksefService = module.get<KsefService>(KsefService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ====================================================================
  // createCorrection - korekta do zera
  // ====================================================================
  describe('createCorrection - korekta do zera (to_zero)', () => {
    it('should reverse all item amounts with negative values', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice) // fetch original
        .mockResolvedValueOnce(null); // no previous correction number
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});

      const correctionInvoice = {
        id: 'inv-corr-1',
        tenant_id: TENANT_ID,
        number: 'KOR/FV/0001',
        series: 'KOR/FV',
        type: 'correction',
        correctionOf: ORIGINAL_INVOICE_ID,
        date: new Date('2025-03-15'),
        totalNet: -5000,
        totalVat: -1150,
        totalGross: -6150,
        items: [
          {
            description: 'Uslugi programistyczne',
            quantity: -10,
            unitPrice: 500,
            vatRate: 23,
            gtu: 'GTU_12',
            netAmount: -5000,
            vatAmount: -1150,
            grossAmount: -6150,
          },
        ],
        buyer: mockOriginalInvoice.buyer,
        company: mockOriginalInvoice.company,
      };
      mockPrisma.invoice.create.mockResolvedValue(correctionInvoice);

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Anulowanie faktury - blad w danych nabywcy',
      };

      const result = await service.createCorrection(TENANT_ID, dto);

      expect(result).toEqual(correctionInvoice);

      // Verify the correction was created with negative amounts
      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            company_id: COMPANY_ID,
            buyer_id: 'buyer-1',
            type: 'correction',
            correctionOf: ORIGINAL_INVOICE_ID,
            correctionReason: 'Anulowanie faktury - blad w danych nabywcy',
            totalNet: -5000,
            totalVat: -1150,
            totalGross: -6150,
            items: {
              create: [
                expect.objectContaining({
                  description: 'Uslugi programistyczne',
                  quantity: -10,
                  unitPrice: 500,
                  vatRate: 23,
                  gtu: 'GTU_12',
                  netAmount: -5000,
                  vatAmount: -1150,
                  grossAmount: -6150,
                }),
              ],
            },
          }),
          include: { items: true, buyer: true, company: true },
        }),
      );
    });

    it('should reverse all items when original has multiple items', async () => {
      const multiItemOriginal = {
        ...mockOriginalInvoice,
        items: [
          {
            id: 'item-1',
            description: 'Service A',
            quantity: 5,
            unitPrice: 200,
            vatRate: 23,
            gtu: null,
            netAmount: 1000,
            vatAmount: 230,
            grossAmount: 1230,
          },
          {
            id: 'item-2',
            description: 'Service B',
            quantity: 2,
            unitPrice: 800,
            vatRate: 8,
            gtu: null,
            netAmount: 1600,
            vatAmount: 128,
            grossAmount: 1728,
          },
        ],
        totalNet: 2600,
        totalVat: 358,
        totalGross: 2958,
      };

      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(multiItemOriginal)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr-multi' });

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Pelne anulowanie',
      };

      await service.createCorrection(TENANT_ID, dto);

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: -2600,
            totalVat: -358,
            totalGross: -2958,
            items: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  description: 'Service A',
                  quantity: -5,
                  netAmount: -1000,
                }),
                expect.objectContaining({
                  description: 'Service B',
                  quantity: -2,
                  netAmount: -1600,
                }),
              ]),
            },
          }),
        }),
      );
    });
  });

  // ====================================================================
  // createCorrection - korekta czesciowa (partial)
  // ====================================================================
  describe('createCorrection - korekta czesciowa (partial)', () => {
    it('should calculate difference amounts for corrected items', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice) // fetch original
        .mockResolvedValueOnce(null); // no previous correction number
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr-partial' });

      // Reduce quantity from 10 to 7 (partial correction)
      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-20',
        correctionType: 'partial',
        correctionReason: 'Korekta ilosci - zwrot 3 sztuk',
        correctedItems: [
          {
            originalItemId: 'item-1',
            description: 'Uslugi programistyczne',
            quantity: 7,
            unitPrice: 500,
            vatRate: 23,
            gtu: 'GTU_12',
          },
        ],
      };

      await service.createCorrection(TENANT_ID, dto);

      // Original: qty=10, net=5000, vat=1150, gross=6150
      // Corrected: qty=7, net=3500, vat=805, gross=4305
      // Difference: qty=-3, net=-1500, vat=-345, gross=-1845
      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: -1500,
            totalVat: -345,
            totalGross: -1845,
            items: {
              create: [
                expect.objectContaining({
                  description: 'Uslugi programistyczne',
                  quantity: -3, // 7 - 10
                  unitPrice: 500,
                  vatRate: 23,
                  netAmount: -1500, // 3500 - 5000
                  vatAmount: -345, // 805 - 1150
                  grossAmount: -1845, // 4305 - 6150
                }),
              ],
            },
          }),
        }),
      );
    });

    it('should handle partial correction with increased quantity', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr-increase' });

      // Increase quantity from 10 to 15
      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-20',
        correctionType: 'partial',
        correctionReason: 'Korekta ilosci - doliczenie',
        correctedItems: [
          {
            originalItemId: 'item-1',
            description: 'Uslugi programistyczne',
            quantity: 15,
            unitPrice: 500,
            vatRate: 23,
            gtu: 'GTU_12',
          },
        ],
      };

      await service.createCorrection(TENANT_ID, dto);

      // Original: qty=10, net=5000, vat=1150, gross=6150
      // Corrected: qty=15, net=7500, vat=1725, gross=9225
      // Difference: qty=+5, net=+2500, vat=+575, gross=+3075
      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 2500,
            totalVat: 575,
            totalGross: 3075,
            items: {
              create: [
                expect.objectContaining({
                  quantity: 5, // 15 - 10
                  netAmount: 2500,
                  vatAmount: 575,
                  grossAmount: 3075,
                }),
              ],
            },
          }),
        }),
      );
    });

    it('should handle new items added via partial correction', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr-newitem' });

      // Add a new item not present in original (no originalItemId)
      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-20',
        correctionType: 'partial',
        correctionReason: 'Dodanie brakujacej pozycji',
        correctedItems: [
          {
            // no originalItemId -> new item
            description: 'Dodatkowa usluga',
            quantity: 3,
            unitPrice: 200,
            vatRate: 23,
          },
        ],
      };

      await service.createCorrection(TENANT_ID, dto);

      // New item: qty=3, net=600, vat=138, gross=738
      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: 600,
            totalVat: 138,
            totalGross: 738,
            items: {
              create: [
                expect.objectContaining({
                  description: 'Dodatkowa usluga',
                  quantity: 3,
                  unitPrice: 200,
                  netAmount: 600,
                  vatAmount: 138,
                  grossAmount: 738,
                }),
              ],
            },
          }),
        }),
      );
    });
  });

  // ====================================================================
  // createCorrection - rejection cases
  // ====================================================================
  describe('createCorrection - rejection cases', () => {
    it('should throw NotFoundException when original invoice is not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: 'nonexistent',
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Test',
      };

      await expect(service.createCorrection(TENANT_ID, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when correcting a correction invoice', async () => {
      const correctionInvoice = {
        ...mockOriginalInvoice,
        type: 'correction',
      };
      mockPrisma.invoice.findFirst.mockResolvedValue(correctionInvoice);

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Attempting to correct a correction',
      };

      await expect(service.createCorrection(TENANT_ID, dto))
        .rejects.toThrow(BadRequestException);

      await expect(service.createCorrection(TENANT_ID, dto))
        .rejects.toThrow('Cannot create correction of a correction invoice');
    });
  });

  // ====================================================================
  // createCorrection - KSeF submission queuing
  // ====================================================================
  describe('createCorrection - KSeF submission queuing', () => {
    it('should submit correction to KSeF when authenticated', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockResolvedValue({ success: true });

      const correctionResult = {
        id: 'inv-corr-1',
        tenant_id: TENANT_ID,
        number: 'KOR/FV/0001',
        date: new Date('2025-03-15'),
        dueDate: null,
        correctionReason: 'Korekta',
        totalNet: -5000,
        totalVat: -1150,
        totalGross: -6150,
        items: mockOriginalInvoice.items.map(i => ({
          ...i,
          quantity: -i.quantity,
          netAmount: -i.netAmount,
          vatAmount: -i.vatAmount,
          grossAmount: -i.grossAmount,
        })),
        buyer: mockOriginalInvoice.buyer,
        company: mockOriginalInvoice.company,
      };
      mockPrisma.invoice.create.mockResolvedValue(correctionResult);

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Korekta',
      };

      await service.createCorrection(TENANT_ID, dto);

      expect(mockKsefService.submitInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceNumber: 'KOR/FV/0001',
          correctionOf: mockOriginalInvoice.number,
          isCorrection: true,
        }),
        TENANT_ID,
      );
    });

    it('should queue correction for later when KSeF is not authenticated', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});

      const correctionResult = {
        id: 'inv-corr-queue',
        tenant_id: TENANT_ID,
        number: 'KOR/FV/0001',
        date: new Date('2025-03-15'),
        items: [],
        buyer: {},
        company: {},
      };
      mockPrisma.invoice.create.mockResolvedValue(correctionResult);

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Korekta do pozniejszej wysylki KSeF',
      };

      await service.createCorrection(TENANT_ID, dto);

      expect(mockKsefService.submitInvoice).not.toHaveBeenCalled();
      expect(mockPrisma.taskQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          type: 'ksef_correction_submission',
          payload: expect.objectContaining({
            invoiceId: 'inv-corr-queue',
          }),
        }),
      });
    });

    it('should queue retry when KSeF submission fails', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: true });
      mockKsefService.submitInvoice.mockRejectedValue(new Error('KSeF network error'));
      mockPrisma.taskQueue.create.mockResolvedValue({});

      const correctionResult = {
        id: 'inv-corr-fail',
        tenant_id: TENANT_ID,
        number: 'KOR/FV/0001',
        date: new Date('2025-03-15'),
        items: [],
        buyer: {},
        company: {},
      };
      mockPrisma.invoice.create.mockResolvedValue(correctionResult);

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Korekta',
      };

      // Should NOT throw - correction is still created, KSeF error is handled internally
      const result = await service.createCorrection(TENANT_ID, dto);
      expect(result).toBeDefined();

      expect(mockPrisma.taskQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          type: 'ksef_correction_submission_retry',
          payload: { invoiceId: 'inv-corr-fail' },
          status: 'pending',
          retryCount: 0,
        }),
      });
    });
  });

  // ====================================================================
  // createCorrection - correction number generation
  // ====================================================================
  describe('createCorrection - correction number generation', () => {
    it('should generate KOR/FV/0001 for first correction in series', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice) // fetch original
        .mockResolvedValueOnce(null); // no previous corrections
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr' });

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Anulowanie',
      };

      await service.createCorrection(TENANT_ID, dto);

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            number: 'KOR/FV/0001',
            series: 'FV', // series stored as original (without KOR/ prefix)
          }),
        }),
      );
    });

    it('should increment correction number from last existing correction', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice) // fetch original
        .mockResolvedValueOnce({ number: 'KOR/FV/0005' }); // last correction
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr' });

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Anulowanie',
      };

      await service.createCorrection(TENANT_ID, dto);

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            number: 'KOR/FV/0006',
          }),
        }),
      );
    });

    it('should use custom series when provided in DTO', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr' });

      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-15',
        correctionType: 'to_zero',
        correctionReason: 'Anulowanie',
        series: 'FA', // custom series
      };

      await service.createCorrection(TENANT_ID, dto);

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            number: 'KOR/FA/0001',
            series: 'FA', // series stored as provided DTO series (without KOR/ prefix)
          }),
        }),
      );
    });
  });

  // ====================================================================
  // getCorrections - pobranie listy korekt
  // ====================================================================
  describe('getCorrections', () => {
    it('should return list of corrections for an original invoice', async () => {
      const corrections = [
        { id: 'corr-1', number: 'KOR/FV/0001', type: 'correction', correctionOf: ORIGINAL_INVOICE_ID },
        { id: 'corr-2', number: 'KOR/FV/0002', type: 'correction', correctionOf: ORIGINAL_INVOICE_ID },
      ];
      mockPrisma.invoice.findMany.mockResolvedValue(corrections);

      const result = await service.getCorrections(TENANT_ID, ORIGINAL_INVOICE_ID);

      expect(result).toEqual(corrections);
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          correctionOf: ORIGINAL_INVOICE_ID,
          type: 'correction',
        },
        include: { items: true, buyer: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no corrections exist', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.getCorrections(TENANT_ID, ORIGINAL_INVOICE_ID);

      expect(result).toEqual([]);
    });
  });

  // ====================================================================
  // createCorrection - full correction type
  // ====================================================================
  describe('createCorrection - korekta pelna (full)', () => {
    it('should calculate difference between original and corrected items', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(mockOriginalInvoice)
        .mockResolvedValueOnce(null);
      mockKsefService.getAuthStatus.mockReturnValue({ authenticated: false });
      mockPrisma.taskQueue.create.mockResolvedValue({});
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-corr-full' });

      // Change price from 500 to 400 for the same item
      const dto: CreateCorrectionInvoiceDto = {
        originalInvoiceId: ORIGINAL_INVOICE_ID,
        company_id: COMPANY_ID,
        correctionDate: '2025-03-20',
        correctionType: 'full',
        correctionReason: 'Korekta ceny',
        correctedItems: [
          {
            originalItemId: 'item-1',
            description: 'Uslugi programistyczne',
            quantity: 10,
            unitPrice: 400,
            vatRate: 23,
            gtu: 'GTU_12',
          },
        ],
      };

      await service.createCorrection(TENANT_ID, dto);

      // Original: net=5000, vat=1150, gross=6150
      // New: net=4000, vat=920, gross=4920
      // Diff: net=-1000, vat=-230, gross=-1230
      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalNet: -1000,
            totalVat: -230,
            totalGross: -1230,
            items: {
              create: [
                expect.objectContaining({
                  quantity: 0, // 10 - 10 = 0
                  unitPrice: 400,
                  netAmount: -1000,
                  vatAmount: -230,
                  grossAmount: -1230,
                }),
              ],
            },
          }),
        }),
      );
    });
  });
});
