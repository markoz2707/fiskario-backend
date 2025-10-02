import { Test, TestingModule } from '@nestjs/testing';
import { PLReportService } from './pl-report.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PLReportService', () => {
  let service: PLReportService;
  let prismaService: PrismaService;

  const mockPrismaService = {
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
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PLReportService>(PLReportService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReport', () => {
    const mockFilters = {
      year: 2024,
    };

    const mockRevenueData = {
      total: 100000,
      sales: 100000,
      other: 0,
    };

    const mockCostData = {
      total: 60000,
      materials: 40000,
      services: 0,
      salaries: 15000,
      other: 5000,
    };

    const mockVATData = {
      collected: 20000,
      paid: 8000,
      due: 12000,
    };

    beforeEach(() => {
      jest.spyOn(service as any, 'getRevenueData').mockResolvedValue(mockRevenueData);
      jest.spyOn(service as any, 'getCostData').mockResolvedValue(mockCostData);
      jest.spyOn(service as any, 'getVATData').mockResolvedValue(mockVATData);
    });

    it('should generate P&L report successfully', async () => {
      const result = await service.generateReport('tenant-123', 'company-456', mockFilters);

      expect(result).toEqual({
        period: '2024',
        revenue: mockRevenueData,
        costs: mockCostData,
        grossProfit: 40000, // 100000 - 60000
        operatingProfit: 40000,
        netProfit: 28000, // 40000 - 12000
        vat: mockVATData,
      });

      expect((service as any).getRevenueData).toHaveBeenCalledWith(
        'tenant-123',
        'company-456',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      expect((service as any).getCostData).toHaveBeenCalledWith(
        'tenant-123',
        'company-456',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      expect((service as any).getVATData).toHaveBeenCalledWith(
        'tenant-123',
        'company-456',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
    });

    it('should generate report with custom date range', async () => {
      const customFilters = {
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      };

      const result = await service.generateReport('tenant-123', 'company-456', customFilters);

      expect(result.period).toBe('2024-06-01_2024-06-30');
      expect((service as any).getRevenueData).toHaveBeenCalledWith(
        'tenant-123',
        'company-456',
        new Date('2024-06-01'),
        new Date('2024-06-30')
      );
    });

    it('should handle database errors during report generation', async () => {
      jest.spyOn(service as any, 'getRevenueData').mockRejectedValue(new Error('Database error'));

      await expect(service.generateReport('tenant-123', 'company-456', mockFilters))
        .rejects.toThrow('Database error');
    });

    it('should handle zero revenue', async () => {
      const zeroRevenueData = { total: 0, sales: 0, other: 0 };
      jest.spyOn(service as any, 'getRevenueData').mockResolvedValue(zeroRevenueData);

      const result = await service.generateReport('tenant-123', 'company-456', mockFilters);

      expect(result.grossProfit).toBe(-60000); // 0 - 60000
      expect(result.operatingProfit).toBe(-60000);
      expect(result.netProfit).toBe(-72000); // -60000 - 12000
    });

    it('should handle zero costs', async () => {
      const zeroCostData = { total: 0, materials: 0, services: 0, salaries: 0, other: 0 };
      jest.spyOn(service as any, 'getCostData').mockResolvedValue(zeroCostData);

      const result = await service.generateReport('tenant-123', 'company-456', mockFilters);

      expect(result.grossProfit).toBe(100000); // 100000 - 0
      expect(result.operatingProfit).toBe(100000);
      expect(result.netProfit).toBe(88000); // 100000 - 12000
    });

    it('should handle negative VAT due (VAT return)', async () => {
      const vatReturnData = { collected: 8000, paid: 20000, due: 0 }; // More paid than collected
      jest.spyOn(service as any, 'getVATData').mockResolvedValue(vatReturnData);

      const result = await service.generateReport('tenant-123', 'company-456', mockFilters);

      expect(result.netProfit).toBe(52000); // 40000 - 0 (VAT return doesn't reduce profit)
    });

    it('should handle concurrent report generation', async () => {
      const filters = [
        { year: 2024 },
        { year: 2023 },
        { startDate: '2024-01-01', endDate: '2024-03-31' },
      ];

      const results = await Promise.all(
        filters.map(filter => service.generateReport('tenant-123', 'company-456', filter))
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('period');
        expect(result).toHaveProperty('revenue');
        expect(result).toHaveProperty('costs');
        expect(result).toHaveProperty('grossProfit');
        expect(result).toHaveProperty('netProfit');
      });
    });
  });

  describe('getDateRange', () => {
    it('should return year range for year filter', () => {
      const filters = { year: 2024 };
      const result = (service as any).getDateRange(filters);

      expect(result).toEqual({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        period: '2024',
      });
    });

    it('should return custom range for date filters', () => {
      const filters = {
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      };
      const result = (service as any).getDateRange(filters);

      expect(result).toEqual({
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
        period: '2024-06-01_2024-06-30',
      });
    });

    it('should use current year when no filters provided', () => {
      const filters = {};
      const currentYear = new Date().getFullYear();
      const result = (service as any).getDateRange(filters);

      expect(result.startDate).toEqual(new Date(`${currentYear}-01-01`));
      expect(result.endDate).toEqual(new Date(`${currentYear}-12-31`));
      expect(result.period).toBe(currentYear.toString());
    });

    it('should handle year boundary dates correctly', () => {
      const filters = { year: 2024 };
      const result = (service as any).getDateRange(filters);

      expect(result.startDate.getFullYear()).toBe(2024);
      expect(result.startDate.getMonth()).toBe(0);
      expect(result.startDate.getDate()).toBe(1);

      expect(result.endDate.getFullYear()).toBe(2024);
      expect(result.endDate.getMonth()).toBe(11);
      expect(result.endDate.getDate()).toBe(31);
    });

    it('should handle leap year correctly', () => {
      const filters = { year: 2024 }; // 2024 is a leap year
      const result = (service as any).getDateRange(filters);

      expect(result.startDate).toEqual(new Date('2024-01-01'));
      expect(result.endDate).toEqual(new Date('2024-12-31'));
    });

    it('should handle custom date range across months', () => {
      const filters = {
        startDate: '2024-03-15',
        endDate: '2024-05-20',
      };
      const result = (service as any).getDateRange(filters);

      expect(result.startDate).toEqual(new Date('2024-03-15'));
      expect(result.endDate).toEqual(new Date('2024-05-20'));
      expect(result.period).toBe('2024-03-15_2024-05-20');
    });

    it('should handle custom date range across years', () => {
      const filters = {
        startDate: '2023-12-15',
        endDate: '2024-01-20',
      };
      const result = (service as any).getDateRange(filters);

      expect(result.startDate).toEqual(new Date('2023-12-15'));
      expect(result.endDate).toEqual(new Date('2024-01-20'));
      expect(result.period).toBe('2023-12-15_2024-01-20');
    });
  });

  describe('getRevenueData', () => {
    beforeEach(() => {
      mockPrismaService.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: 100000 },
      });
      mockPrismaService.vATRegister.aggregate.mockResolvedValue({
        _sum: { netAmount: 80000, vatAmount: 20000 },
      });
    });

    it('should get revenue data correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await (service as any).getRevenueData('tenant-123', 'company-456', startDate, endDate);

      expect(result).toEqual({
        total: 100000,
        sales: 100000,
        other: 0,
      });

      expect(prismaService.invoice.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          date: {
            gte: startDate,
            lte: endDate,
          },
          status: {
            in: ['issued', 'sent'],
          },
        },
        _sum: {
          totalGross: true,
        },
      });

      expect(prismaService.vATRegister.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          type: 'sprzedaz',
          invoiceDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          netAmount: true,
          vatAmount: true,
        },
      });
    });

    it('should handle zero revenue', async () => {
      mockPrismaService.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: 0 },
      });

      const result = await (service as any).getRevenueData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.total).toBe(0);
      expect(result.sales).toBe(0);
    });

    it('should handle database errors in invoice aggregation', async () => {
      mockPrismaService.invoice.aggregate.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getRevenueData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in VAT register aggregation', async () => {
      mockPrismaService.vATRegister.aggregate.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getRevenueData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle null aggregation results', async () => {
      mockPrismaService.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: null },
      });
      mockPrismaService.vATRegister.aggregate.mockResolvedValue({
        _sum: { netAmount: null, vatAmount: null },
      });

      const result = await (service as any).getRevenueData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.total).toBe(0);
      expect(result.sales).toBe(0);
    });

    it('should handle different invoice statuses', async () => {
      const result = await (service as any).getRevenueData('tenant-123', 'company-456', new Date(), new Date());

      expect(prismaService.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: ['issued', 'sent'],
            },
          }),
        })
      );
    });

    it('should handle concurrent revenue data retrieval', async () => {
      const dateRanges = [
        { start: new Date('2024-01-01'), end: new Date('2024-03-31') },
        { start: new Date('2024-04-01'), end: new Date('2024-06-30') },
        { start: new Date('2024-07-01'), end: new Date('2024-09-30') },
      ];

      const results = await Promise.all(
        dateRanges.map(range =>
          (service as any).getRevenueData('tenant-123', 'company-456', range.start, range.end)
        )
      );

      expect(results).toHaveLength(3);
      expect(prismaService.invoice.aggregate).toHaveBeenCalledTimes(3);
      expect(prismaService.vATRegister.aggregate).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCostData', () => {
    beforeEach(() => {
      mockPrismaService.invoice.aggregate.mockResolvedValue({
        _sum: { totalGross: 60000 },
      });
      mockPrismaService.vATRegister.aggregate.mockResolvedValue({
        _sum: { netAmount: 40000, vatAmount: 8000 },
      });
      mockPrismaService.zUSContribution.aggregate.mockResolvedValue({
        _sum: {
          emerytalnaEmployer: 2000,
          rentowaEmployer: 1500,
          chorobowaEmployee: 1000,
          wypadkowaEmployer: 800,
          zdrowotnaEmployee: 1200,
          fpEmployee: 500,
          fgspEmployee: 300,
        },
      });
    });

    it('should get cost data correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await (service as any).getCostData('tenant-123', 'company-456', startDate, endDate);

      expect(result).toEqual({
        total: 60000,
        materials: 40000,
        services: 0,
        salaries: 7300, // Sum of ZUS contributions
        other: 12700, // 60000 - 40000 - 7300
      });

      expect(prismaService.invoice.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          date: {
            gte: startDate,
            lte: endDate,
          },
          status: {
            in: ['issued', 'sent'],
          },
          buyerNip: {
            not: null,
          },
        },
        _sum: {
          totalGross: true,
        },
      });

      expect(prismaService.vATRegister.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          type: 'zakup',
          invoiceDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          netAmount: true,
          vatAmount: true,
        },
      });

      expect(prismaService.zUSContribution.aggregate).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          period: {
            gte: startDate.toISOString().slice(0, 7),
            lte: endDate.toISOString().slice(0, 7),
          },
        },
        _sum: {
          emerytalnaEmployer: true,
          rentowaEmployer: true,
          chorobowaEmployee: true,
          wypadkowaEmployer: true,
          zdrowotnaEmployee: true,
          fpEmployee: true,
          fgspEmployee: true,
        },
      });
    });

    it('should handle zero costs', async () => {
      mockPrismaService.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: 0 } });
      mockPrismaService.vATRegister.aggregate.mockResolvedValue({ _sum: { netAmount: 0, vatAmount: 0 } });
      mockPrismaService.zUSContribution.aggregate.mockResolvedValue({ _sum: {} });

      const result = await (service as any).getCostData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.total).toBe(0);
      expect(result.materials).toBe(0);
      expect(result.salaries).toBe(0);
      expect(result.other).toBe(0);
    });

    it('should handle database errors in invoice aggregation', async () => {
      mockPrismaService.invoice.aggregate.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getCostData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in VAT register aggregation', async () => {
      mockPrismaService.vATRegister.aggregate.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getCostData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in ZUS contribution aggregation', async () => {
      mockPrismaService.zUSContribution.aggregate.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getCostData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle null aggregation results', async () => {
      mockPrismaService.invoice.aggregate.mockResolvedValue({ _sum: { totalGross: null } });
      mockPrismaService.vATRegister.aggregate.mockResolvedValue({ _sum: { netAmount: null, vatAmount: null } });
      mockPrismaService.zUSContribution.aggregate.mockResolvedValue({ _sum: {} });

      const result = await (service as any).getCostData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.total).toBe(0);
      expect(result.materials).toBe(0);
      expect(result.salaries).toBe(0);
    });

    it('should handle different date ranges correctly', async () => {
      const dateRanges = [
        { start: new Date('2024-01-01'), end: new Date('2024-03-31') },
        { start: new Date('2024-04-01'), end: new Date('2024-06-30') },
      ];

      for (const range of dateRanges) {
        await (service as any).getCostData('tenant-123', 'company-456', range.start, range.end);
      }

      expect(prismaService.invoice.aggregate).toHaveBeenCalledTimes(2);
      expect(prismaService.vATRegister.aggregate).toHaveBeenCalledTimes(2);
      expect(prismaService.zUSContribution.aggregate).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent cost data retrieval', async () => {
      const dateRanges = [
        { start: new Date('2024-01-01'), end: new Date('2024-03-31') },
        { start: new Date('2024-04-01'), end: new Date('2024-06-30') },
      ];

      const results = await Promise.all(
        dateRanges.map(range =>
          (service as any).getCostData('tenant-123', 'company-456', range.start, range.end)
        )
      );

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toHaveProperty('total');
        expect(result).toHaveProperty('materials');
        expect(result).toHaveProperty('salaries');
        expect(result).toHaveProperty('other');
      });
    });
  });

  describe('getVATData', () => {
    beforeEach(() => {
      mockPrismaService.vATRegister.aggregate
        .mockResolvedValueOnce({ _sum: { vatAmount: 20000 } }) // Sales VAT
        .mockResolvedValueOnce({ _sum: { vatAmount: 8000 } }); // Purchase VAT

      mockPrismaService.taxCalculation.findMany.mockResolvedValue([
        {
          id: '1',
          period: '2024-10',
          declarationType: 'VAT-7',
          vatDue: 12000,
        },
      ]);
    });

    it('should get VAT data correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await (service as any).getVATData('tenant-123', 'company-456', startDate, endDate);

      expect(result).toEqual({
        collected: 20000,
        paid: 8000,
        due: 12000, // Simplified calculation
      });

      expect(prismaService.vATRegister.aggregate).toHaveBeenCalledTimes(2);
      expect(prismaService.taxCalculation.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          period: {
            gte: startDate.toISOString().slice(0, 7),
            lte: endDate.toISOString().slice(0, 7),
          },
          declarationType: {
            in: ['VAT-7', 'JPK_V7M', 'JPK_V7K'],
          },
        },
      });
    });

    it('should handle zero VAT collected', async () => {
      mockPrismaService.vATRegister.aggregate
        .mockResolvedValueOnce({ _sum: { vatAmount: 0 } })
        .mockResolvedValueOnce({ _sum: { vatAmount: 8000 } });

      const result = await (service as any).getVATData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.collected).toBe(0);
      expect(result.paid).toBe(8000);
      expect(result.due).toBe(0); // Max(0, 0 - 8000) = 0
    });

    it('should handle zero VAT paid', async () => {
      mockPrismaService.vATRegister.aggregate
        .mockResolvedValueOnce({ _sum: { vatAmount: 20000 } })
        .mockResolvedValueOnce({ _sum: { vatAmount: 0 } });

      const result = await (service as any).getVATData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.collected).toBe(20000);
      expect(result.paid).toBe(0);
      expect(result.due).toBe(20000); // Max(0, 20000 - 0) = 20000
    });

    it('should handle database errors in VAT register aggregation', async () => {
      mockPrismaService.vATRegister.aggregate.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getVATData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in tax calculation lookup', async () => {
      mockPrismaService.taxCalculation.findMany.mockRejectedValue(new Error('Database error'));

      await expect((service as any).getVATData('tenant-123', 'company-456', new Date(), new Date()))
        .rejects.toThrow('Database error');
    });

    it('should handle null aggregation results', async () => {
      mockPrismaService.vATRegister.aggregate
        .mockResolvedValueOnce({ _sum: { vatAmount: null } })
        .mockResolvedValueOnce({ _sum: { vatAmount: null } });

      const result = await (service as any).getVATData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.collected).toBe(0);
      expect(result.paid).toBe(0);
      expect(result.due).toBe(0);
    });

    it('should handle empty tax calculations', async () => {
      mockPrismaService.taxCalculation.findMany.mockResolvedValue([]);

      const result = await (service as any).getVATData('tenant-123', 'company-456', new Date(), new Date());

      expect(result.due).toBe(12000); // Uses simplified calculation when no tax data
    });

    it('should handle different declaration types in tax calculations', async () => {
      mockPrismaService.taxCalculation.findMany.mockResolvedValue([
        { declarationType: 'VAT-7' },
        { declarationType: 'JPK_V7M' },
        { declarationType: 'JPK_V7K' },
      ]);

      await (service as any).getVATData('tenant-123', 'company-456', new Date(), new Date());

      expect(prismaService.taxCalculation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            declarationType: {
              in: ['VAT-7', 'JPK_V7M', 'JPK_V7K'],
            },
          }),
        })
      );
    });

    it('should handle concurrent VAT data retrieval', async () => {
      const dateRanges = [
        { start: new Date('2024-01-01'), end: new Date('2024-03-31') },
        { start: new Date('2024-04-01'), end: new Date('2024-06-30') },
      ];

      const results = await Promise.all(
        dateRanges.map(range =>
          (service as any).getVATData('tenant-123', 'company-456', range.start, range.end)
        )
      );

      expect(results).toHaveLength(2);
      expect(prismaService.vATRegister.aggregate).toHaveBeenCalledTimes(4); // 2 calls per range (sales + purchases)
      expect(prismaService.taxCalculation.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateTotalZUSContributions', () => {
    it('should calculate total ZUS contributions correctly', () => {
      const zusData = {
        _sum: {
          emerytalnaEmployer: 2000,
          rentowaEmployer: 1500,
          chorobowaEmployee: 1000,
          wypadkowaEmployer: 800,
          zdrowotnaEmployee: 1200,
          fpEmployee: 500,
          fgspEmployee: 300,
        },
      };

      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(7300); // Sum of all contributions
    });

    it('should handle zero ZUS contributions', () => {
      const zusData = { _sum: {} };
      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(0);
    });

    it('should handle null ZUS contributions', () => {
      const zusData = {
        _sum: {
          emerytalnaEmployer: null,
          rentowaEmployer: null,
          chorobowaEmployee: null,
          wypadkowaEmployer: null,
          zdrowotnaEmployee: null,
          fpEmployee: null,
          fgspEmployee: null,
        },
      };

      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(0);
    });

    it('should handle partial ZUS contributions', () => {
      const zusData = {
        _sum: {
          emerytalnaEmployer: 2000,
          rentowaEmployer: 1500,
          // Other fields missing
        },
      };

      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(3500); // Only sum of provided values
    });

    it('should handle negative ZUS contributions', () => {
      const zusData = {
        _sum: {
          emerytalnaEmployer: -1000,
          rentowaEmployer: 1500,
          chorobowaEmployee: 1000,
        },
      };

      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(1500); // -1000 + 1500 + 1000
    });

    it('should handle fractional ZUS contributions', () => {
      const zusData = {
        _sum: {
          emerytalnaEmployer: 2000.50,
          rentowaEmployer: 1500.25,
          chorobowaEmployee: 1000.75,
        },
      };

      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(4501.50); // Sum of fractional values
    });

    it('should handle very large ZUS contributions', () => {
      const zusData = {
        _sum: {
          emerytalnaEmployer: 1000000,
          rentowaEmployer: 500000,
          chorobowaEmployee: 300000,
          wypadkowaEmployer: 200000,
          zdrowotnaEmployee: 400000,
          fpEmployee: 100000,
          fgspEmployee: 50000,
        },
      };

      const result = (service as any).calculateTotalZUSContributions(zusData);

      expect(result).toBe(2100000); // Sum of large values
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle null tenant_id in generateReport', async () => {
      const filters = { year: 2024 };

      await expect(service.generateReport(null as any, 'company-456', filters))
        .rejects.toThrow();
    });

    it('should handle undefined tenant_id in generateReport', async () => {
      const filters = { year: 2024 };

      await expect(service.generateReport(undefined as any, 'company-456', filters))
        .rejects.toThrow();
    });

    it('should handle null company_id in generateReport', async () => {
      const filters = { year: 2024 };

      await expect(service.generateReport('tenant-123', null as any, filters))
        .rejects.toThrow();
    });

    it('should handle null filters in generateReport', async () => {
      await expect(service.generateReport('tenant-123', 'company-456', null as any))
        .rejects.toThrow();
    });

    it('should handle very large date ranges', async () => {
      const filters = {
        startDate: '2020-01-01',
        endDate: '2024-12-31',
      };

      const result = await service.generateReport('tenant-123', 'company-456', filters);

      expect(result).toBeDefined();
      expect(result.period).toBe('2020-01-01_2024-12-31');
    });

    it('should handle future date ranges', async () => {
      const futureYear = new Date().getFullYear() + 5;
      const filters = { year: futureYear };

      const result = await service.generateReport('tenant-123', 'company-456', filters);

      expect(result).toBeDefined();
      expect(result.period).toBe(futureYear.toString());
    });

    it('should handle single day date ranges', async () => {
      const filters = {
        startDate: '2024-01-15',
        endDate: '2024-01-15',
      };

      const result = await service.generateReport('tenant-123', 'company-456', filters);

      expect(result).toBeDefined();
      expect(result.period).toBe('2024-01-15_2024-01-15');
    });

    it('should handle concurrent report generation with different parameters', async () => {
      const reportConfigs = [
        { tenantId: 'tenant-1', companyId: 'company-1', filters: { year: 2024 } },
        { tenantId: 'tenant-2', companyId: 'company-2', filters: { year: 2023 } },
        { tenantId: 'tenant-3', companyId: 'company-3', filters: { startDate: '2024-01-01', endDate: '2024-06-30' } },
      ];

      const results = await Promise.all(
        reportConfigs.map(config =>
          service.generateReport(config.tenantId, config.companyId, config.filters)
        )
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('period');
        expect(result).toHaveProperty('revenue');
        expect(result).toHaveProperty('costs');
        expect(result).toHaveProperty('grossProfit');
        expect(result).toHaveProperty('netProfit');
      });
    });

    it('should handle malformed date strings in filters', async () => {
      const filters = {
        startDate: 'invalid-date',
        endDate: '2024-12-31',
      };

      await expect(service.generateReport('tenant-123', 'company-456', filters))
        .rejects.toThrow();
    });

    it('should handle very large numbers in calculations', async () => {
      const largeRevenueData = { total: 1000000000, sales: 1000000000, other: 0 };
      const largeCostData = { total: 800000000, materials: 600000000, services: 0, salaries: 100000000, other: 100000000 };
      const largeVATData = { collected: 200000000, paid: 160000000, due: 40000000 };

      jest.spyOn(service as any, 'getRevenueData').mockResolvedValue(largeRevenueData);
      jest.spyOn(service as any, 'getCostData').mockResolvedValue(largeCostData);
      jest.spyOn(service as any, 'getVATData').mockResolvedValue(largeVATData);

      const result = await service.generateReport('tenant-123', 'company-456', { year: 2024 });

      expect(result.grossProfit).toBe(200000000); // 1000000000 - 800000000
      expect(result.netProfit).toBe(160000000); // 200000000 - 40000000
    });

    it('should handle negative profit scenarios', async () => {
      const lossRevenueData = { total: 50000, sales: 50000, other: 0 };
      const highCostData = { total: 100000, materials: 60000, services: 0, salaries: 30000, other: 10000 };
      const vatData = { collected: 10000, paid: 5000, due: 5000 };

      jest.spyOn(service as any, 'getRevenueData').mockResolvedValue(lossRevenueData);
      jest.spyOn(service as any, 'getCostData').mockResolvedValue(highCostData);
      jest.spyOn(service as any, 'getVATData').mockResolvedValue(vatData);

      const result = await service.generateReport('tenant-123', 'company-456', { year: 2024 });

      expect(result.grossProfit).toBe(-50000); // 50000 - 100000
      expect(result.operatingProfit).toBe(-50000);
      expect(result.netProfit).toBe(-55000); // -50000 - 5000
    });

    it('should handle edge case date boundaries', async () => {
      const edgeCaseFilters = [
        { startDate: '2024-02-29', endDate: '2024-03-01' }, // Leap year
        { startDate: '2023-12-31', endDate: '2024-01-01' }, // Year boundary
        { startDate: '2024-01-01', endDate: '2024-01-01' }, // Same day
      ];

      for (const filters of edgeCaseFilters) {
        const result = await service.generateReport('tenant-123', 'company-456', filters);
        expect(result).toBeDefined();
      }
    });
  });
});