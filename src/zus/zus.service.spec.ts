import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ZusService } from './zus.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZUSEmployeeDto } from './dto/zus-employee.dto';
import { UpdateZUSEmployeeDto } from './dto/zus-employee.dto';
import { CreateZUSRegistrationDto } from './dto/zus-registration.dto';
import { CreateZUSReportDto } from './dto/zus-report.dto';

describe('ZusService', () => {
  let service: ZusService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    zUSEmployee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    zUSContribution: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    zUSRegistration: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    zUSReport: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  // Mock ZUS rates
  const ZUS_RATES = {
    emerytalna: { employer: 9.76, employee: 9.76 },
    rentowa: { employer: 6.50, employee: 1.50 },
    chorobowa: { employee: 2.45 },
    wypadkowa: { employer: 1.67 },
    zdrowotna: { employee: 9.00 },
    fp: { employer: 2.45 },
    fgsp: { employer: 0.10 }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZusService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ZusService>(ZusService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateContributions', () => {
    it('should calculate contributions correctly for standard basis', () => {
      const basis = 5000;
      const result = service.calculateContributions(basis);

      expect(result.basis).toBe(5000);
      expect(result.totalEmployer).toBeGreaterThan(0);
      expect(result.totalEmployee).toBeGreaterThan(0);
      expect(result.totalContribution).toBe(result.totalEmployer + result.totalEmployee);
    });

    it('should handle zero basis', () => {
      const result = service.calculateContributions(0);

      expect(result.basis).toBe(0);
      expect(result.totalEmployer).toBe(0);
      expect(result.totalEmployee).toBe(0);
      expect(result.totalContribution).toBe(0);
    });

    it('should handle negative basis', () => {
      const result = service.calculateContributions(-1000);

      expect(result.basis).toBe(-1000);
      expect(result.totalEmployer).toBeLessThan(0);
      expect(result.totalEmployee).toBeLessThan(0);
    });

    it('should handle fractional basis', () => {
      const basis = 5000.50;
      const result = service.calculateContributions(basis);

      expect(result.basis).toBe(5000.50);
      expect(result.emerytalnaEmployer).toBeCloseTo(5000.50 * 0.0975, 2);
    });

    it('should handle very large basis', () => {
      const largeBasis = 1000000;
      const result = service.calculateContributions(largeBasis);

      expect(result.basis).toBe(largeBasis);
      expect(result.totalContribution).toBeGreaterThan(0);
    });

    it('should handle very small basis', () => {
      const smallBasis = 0.01;
      const result = service.calculateContributions(smallBasis);

      expect(result.basis).toBe(0.01);
      expect(result.totalContribution).toBeGreaterThan(0);
    });
  });

  describe('getZUSDeadlines', () => {
    it('should return correct monthly and annual deadlines', () => {
      const result = service.getZUSDeadlines();

      expect(result).toHaveProperty('monthlyReports');
      expect(result).toHaveProperty('annualReports');

      expect(result.monthlyReports).toHaveProperty('deadline');
      expect(result.monthlyReports).toHaveProperty('description');
      expect(result.annualReports).toHaveProperty('deadline');
      expect(result.annualReports).toHaveProperty('description');

      expect(result.monthlyReports.deadline).toBeInstanceOf(Date);
      expect(result.annualReports.deadline).toBeInstanceOf(Date);
    });

    it('should calculate deadlines based on current date', () => {
      const result = service.getZUSDeadlines();
      const currentDate = new Date();

      // Monthly deadline should be 15th of next month
      const expectedMonthlyDeadline = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 15);
      expect(result.monthlyReports.deadline.getTime()).toBe(expectedMonthlyDeadline.getTime());

      // Annual deadline should be January 31st of next year
      const expectedAnnualDeadline = new Date(currentDate.getFullYear() + 1, 0, 31);
      expect(result.annualReports.deadline.getTime()).toBe(expectedAnnualDeadline.getTime());
    });

    it('should return consistent results for same date', () => {
      const result1 = service.getZUSDeadlines();
      const result2 = service.getZUSDeadlines();

      expect(result1.monthlyReports.deadline.getTime()).toBe(result2.monthlyReports.deadline.getTime());
      expect(result1.annualReports.deadline.getTime()).toBe(result2.annualReports.deadline.getTime());
    });
  });

  describe('Error handling', () => {
    it('should handle database errors in employee operations', async () => {
      mockPrismaService.zUSEmployee.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getEmployees('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in contribution operations', async () => {
      mockPrismaService.zUSContribution.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getContributions('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in registration operations', async () => {
      mockPrismaService.zUSRegistration.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getRegistrations('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors in report operations', async () => {
      mockPrismaService.zUSReport.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getReports('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });
  });

  describe('Edge cases', () => {
    it('should handle null tenant_id in operations', async () => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue([]);

      const result = await service.getEmployees(null as any, 'company-456');

      expect(result).toEqual([]);
    });

    it('should handle undefined tenant_id in operations', async () => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue([]);

      const result = await service.getEmployees(undefined as any, 'company-456');

      expect(result).toEqual([]);
    });

    it('should handle null company_id in operations', async () => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue([]);

      const result = await service.getEmployees('tenant-123', null as any);

      expect(result).toEqual([]);
    });

    it('should handle concurrent operations', async () => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue([]);
      mockPrismaService.zUSContribution.findMany.mockResolvedValue([]);
      mockPrismaService.zUSRegistration.findMany.mockResolvedValue([]);
      mockPrismaService.zUSReport.findMany.mockResolvedValue([]);

      const operations = [
        service.getEmployees('tenant-123', 'company-456'),
        service.getContributions('tenant-123', 'company-456'),
        service.getRegistrations('tenant-123', 'company-456'),
        service.getReports('tenant-123', 'company-456'),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('createEmployee', () => {
    const mockEmployeeDto: CreateZUSEmployeeDto = {
      firstName: 'John',
      lastName: 'Doe',
      pesel: '12345678901',
      address: 'Test Address 1',
      salaryBasis: 5000,
      employmentDate: '2024-01-15',
      birthDate: '1990-05-20',
      insuranceStartDate: '2024-01-15',
      contractType: 'employment',
    };

    const mockCreatedEmployee = {
      id: 'employee-id',
      tenant_id: 'tenant-123',
      company_id: 'company-456',
      ...mockEmployeeDto,
      employmentDate: new Date('2024-01-15'),
      birthDate: new Date('1990-05-20'),
      insuranceStartDate: new Date('2024-01-15'),
      terminationDate: null,
    };

    beforeEach(() => {
      mockPrismaService.zUSEmployee.create.mockResolvedValue(mockCreatedEmployee);
    });

    it('should create employee successfully', async () => {
      const result = await service.createEmployee('tenant-123', 'company-456', mockEmployeeDto);

      expect(result).toEqual(mockCreatedEmployee);

      expect(prismaService.zUSEmployee.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          firstName: 'John',
          lastName: 'Doe',
          pesel: '12345678901',
          address: 'Test Address 1',
          salaryBasis: 5000,
          employmentDate: new Date('2024-01-15'),
          birthDate: new Date('1990-05-20'),
          insuranceStartDate: new Date('2024-01-15'),
          contractType: 'employment',
          terminationDate: null,
        },
      });
    });

    it('should handle employee with termination date', async () => {
      const dtoWithTermination = {
        ...mockEmployeeDto,
        terminationDate: '2024-12-31',
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithTermination);

      expect(result).toEqual({
        ...mockCreatedEmployee,
        terminationDate: new Date('2024-12-31'),
      });

      expect(prismaService.zUSEmployee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          terminationDate: new Date('2024-12-31'),
        }),
      });
    });

    it('should handle database errors during creation', async () => {
      mockPrismaService.zUSEmployee.create.mockRejectedValue(new Error('Database error'));

      await expect(service.createEmployee('tenant-123', 'company-456', mockEmployeeDto))
        .rejects.toThrow('Database error');
    });

    it('should handle special characters in employee data', async () => {
      const dtoWithSpecialChars = {
        ...mockEmployeeDto,
        firstName: 'José',
        lastName: 'García',
        address: 'Calle 123 ñáéíóú',
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithSpecialChars);

      expect(result.firstName).toBe('José');
      expect(result.lastName).toBe('García');
      expect(result.address).toBe('Calle 123 ñáéíóú');
    });

    it('should handle very long names and addresses', async () => {
      const longName = 'A'.repeat(100);
      const longAddress = 'B'.repeat(200);

      const dtoWithLongData = {
        ...mockEmployeeDto,
        firstName: longName,
        lastName: longName,
        address: longAddress,
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithLongData);

      expect(result.firstName).toBe(longName);
      expect(result.lastName).toBe(longName);
      expect(result.address).toBe(longAddress);
    });

    it('should handle zero salary basis', async () => {
      const dtoWithZeroSalary = {
        ...mockEmployeeDto,
        salaryBasis: 0,
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithZeroSalary);

      expect(result.salaryBasis).toBe(0);
    });

    it('should handle negative salary basis', async () => {
      const dtoWithNegativeSalary = {
        ...mockEmployeeDto,
        salaryBasis: -1000,
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithNegativeSalary);

      expect(result.salaryBasis).toBe(-1000);
    });

    it('should handle fractional salary basis', async () => {
      const dtoWithFractionalSalary = {
        ...mockEmployeeDto,
        salaryBasis: 5000.50,
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithFractionalSalary);

      expect(result.salaryBasis).toBe(5000.50);
    });

    it('should handle concurrent employee creation', async () => {
      const employees = Array.from({ length: 5 }, (_, i) => ({
        ...mockEmployeeDto,
        firstName: `Employee${i}`,
        pesel: `1234567890${i}`,
      }));

      const results = await Promise.all(
        employees.map(emp => service.createEmployee('tenant-123', 'company-456', emp))
      );

      expect(results).toHaveLength(5);
      expect(prismaService.zUSEmployee.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('getEmployees', () => {
    const mockEmployees = [
      {
        id: 'emp-1',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        firstName: 'John',
        lastName: 'Doe',
        pesel: '12345678901',
        zusRegistrations: [
          {
            id: 'reg-1',
            formType: 'ZUA',
          },
        ],
        zusContributions: [
          {
            id: 'cont-1',
            period: '2024-10',
          },
        ],
      },
      {
        id: 'emp-2',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        firstName: 'Jane',
        lastName: 'Smith',
        pesel: '98765432109',
        zusRegistrations: [],
        zusContributions: [],
      },
    ];

    beforeEach(() => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue(mockEmployees);
    });

    it('should get all employees with relations', async () => {
      const result = await service.getEmployees('tenant-123', 'company-456');

      expect(result).toEqual(mockEmployees);
      expect(result).toHaveLength(2);

      expect(prismaService.zUSEmployee.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
        include: {
          zusRegistrations: true,
          zusContributions: true,
        },
      });
    });

    it('should return empty array when no employees found', async () => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue([]);

      const result = await service.getEmployees('tenant-123', 'company-456');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrismaService.zUSEmployee.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getEmployees('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should handle employees with missing relations', async () => {
      const employeesWithoutRelations = [
        {
          id: 'emp-1',
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          firstName: 'John',
          lastName: 'Doe',
          pesel: '12345678901',
          zusRegistrations: [],
          zusContributions: [],
        },
      ];

      mockPrismaService.zUSEmployee.findMany.mockResolvedValue(employeesWithoutRelations);

      const result = await service.getEmployees('tenant-123', 'company-456');

      expect(result).toEqual(employeesWithoutRelations);
      expect(result[0].zusRegistrations).toEqual([]);
      expect(result[0].zusContributions).toEqual([]);
    });
  });

  describe('updateEmployee', () => {
    const mockUpdateDto: UpdateZUSEmployeeDto = {
      firstName: 'John Updated',
      salaryBasis: 6000,
    };

    const mockUpdateResult = {
      count: 1,
    };

    beforeEach(() => {
      mockPrismaService.zUSEmployee.updateMany.mockResolvedValue(mockUpdateResult);
    });

    it('should update employee successfully', async () => {
      const result = await service.updateEmployee('tenant-123', 'employee-456', mockUpdateDto);

      expect(result).toEqual(mockUpdateResult);

      expect(prismaService.zUSEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'employee-456',
          tenant_id: 'tenant-123',
        },
        data: {
          firstName: 'John Updated',
          salaryBasis: 6000,
          // position field doesn't exist in DTO
        },
      });
    });

    it('should handle date updates', async () => {
      const dtoWithDates = {
        employmentDate: '2024-02-01',
        birthDate: '1990-06-01',
        terminationDate: '2024-12-31',
      };

      const result = await service.updateEmployee('tenant-123', 'employee-456', dtoWithDates);

      expect(result).toEqual(mockUpdateResult);

      expect(prismaService.zUSEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'employee-456',
          tenant_id: 'tenant-123',
        },
        data: {
          employmentDate: new Date('2024-02-01'),
          birthDate: new Date('1990-06-01'),
          terminationDate: new Date('2024-12-31'),
        },
      });
    });

    it('should handle partial updates', async () => {
      const partialUpdateDto = {
        firstName: 'John Updated',
      };

      const result = await service.updateEmployee('tenant-123', 'employee-456', partialUpdateDto);

      expect(result).toEqual(mockUpdateResult);

      expect(prismaService.zUSEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'employee-456',
          tenant_id: 'tenant-123',
        },
        data: {
          firstName: 'John Updated',
        },
      });
    });

    it('should handle database errors', async () => {
      mockPrismaService.zUSEmployee.updateMany.mockRejectedValue(new Error('Database error'));

      await expect(service.updateEmployee('tenant-123', 'employee-456', mockUpdateDto))
        .rejects.toThrow('Database error');
    });

    it('should handle employee not found', async () => {
      mockPrismaService.zUSEmployee.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.updateEmployee('tenant-123', 'nonexistent-employee', mockUpdateDto);

      expect(result.count).toBe(0);
    });

    it('should handle concurrent updates', async () => {
      const updateDtos = [
        { firstName: 'Employee 1 Updated' },
        { firstName: 'Employee 2 Updated' },
        { firstName: 'Employee 3 Updated' },
      ];

      const results = await Promise.all(
        updateDtos.map((dto, i) =>
          service.updateEmployee('tenant-123', `employee-${i}`, dto)
        )
      );

      expect(results).toHaveLength(3);
      expect(prismaService.zUSEmployee.updateMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('calculateContributions', () => {
    it('should calculate contributions correctly for standard basis', () => {
      const basis = 5000;
      const result = service.calculateContributions(basis);

      expect(result.basis).toBe(5000);
      expect(result.emerytalnaEmployer).toBeCloseTo(5000 * (ZUS_RATES.emerytalna.employer / 100), 2);
      expect(result.emerytalnaEmployee).toBeCloseTo(5000 * (ZUS_RATES.emerytalna.employee / 100), 2);
      expect(result.rentowaEmployer).toBeCloseTo(5000 * (ZUS_RATES.rentowa.employer / 100), 2);
      expect(result.rentowaEmployee).toBeCloseTo(5000 * (ZUS_RATES.rentowa.employee / 100), 2);
      expect(result.chorobowaEmployee).toBeCloseTo(5000 * (ZUS_RATES.chorobowa.employee / 100), 2);
      expect(result.wypadkowaEmployer).toBeCloseTo(5000 * (ZUS_RATES.wypadkowa.employer / 100), 2);
      expect(result.zdrowotnaEmployee).toBeCloseTo(5000 * (ZUS_RATES.zdrowotna.employee / 100), 2);
      expect(result.fpEmployee).toBeCloseTo(5000 * (ZUS_RATES.fp.employer / 100), 2);
      expect(result.fgspEmployee).toBeCloseTo(5000 * (ZUS_RATES.fgsp.employer / 100), 2);

      expect(result.totalEmployer).toBe(
        result.emerytalnaEmployer + result.rentowaEmployer + result.wypadkowaEmployer + result.fpEmployee + result.fgspEmployee
      );
      expect(result.totalEmployee).toBe(
        result.emerytalnaEmployee + result.rentowaEmployee + result.chorobowaEmployee + result.zdrowotnaEmployee
      );
      expect(result.totalContribution).toBe(result.totalEmployer + result.totalEmployee);
    });

    it('should handle zero basis', () => {
      const result = service.calculateContributions(0);

      expect(result.basis).toBe(0);
      expect(result.totalEmployer).toBe(0);
      expect(result.totalEmployee).toBe(0);
      expect(result.totalContribution).toBe(0);
    });

    it('should handle negative basis', () => {
      const result = service.calculateContributions(-1000);

      expect(result.basis).toBe(-1000);
      expect(result.totalEmployer).toBeCloseTo(-1000 * 0.01, 2); // Approximate calculation
      expect(result.totalEmployee).toBeCloseTo(-1000 * 0.01, 2); // Approximate calculation
    });

    it('should handle fractional basis', () => {
      const basis = 5000.50;
      const result = service.calculateContributions(basis);

      expect(result.basis).toBe(5000.50);
      expect(result.emerytalnaEmployer).toBeCloseTo(5000.50 * (ZUS_RATES.emerytalna.employer / 100), 2);
    });

    it('should handle very large basis', () => {
      const largeBasis = 1000000;
      const result = service.calculateContributions(largeBasis);

      expect(result.basis).toBe(largeBasis);
      expect(result.totalContribution).toBeGreaterThan(0);
    });

    it('should handle very small basis', () => {
      const smallBasis = 0.01;
      const result = service.calculateContributions(smallBasis);

      expect(result.basis).toBe(0.01);
      expect(result.totalContribution).toBeGreaterThan(0);
    });

    it('should calculate correct totals for known rates', () => {
      // Using approximate current ZUS rates for testing
      const basis = 10000;
      const result = service.calculateContributions(basis);

      // Verify calculations are mathematically correct
      const expectedEmerytalnaEmployer = Math.round((basis * ZUS_RATES.emerytalna.employer) / 100 * 100) / 100;
      const expectedEmerytalnaEmployee = Math.round((basis * ZUS_RATES.emerytalna.employee) / 100 * 100) / 100;

      expect(result.emerytalnaEmployer).toBe(expectedEmerytalnaEmployer);
      expect(result.emerytalnaEmployee).toBe(expectedEmerytalnaEmployee);
    });
  });

  describe('calculateEmployeeContributions', () => {
    const mockEmployee = {
      id: 'employee-123',
      tenant_id: 'tenant-123',
      company_id: 'company-456',
      firstName: 'John',
      lastName: 'Doe',
      salaryBasis: 5000,
    };

    const mockCreatedContribution = {
      id: 'contribution-123',
      tenant_id: 'tenant-123',
      company_id: 'company-456',
      employee_id: 'employee-123',
      period: '2024-10',
      contributionDate: new Date(),
      basisEmerytalnaRentowa: 5000,
      basisChorobowa: 5000,
      basisZdrowotna: 5000,
      basisFPFGSP: 5000,
      emerytalnaEmployer: expect.any(Number),
      emerytalnaEmployee: expect.any(Number),
      rentowaEmployer: expect.any(Number),
      rentowaEmployee: expect.any(Number),
      chorobowaEmployee: expect.any(Number),
      wypadkowaEmployer: expect.any(Number),
      zdrowotnaEmployee: expect.any(Number),
      zdrowotnaDeductible: expect.any(Number),
      fpEmployee: expect.any(Number),
      fgspEmployee: expect.any(Number),
    };

    beforeEach(() => {
      mockPrismaService.zUSEmployee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.zUSContribution.create.mockResolvedValue(mockCreatedContribution);
    });

    it('should calculate and create employee contributions successfully', async () => {
      const result = await service.calculateEmployeeContributions('tenant-123', 'employee-123', '2024-10');

      expect(result).toEqual(mockCreatedContribution);

      expect(prismaService.zUSEmployee.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'employee-123',
          tenant_id: 'tenant-123',
        },
      });

      expect(prismaService.zUSContribution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          employee_id: 'employee-123',
          period: '2024-10',
          basisEmerytalnaRentowa: 5000,
          basisChorobowa: 5000,
          basisZdrowotna: 5000,
          basisFPFGSP: 5000,
        }),
      });
    });

    it('should throw NotFoundException when employee not found', async () => {
      mockPrismaService.zUSEmployee.findFirst.mockResolvedValue(null);

      await expect(service.calculateEmployeeContributions('tenant-123', 'nonexistent-employee', '2024-10'))
        .rejects.toThrow(NotFoundException);
      await expect(service.calculateEmployeeContributions('tenant-123', 'nonexistent-employee', '2024-10'))
        .rejects.toThrow('Employee not found');
    });

    it('should handle database errors during employee lookup', async () => {
      mockPrismaService.zUSEmployee.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.calculateEmployeeContributions('tenant-123', 'employee-123', '2024-10'))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during contribution creation', async () => {
      mockPrismaService.zUSContribution.create.mockRejectedValue(new Error('Creation error'));

      await expect(service.calculateEmployeeContributions('tenant-123', 'employee-123', '2024-10'))
        .rejects.toThrow('Creation error');
    });

    it('should handle employee with zero salary basis', async () => {
      const employeeWithZeroSalary = {
        ...mockEmployee,
        salaryBasis: 0,
      };

      mockPrismaService.zUSEmployee.findFirst.mockResolvedValue(employeeWithZeroSalary);

      const result = await service.calculateEmployeeContributions('tenant-123', 'employee-123', '2024-10');

      expect(result).toBeDefined();
      expect(prismaService.zUSContribution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          basisEmerytalnaRentowa: 0,
          basisChorobowa: 0,
          basisZdrowotna: 0,
          basisFPFGSP: 0,
        }),
      });
    });

    it('should handle employee with negative salary basis', async () => {
      const employeeWithNegativeSalary = {
        ...mockEmployee,
        salaryBasis: -1000,
      };

      mockPrismaService.zUSEmployee.findFirst.mockResolvedValue(employeeWithNegativeSalary);

      const result = await service.calculateEmployeeContributions('tenant-123', 'employee-123', '2024-10');

      expect(result).toBeDefined();
      expect(prismaService.zUSContribution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          basisEmerytalnaRentowa: -1000,
        }),
      });
    });

    it('should handle concurrent contribution calculations', async () => {
      const employeeIds = ['emp-1', 'emp-2', 'emp-3'];

      const results = await Promise.all(
        employeeIds.map(empId =>
          service.calculateEmployeeContributions('tenant-123', empId, '2024-10')
        )
      );

      expect(results).toHaveLength(3);
      expect(prismaService.zUSEmployee.findFirst).toHaveBeenCalledTimes(3);
      expect(prismaService.zUSContribution.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('createRegistration', () => {
    const mockEmployee = {
      id: 'employee-123',
      tenant_id: 'tenant-123',
      company_id: 'company-456',
      firstName: 'John',
      lastName: 'Doe',
      pesel: '12345678901',
      address: 'Employee Address',
    };

    const mockRegistrationDto: CreateZUSRegistrationDto = {
      employeeId: 'employee-123',
      formType: 'ZUA',
      registrationDate: '2024-01-15',
      insuranceTypes: {
        emerytalna: true,
        rentowa: true,
        chorobowa: true,
        wypadkowa: false,
        zdrowotna: true,
      },
      contributionBasis: 5000,
    };

    const mockCreatedRegistration = {
      id: 'registration-123',
      tenant_id: 'tenant-123',
      company_id: 'company-456',
      employee_id: 'employee-123',
      formType: 'ZUA',
      registrationDate: new Date('2024-01-15'),
      insuranceTypes: ['emerytalna', 'rentowa', 'chorobowa', 'zdrowotna'],
      contributionBasis: 5000,
      data: {
        formType: 'ZUA',
        registrationDate: new Date('2024-01-15'),
        employee: {
          firstName: 'John',
          lastName: 'Doe',
          pesel: '12345678901',
          address: 'Employee Address',
        },
        insuranceTypes: {
          emerytalna: true,
          rentowa: true,
          chorobowa: true,
          wypadkowa: false,
          zdrowotna: true,
        },
        contributionBasis: 5000,
        company: {
          name: '',
          nip: '',
          address: '',
        },
      },
    };

    beforeEach(() => {
      mockPrismaService.zUSEmployee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.zUSRegistration.create.mockResolvedValue(mockCreatedRegistration);
    });

    it('should create registration successfully', async () => {
      const result = await service.createRegistration('tenant-123', 'company-456', mockRegistrationDto);

      expect(result).toEqual(mockCreatedRegistration);

      expect(prismaService.zUSEmployee.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'employee-123',
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
      });

      expect(prismaService.zUSRegistration.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          employee_id: 'employee-123',
          formType: 'ZUA',
          registrationDate: new Date('2024-01-15'),
          insuranceTypes: {
            emerytalna: true,
            rentowa: true,
            chorobowa: true,
            wypadkowa: false,
            zdrowotna: true,
          },
          contributionBasis: 5000,
          data: {
            formType: 'ZUA',
            registrationDate: new Date('2024-01-15'),
            employee: {
              firstName: 'John',
              lastName: 'Doe',
              pesel: '12345678901',
              address: 'Employee Address',
            },
            insuranceTypes: {
              emerytalna: true,
              rentowa: true,
              chorobowa: true,
              wypadkowa: false,
              zdrowotna: true,
            },
            contributionBasis: 5000,
            company: {
              name: '',
              nip: '',
              address: '',
            },
          },
        },
      });
    });

    it('should throw NotFoundException when employee not found', async () => {
      mockPrismaService.zUSEmployee.findFirst.mockResolvedValue(null);

      await expect(service.createRegistration('tenant-123', 'company-456', mockRegistrationDto))
        .rejects.toThrow(NotFoundException);
      await expect(service.createRegistration('tenant-123', 'company-456', mockRegistrationDto))
        .rejects.toThrow('Employee not found');
    });

    it('should handle different form types', async () => {
      const formTypes = ['ZUA', 'ZZA', 'ZWUA'];

      for (const formType of formTypes) {
        const dtoWithFormType = {
          ...mockRegistrationDto,
          formType: formType as 'ZUA' | 'ZZA' | 'ZWUA',
        };

        mockPrismaService.zUSRegistration.create.mockResolvedValue({
          ...mockCreatedRegistration,
          formType: formType as 'ZUA' | 'ZZA' | 'ZWUA',
          data: expect.objectContaining({ formType }),
        });

        const result = await service.createRegistration('tenant-123', 'company-456', dtoWithFormType);

        expect(result.formType).toBe(formType);
      }
    });

    it('should handle different insurance types', async () => {
      const insuranceTypesScenarios = [
        ['emerytalna'],
        ['emerytalna', 'rentowa'],
        ['emerytalna', 'rentowa', 'chorobowa', 'zdrowotna'],
        ['wypadkowa'],
      ];

      for (const insuranceTypes of insuranceTypesScenarios) {
        const insuranceTypesObj = {
          emerytalna: insuranceTypes.includes('emerytalna'),
          rentowa: insuranceTypes.includes('rentowa'),
          chorobowa: insuranceTypes.includes('chorobowa'),
          wypadkowa: insuranceTypes.includes('wypadkowa'),
          zdrowotna: insuranceTypes.includes('zdrowotna'),
        };

        const dtoWithInsuranceTypes = {
          ...mockRegistrationDto,
          insuranceTypes: insuranceTypesObj,
        };

        mockPrismaService.zUSRegistration.create.mockResolvedValue({
          ...mockCreatedRegistration,
          insuranceTypes: insuranceTypesObj,
          data: expect.objectContaining({ insuranceTypes: insuranceTypesObj }),
        });

        const result = await service.createRegistration('tenant-123', 'company-456', dtoWithInsuranceTypes);

        expect(result.insuranceTypes).toEqual(insuranceTypesObj);
      }
    });

    it('should handle database errors during employee lookup', async () => {
      mockPrismaService.zUSEmployee.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.createRegistration('tenant-123', 'company-456', mockRegistrationDto))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during registration creation', async () => {
      mockPrismaService.zUSRegistration.create.mockRejectedValue(new Error('Creation error'));

      await expect(service.createRegistration('tenant-123', 'company-456', mockRegistrationDto))
        .rejects.toThrow('Creation error');
    });

    it('should handle concurrent registration creation', async () => {
      const registrations = Array.from({ length: 3 }, (_, i) => ({
        ...mockRegistrationDto,
        employeeId: `employee-${i}`,
        formType: i === 0 ? 'ZUA' : (i === 1 ? 'ZZA' : 'ZWUA') as 'ZUA' | 'ZZA' | 'ZWUA',
      }));

      const results = await Promise.all(
        registrations.map(reg => service.createRegistration('tenant-123', 'company-456', reg))
      );

      expect(results).toHaveLength(3);
      expect(prismaService.zUSEmployee.findFirst).toHaveBeenCalledTimes(3);
      expect(prismaService.zUSRegistration.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('createReport', () => {
    const mockEmployees = [
      {
        id: 'emp-1',
        firstName: 'John',
        lastName: 'Doe',
        pesel: '12345678901',
      },
      {
        id: 'emp-2',
        firstName: 'Jane',
        lastName: 'Smith',
        pesel: '98765432109',
      },
    ];

    const mockContributions = [
      {
        id: 'cont-1',
        employee_id: 'emp-1',
        period: '2024-10',
        emerytalnaEmployer: 100,
        emerytalnaEmployee: 50,
        rentowaEmployer: 80,
        rentowaEmployee: 40,
        chorobowaEmployee: 30,
        wypadkowaEmployer: 20,
        zdrowotnaEmployee: 45,
        fpEmployee: 10,
        fgspEmployee: 5,
        employee: mockEmployees[0],
      },
      {
        id: 'cont-2',
        employee_id: 'emp-2',
        period: '2024-10',
        emerytalnaEmployer: 120,
        emerytalnaEmployee: 60,
        rentowaEmployer: 96,
        rentowaEmployee: 48,
        chorobowaEmployee: 36,
        wypadkowaEmployer: 24,
        zdrowotnaEmployee: 54,
        fpEmployee: 12,
        fgspEmployee: 6,
        employee: mockEmployees[1],
      },
    ];

    const mockReportDto: CreateZUSReportDto = {
      reportType: 'RCA',
      period: '2024-10',
      reportDate: '2024-11-15',
    };

    const mockCreatedReport = {
      id: 'report-123',
      tenant_id: 'tenant-123',
      company_id: 'company-456',
      reportType: 'RCA',
      period: '2024-10',
      reportDate: new Date('2024-11-15'),
      totalEmployees: 2,
      totalContributions: expect.any(Number),
      data: expect.any(Object),
    };

    beforeEach(() => {
      mockPrismaService.zUSEmployee.findMany.mockResolvedValue(mockEmployees);
      mockPrismaService.zUSContribution.findMany.mockResolvedValue(mockContributions);
      mockPrismaService.zUSReport.create.mockResolvedValue(mockCreatedReport);
    });

    it('should create report successfully', async () => {
      const result = await service.createReport('tenant-123', 'company-456', mockReportDto);

      expect(result).toEqual(mockCreatedReport);

      expect(prismaService.zUSEmployee.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
        include: {
          zusContributions: true,
        },
      });

      expect(prismaService.zUSContribution.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          period: '2024-10',
        },
        include: {
          employee: true,
        },
      });

      expect(prismaService.zUSReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          reportType: 'RCA',
          period: '2024-10',
          reportDate: new Date('2024-11-15'),
          totalEmployees: 2,
        }),
      });
    });

    it('should calculate summary correctly', async () => {
      const result = await service.createReport('tenant-123', 'company-456', mockReportDto);

      const expectedTotalContributions = 100 + 50 + 80 + 40 + 30 + 20 + 45 + 10 + 5 + 120 + 60 + 96 + 48 + 36 + 24 + 54 + 12 + 6;

      expect(result.totalContributions).toBe(expectedTotalContributions);
      expect((result.data as any)?.summary?.totalEmployees).toBe(2);
      expect((result.data as any)?.summary?.totalEmerytalnaEmployer).toBe(220); // 100 + 120
      expect((result.data as any)?.summary?.totalEmerytalnaEmployee).toBe(110); // 50 + 60
    });

    it('should handle empty contributions', async () => {
      mockPrismaService.zUSContribution.findMany.mockResolvedValue([]);

      const result = await service.createReport('tenant-123', 'company-456', mockReportDto);

      expect(result.totalEmployees).toBe(0);
      expect(result.totalContributions).toBe(0);
      expect((result.data as any)?.summary?.totalEmployees).toBe(0);
    });

    it('should handle database errors during employee lookup', async () => {
      mockPrismaService.zUSEmployee.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.createReport('tenant-123', 'company-456', mockReportDto))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during contribution lookup', async () => {
      mockPrismaService.zUSContribution.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.createReport('tenant-123', 'company-456', mockReportDto))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during report creation', async () => {
      mockPrismaService.zUSReport.create.mockRejectedValue(new Error('Creation error'));

      await expect(service.createReport('tenant-123', 'company-456', mockReportDto))
        .rejects.toThrow('Creation error');
    });

    it('should handle different report types', async () => {
      const reportTypes = ['RCA', 'RZA', 'RSA', 'DRA', 'RPA'];

      for (const reportType of reportTypes) {
        const dtoWithReportType = {
          ...mockReportDto,
          reportType,
        };

        mockPrismaService.zUSReport.create.mockResolvedValue({
          ...mockCreatedReport,
          reportType,
          data: expect.objectContaining({ reportType }),
        });

        const dtoWithReportTypeFixed = {
          ...mockReportDto,
          reportType: reportType as 'RCA' | 'RZA' | 'RSA' | 'DRA' | 'RPA',
        };

        const result = await service.createReport('tenant-123', 'company-456', dtoWithReportTypeFixed);

        expect(result.reportType).toBe(reportType);
      }
    });

    it('should handle concurrent report creation', async () => {
      const reports = Array.from({ length: 3 }, (_, i) => ({
        ...mockReportDto,
        period: `2024-${(10 + i).toString().padStart(2, '0')}`,
      }));

      const results = await Promise.all(
        reports.map(report => service.createReport('tenant-123', 'company-456', report))
      );

      expect(results).toHaveLength(3);
      expect(prismaService.zUSEmployee.findMany).toHaveBeenCalledTimes(3);
      expect(prismaService.zUSContribution.findMany).toHaveBeenCalledTimes(3);
      expect(prismaService.zUSReport.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('getReports', () => {
    const mockReports = [
      {
        id: 'report-1',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        reportType: 'RCA',
        period: '2024-10',
        reportDate: new Date('2024-11-15'),
        totalEmployees: 10,
        totalContributions: 50000,
        contributions: [
          {
            id: 'cont-1',
            employee: {
              firstName: 'John',
              lastName: 'Doe',
            },
          },
        ],
      },
      {
        id: 'report-2',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        reportType: 'RZA',
        period: '2024-09',
        reportDate: new Date('2024-10-15'),
        totalEmployees: 8,
        totalContributions: 40000,
        contributions: [],
      },
    ];

    beforeEach(() => {
      mockPrismaService.zUSReport.findMany.mockResolvedValue(mockReports);
    });

    it('should get all reports with contributions', async () => {
      const result = await service.getReports('tenant-123', 'company-456');

      expect(result).toEqual(mockReports);
      expect(result).toHaveLength(2);

      expect(prismaService.zUSReport.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
        include: {
          contributions: {
            include: {
              employee: true,
            },
          },
        },
        orderBy: {
          period: 'desc',
        },
      });
    });

    it('should return empty array when no reports found', async () => {
      mockPrismaService.zUSReport.findMany.mockResolvedValue([]);

      const result = await service.getReports('tenant-123', 'company-456');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrismaService.zUSReport.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getReports('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should order reports by period descending', async () => {
      const result = await service.getReports('tenant-123', 'company-456');

      expect(result[0].period).toBe('2024-10');
      expect(result[1].period).toBe('2024-09');
    });
  });

  describe('getRegistrations', () => {
    const mockRegistrations = [
      {
        id: 'reg-1',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        formType: 'ZUA',
        registrationDate: new Date('2024-01-15'),
        employee: {
          firstName: 'John',
          lastName: 'Doe',
        },
      },
      {
        id: 'reg-2',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        formType: 'ZZA',
        registrationDate: new Date('2024-02-01'),
        employee: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      },
    ];

    beforeEach(() => {
      mockPrismaService.zUSRegistration.findMany.mockResolvedValue(mockRegistrations);
    });

    it('should get all registrations with employees', async () => {
      const result = await service.getRegistrations('tenant-123', 'company-456');

      expect(result).toEqual(mockRegistrations);
      expect(result).toHaveLength(2);

      expect(prismaService.zUSRegistration.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
        include: {
          employee: true,
        },
        orderBy: {
          registrationDate: 'desc',
        },
      });
    });

    it('should return empty array when no registrations found', async () => {
      mockPrismaService.zUSRegistration.findMany.mockResolvedValue([]);

      const result = await service.getRegistrations('tenant-123', 'company-456');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrismaService.zUSRegistration.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getRegistrations('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should order registrations by date descending', async () => {
      const result = await service.getRegistrations('tenant-123', 'company-456');

      expect(result[0].registrationDate.getTime()).toBeGreaterThan(result[1].registrationDate.getTime());
    });
  });

  describe('getContributions', () => {
    const mockContributions = [
      {
        id: 'cont-1',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        period: '2024-10',
        employee: {
          firstName: 'John',
          lastName: 'Doe',
        },
        report: {
          reportType: 'RCA',
        },
      },
      {
        id: 'cont-2',
        tenant_id: 'tenant-123',
        company_id: 'company-456',
        period: '2024-09',
        employee: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
        report: null,
      },
    ];

    beforeEach(() => {
      mockPrismaService.zUSContribution.findMany.mockResolvedValue(mockContributions);
    });

    it('should get all contributions', async () => {
      const result = await service.getContributions('tenant-123', 'company-456');

      expect(result).toEqual(mockContributions);
      expect(result).toHaveLength(2);

      expect(prismaService.zUSContribution.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
        include: {
          employee: true,
          report: true,
        },
        orderBy: {
          period: 'desc',
        },
      });
    });

    it('should get contributions filtered by period', async () => {
      const result = await service.getContributions('tenant-123', 'company-456', '2024-10');

      expect(result).toEqual([mockContributions[0]]);

      expect(prismaService.zUSContribution.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
          period: '2024-10',
        },
        include: {
          employee: true,
          report: true,
        },
        orderBy: {
          period: 'desc',
        },
      });
    });

    it('should return empty array when no contributions found', async () => {
      mockPrismaService.zUSContribution.findMany.mockResolvedValue([]);

      const result = await service.getContributions('tenant-123', 'company-456');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrismaService.zUSContribution.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getContributions('tenant-123', 'company-456'))
        .rejects.toThrow('Database error');
    });

    it('should order contributions by period descending', async () => {
      const result = await service.getContributions('tenant-123', 'company-456');

      expect(result[0].period).toBe('2024-10');
      expect(result[1].period).toBe('2024-09');
    });

    it('should handle null period filter', async () => {
      const result = await service.getContributions('tenant-123', 'company-456', null as any);

      expect(result).toEqual(mockContributions);

      expect(prismaService.zUSContribution.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          company_id: 'company-456',
        },
        include: {
          employee: true,
          report: true,
        },
        orderBy: {
          period: 'desc',
        },
      });
    });
  });

  describe('getZUSDeadlines', () => {
    it('should return correct monthly and annual deadlines', () => {
      const result = service.getZUSDeadlines();

      expect(result).toHaveProperty('monthlyReports');
      expect(result).toHaveProperty('annualReports');

      expect(result.monthlyReports).toHaveProperty('deadline');
      expect(result.monthlyReports).toHaveProperty('description');
      expect(result.annualReports).toHaveProperty('deadline');
      expect(result.annualReports).toHaveProperty('description');

      expect(result.monthlyReports.deadline).toBeInstanceOf(Date);
      expect(result.annualReports.deadline).toBeInstanceOf(Date);
    });

    it('should calculate deadlines based on current date', () => {
      const result = service.getZUSDeadlines();
      const currentDate = new Date();

      // Monthly deadline should be 15th of next month
      const expectedMonthlyDeadline = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 15);
      expect(result.monthlyReports.deadline.getTime()).toBe(expectedMonthlyDeadline.getTime());

      // Annual deadline should be January 31st of next year
      const expectedAnnualDeadline = new Date(currentDate.getFullYear() + 1, 0, 31);
      expect(result.annualReports.deadline.getTime()).toBe(expectedAnnualDeadline.getTime());
    });

    it('should handle year boundary correctly for monthly deadlines', () => {
      // Mock current date to be December
      const originalDate = Date;
      const mockDate = new originalDate('2024-12-15');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = service.getZUSDeadlines();

      // Should be January 15, 2025
      expect(result.monthlyReports.deadline.getMonth()).toBe(0); // January
      expect(result.monthlyReports.deadline.getFullYear()).toBe(2025);

      // Restore original Date
      jest.restoreAllMocks();
    });

    it('should handle year boundary correctly for annual deadlines', () => {
      // Mock current date to be December
      const originalDate = Date;
      const mockDate = new originalDate('2024-12-15');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = service.getZUSDeadlines();

      // Should be January 31, 2025
      expect(result.annualReports.deadline.getMonth()).toBe(0); // January
      expect(result.annualReports.deadline.getFullYear()).toBe(2025);
      expect(result.annualReports.deadline.getDate()).toBe(31);

      // Restore original Date
      jest.restoreAllMocks();
    });

    it('should return consistent results for same date', () => {
      const result1 = service.getZUSDeadlines();
      const result2 = service.getZUSDeadlines();

      expect(result1.monthlyReports.deadline.getTime()).toBe(result2.monthlyReports.deadline.getTime());
      expect(result1.annualReports.deadline.getTime()).toBe(result2.annualReports.deadline.getTime());
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null tenant_id in createEmployee', async () => {
      const mockEmployeeDto: CreateZUSEmployeeDto = {
        firstName: 'John',
        lastName: 'Doe',
        pesel: '12345678901',
        address: 'Test Address',
        salaryBasis: 5000,
        employmentDate: '2024-01-15',
        birthDate: '1990-05-20',
        insuranceStartDate: '2024-01-15',
        contractType: 'employment',
      };

      await expect(service.createEmployee(null as any, 'company-456', mockEmployeeDto))
        .rejects.toThrow();
    });

    it('should handle undefined tenant_id in createEmployee', async () => {
      const mockEmployeeDto: CreateZUSEmployeeDto = {
        firstName: 'John',
        lastName: 'Doe',
        pesel: '12345678901',
        address: 'Test Address',
        salaryBasis: 5000,
        employmentDate: '2024-01-15',
        birthDate: '1990-05-20',
        insuranceStartDate: '2024-01-15',
        contractType: 'employment',
      };

      await expect(service.createEmployee(undefined as any, 'company-456', mockEmployeeDto))
        .rejects.toThrow();
    });

    it('should handle null company_id in createEmployee', async () => {
      const mockEmployeeDto: CreateZUSEmployeeDto = {
        firstName: 'John',
        lastName: 'Doe',
        pesel: '12345678901',
        address: 'Test Address',
        salaryBasis: 5000,
        employmentDate: '2024-01-15',
        birthDate: '1990-05-20',
        insuranceStartDate: '2024-01-15',
        contractType: 'employment',
      };

      await expect(service.createEmployee('tenant-123', null as any, mockEmployeeDto))
        .rejects.toThrow();
    });

    it('should handle very long strings in employee data', async () => {
      const longString = 'A'.repeat(1000);
      const dtoWithLongData: CreateZUSEmployeeDto = {
        firstName: longString,
        lastName: longString,
        pesel: '12345678901',
        address: longString,
        salaryBasis: 5000,
        employmentDate: '2024-01-15',
        birthDate: '1990-05-20',
        insuranceStartDate: '2024-01-15',
        contractType: 'employment',
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithLongData);

      expect(result.firstName).toBe(longString);
      expect(result.lastName).toBe(longString);
      expect(result.address).toBe(longString);
    });

    it('should handle special characters in employee data', async () => {
      const dtoWithSpecialChars: CreateZUSEmployeeDto = {
        firstName: 'José',
        lastName: 'García',
        pesel: '12345678901',
        address: 'Calle 123 ñáéíóú 🚀',
        salaryBasis: 5000,
        employmentDate: '2024-01-15',
        birthDate: '1990-05-20',
        insuranceStartDate: '2024-01-15',
        contractType: 'employment',
      };

      const result = await service.createEmployee('tenant-123', 'company-456', dtoWithSpecialChars);

      expect(result.firstName).toBe('José');
      expect(result.lastName).toBe('García');
      expect(result.address).toBe('Calle 123 ñáéíóú 🚀');
    });

    it('should handle concurrent operations across all methods', async () => {
      // Test concurrent operations across different methods
      const operations = [
        service.getEmployees('tenant-123', 'company-456'),
        service.getReports('tenant-123', 'company-456'),
        service.getRegistrations('tenant-123', 'company-456'),
        service.getContributions('tenant-123', 'company-456'),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
});