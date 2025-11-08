import { Test, TestingModule } from '@nestjs/testing';
import { ManagementDashboardController } from './management-dashboard.controller';
import { ManagementDashboardService } from '../services/management-dashboard.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

describe('ManagementDashboardController', () => {
  let controller: ManagementDashboardController;
  let service: ManagementDashboardService;

  const mockManagementDashboardService = {
    getDashboardSummary: jest.fn(),
    getRealTimeStatus: jest.fn(),
    getRecentActivities: jest.fn(),
    getUpcomingDeadlines: jest.fn(),
    getDetailedMetrics: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ManagementDashboardController],
      providers: [
        {
          provide: ManagementDashboardService,
          useValue: mockManagementDashboardService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<ManagementDashboardController>(ManagementDashboardController);
    service = module.get<ManagementDashboardService>(ManagementDashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardSummary', () => {
    it('should return dashboard summary successfully', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = { companyId: 'comp-1' };
      const mockResponse = {
        totalInvoices: 10,
        totalRevenue: 10000,
        totalVat: 2300,
        activeCustomers: 5,
        pendingDeclarations: 2,
        overduePayments: 1,
        ksefStatus: { submitted: 8, pending: 1, failed: 1 },
        recentActivities: [],
        upcomingDeadlines: [],
      };

      mockManagementDashboardService.getDashboardSummary.mockResolvedValue(mockResponse);

      const result = await controller.getDashboardSummary(mockRequest as any, mockFilters);

      expect(result).toEqual(mockResponse);
      expect(mockManagementDashboardService.getDashboardSummary).toHaveBeenCalledWith('test-tenant', mockFilters);
    });

    it('should use default tenant when user tenant_id is not provided', async () => {
      const mockRequest = { user: {} };
      const mockFilters = {};

      mockManagementDashboardService.getDashboardSummary.mockResolvedValue({} as any);

      await controller.getDashboardSummary(mockRequest as any, mockFilters);

      expect(mockManagementDashboardService.getDashboardSummary).toHaveBeenCalledWith('default-tenant', mockFilters);
    });

    it('should handle service errors and throw HttpException', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = {};
      const mockError = new Error('Service error');

      mockManagementDashboardService.getDashboardSummary.mockRejectedValue(mockError);

      await expect(controller.getDashboardSummary(mockRequest as any, mockFilters)).rejects.toThrow();
    });
  });

  describe('getRealTimeStatus', () => {
    it('should return real-time status successfully', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockResponse = {
        systemStatus: 'operational',
        activeProcesses: [],
        alerts: [],
        lastUpdated: new Date().toISOString(),
      };

      mockManagementDashboardService.getRealTimeStatus.mockResolvedValue(mockResponse);

      const result = await controller.getRealTimeStatus(mockRequest as any);

      expect(result).toEqual(mockResponse);
      expect(mockManagementDashboardService.getRealTimeStatus).toHaveBeenCalledWith('test-tenant');
    });

    it('should use default tenant when user tenant_id is not provided', async () => {
      const mockRequest = { user: {} };

      mockManagementDashboardService.getRealTimeStatus.mockResolvedValue({} as any);

      await controller.getRealTimeStatus(mockRequest as any);

      expect(mockManagementDashboardService.getRealTimeStatus).toHaveBeenCalledWith('default-tenant');
    });

    it('should handle service errors and throw HttpException', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockError = new Error('Service error');

      mockManagementDashboardService.getRealTimeStatus.mockRejectedValue(mockError);

      await expect(controller.getRealTimeStatus(mockRequest as any)).rejects.toThrow();
    });
  });

  describe('getRecentActivities', () => {
    it('should return recent activities successfully', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = { limit: 20 };
      const mockResponse = [
        {
          id: 'activity-1',
          type: 'invoice_created',
          description: 'Invoice created',
          timestamp: new Date(),
          priority: 'medium' as const,
        },
      ];

      mockManagementDashboardService.getRecentActivities.mockResolvedValue(mockResponse);

      const result = await controller.getRecentActivities(mockRequest as any, mockFilters);

      expect(result).toEqual(mockResponse);
      expect(mockManagementDashboardService.getRecentActivities).toHaveBeenCalledWith('test-tenant', mockFilters);
    });

    it('should handle service errors and throw HttpException', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = {};
      const mockError = new Error('Service error');

      mockManagementDashboardService.getRecentActivities.mockRejectedValue(mockError);

      await expect(controller.getRecentActivities(mockRequest as any, mockFilters)).rejects.toThrow();
    });
  });

  describe('getUpcomingDeadlines', () => {
    it('should return upcoming deadlines successfully', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = { priority: 'high' as const };
      const mockResponse = [
        {
          id: 'deadline-1',
          type: 'tax_deadline',
          description: 'VAT Declaration',
          dueDate: new Date(),
          daysRemaining: 7,
          priority: 'medium' as const,
        },
      ];

      mockManagementDashboardService.getUpcomingDeadlines.mockResolvedValue(mockResponse);

      const result = await controller.getUpcomingDeadlines(mockRequest as any, mockFilters);

      expect(result).toEqual(mockResponse);
      expect(mockManagementDashboardService.getUpcomingDeadlines).toHaveBeenCalledWith('test-tenant', mockFilters);
    });

    it('should handle service errors and throw HttpException', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = {};
      const mockError = new Error('Service error');

      mockManagementDashboardService.getUpcomingDeadlines.mockRejectedValue(mockError);

      await expect(controller.getUpcomingDeadlines(mockRequest as any, mockFilters)).rejects.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return detailed metrics successfully', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = {};
      const mockResponse = {
        revenueTrends: [],
        vatBreakdown: [],
        customerTrends: [],
        complianceMetrics: {},
      };

      mockManagementDashboardService.getDetailedMetrics.mockResolvedValue(mockResponse);

      const result = await controller.getMetrics(mockRequest as any, mockFilters);

      expect(result).toEqual(mockResponse);
      expect(mockManagementDashboardService.getDetailedMetrics).toHaveBeenCalledWith('test-tenant', mockFilters);
    });

    it('should handle service errors and throw HttpException', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockFilters = {};
      const mockError = new Error('Service error');

      mockManagementDashboardService.getDetailedMetrics.mockRejectedValue(mockError);

      await expect(controller.getMetrics(mockRequest as any, mockFilters)).rejects.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should throw HttpException with proper error structure', async () => {
      const mockRequest = { user: { tenant_id: 'test-tenant' } };
      const mockError = new Error('Database connection failed');

      mockManagementDashboardService.getDashboardSummary.mockRejectedValue(mockError);

      try {
        await controller.getDashboardSummary(mockRequest as any, {});
        fail('Should have thrown HttpException');
      } catch (error: any) {
        expect(error.response).toHaveProperty('success', false);
        expect(error.response).toHaveProperty('errorCode', 'DASHBOARD_SUMMARY_ERROR');
        expect(error.response).toHaveProperty('message', 'Failed to retrieve dashboard summary');
        expect(error.response).toHaveProperty('details', 'Database connection failed');
      }
    });
  });
});