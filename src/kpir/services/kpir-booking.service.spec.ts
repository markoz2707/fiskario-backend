import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { KPiRBookingService } from './kpir-booking.service';
import { KPiRNumberingService } from './kpir-numbering.service';

describe('KPiRBookingService', () => {
  let service: KPiRBookingService;

  const TENANT_ID = 'tenant-1';
  const COMPANY_ID = 'company-1';

  const mockPrisma = {
    invoice: {
      findFirst: jest.fn(),
    },
    kPiREntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    zUSContribution: {
      findFirst: jest.fn(),
    },
  };

  const mockNumberingService = {
    getNextNumber: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KPiRBookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KPiRNumberingService, useValue: mockNumberingService },
      ],
    }).compile();

    service = module.get<KPiRBookingService>(KPiRBookingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ====================================================================
  // bookSalesInvoice - ksiegowanie faktury sprzedazy
  // ====================================================================
  describe('bookSalesInvoice - ksiegowanie faktury sprzedazy do kolumny 7', () => {
    const mockSalesInvoice = {
      id: 'inv-sale-1',
      series: 'FV',
      number: '001/2025',
      date: new Date('2025-03-15'),
      totalNet: 15000,
      buyer: {
        name: 'Klient Sp. z o.o.',
        address: 'ul. Kliencka 5, Krakow',
      },
      items: [
        { description: 'Usluga programistyczna' },
        { description: 'Konsultacja IT' },
      ],
    };

    it('powinien zaksiegowac fakture sprzedazy z przychodem w kolumnie 7 (salesRevenue)', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockSalesInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null); // not booked yet
      mockNumberingService.getNextNumber.mockResolvedValue(1);

      const createdEntry = { id: 'kpir-1', lp: 1, salesRevenue: 15000 };
      mockPrisma.kPiREntry.create.mockResolvedValue(createdEntry);

      const result = await service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-sale-1');

      expect(result).toEqual(createdEntry);
      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salesRevenue: 15000,
          otherRevenue: 0,
          totalRevenue: 15000,
          purchaseCost: 0,
          sideExpenses: 0,
          salaries: 0,
          otherExpenses: 0,
          totalExpenses: 0,
          sourceType: 'INVOICE_SALES',
          sourceId: 'inv-sale-1',
        }),
      });
    });

    it('powinien ustawic numer dokumentu z serii i numeru faktury', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockSalesInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(1);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-1' });

      await service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-sale-1');

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentNumber: 'FV/001/2025',
        }),
      });
    });

    it('powinien zbudowac opis z pozycji faktury', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockSalesInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(1);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-1' });

      await service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-sale-1');

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'Sprzedaz: Usluga programistyczna, Konsultacja IT',
        }),
      });
    });

    it('powinien ustawic dane kontrahenta z nabywcy faktury', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockSalesInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(1);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-1' });

      await service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-sale-1');

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          counterpartyName: 'Klient Sp. z o.o.',
          counterpartyAddress: 'ul. Kliencka 5, Krakow',
        }),
      });
    });

    it('powinien zwrocic istniejacy wpis gdy faktura jest juz zaksiegowana', async () => {
      const existingEntry = { id: 'kpir-existing', lp: 5 };
      mockPrisma.invoice.findFirst.mockResolvedValue(mockSalesInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(existingEntry);

      const result = await service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-sale-1');

      expect(result).toEqual(existingEntry);
      expect(mockPrisma.kPiREntry.create).not.toHaveBeenCalled();
    });

    it('powinien rzucic blad gdy faktura nie istnieje', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-nonexistent'),
      ).rejects.toThrow('Invoice inv-nonexistent not found');
    });

    it('powinien poprawnie ustawic miesiac i rok z daty faktury', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockSalesInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(10);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-10' });

      await service.bookSalesInvoice(TENANT_ID, COMPANY_ID, 'inv-sale-1');

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          month: 3,
          year: 2025,
          lp: 10,
        }),
      });
    });
  });

  // ====================================================================
  // bookPurchaseInvoice - ksiegowanie faktury zakupu
  // ====================================================================
  describe('bookPurchaseInvoice - ksiegowanie faktury zakupu', () => {
    const mockPurchaseInvoice = {
      id: 'inv-purch-1',
      series: 'FZ',
      number: '042/2025',
      date: new Date('2025-05-20'),
      totalNet: 8000,
      isIncoming: true,
      buyer: {
        name: 'Dostawca Sp. z o.o.',
        address: 'ul. Dostawcza 10, Poznan',
      },
      items: [
        { description: 'Materialy biurowe' },
        { description: 'Toner do drukarki' },
      ],
    };

    it('powinien domyslnie zaksiegowac koszt do kolumny 13 (otherExpenses)', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockPurchaseInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(3);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-3' });

      await service.bookPurchaseInvoice(TENANT_ID, COMPANY_ID, 'inv-purch-1');

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salesRevenue: 0,
          totalRevenue: 0,
          purchaseCost: 0,
          sideExpenses: 0,
          otherExpenses: 8000,
          totalExpenses: 8000,
          sourceType: 'INVOICE_PURCHASE',
        }),
      });
    });

    it('powinien zaksiegowac do kolumny 10 (purchaseCost) gdy costColumn=purchaseCost', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockPurchaseInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(4);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-4' });

      await service.bookPurchaseInvoice(TENANT_ID, COMPANY_ID, 'inv-purch-1', {
        costColumn: 'purchaseCost',
      });

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseCost: 8000,
          sideExpenses: 0,
          otherExpenses: 0,
          totalExpenses: 8000,
        }),
      });
    });

    it('powinien zaksiegowac do kolumny 11 (sideExpenses) gdy costColumn=sideExpenses', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockPurchaseInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(5);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-5' });

      await service.bookPurchaseInvoice(TENANT_ID, COMPANY_ID, 'inv-purch-1', {
        costColumn: 'sideExpenses',
      });

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseCost: 0,
          sideExpenses: 8000,
          otherExpenses: 0,
          totalExpenses: 8000,
        }),
      });
    });

    it('powinien rzucic blad gdy faktura zakupu nie istnieje', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.bookPurchaseInvoice(TENANT_ID, COMPANY_ID, 'inv-nonexistent'),
      ).rejects.toThrow('Purchase invoice inv-nonexistent not found');
    });

    it('powinien zwrocic istniejacy wpis gdy faktura zakupu jest juz zaksiegowana', async () => {
      const existingEntry = { id: 'kpir-existing', sourceType: 'INVOICE_PURCHASE' };
      mockPrisma.invoice.findFirst.mockResolvedValue(mockPurchaseInvoice);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(existingEntry);

      const result = await service.bookPurchaseInvoice(TENANT_ID, COMPANY_ID, 'inv-purch-1');

      expect(result).toEqual(existingEntry);
      expect(mockPrisma.kPiREntry.create).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // bookZUSContribution - ksiegowanie skladek ZUS
  // ====================================================================
  describe('bookZUSContribution - ksiegowanie skladek ZUS spolecznych', () => {
    const mockContribution = {
      id: 'zus-1',
      contributionDate: new Date('2025-02-15'),
      period: '01/2025',
      emerytalnaEmployer: 400,
      rentowaEmployer: 200,
      wypadkowaEmployer: 100,
      fpEmployee: 50,
      fgspEmployee: 30,
      zdrowotna: 500, // NOT included in KPiR
    };

    it('powinien zaksiegowac skladki spoleczne ZUS do kolumny 13 (otherExpenses)', async () => {
      mockPrisma.zUSContribution.findFirst.mockResolvedValue(mockContribution);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(7);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-7' });

      const result = await service.bookZUSContribution(TENANT_ID, COMPANY_ID, 'zus-1');

      // socialContributions = 400 + 200 + 100 + 50 + 30 = 780
      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          otherExpenses: 780,
          totalExpenses: 780,
          salesRevenue: 0,
          totalRevenue: 0,
          sourceType: 'ZUS_CONTRIBUTION',
          sourceId: 'zus-1',
          counterpartyName: 'Zaklad Ubezpieczen Spolecznych',
          description: 'Skladki ZUS spoleczne za okres 01/2025',
          documentNumber: 'ZUS/01/2025',
        }),
      });
    });

    it('powinien NIE ksiegowac skladki zdrowotnej do KPiR (odliczana od podatku)', async () => {
      mockPrisma.zUSContribution.findFirst.mockResolvedValue(mockContribution);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);
      mockNumberingService.getNextNumber.mockResolvedValue(7);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-7' });

      await service.bookZUSContribution(TENANT_ID, COMPANY_ID, 'zus-1');

      // zdrowotna (500) should NOT be included
      const createCall = mockPrisma.kPiREntry.create.mock.calls[0][0];
      expect(createCall.data.otherExpenses).toBe(780); // not 1280
    });

    it('powinien zwrocic null gdy skladki spoleczne sa zerowe', async () => {
      const zeroContribution = {
        ...mockContribution,
        emerytalnaEmployer: 0,
        rentowaEmployer: 0,
        wypadkowaEmployer: 0,
        fpEmployee: 0,
        fgspEmployee: 0,
      };
      mockPrisma.zUSContribution.findFirst.mockResolvedValue(zeroContribution);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);

      const result = await service.bookZUSContribution(TENANT_ID, COMPANY_ID, 'zus-1');

      expect(result).toBeNull();
      expect(mockPrisma.kPiREntry.create).not.toHaveBeenCalled();
    });

    it('powinien rzucic blad gdy skladka ZUS nie istnieje', async () => {
      mockPrisma.zUSContribution.findFirst.mockResolvedValue(null);

      await expect(
        service.bookZUSContribution(TENANT_ID, COMPANY_ID, 'zus-nonexistent'),
      ).rejects.toThrow('ZUS contribution zus-nonexistent not found');
    });

    it('powinien zwrocic istniejacy wpis gdy skladka jest juz zaksiegowana', async () => {
      const existingEntry = { id: 'kpir-existing', sourceType: 'ZUS_CONTRIBUTION' };
      mockPrisma.zUSContribution.findFirst.mockResolvedValue(mockContribution);
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(existingEntry);

      const result = await service.bookZUSContribution(TENANT_ID, COMPANY_ID, 'zus-1');

      expect(result).toEqual(existingEntry);
      expect(mockPrisma.kPiREntry.create).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // bookSalary - ksiegowanie wynagrodzenia
  // ====================================================================
  describe('bookSalary - ksiegowanie wynagrodzenia do kolumny 12', () => {
    it('powinien zaksiegowac wynagrodzenie brutto do kolumny 12 (salaries)', async () => {
      mockNumberingService.getNextNumber.mockResolvedValue(8);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'kpir-8', salaries: 6500 });

      const result = await service.bookSalary(TENANT_ID, COMPANY_ID, {
        date: new Date('2025-04-10'),
        employeeName: 'Jan Kowalski',
        period: '03/2025',
        grossAmount: 6500,
        documentNumber: 'LP/03/2025/001',
      });

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salaries: 6500,
          totalExpenses: 6500,
          salesRevenue: 0,
          totalRevenue: 0,
          purchaseCost: 0,
          otherExpenses: 0,
          sourceType: 'SALARY',
          counterpartyName: 'Jan Kowalski',
          description: 'Wynagrodzenie za okres 03/2025',
          month: 4,
          year: 2025,
        }),
      });
    });
  });
});
