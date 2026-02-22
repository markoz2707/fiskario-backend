import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { KPiRNumberingService } from './kpir-numbering.service';

describe('KPiRNumberingService', () => {
  let service: KPiRNumberingService;

  const TENANT_ID = 'tenant-1';
  const COMPANY_ID = 'company-1';

  const mockPrisma = {
    kPiREntry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KPiRNumberingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<KPiRNumberingService>(KPiRNumberingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ====================================================================
  // getNextNumber - pobieranie kolejnego numeru LP
  // ====================================================================
  describe('getNextNumber - kolejny numer porzadkowy w roku', () => {
    it('powinien zwrocic 1 gdy brak wpisow w danym roku (pierwszy wpis)', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue(null);

      const result = await service.getNextNumber(TENANT_ID, COMPANY_ID, 2025);

      expect(result).toBe(1);
    });

    it('powinien zwrocic nastepny numer po ostatnim wpisie', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue({ lp: 42 });

      const result = await service.getNextNumber(TENANT_ID, COMPANY_ID, 2025);

      expect(result).toBe(43);
    });

    it('powinien szukac ostatniego wpisu w poprawnym roku i firmie', async () => {
      mockPrisma.kPiREntry.findFirst.mockResolvedValue({ lp: 10 });

      await service.getNextNumber(TENANT_ID, COMPANY_ID, 2025);

      expect(mockPrisma.kPiREntry.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          year: 2025,
        },
        orderBy: { lp: 'desc' },
        select: { lp: true },
      });
    });

    it('powinien resetowac numeracje na poczatku nowego roku', async () => {
      // 2024 has 150 entries
      mockPrisma.kPiREntry.findFirst.mockResolvedValueOnce({ lp: 150 });
      const result2024 = await service.getNextNumber(TENANT_ID, COMPANY_ID, 2024);
      expect(result2024).toBe(151);

      // 2025 is a new year - no entries yet
      mockPrisma.kPiREntry.findFirst.mockResolvedValueOnce(null);
      const result2025 = await service.getNextNumber(TENANT_ID, COMPANY_ID, 2025);
      expect(result2025).toBe(1);
    });

    it('powinien zapewnic ciagla numeracje w obrebie roku (niezaleznie od miesiaca)', async () => {
      // The numbering is per year, not per month
      mockPrisma.kPiREntry.findFirst.mockResolvedValue({ lp: 25 });

      const result = await service.getNextNumber(TENANT_ID, COMPANY_ID, 2025);

      // Should be 26, regardless of what month we are in
      expect(result).toBe(26);
    });
  });

  // ====================================================================
  // renumberEntries - przenumerowanie wpisow
  // ====================================================================
  describe('renumberEntries - przenumerowanie wpisow po usuniecin', () => {
    it('powinien przenumerowac wpisy z lukami do ciaglej sekwencji', async () => {
      // Entries with gaps: lp 1, 3, 5 (missing 2 and 4)
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { id: 'e1', lp: 1 },
        { id: 'e3', lp: 3 },
        { id: 'e5', lp: 5 },
      ]);
      mockPrisma.kPiREntry.update.mockResolvedValue({});

      const updatedCount = await service.renumberEntries(TENANT_ID, COMPANY_ID, 2025);

      // e1 stays at 1, e3 -> 2, e5 -> 3
      expect(updatedCount).toBe(2);
      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: 'e3' },
        data: { lp: 2 },
      });
      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: 'e5' },
        data: { lp: 3 },
      });
    });

    it('powinien nie modyfikowac wpisow gdy numeracja jest poprawna', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { id: 'e1', lp: 1 },
        { id: 'e2', lp: 2 },
        { id: 'e3', lp: 3 },
      ]);

      const updatedCount = await service.renumberEntries(TENANT_ID, COMPANY_ID, 2025);

      expect(updatedCount).toBe(0);
      expect(mockPrisma.kPiREntry.update).not.toHaveBeenCalled();
    });

    it('powinien zwrocic 0 gdy brak wpisow do przenumerowania', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);

      const updatedCount = await service.renumberEntries(TENANT_ID, COMPANY_ID, 2025);

      expect(updatedCount).toBe(0);
    });

    it('powinien sortowac po dacie wpisu i dacie utworzenia', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);

      await service.renumberEntries(TENANT_ID, COMPANY_ID, 2025);

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          year: 2025,
        },
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, lp: true },
      });
    });

    it('powinien przenumerowac wszystkie wpisy gdy numeracja zaczyna sie od zlego numeru', async () => {
      // All entries shifted: lp 5, 6, 7 instead of 1, 2, 3
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { id: 'e1', lp: 5 },
        { id: 'e2', lp: 6 },
        { id: 'e3', lp: 7 },
      ]);
      mockPrisma.kPiREntry.update.mockResolvedValue({});

      const updatedCount = await service.renumberEntries(TENANT_ID, COMPANY_ID, 2025);

      expect(updatedCount).toBe(3);
      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { lp: 1 },
      });
      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: 'e2' },
        data: { lp: 2 },
      });
      expect(mockPrisma.kPiREntry.update).toHaveBeenCalledWith({
        where: { id: 'e3' },
        data: { lp: 3 },
      });
    });
  });

  // ====================================================================
  // validateNumbering - walidacja ciaglej numeracji
  // ====================================================================
  describe('validateNumbering - walidacja ciaglej numeracji', () => {
    it('powinien zwrocic isValid=true dla prawidlowej ciaglej numeracji', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { lp: 1 },
        { lp: 2 },
        { lp: 3 },
        { lp: 4 },
        { lp: 5 },
      ]);

      const result = await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(result.isValid).toBe(true);
      expect(result.gaps).toEqual([]);
      expect(result.duplicates).toEqual([]);
    });

    it('powinien wykryc luki w numeracji', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { lp: 1 },
        { lp: 3 },  // gap at position 2
        { lp: 5 },  // gap at position 3
      ]);

      const result = await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(result.isValid).toBe(false);
      expect(result.gaps).toContain(2);
      expect(result.gaps).toContain(3);
    });

    it('powinien wykryc zduplikowane numery', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { lp: 1 },
        { lp: 1 },  // duplicate
        { lp: 3 },
      ]);

      const result = await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(result.isValid).toBe(false);
      expect(result.duplicates).toContain(1);
    });

    it('powinien zwrocic isValid=true dla pustej listy wpisow', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);

      const result = await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(result.isValid).toBe(true);
      expect(result.gaps).toEqual([]);
      expect(result.duplicates).toEqual([]);
    });

    it('powinien zwrocic isValid=true dla pojedynczego wpisu z LP=1', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([{ lp: 1 }]);

      const result = await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(result.isValid).toBe(true);
    });

    it('powinien wykryc jednoczesnie luki i duplikaty', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        { lp: 1 },
        { lp: 2 },
        { lp: 2 },   // duplicate at position 3 (expected 3, got 2)
        { lp: 5 },   // gap at position 4 (expected 4, got 5)
      ]);

      const result = await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(result.isValid).toBe(false);
      expect(result.duplicates.length).toBeGreaterThan(0);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('powinien sortowac wpisy po LP rosnaco przed walidacja', async () => {
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);

      await service.validateNumbering(TENANT_ID, COMPANY_ID, 2025);

      expect(mockPrisma.kPiREntry.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          year: 2025,
        },
        orderBy: { lp: 'asc' },
        select: { lp: true },
      });
    });
  });
});
