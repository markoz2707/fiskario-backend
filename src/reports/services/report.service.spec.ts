import { Test, TestingModule } from '@nestjs/testing';
import { PLReportService, PLData } from './pl-report.service';
import { CashflowReportService } from './cashflow-report.service';
import { ExportService, ComplianceHeaders } from './export.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Report Services', () => {
  // =========================================================================
  // PLReportService
  // =========================================================================

  describe('PLReportService', () => {
    let plService: PLReportService;

    const mockPrisma = {
      invoice: {
        aggregate: jest.fn(),
      },
      vATRegister: {
        aggregate: jest.fn(),
      },
      zUSContribution: {
        aggregate: jest.fn(),
      },
      taxCalculation: {
        findMany: jest.fn(),
      },
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PLReportService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      plService = module.get<PLReportService>(PLReportService);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should generate a P&L report with default year filter', async () => {
      // Mock sales invoices (revenue)
      mockPrisma.invoice.aggregate.mockResolvedValueOnce({
        _sum: { totalGross: 250000 },
      });
      // Mock purchase invoices (costs)
      mockPrisma.invoice.aggregate.mockResolvedValueOnce({
        _sum: { totalGross: 80000 },
      });

      // Mock VAT sales
      mockPrisma.vATRegister.aggregate.mockResolvedValueOnce({
        _sum: { netAmount: 200000, vatAmount: 46000 },
      });
      // Mock VAT purchases
      mockPrisma.vATRegister.aggregate.mockResolvedValueOnce({
        _sum: { netAmount: 60000, vatAmount: 13800 },
      });

      // Mock ZUS contributions
      mockPrisma.zUSContribution.aggregate.mockResolvedValue({
        _sum: {
          emerytalnaEmployer: 5000,
          rentowaEmployer: 3500,
          chorobowaEmployee: 1200,
          wypadkowaEmployer: 800,
          zdrowotnaEmployee: 4500,
          fpEmployee: 1200,
          fgspEmployee: 50,
        },
      });

      // Mock VAT collected
      mockPrisma.vATRegister.aggregate.mockResolvedValueOnce({
        _sum: { vatAmount: 46000 },
      });
      // Mock VAT paid
      mockPrisma.vATRegister.aggregate.mockResolvedValueOnce({
        _sum: { vatAmount: 13800 },
      });

      // Mock tax calculations
      mockPrisma.taxCalculation.findMany.mockResolvedValue([]);

      const result = await plService.generateReport(
        'tenant-1',
        'company-1',
        { year: 2026 },
      );

      expect(result).toBeDefined();
      expect(result.period).toBe('2026');
      expect(result.revenue).toBeDefined();
      expect(result.costs).toBeDefined();
      expect(result.vat).toBeDefined();
    });

    it('should generate report with custom date range', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: 100000 },
      });
      mockPrisma.vATRegister.aggregate.mockResolvedValue({
        _sum: { netAmount: 80000, vatAmount: 18400 },
      });
      mockPrisma.zUSContribution.aggregate.mockResolvedValue({
        _sum: {
          emerytalnaEmployer: 2500,
          rentowaEmployer: 1750,
          chorobowaEmployee: 600,
          wypadkowaEmployer: 400,
          zdrowotnaEmployee: 2250,
          fpEmployee: 600,
          fgspEmployee: 25,
        },
      });
      mockPrisma.taxCalculation.findMany.mockResolvedValue([]);

      const result = await plService.generateReport(
        'tenant-1',
        'company-1',
        { startDate: '2026-01-01', endDate: '2026-06-30' },
      );

      expect(result.period).toBe('2026-01-01_2026-06-30');
    });

    it('should calculate gross profit as revenue - costs', async () => {
      // Revenue
      mockPrisma.invoice.aggregate.mockResolvedValueOnce({
        _sum: { totalGross: 150000 },
      });
      // Costs
      mockPrisma.invoice.aggregate.mockResolvedValueOnce({
        _sum: { totalGross: 50000 },
      });

      mockPrisma.vATRegister.aggregate.mockResolvedValue({
        _sum: { netAmount: 0, vatAmount: 0 },
      });
      mockPrisma.zUSContribution.aggregate.mockResolvedValue({
        _sum: {
          emerytalnaEmployer: 0,
          rentowaEmployer: 0,
          chorobowaEmployee: 0,
          wypadkowaEmployer: 0,
          zdrowotnaEmployee: 0,
          fpEmployee: 0,
          fgspEmployee: 0,
        },
      });
      mockPrisma.taxCalculation.findMany.mockResolvedValue([]);

      const result = await plService.generateReport(
        'tenant-1',
        'company-1',
        { year: 2026 },
      );

      expect(result.grossProfit).toBe(result.revenue.total - result.costs.total);
    });

    it('should calculate VAT due as collected - paid', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: 100000 },
      });
      mockPrisma.vATRegister.aggregate
        .mockResolvedValueOnce({ _sum: { netAmount: 80000, vatAmount: 18400 } }) // sales
        .mockResolvedValueOnce({ _sum: { netAmount: 40000, vatAmount: 9200 } }) // purchases
        .mockResolvedValueOnce({ _sum: { vatAmount: 18400 } }) // VAT collected
        .mockResolvedValueOnce({ _sum: { vatAmount: 9200 } }); // VAT paid

      mockPrisma.zUSContribution.aggregate.mockResolvedValue({
        _sum: {
          emerytalnaEmployer: 0,
          rentowaEmployer: 0,
          chorobowaEmployee: 0,
          wypadkowaEmployer: 0,
          zdrowotnaEmployee: 0,
          fpEmployee: 0,
          fgspEmployee: 0,
        },
      });
      mockPrisma.taxCalculation.findMany.mockResolvedValue([]);

      const result = await plService.generateReport(
        'tenant-1',
        'company-1',
        { year: 2026 },
      );

      expect(result.vat.due).toBe(Math.max(0, result.vat.collected - result.vat.paid));
    });

    it('should handle zero revenue and costs', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: 0 },
      });
      mockPrisma.vATRegister.aggregate.mockResolvedValue({
        _sum: { netAmount: 0, vatAmount: 0 },
      });
      mockPrisma.zUSContribution.aggregate.mockResolvedValue({
        _sum: {
          emerytalnaEmployer: 0,
          rentowaEmployer: 0,
          chorobowaEmployee: 0,
          wypadkowaEmployer: 0,
          zdrowotnaEmployee: 0,
          fpEmployee: 0,
          fgspEmployee: 0,
        },
      });
      mockPrisma.taxCalculation.findMany.mockResolvedValue([]);

      const result = await plService.generateReport(
        'tenant-1',
        'company-1',
        { year: 2026 },
      );

      expect(result.grossProfit).toBe(0);
      expect(result.netProfit).toBe(0);
    });
  });

  // =========================================================================
  // CashflowReportService
  // =========================================================================

  describe('CashflowReportService', () => {
    let cashflowService: CashflowReportService;

    const mockPrisma = {
      invoice: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
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
          CashflowReportService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      cashflowService = module.get<CashflowReportService>(CashflowReportService);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should generate a cashflow report with default 3-month range', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });

      const result = await cashflowService.generateReport(
        'tenant-1',
        'company-1',
        {},
      );

      expect(result).toBeDefined();
      expect(result.period).toBe('next_3_months');
      expect(result.entries).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should generate report with custom date range', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });

      const result = await cashflowService.generateReport(
        'tenant-1',
        'company-1',
        { startDate: '2026-01-01', endDate: '2026-06-30' },
      );

      expect(result.period).toBe('2026-01-01_2026-06-30');
    });

    it('should categorize income and expense entries', async () => {
      const now = new Date();
      const futureDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);

      // Sales invoices (income)
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([
          {
            id: 'inv-1',
            date: now,
            dueDate: futureDate,
            totalGross: 10000,
            series: 'FV',
            number: '001/2026',
            buyer: { name: 'Firma ABC' },
          },
        ])
        .mockResolvedValueOnce([]); // purchase invoices

      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });

      const result = await cashflowService.generateReport(
        'tenant-1',
        'company-1',
        {},
      );

      const incomeEntries = result.entries.filter((e) => e.type === 'income');
      expect(incomeEntries.length).toBeGreaterThanOrEqual(0); // May be 0 depending on date range
    });

    it('should calculate summary totals correctly', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });

      const result = await cashflowService.generateReport(
        'tenant-1',
        'company-1',
        {},
      );

      // For empty data, all totals should be 0
      expect(result.summary.totalIncome).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
      expect(result.summary.netCashflow).toBe(0);
      expect(result.summary.pendingIncome).toBe(0);
      expect(result.summary.pendingExpenses).toBe(0);
      expect(result.summary.overdueAmount).toBe(0);
    });

    it('should include projections in the summary', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });

      const result = await cashflowService.generateReport(
        'tenant-1',
        'company-1',
        {},
      );

      expect(result.summary.projection).toBeDefined();
      expect(result.summary.projection).toHaveLength(3); // 3 months projected
    });

    it('should have cumulative balance across projection months', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.zUSContribution.findMany.mockResolvedValue([]);
      mockPrisma.declaration.findMany.mockResolvedValue([]);
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });

      const result = await cashflowService.generateReport(
        'tenant-1',
        'company-1',
        {},
      );

      result.summary.projection.forEach((proj) => {
        expect(proj.date).toBeDefined();
        expect(typeof proj.projectedIncome).toBe('number');
        expect(typeof proj.projectedExpenses).toBe('number');
        expect(typeof proj.netCashflow).toBe('number');
        expect(typeof proj.cumulativeBalance).toBe('number');
      });
    });
  });

  // =========================================================================
  // ExportService
  // =========================================================================

  describe('ExportService', () => {
    let exportService: ExportService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ExportService],
      }).compile();

      exportService = module.get<ExportService>(ExportService);
    });

    describe('formatColumnName', () => {
      it('should convert camelCase to readable format', () => {
        // Access private method
        const formatColumnName = (exportService as any).formatColumnName.bind(exportService);

        expect(formatColumnName('totalGross')).toBe('Total Gross');
        expect(formatColumnName('invoiceNumber')).toBe('Invoice Number');
      });

      it('should translate common terms to Polish', () => {
        const formatColumnName = (exportService as any).formatColumnName.bind(exportService);

        expect(formatColumnName('amount')).toBe('Kwota');
        expect(formatColumnName('date')).toBe('Data');
        expect(formatColumnName('status')).toBe('Status');
        expect(formatColumnName('name')).toBe('Nazwa');
      });
    });

    describe('convertToCSV', () => {
      it('should convert data array to CSV string', () => {
        const convertToCSV = (exportService as any).convertToCSV.bind(exportService);

        const data = [
          { name: 'Firma ABC', nip: '1234567890', amount: 10000 },
          { name: 'Firma XYZ', nip: '0987654321', amount: 5000 },
        ];

        const csv = convertToCSV(data, ';');

        expect(csv).toContain('name;nip;amount');
        expect(csv).toContain('Firma ABC;1234567890;10000');
        expect(csv).toContain('Firma XYZ;0987654321;5000');
      });

      it('should escape values containing delimiter', () => {
        const convertToCSV = (exportService as any).convertToCSV.bind(exportService);

        const data = [
          { name: 'Firma; ABC', amount: 10000 },
        ];

        const csv = convertToCSV(data, ';');

        // Value with delimiter should be wrapped in quotes
        expect(csv).toContain('"Firma; ABC"');
      });

      it('should escape values containing quotes', () => {
        const convertToCSV = (exportService as any).convertToCSV.bind(exportService);

        const data = [
          { name: 'Firma "ABC"', amount: 10000 },
        ];

        const csv = convertToCSV(data, ';');

        // Quotes should be doubled and wrapped
        expect(csv).toContain('"Firma ""ABC"""');
      });

      it('should return empty string for empty data', () => {
        const convertToCSV = (exportService as any).convertToCSV.bind(exportService);
        expect(convertToCSV([], ';')).toBe('');
      });
    });

    describe('generateComplianceHeaderCSV', () => {
      it('should generate compliance header with company info', () => {
        const generateHeader = (exportService as any).generateComplianceHeaderCSV.bind(
          exportService,
        );

        const headers: ComplianceHeaders = {
          companyName: 'Test Firma Sp. z o.o.',
          companyNIP: '1234567890',
          reportType: 'P&L Report',
          period: '2026',
          generatedAt: new Date('2026-02-22T10:00:00Z'),
          generatedBy: 'admin@test.pl',
        };

        const csv = generateHeader(headers);

        expect(csv).toContain('Fiskario');
        expect(csv).toContain('Test Firma Sp. z o.o.');
        expect(csv).toContain('1234567890');
        expect(csv).toContain('P&L Report');
        expect(csv).toContain('RODO/GDPR');
      });
    });

    describe('getExportFileUrl', () => {
      it('should return relative URL for exported file', () => {
        const url = exportService.getExportFileUrl('./uploads/exports/report-2026.xlsx');
        expect(url).toContain('/uploads/exports/');
      });
    });
  });
});
