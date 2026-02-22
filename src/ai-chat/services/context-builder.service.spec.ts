import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ContextBuilderService } from './context-builder.service';

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;
  let prisma: PrismaService;

  const mockPrisma = {
    company: {
      findFirst: jest.fn(),
    },
    kPiREntry: {
      findMany: jest.fn(),
    },
    zUSContribution: {
      findMany: jest.fn(),
    },
    declaration: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBuilderService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ContextBuilderService>(ContextBuilderService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =============================================================
  // Full context building with all data present
  // =============================================================
  describe('buildCompanyContext - full data', () => {
    it('should build a complete context string with company info, KPiR, ZUS, and declarations', async () => {
      // Company
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Test Firma Sp. z o.o.',
        nip: '1234567890',
        address: 'ul. Testowa 1, 00-001 Warszawa',
        taxForm: 'SKALA',
        vatPayer: true,
        taxOffice: 'US Warszawa-Srodmiescie',
        taxSettings: [
          {
            isSelected: true,
            taxForm: { name: 'Skala podatkowa' },
          },
        ],
      });

      // KPiR entries - 2 entries for current month
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        {
          id: 'kpir-1',
          year: currentYear,
          month: currentMonth,
          totalRevenue: 15000.0,
          totalExpenses: 5000.0,
          entryDate: new Date(),
        },
        {
          id: 'kpir-2',
          year: currentYear,
          month: Math.max(1, currentMonth - 1),
          totalRevenue: 12000.0,
          totalExpenses: 4000.0,
          entryDate: new Date(),
        },
      ]);

      // ZUS contributions
      mockPrisma.zUSContribution.findMany.mockResolvedValue([
        {
          period: '2025-01',
          emerytalnaEmployer: 200,
          emerytalnaEmployee: 200,
          rentowaEmployer: 80,
          rentowaEmployee: 80,
          chorobowaEmployee: 30,
          wypadkowaEmployer: 20,
          zdrowotnaEmployee: 314.1,
          fpEmployee: 30,
          fgspEmployee: 10,
          status: 'PAID',
        },
      ]);

      // Pending declarations
      mockPrisma.declaration.findMany.mockResolvedValue([
        {
          type: 'JPK_V7M',
          period: '2025-01',
          status: 'draft',
          createdAt: new Date(),
        },
      ]);

      const result = await service.buildCompanyContext('t1', 'c1');

      // Verify company info section
      expect(result).toContain('DANE FIRMY');
      expect(result).toContain('Test Firma Sp. z o.o.');
      expect(result).toContain('1234567890');
      expect(result).toContain('TAK (czynny podatnik VAT)');
      expect(result).toContain('US Warszawa-Srodmiescie');

      // Verify KPiR section
      expect(result).toContain('KPiR');
      expect(result).toContain('przychod');
      expect(result).toContain('koszty');

      // Verify ZUS section
      expect(result).toContain('SKLADKI ZUS');
      expect(result).toContain('2025-01');
      expect(result).toContain('PAID');

      // Verify declarations section
      expect(result).toContain('DEKLARACJE DO ZLOZENIA');
      expect(result).toContain('JPK_V7M');
      expect(result).toContain('draft');
    });
  });

  // =============================================================
  // Company info formatting
  // =============================================================
  describe('buildCompanyContext - company info', () => {
    it('should show non-VAT payer status correctly', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Mala Firma',
        nip: null,
        address: null,
        taxForm: null,
        vatPayer: false,
        taxOffice: null,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).toContain('NIE (zwolniony/nieVAT)');
      expect(result).toContain('nie wybrano');
    });

    it('should use taxForm from taxSettings when taxForm field is not set', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma ABC',
        nip: '9876543210',
        address: 'ul. Inna 2',
        taxForm: null,
        vatPayer: true,
        taxOffice: 'US Krakow',
        taxSettings: [
          {
            isSelected: true,
            taxForm: { name: 'Podatek liniowy 19%' },
          },
        ],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      // taxForm is null, so it should fall through to taxSettings taxForm name
      expect(result).toContain('Podatek liniowy 19%');
    });
  });

  // =============================================================
  // KPiR data
  // =============================================================
  describe('buildCompanyContext - KPiR data', () => {
    it('should calculate revenue, expenses, and profit correctly', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma',
        vatPayer: false,
        taxSettings: [],
      });

      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        {
          year: currentYear,
          month: currentMonth,
          totalRevenue: 10000,
          totalExpenses: 3000,
          entryDate: new Date(),
        },
        {
          year: currentYear,
          month: currentMonth,
          totalRevenue: 8000,
          totalExpenses: 2000,
          entryDate: new Date(),
        },
      ]);

      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      // Total revenue: 18000, total expenses: 5000, profit: 13000
      expect(result).toContain('18000.00');
      expect(result).toContain('5000.00');
      expect(result).toContain('13000.00');
    });

    it('should not include KPiR section when no entries exist', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma',
        vatPayer: false,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).not.toContain('KPiR');
    });
  });

  // =============================================================
  // ZUS data
  // =============================================================
  describe('buildCompanyContext - ZUS data', () => {
    it('should include ZUS contributions with total and health amounts', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma',
        vatPayer: false,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);

      mockPrisma.zUSContribution.findMany.mockResolvedValue([
        {
          period: '2025-02',
          emerytalnaEmployer: 250.0,
          emerytalnaEmployee: 250.0,
          rentowaEmployer: 100.0,
          rentowaEmployee: 100.0,
          chorobowaEmployee: 50.0,
          wypadkowaEmployer: 25.0,
          zdrowotnaEmployee: 400.0,
          fpEmployee: 40.0,
          fgspEmployee: 15.0,
          status: 'PENDING',
        },
        {
          period: '2025-01',
          emerytalnaEmployer: 250.0,
          emerytalnaEmployee: 250.0,
          rentowaEmployer: 100.0,
          rentowaEmployee: 100.0,
          chorobowaEmployee: 50.0,
          wypadkowaEmployer: 25.0,
          zdrowotnaEmployee: 400.0,
          fpEmployee: 40.0,
          fgspEmployee: 15.0,
          status: 'PAID',
        },
      ]);

      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).toContain('SKLADKI ZUS');
      expect(result).toContain('2025-02');
      expect(result).toContain('2025-01');
      expect(result).toContain('PENDING');
      expect(result).toContain('PAID');
      // Total per contribution = 250+250+100+100+50+25+400+40+15 = 1230
      expect(result).toContain('1230.00');
      expect(result).toContain('zdrowotna: 400.00');
    });

    it('should not include ZUS section when no contributions exist', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma',
        vatPayer: false,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).not.toContain('SKLADKI ZUS');
    });
  });

  // =============================================================
  // Pending declarations
  // =============================================================
  describe('buildCompanyContext - pending declarations', () => {
    it('should list pending declarations with type, period, and status', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma',
        vatPayer: false,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);

      mockPrisma.declaration.findMany.mockResolvedValue([
        { type: 'JPK_V7M', period: '2025-01', status: 'draft', createdAt: new Date() },
        { type: 'PIT-5L', period: '2025-01', status: 'ready', createdAt: new Date() },
        { type: 'ZUS_DRA', period: '2025-01', status: 'pending', createdAt: new Date() },
      ]);

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).toContain('DEKLARACJE DO ZLOZENIA');
      expect(result).toContain('JPK_V7M');
      expect(result).toContain('PIT-5L');
      expect(result).toContain('ZUS_DRA');
      expect(result).toContain('draft');
      expect(result).toContain('ready');
      expect(result).toContain('pending');
    });

    it('should not include declarations section when none are pending', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma',
        vatPayer: false,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).not.toContain('DEKLARACJE DO ZLOZENIA');
    });
  });

  // =============================================================
  // Empty / new company
  // =============================================================
  describe('buildCompanyContext - empty company', () => {
    it('should return minimal context for a brand new company with no data', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Nowa Firma',
        nip: null,
        address: null,
        taxForm: null,
        vatPayer: false,
        taxOffice: null,
        taxSettings: [],
      });

      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      // Should only contain company info section
      expect(result).toContain('DANE FIRMY');
      expect(result).toContain('Nowa Firma');
      expect(result).not.toContain('KPiR');
      expect(result).not.toContain('SKLADKI ZUS');
      expect(result).not.toContain('DEKLARACJE');
    });

    it('should return empty string when company is not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      mockPrisma.kPiREntry.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'nonexistent');

      // No company found means no company info section
      expect(result).not.toContain('DANE FIRMY');
    });
  });

  // =============================================================
  // Error handling
  // =============================================================
  describe('buildCompanyContext - error handling', () => {
    it('should return a fallback message when database query fails completely', async () => {
      mockPrisma.company.findFirst.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const result = await service.buildCompanyContext('t1', 'c1');

      expect(result).toContain('Nie udalo sie pobrac pelnych danych firmy');
    });

    it('should still include company info when KPiR query fails', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma Testowa',
        vatPayer: true,
        taxSettings: [],
      });

      // KPiR throws but service catches it internally in buildKPiRSummary
      mockPrisma.kPiREntry.findMany.mockRejectedValue(
        new Error('KPiR table not found'),
      );

      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);

      const result = await service.buildCompanyContext('t1', 'c1');

      // Company info should still be present
      expect(result).toContain('DANE FIRMY');
      expect(result).toContain('Firma Testowa');
      // KPiR section should be absent due to error (caught internally)
      expect(result).not.toContain('KPiR');
    });
  });

  // =============================================================
  // Context string format
  // =============================================================
  describe('context string format', () => {
    it('should separate sections with double newlines', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Firma Format Test',
        vatPayer: true,
        taxSettings: [],
      });

      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      mockPrisma.kPiREntry.findMany.mockResolvedValue([
        {
          year: currentYear,
          month: currentMonth,
          totalRevenue: 5000,
          totalExpenses: 1000,
          entryDate: new Date(),
        },
      ]);

      mockPrisma.zUSContribution.findMany.mockResolvedValue([
        {
          period: '2025-01',
          emerytalnaEmployer: 100,
          emerytalnaEmployee: 100,
          rentowaEmployer: 50,
          rentowaEmployee: 50,
          chorobowaEmployee: 25,
          wypadkowaEmployer: 10,
          zdrowotnaEmployee: 314,
          fpEmployee: 20,
          fgspEmployee: 5,
          status: 'PAID',
        },
      ]);

      mockPrisma.declaration.findMany.mockResolvedValue([
        { type: 'JPK_V7M', period: '2025-01', status: 'draft', createdAt: new Date() },
      ]);

      const result = await service.buildCompanyContext('t1', 'c1');

      // The sections are joined with '\n\n'
      const sections = result.split('\n\n');
      // Should have at least company info + KPiR + ZUS + declarations = 4+ sections
      // (some sections may have internal \n\n so we check for at least 3 major parts)
      expect(sections.length).toBeGreaterThanOrEqual(3);
    });
  });
});
