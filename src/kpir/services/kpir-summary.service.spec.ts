import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { KPiRSummaryService } from './kpir-summary.service';

describe('KPiRSummaryService', () => {
  let service: KPiRSummaryService;

  const TENANT_ID = 'tenant-1';
  const COMPANY_ID = 'company-1';

  const mockPrisma = {
    kPiREntry: {
      aggregate: jest.fn(),
    },
    remanent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KPiRSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<KPiRSummaryService>(KPiRSummaryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Helper to create an aggregate response with specific values
  function createAggregateResult(overrides: Partial<{
    salesRevenue: number | null;
    otherRevenue: number | null;
    totalRevenue: number | null;
    purchaseCost: number | null;
    sideExpenses: number | null;
    salaries: number | null;
    otherExpenses: number | null;
    totalExpenses: number | null;
    researchCosts: number | null;
    count: number;
  }> = {}) {
    return {
      _sum: {
        salesRevenue: overrides.salesRevenue ?? null,
        otherRevenue: overrides.otherRevenue ?? null,
        totalRevenue: overrides.totalRevenue ?? null,
        purchaseCost: overrides.purchaseCost ?? null,
        sideExpenses: overrides.sideExpenses ?? null,
        salaries: overrides.salaries ?? null,
        otherExpenses: overrides.otherExpenses ?? null,
        totalExpenses: overrides.totalExpenses ?? null,
        researchCosts: overrides.researchCosts ?? null,
      },
      _count: overrides.count ?? 0,
    };
  }

  // ====================================================================
  // getMonthlySummary - podsumowanie miesieczne
  // ====================================================================
  describe('getMonthlySummary - podsumowanie miesieczne', () => {
    it('powinien obliczyc podsumowanie miesieczne z poprawnymi sumami kolumn', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult({
        salesRevenue: 25000,
        otherRevenue: 1000,
        totalRevenue: 26000,
        purchaseCost: 8000,
        sideExpenses: 500,
        salaries: 6000,
        otherExpenses: 2000,
        totalExpenses: 16500,
        researchCosts: 300,
        count: 15,
      }));

      const result = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 3);

      expect(result.year).toBe(2025);
      expect(result.month).toBe(3);
      expect(result.monthName).toBe('Marzec');
      expect(result.salesRevenue).toBe(25000);
      expect(result.otherRevenue).toBe(1000);
      expect(result.totalRevenue).toBe(26000);
      expect(result.purchaseCost).toBe(8000);
      expect(result.sideExpenses).toBe(500);
      expect(result.salaries).toBe(6000);
      expect(result.otherExpenses).toBe(2000);
      expect(result.totalExpenses).toBe(16500);
      expect(result.researchCosts).toBe(300);
      expect(result.entryCount).toBe(15);
    });

    it('powinien obliczyc dochod jako przychod minus koszty', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult({
        totalRevenue: 50000,
        totalExpenses: 30000,
      }));

      const result = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 6);

      expect(result.income).toBe(20000); // 50000 - 30000
    });

    it('powinien zwrocic ujemny dochod gdy koszty przekraczaja przychod (strata)', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult({
        totalRevenue: 10000,
        totalExpenses: 25000,
      }));

      const result = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 1);

      expect(result.income).toBe(-15000);
    });

    it('powinien zwracac zera gdy brak wpisow w danym miesiacu', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult());

      const result = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 8);

      expect(result.salesRevenue).toBe(0);
      expect(result.otherRevenue).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.purchaseCost).toBe(0);
      expect(result.sideExpenses).toBe(0);
      expect(result.salaries).toBe(0);
      expect(result.otherExpenses).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.researchCosts).toBe(0);
      expect(result.income).toBe(0);
      expect(result.entryCount).toBe(0);
    });

    it('powinien zwracac poprawna nazwe miesiaca po polsku', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult());

      const january = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 1);
      expect(january.monthName).toBe('Styczen');

      const december = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 12);
      expect(december.monthName).toBe('Grudzien');

      const july = await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 7);
      expect(july.monthName).toBe('Lipiec');
    });

    it('powinien zapytac Prisma o poprawny tenant, company, rok i miesiac', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult());

      await service.getMonthlySummary(TENANT_ID, COMPANY_ID, 2025, 5);

      expect(mockPrisma.kPiREntry.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          year: 2025,
          month: 5,
        },
        _sum: {
          salesRevenue: true,
          otherRevenue: true,
          totalRevenue: true,
          purchaseCost: true,
          sideExpenses: true,
          salaries: true,
          otherExpenses: true,
          totalExpenses: true,
          researchCosts: true,
        },
        _count: true,
      });
    });
  });

  // ====================================================================
  // getYearlySummary - podsumowanie roczne
  // ====================================================================
  describe('getYearlySummary - podsumowanie roczne z remanentami', () => {
    beforeEach(() => {
      // Default: empty months
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(createAggregateResult());
      mockPrisma.remanent.findFirst.mockResolvedValue(null);
    });

    it('powinien zagregowac podsumowania 12 miesiecy', async () => {
      // January has revenue, March has expenses
      mockPrisma.kPiREntry.aggregate
        .mockResolvedValueOnce(createAggregateResult({ totalRevenue: 20000, totalExpenses: 5000, salesRevenue: 20000, count: 5 })) // Jan
        .mockResolvedValueOnce(createAggregateResult()) // Feb
        .mockResolvedValueOnce(createAggregateResult({ totalRevenue: 10000, totalExpenses: 15000, otherExpenses: 15000, count: 3 })) // Mar
        .mockResolvedValue(createAggregateResult()); // Apr-Dec

      const result = await service.getYearlySummary(TENANT_ID, COMPANY_ID, 2025);

      expect(result.year).toBe(2025);
      expect(result.months).toHaveLength(12);
      expect(result.totalRevenue).toBe(30000);   // 20000 + 10000
      expect(result.totalExpenses).toBe(20000);   // 5000 + 15000
      expect(result.totalEntries).toBe(8);        // 5 + 3
    });

    it('powinien uwzglednic remanent poczatkowy i koncowy w dochodzie rocznym', async () => {
      // All months have some data
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(
        createAggregateResult({ totalRevenue: 10000, totalExpenses: 5000 }),
      );

      // Remanent: opening 15000, closing 10000
      mockPrisma.remanent.findFirst
        .mockResolvedValueOnce({ totalValue: 15000 })   // OPENING
        .mockResolvedValueOnce({ totalValue: 10000 });   // CLOSING

      const result = await service.getYearlySummary(TENANT_ID, COMPANY_ID, 2025);

      // totalRevenue = 10000 * 12 = 120000
      // totalExpenses = 5000 * 12 = 60000
      // annualIncome = 120000 - 60000 + 15000 - 10000 = 65000
      expect(result.openingRemanent).toBe(15000);
      expect(result.closingRemanent).toBe(10000);
      expect(result.annualIncome).toBe(65000);
    });

    it('powinien obliczyc dochod roczny bez remanentow gdy nie istnieja', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(
        createAggregateResult({ totalRevenue: 5000, totalExpenses: 2000 }),
      );
      mockPrisma.remanent.findFirst.mockResolvedValue(null);

      const result = await service.getYearlySummary(TENANT_ID, COMPANY_ID, 2025);

      // annualIncome = (5000*12) - (2000*12) + 0 - 0 = 36000
      expect(result.openingRemanent).toBe(0);
      expect(result.closingRemanent).toBe(0);
      expect(result.annualIncome).toBe(36000);
    });

    it('powinien poprawnie agregowac wszystkie kolumny kosztowe i przychodowe', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue(
        createAggregateResult({
          salesRevenue: 1000,
          otherRevenue: 200,
          totalRevenue: 1200,
          purchaseCost: 300,
          sideExpenses: 100,
          salaries: 400,
          otherExpenses: 150,
          totalExpenses: 950,
          researchCosts: 50,
          count: 2,
        }),
      );

      const result = await service.getYearlySummary(TENANT_ID, COMPANY_ID, 2025);

      expect(result.totalSalesRevenue).toBe(12000);    // 1000 * 12
      expect(result.totalOtherRevenue).toBe(2400);      // 200 * 12
      expect(result.totalRevenue).toBe(14400);           // 1200 * 12
      expect(result.totalPurchaseCost).toBe(3600);       // 300 * 12
      expect(result.totalSideExpenses).toBe(1200);       // 100 * 12
      expect(result.totalSalaries).toBe(4800);           // 400 * 12
      expect(result.totalOtherExpenses).toBe(1800);      // 150 * 12
      expect(result.totalExpenses).toBe(11400);          // 950 * 12
      expect(result.totalResearchCosts).toBe(600);       // 50 * 12
      expect(result.totalEntries).toBe(24);              // 2 * 12
    });
  });

  // ====================================================================
  // getCumulativeSummary - podsumowanie narastajace
  // ====================================================================
  describe('getCumulativeSummary - podsumowanie narastajace od poczatku roku', () => {
    it('powinien obliczyc sumy narastajace do wskazanego miesiaca', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: 75000, totalExpenses: 40000 },
      });

      const result = await service.getCumulativeSummary(TENANT_ID, COMPANY_ID, 2025, 6);

      expect(result.totalRevenue).toBe(75000);
      expect(result.totalExpenses).toBe(40000);
      expect(result.income).toBe(35000);
    });

    it('powinien filtrowac wpisy od miesiaca 1 do wskazanego miesiaca', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      await service.getCumulativeSummary(TENANT_ID, COMPANY_ID, 2025, 9);

      expect(mockPrisma.kPiREntry.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          year: 2025,
          month: { lte: 9 },
        },
        _sum: {
          totalRevenue: true,
          totalExpenses: true,
        },
      });
    });

    it('powinien zwracac zera gdy brak wpisow', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: null, totalExpenses: null },
      });

      const result = await service.getCumulativeSummary(TENANT_ID, COMPANY_ID, 2025, 3);

      expect(result.totalRevenue).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.income).toBe(0);
    });

    it('powinien obliczyc ujemny dochod narastajaco (strata)', async () => {
      mockPrisma.kPiREntry.aggregate.mockResolvedValue({
        _sum: { totalRevenue: 20000, totalExpenses: 55000 },
      });

      const result = await service.getCumulativeSummary(TENANT_ID, COMPANY_ID, 2025, 4);

      expect(result.income).toBe(-35000);
    });
  });

  // ====================================================================
  // Remanent (spis z natury) management
  // ====================================================================
  describe('createRemanent - tworzenie spisu z natury', () => {
    it('powinien utworzyc remanent poczatkowy', async () => {
      const remanentData = {
        date: new Date('2025-01-01'),
        type: 'OPENING',
        totalValue: 25000,
        items: [{ name: 'Towar A', unit: 'szt', quantity: 100, unitPrice: 250, totalValue: 25000 }],
        year: 2025,
        notes: 'Spis z natury na poczatek roku',
      };
      mockPrisma.remanent.create.mockResolvedValue({ id: 'rem-1', ...remanentData });

      const result = await service.createRemanent(TENANT_ID, COMPANY_ID, remanentData);

      expect(mockPrisma.remanent.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          date: remanentData.date,
          type: 'OPENING',
          totalValue: 25000,
          items: remanentData.items,
          year: 2025,
          notes: 'Spis z natury na poczatek roku',
        },
      });
    });
  });

  describe('getRemanents - pobieranie spisow z natury', () => {
    it('powinien pobrac remanenty dla danego roku posortowane wg daty', async () => {
      const remanents = [
        { id: 'rem-1', type: 'OPENING', totalValue: 20000 },
        { id: 'rem-2', type: 'CLOSING', totalValue: 18000 },
      ];
      mockPrisma.remanent.findMany.mockResolvedValue(remanents);

      const result = await service.getRemanents(TENANT_ID, COMPANY_ID, 2025);

      expect(result).toEqual(remanents);
      expect(mockPrisma.remanent.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, company_id: COMPANY_ID, year: 2025 },
        orderBy: { date: 'asc' },
      });
    });
  });

  describe('deleteRemanent - usuwanie spisu z natury', () => {
    it('powinien usunac remanent po ID', async () => {
      mockPrisma.remanent.delete.mockResolvedValue({ id: 'rem-1' });

      await service.deleteRemanent('rem-1');

      expect(mockPrisma.remanent.delete).toHaveBeenCalledWith({ where: { id: 'rem-1' } });
    });
  });
});
