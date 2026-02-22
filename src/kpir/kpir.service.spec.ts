import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KPiRService } from './kpir.service';
import { KPiRNumberingService } from './services/kpir-numbering.service';
import { CreateKPiREntryDto } from './dto/create-kpir-entry.dto';

describe('KPiRService', () => {
  let service: KPiRService;
  let prisma: PrismaService;
  let numberingService: KPiRNumberingService;

  const TENANT_ID = 'tenant-1';
  const COMPANY_ID = 'company-1';
  const ENTRY_ID = 'entry-1';

  const mockPrisma = {
    kPiREntry: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  const mockNumberingService = {
    getNextNumber: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KPiRService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KPiRNumberingService, useValue: mockNumberingService },
      ],
    }).compile();

    service = module.get<KPiRService>(KPiRService);
    prisma = module.get<PrismaService>(PrismaService);
    numberingService = module.get<KPiRNumberingService>(KPiRNumberingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ====================================================================
  // createEntry - tworzenie wpisu KPiR
  // ====================================================================
  describe('createEntry - tworzenie wpisu KPiR', () => {
    it('powinien utworzyc wpis przychodu ze sprzedazy (kolumna 7)', async () => {
      mockNumberingService.getNextNumber.mockResolvedValue(1);
      const createdEntry = { id: ENTRY_ID, lp: 1, salesRevenue: 5000, totalRevenue: 5000 };
      mockPrisma.kPiREntry.create.mockResolvedValue(createdEntry);

      const dto: CreateKPiREntryDto = {
        entryDate: '2025-03-15',
        documentNumber: 'FV/03/2025/001',
        counterpartyName: 'Firma ABC Sp. z o.o.',
        counterpartyAddress: 'ul. Testowa 1, Warszawa',
        description: 'Sprzedaz uslugi programistycznej',
        salesRevenue: 5000,
        otherRevenue: 0,
        sourceType: 'INVOICE_SALES',
      };

      const result = await service.createEntry(TENANT_ID, COMPANY_ID, dto);

      expect(result).toEqual(createdEntry);
      expect(mockNumberingService.getNextNumber).toHaveBeenCalledWith(TENANT_ID, COMPANY_ID, 2025);
      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          lp: 1,
          salesRevenue: 5000,
          otherRevenue: 0,
          totalRevenue: 5000,
          totalExpenses: 0,
          month: 3,
          year: 2025,
        }),
      });
    });

    it('powinien utworzyc wpis kosztu zakupu (kolumna 10)', async () => {
      mockNumberingService.getNextNumber.mockResolvedValue(2);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'entry-2', lp: 2 });

      const dto: CreateKPiREntryDto = {
        entryDate: '2025-06-10',
        documentNumber: 'FZ/06/2025/001',
        description: 'Zakup materialow biurowych',
        purchaseCost: 1200,
        sourceType: 'INVOICE_PURCHASE',
      };

      await service.createEntry(TENANT_ID, COMPANY_ID, dto);

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseCost: 1200,
          totalRevenue: 0,
          totalExpenses: 1200,
          month: 6,
          year: 2025,
        }),
      });
    });

    it('powinien poprawnie obliczac laczny przychod i laczne koszty ze wszystkich kolumn', async () => {
      mockNumberingService.getNextNumber.mockResolvedValue(3);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'entry-3' });

      const dto: CreateKPiREntryDto = {
        entryDate: '2025-01-20',
        documentNumber: 'DOC/01/2025',
        description: 'Wpis zbliorczy',
        salesRevenue: 10000,
        otherRevenue: 500,
        purchaseCost: 3000,
        sideExpenses: 200,
        salaries: 5000,
        otherExpenses: 800,
        sourceType: 'MANUAL',
      };

      await service.createEntry(TENANT_ID, COMPANY_ID, dto);

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalRevenue: 10500,    // 10000 + 500
          totalExpenses: 9000,    // 3000 + 200 + 5000 + 800
        }),
      });
    });

    it('powinien traktowac brakujace pola kwotowe jako 0', async () => {
      mockNumberingService.getNextNumber.mockResolvedValue(1);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'entry-4' });

      const dto: CreateKPiREntryDto = {
        entryDate: '2025-01-01',
        documentNumber: 'DOC/001',
        description: 'Wpis bez kwot',
        sourceType: 'MANUAL',
      };

      await service.createEntry(TENANT_ID, COMPANY_ID, dto);

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salesRevenue: 0,
          otherRevenue: 0,
          totalRevenue: 0,
          purchaseCost: 0,
          sideExpenses: 0,
          salaries: 0,
          otherExpenses: 0,
          totalExpenses: 0,
          researchCosts: 0,
        }),
      });
    });

    it('powinien ustawic flage korekty i ID korygowanego wpisu', async () => {
      mockNumberingService.getNextNumber.mockResolvedValue(5);
      mockPrisma.kPiREntry.create.mockResolvedValue({ id: 'entry-5', isCorrection: true });

      const dto: CreateKPiREntryDto = {
        entryDate: '2025-04-01',
        documentNumber: 'KOR/04/2025/001',
        description: 'Korekta sprzedazy',
        salesRevenue: -500,
        sourceType: 'INVOICE_SALES',
        isCorrection: true,
        correctedEntryId: 'entry-1',
      };

      await service.createEntry(TENANT_ID, COMPANY_ID, dto);

      expect(mockPrisma.kPiREntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isCorrection: true,
          correctedEntryId: 'entry-1',
        }),
      });
    });
  });

  // ====================================================================
  // getEntry - pobieranie wpisu KPiR
  // ====================================================================
  describe('getEntry - pobieranie wpisu KPiR', () => {
    it('powinien zwrocic wpis gdy istnieje', async () => {
      const entry = { id: ENTRY_ID, lp: 1, description: 'Test' };
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(entry);

      const result = await service.getEntry(TENANT_ID, COMPANY_ID, ENTRY_ID);

      expect(result).toEqual(entry);
      expect(mockPrisma.kPiREntry.findFirst).toHaveBeenCalledWith({
        where: { id: ENTRY_ID, tenant_id: TENANT_ID, company_id: COMPANY_ID },
      });
    });

    it('powinien rzucic NotFoundException gdy wpis nie istnieje', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);

      await expect(
        service.getEntry(TENANT_ID, COMPANY_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ====================================================================
  // listEntries - listowanie wpisow z filtrami
  // ====================================================================
  describe('listEntries - listowanie wpisow z filtrami', () => {
    it('powinien zwrocic liste wpisow z paginacja i podsumowaniem', async () => {
      const entries = [{ id: 'e1' }, { id: 'e2' }];
      mockPrisma.kPiREntry.findMany.mockResolvedValue(entries);
      mockPrisma.kPiREntry.count.mockResolvedValue(2);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: 15000, totalExpenses: 8000 },
      });

      const result = await service.listEntries(TENANT_ID, COMPANY_ID, {});

      expect(result.entries).toEqual(entries);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.summary.totalRevenue).toBe(15000);
      expect(result.summary.totalExpenses).toBe(8000);
      expect(result.summary.income).toBe(7000);
    });

    it('powinien filtrowac po roku i miesiacu', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.kPiREntry.count.mockResolvedValue(0);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      await service.listEntries(TENANT_ID, COMPANY_ID, { year: 2025, month: 3 });

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ year: 2025, month: 3 }),
        }),
      );
    });

    it('powinien filtrowac po zakresie dat', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.kPiREntry.count.mockResolvedValue(0);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      await service.listEntries(TENANT_ID, COMPANY_ID, {
        dateFrom: '2025-01-01',
        dateTo: '2025-03-31',
      });

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entryDate: {
              gte: new Date('2025-01-01'),
              lte: new Date('2025-03-31'),
            },
          }),
        }),
      );
    });

    it('powinien wyszukiwac po opisie, nazwie kontrahenta i numerze dokumentu', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.kPiREntry.count.mockResolvedValue(0);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      await service.listEntries(TENANT_ID, COMPANY_ID, { search: 'Firma ABC' });

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { description: { contains: 'Firma ABC', mode: 'insensitive' } },
              { counterpartyName: { contains: 'Firma ABC', mode: 'insensitive' } },
              { documentNumber: { contains: 'Firma ABC', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('powinien uzywac domyslnych wartosci paginacji (strona 1, limit 50)', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.kPiREntry.count.mockResolvedValue(0);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      const result = await service.listEntries(TENANT_ID, COMPANY_ID, {});

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        }),
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('powinien poprawnie obliczac skip dla strony 3 z limitem 20', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.kPiREntry.count.mockResolvedValue(0);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      await service.listEntries(TENANT_ID, COMPANY_ID, { page: 3, limit: 20 });

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,  // (3-1) * 20
          take: 20,
        }),
      );
    });

    it('powinien zwracac 0 w podsumowaniu gdy brak wpisow', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.kPiREntry.count.mockResolvedValue(0);
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      const result = await service.listEntries(TENANT_ID, COMPANY_ID, {});

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
      expect(result.summary.income).toBe(0);
    });
  });

  // ====================================================================
  // updateEntry - aktualizacja wpisu KPiR
  // ====================================================================
  describe('updateEntry - aktualizacja wpisu KPiR', () => {
    it('powinien zaktualizowac opis i numer dokumentu bez przeliczania sum', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue({ id: ENTRY_ID });
      mockPrisma.kPiREntry.update.mockResolvedValue({ id: ENTRY_ID, description: 'Nowy opis' });

      const result = await service.updateEntry(TENANT_ID, COMPANY_ID, ENTRY_ID, {
        description: 'Nowy opis',
        documentNumber: 'FV/NOWY/001',
      });

      expect(result.description).toBe('Nowy opis');
      // findUnique should NOT be called when no financial fields change
      expect(mockPrisma.kPiREntry.findUnique).not.toHaveBeenCalled();
    });

    it('powinien przeliczyc sumy po zmianie kwoty przychodu ze sprzedazy', async () => {
      const existingEntry = {
        id: ENTRY_ID,
        salesRevenue: 5000,
        otherRevenue: 500,
        purchaseCost: 0,
        sideExpenses: 0,
        salaries: 0,
        otherExpenses: 0,
      };
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(existingEntry);
      mockPrisma.kPiREntry.findUnique.mockResolvedValue(existingEntry);
      mockPrisma.kPiREntry.update.mockResolvedValue({
        ...existingEntry,
        salesRevenue: 8000,
        totalRevenue: 8500, // 8000 + 500
      });

      await service.updateEntry(TENANT_ID, COMPANY_ID, ENTRY_ID, {
        salesRevenue: 8000,
      });

      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: ENTRY_ID },
        data: expect.objectContaining({
          salesRevenue: 8000,
          totalRevenue: 8500,    // 8000 (new) + 500 (existing otherRevenue)
          totalExpenses: 0,
        }),
      });
    });

    it('powinien zaktualizowac miesiac i rok po zmianie daty', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue({ id: ENTRY_ID });
      mockPrisma.kPiREntry.update.mockResolvedValue({ id: ENTRY_ID });

      await service.updateEntry(TENANT_ID, COMPANY_ID, ENTRY_ID, {
        entryDate: '2025-12-15',
      });

      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: ENTRY_ID },
        data: expect.objectContaining({
          entryDate: new Date('2025-12-15'),
          month: 12,
          year: 2025,
        }),
      });
    });

    it('powinien rzucic NotFoundException gdy aktualizowany wpis nie istnieje', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEntry(TENANT_ID, COMPANY_ID, 'non-existent', { description: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ====================================================================
  // deleteEntry - usuwanie wpisu KPiR
  // ====================================================================
  describe('deleteEntry - usuwanie wpisu KPiR', () => {
    it('powinien usunac istniejacy wpis', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue({ id: ENTRY_ID });
      mockPrisma.kPiREntry.delete.mockResolvedValue({ id: ENTRY_ID });

      const result = await service.deleteEntry(TENANT_ID, COMPANY_ID, ENTRY_ID);

      expect(mockPrisma.kPiREntry.delete).toHaveBeenCalledWith({ where: { id: ENTRY_ID } });
      expect(result.id).toBe(ENTRY_ID);
    });

    it('powinien rzucic NotFoundException przy probie usuniecia nieistniejacego wpisu', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteEntry(TENANT_ID, COMPANY_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ====================================================================
  // isInvoiceBooked - sprawdzanie czy faktura jest juz zaksiegowana
  // ====================================================================
  describe('isInvoiceBooked - sprawdzanie czy faktura jest zaksiegowana', () => {
    it('powinien zwrocic true gdy faktura jest juz zaksiegowana', async () => {
      mockPrisma.kPiREntry.count.mockResolvedValue(1);

      const result = await service.isInvoiceBooked(TENANT_ID, COMPANY_ID, 'inv-1');

      expect(result).toBe(true);
      expect(mockPrisma.kPiREntry.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          sourceId: 'inv-1',
          sourceType: { in: ['INVOICE_SALES', 'INVOICE_PURCHASE'] },
          isCorrection: false,
        },
      });
    });

    it('powinien zwrocic false gdy faktura nie jest zaksiegowana', async () => {
      mockPrisma.kPiREntry.count.mockResolvedValue(0);

      const result = await service.isInvoiceBooked(TENANT_ID, COMPANY_ID, 'inv-new');

      expect(result).toBe(false);
    });
  });

  // ====================================================================
  // getEntriesBySource - pobieranie wpisow po zrodle
  // ====================================================================
  describe('getEntriesBySource - pobieranie wpisow wedlug zrodla', () => {
    it('powinien zwrocic wpisy powiazane z faktura sprzedazy', async () => {
      const entries = [{ id: 'e1', sourceType: 'INVOICE_SALES', sourceId: 'inv-1' }];
      mockPrisma.kPiREntry.findMany.mockResolvedValue(entries);

      const result = await service.getEntriesBySource(
        TENANT_ID, COMPANY_ID, 'INVOICE_SALES', 'inv-1',
      );

      expect(result).toEqual(entries);
      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          sourceType: 'INVOICE_SALES',
          sourceId: 'inv-1',
        },
        orderBy: { lp: 'asc' },
      });
    });
  });
});
