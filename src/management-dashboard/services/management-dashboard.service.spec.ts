import { Test, TestingModule } from '@nestjs/testing';
import { ManagementDashboardService } from './management-dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicingService } from '../../invoicing/invoicing.service';
import { BuyersService } from '../../invoicing/buyers.service';
import { TaxRulesService } from '../../tax-rules/tax-rules.service';
import { DeadlineReminderService } from '../../declarations/services/deadline-reminder.service';
import { DeclarationStatusService } from '../../declarations/services/declaration-status.service';
import { KsefService } from '../../ksef/ksef.service';

describe('ManagementDashboardService', () => {
  let service: ManagementDashboardService;
  let prismaService: PrismaService;
  let invoicingService: InvoicingService;
  let buyersService: BuyersService;
  let taxRulesService: TaxRulesService;
  let deadlineReminderService: DeadlineReminderService;
  let declarationStatusService: DeclarationStatusService;
  let ksefService: KsefService;

  const mockPrismaService = {
    invoice: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    buyer: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    declaration: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    taskQueue: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
    },
    invoiceItem: {
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockInvoicingService = {};
  const mockBuyersService = {};
  const mockTaxRulesService = {};
  const mockDeadlineReminderService = {
    getUpcomingDeadlines: jest.fn(),
  };
  const mockDeclarationStatusService = {};
  const mockKsefService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagementDashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: InvoicingService,
          useValue: mockInvoicingService,
        },
        {
          provide: BuyersService,
          useValue: mockBuyersService,
        },
        {
          provide: TaxRulesService,
          useValue: mockTaxRulesService,
        },
        {
          provide: DeadlineReminderService,
          useValue: mockDeadlineReminderService,
        },
        {
          provide: DeclarationStatusService,
          useValue: mockDeclarationStatusService,
        },
        {
          provide: KsefService,
          useValue: mockKsefService,
        },
      ],
    }).compile();

    service = module.get<ManagementDashboardService>(ManagementDashboardService);
    prismaService = module.get<PrismaService>(PrismaService);
    invoicingService = module.get<InvoicingService>(InvoicingService);
    buyersService = module.get<BuyersService>(BuyersService);
    taxRulesService = module.get<TaxRulesService>(TaxRulesService);
    deadlineReminderService = module.get<DeadlineReminderService>(DeadlineReminderService);
    declarationStatusService = module.get<DeclarationStatusService>(DeclarationStatusService);
    ksefService = module.get<KsefService>(KsefService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardSummary', () => {
    it('should return dashboard summary with all statistics', async () => {
      const tenantId = 'test-tenant';
      const filters = {};

      // Mock all the service methods
      mockPrismaService.invoice.findMany
        .mockResolvedValueOnce([
          { totalNet: 100, totalVat: 23, totalGross: 123 },
          { totalNet: 200, totalVat: 46, totalGross: 246 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrismaService.buyer.count.mockResolvedValue(5);
      mockPrismaService.declaration.count.mockResolvedValue(2);
      mockPrismaService.invoice.count.mockResolvedValue(1);
      mockPrismaService.taskQueue.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      const result = await service.getDashboardSummary(tenantId, filters);

      expect(result).toHaveProperty('totalInvoices', 2);
      expect(result).toHaveProperty('totalRevenue', 369);
      expect(result).toHaveProperty('totalVat', 69);
      expect(result).toHaveProperty('activeCustomers', 5);
      expect(result).toHaveProperty('pendingDeclarations', 2);
      expect(result).toHaveProperty('overduePayments', 1);
      expect(result).toHaveProperty('ksefStatus');
      expect(result).toHaveProperty('recentActivities');
      expect(result).toHaveProperty('upcomingDeadlines');
    });

    it('should handle filters correctly', async () => {
      const tenantId = 'test-tenant';
      const filters = {
        companyId: 'company-1',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      };

      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.buyer.count.mockResolvedValue(0);
      mockPrismaService.declaration.count.mockResolvedValue(0);
      mockPrismaService.invoice.count.mockResolvedValue(0);
      mockPrismaService.taskQueue.count.mockResolvedValue(0);

      await service.getDashboardSummary(tenantId, filters);

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: tenantId,
            company_id: filters.companyId,
            date: {
              gte: new Date(filters.dateFrom),
              lte: new Date(filters.dateTo),
            },
          }),
        }),
      );
    });
  });

  describe('getRealTimeStatus', () => {
    it('should return operational status when system is healthy', async () => {
      const tenantId = 'test-tenant';

      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.taskQueue.count.mockResolvedValue(5);
      mockPrismaService.taskQueue.findMany.mockResolvedValue([]);

      const result = await service.getRealTimeStatus(tenantId);

      expect(result.systemStatus).toBe('operational');
      expect(result).toHaveProperty('activeProcesses');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('lastUpdated');
    });

    it('should return degraded status when database fails', async () => {
      const tenantId = 'test-tenant';

      mockPrismaService.$queryRaw.mockRejectedValue(new Error('DB connection failed'));
      mockPrismaService.taskQueue.findMany.mockResolvedValue([]);

      const result = await service.getRealTimeStatus(tenantId);

      expect(result.systemStatus).toBe('degraded');
    });

    it('should return alerts for failed KSeF submissions', async () => {
      const tenantId = 'test-tenant';

      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.taskQueue.count
        .mockResolvedValueOnce(0) // failed KSeF
        .mockResolvedValueOnce(3); // failed count
      mockPrismaService.taskQueue.findMany.mockResolvedValue([]);

      const result = await service.getRealTimeStatus(tenantId);

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].level).toBe('error');
      expect(result.alerts[0].message).toContain('3 KSeF submission(s) failed');
    });
  });

  describe('getRecentActivities', () => {
    it('should return combined activities from invoices, declarations, and KSeF submissions', async () => {
      const tenantId = 'test-tenant';
      const filters = { limit: 10 };

      const mockInvoices = [
        {
          id: 'inv-1',
          number: 'INV-001',
          createdAt: new Date(),
          buyer: { name: 'Test Buyer' },
          totalGross: 5000,
        },
      ];

      const mockDeclarations = [
        {
          id: 'decl-1',
          type: 'VAT',
          createdAt: new Date(),
        },
      ];

      const mockKSeFSubmissions = [
        {
          id: 'ksef-1',
          createdAt: new Date(),
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.declaration.findMany.mockResolvedValue(mockDeclarations);
      mockPrismaService.taskQueue.findMany.mockResolvedValue(mockKSeFSubmissions);

      const result = await service.getRecentActivities(tenantId, filters);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('type', 'invoice_created');
      expect(result[1]).toHaveProperty('type', 'declaration_submitted');
      expect(result[2]).toHaveProperty('type', 'ksef_submission');
    });

    it('should filter by priority when specified', async () => {
      const tenantId = 'test-tenant';
      const filters = { priority: 'high' as const };

      const mockInvoices = [
        {
          id: 'inv-1',
          number: 'INV-001',
          createdAt: new Date(),
          buyer: { name: 'Test Buyer' },
          totalGross: 15000, // Should be high priority
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.declaration.findMany.mockResolvedValue([]);
      mockPrismaService.taskQueue.findMany.mockResolvedValue([]);

      const result = await service.getRecentActivities(tenantId, filters);

      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('high');
    });
  });

  describe('getUpcomingDeadlines', () => {
    it('should return combined tax and payment deadlines', async () => {
      const tenantId = 'test-tenant';
      const filters = { limit: 5 };

      const mockCompanies = [
        { id: 'comp-1', name: 'Test Company' },
      ];

      const mockTaxDeadlines = [
        {
          type: 'VAT',
          period: '2024-Q1',
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          daysUntilDeadline: 7,
          description: 'VAT Declaration Q1 2024',
        },
      ];

      const mockPaymentDeadlines = [
        {
          id: 'inv-1',
          number: 'INV-001',
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
          buyer: { name: 'Test Buyer' },
        },
      ];

      mockPrismaService.company.findMany.mockResolvedValue(mockCompanies);
      mockDeadlineReminderService.getUpcomingDeadlines.mockResolvedValue(mockTaxDeadlines);
      mockPrismaService.invoice.findMany.mockResolvedValue(mockPaymentDeadlines);

      const result = await service.getUpcomingDeadlines(tenantId, filters);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('type', 'tax_deadline');
      expect(result[1]).toHaveProperty('type', 'payment_deadline');
    });

    it('should sort deadlines by days remaining', async () => {
      const tenantId = 'test-tenant';
      const filters = {};

      mockPrismaService.company.findMany.mockResolvedValue([]);
      mockPrismaService.invoice.findMany.mockResolvedValue([]);

      const result = await service.getUpcomingDeadlines(tenantId, filters);

      // Should be sorted by daysRemaining ascending
      for (let i = 1; i < result.length; i++) {
        expect(result[i].daysRemaining).toBeGreaterThanOrEqual(result[i - 1].daysRemaining);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const tenantId = 'test-tenant';
      const filters = {};

      mockPrismaService.invoice.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.getDashboardSummary(tenantId, filters)).rejects.toThrow();
    });

    it('should handle null tenant_id', async () => {
      const tenantId = null;
      const filters = {};

      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.buyer.count.mockResolvedValue(0);
      mockPrismaService.declaration.count.mockResolvedValue(0);
      mockPrismaService.invoice.count.mockResolvedValue(0);
      mockPrismaService.taskQueue.count.mockResolvedValue(0);

      await expect(service.getDashboardSummary(tenantId as any, filters)).rejects.toThrow();
    });

    it('should handle undefined tenant_id', async () => {
      const tenantId = undefined;
      const filters = {};

      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.buyer.count.mockResolvedValue(0);
      mockPrismaService.declaration.count.mockResolvedValue(0);
      mockPrismaService.invoice.count.mockResolvedValue(0);
      mockPrismaService.taskQueue.count.mockResolvedValue(0);

      await expect(service.getDashboardSummary(tenantId as any, filters)).rejects.toThrow();
    });
  });
});