import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZUSEmployeeDto, UpdateZUSEmployeeDto } from './dto/zus-employee.dto';
import { CreateZUSRegistrationDto, UpdateZUSRegistrationDto, ZUSFormData, ZUSReportData } from './dto/zus-registration.dto';
import { CreateZUSReportDto, UpdateZUSReportDto } from './dto/zus-report.dto';
import {
  CreateZUSContributionDto,
  ZUSContributionCalculation,
  ZUS_RATES,
  JDGTierType,
  ZUS_JDG_TIERS,
  ZUS_REFERENCE_VALUES_2026,
} from './dto/zus-contribution.dto';

@Injectable()
export class ZusService {
  constructor(private prisma: PrismaService) {}

  // Employee Management
  async createEmployee(tenantId: string, companyId: string, dto: CreateZUSEmployeeDto) {
    return this.prisma.zUSEmployee.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        ...dto,
        employmentDate: new Date(dto.employmentDate),
        birthDate: new Date(dto.birthDate),
        insuranceStartDate: new Date(dto.insuranceStartDate),
        terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : null,
      },
    });
  }

  async getEmployees(tenantId: string, companyId: string) {
    return this.prisma.zUSEmployee.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
      include: {
        zusRegistrations: true,
        zusContributions: true,
      },
    });
  }

  async updateEmployee(tenantId: string, employeeId: string, dto: UpdateZUSEmployeeDto) {
    const updateData: any = { ...dto };

    if (dto.employmentDate) updateData.employmentDate = new Date(dto.employmentDate);
    if (dto.birthDate) updateData.birthDate = new Date(dto.birthDate);
    if (dto.insuranceStartDate) updateData.insuranceStartDate = new Date(dto.insuranceStartDate);
    if (dto.terminationDate) updateData.terminationDate = new Date(dto.terminationDate);

    return this.prisma.zUSEmployee.updateMany({
      where: { id: employeeId, tenant_id: tenantId },
      data: updateData,
    });
  }

  // Contribution Calculations
  calculateContributions(basis: number): ZUSContributionCalculation {
    const emerytalnaEmployer = Math.round((basis * ZUS_RATES.emerytalna.employer) / 100 * 100) / 100;
    const emerytalnaEmployee = Math.round((basis * ZUS_RATES.emerytalna.employee) / 100 * 100) / 100;
    const rentowaEmployer = Math.round((basis * ZUS_RATES.rentowa.employer) / 100 * 100) / 100;
    const rentowaEmployee = Math.round((basis * ZUS_RATES.rentowa.employee) / 100 * 100) / 100;
    const chorobowaEmployee = Math.round((basis * ZUS_RATES.chorobowa.employee) / 100 * 100) / 100;
    const wypadkowaEmployer = Math.round((basis * ZUS_RATES.wypadkowa.employer) / 100 * 100) / 100;
    const zdrowotnaEmployee = Math.round((basis * ZUS_RATES.zdrowotna.employee) / 100 * 100) / 100;
    const zdrowotnaDeductible = Math.round((basis * ZUS_RATES.zdrowotna.deductible) / 100 * 100) / 100;
    const fpEmployee = Math.round((basis * ZUS_RATES.fp.employer) / 100 * 100) / 100;
    const fgspEmployee = Math.round((basis * ZUS_RATES.fgsp.employer) / 100 * 100) / 100;

    const totalEmployer = emerytalnaEmployer + rentowaEmployer + wypadkowaEmployer + fpEmployee + fgspEmployee;
    const totalEmployee = emerytalnaEmployee + rentowaEmployee + chorobowaEmployee + zdrowotnaEmployee;
    const totalContribution = totalEmployer + totalEmployee;

    return {
      basis,
      emerytalnaEmployer,
      emerytalnaEmployee,
      rentowaEmployer,
      rentowaEmployee,
      chorobowaEmployee,
      wypadkowaEmployer,
      zdrowotnaEmployee,
      zdrowotnaDeductible,
      fpEmployee,
      fgspEmployee,
      totalEmployer,
      totalEmployee,
      totalContribution,
    };
  }

  async calculateEmployeeContributions(tenantId: string, employeeId: string, period: string) {
    const employee = await this.prisma.zUSEmployee.findFirst({
      where: { id: employeeId, tenant_id: tenantId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const calculation = this.calculateContributions(employee.salaryBasis);

    return this.prisma.zUSContribution.create({
      data: {
        tenant_id: tenantId,
        company_id: employee.company_id,
        employee_id: employeeId,
        period,
        contributionDate: new Date(),
        basisEmerytalnaRentowa: calculation.basis,
        basisChorobowa: calculation.basis,
        basisZdrowotna: calculation.basis,
        basisFPFGSP: calculation.basis,
        emerytalnaEmployer: calculation.emerytalnaEmployer,
        emerytalnaEmployee: calculation.emerytalnaEmployee,
        rentowaEmployer: calculation.rentowaEmployer,
        rentowaEmployee: calculation.rentowaEmployee,
        chorobowaEmployee: calculation.chorobowaEmployee,
        wypadkowaEmployer: calculation.wypadkowaEmployer,
        zdrowotnaEmployee: calculation.zdrowotnaEmployee,
        zdrowotnaDeductible: calculation.zdrowotnaDeductible,
        fpEmployee: calculation.fpEmployee,
        fgspEmployee: calculation.fgspEmployee,
      },
    });
  }

  // Registration Forms (ZUA, ZZA, ZWUA)
  async createRegistration(tenantId: string, companyId: string, dto: CreateZUSRegistrationDto) {
    const employee = await this.prisma.zUSEmployee.findFirst({
      where: { id: dto.employeeId, tenant_id: tenantId, company_id: companyId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenant_id: tenantId },
    });

    const formData: ZUSFormData = {
      formType: dto.formType,
      registrationDate: new Date(dto.registrationDate),
      employee: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        pesel: employee.pesel || undefined,
        address: employee.address,
      },
      insuranceTypes: dto.insuranceTypes,
      contributionBasis: dto.contributionBasis,
      company: {
        name: company?.name || '',
        nip: company?.nip || '',
        address: company?.address || '',
      },
    };

    return this.prisma.zUSRegistration.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: dto.employeeId,
        formType: dto.formType,
        registrationDate: new Date(dto.registrationDate),
        insuranceTypes: dto.insuranceTypes,
        contributionBasis: dto.contributionBasis,
        data: formData as any,
      },
    });
  }

  // Monthly/Annual Reports (RCA, RZA, RSA, DRA, RPA)
  async createReport(tenantId: string, companyId: string, dto: CreateZUSReportDto) {
    const employees = await this.prisma.zUSEmployee.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
      include: { zusContributions: true },
    });

    const contributions = await this.prisma.zUSContribution.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: dto.period,
      },
      include: { employee: true },
    });

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenant_id: tenantId },
    });

    const reportData: ZUSReportData = {
      reportType: dto.reportType,
      period: dto.period,
      reportDate: new Date(dto.reportDate),
      company: {
        name: company?.name || '',
        nip: company?.nip || '',
        address: company?.address || '',
      },
      summary: {
        totalEmployees: contributions.length,
        totalContributions: contributions.reduce((sum, c) => sum + c.emerytalnaEmployer + c.emerytalnaEmployee + c.rentowaEmployer + c.rentowaEmployee + c.chorobowaEmployee + c.wypadkowaEmployer + c.zdrowotnaEmployee + c.fpEmployee + c.fgspEmployee, 0),
        totalEmerytalnaEmployer: contributions.reduce((sum, c) => sum + c.emerytalnaEmployer, 0),
        totalEmerytalnaEmployee: contributions.reduce((sum, c) => sum + c.emerytalnaEmployee, 0),
        totalRentowaEmployer: contributions.reduce((sum, c) => sum + c.rentowaEmployer, 0),
        totalRentowaEmployee: contributions.reduce((sum, c) => sum + c.rentowaEmployee, 0),
        totalChorobowaEmployee: contributions.reduce((sum, c) => sum + c.chorobowaEmployee, 0),
        totalWypadkowaEmployer: contributions.reduce((sum, c) => sum + c.wypadkowaEmployer, 0),
        totalZdrowotnaEmployee: contributions.reduce((sum, c) => sum + c.zdrowotnaEmployee, 0),
        totalFPEmployee: contributions.reduce((sum, c) => sum + c.fpEmployee, 0),
        totalFGSPEmployee: contributions.reduce((sum, c) => sum + c.fgspEmployee, 0),
      },
      employees: contributions.map(c => ({
        employeeId: c.employee_id || '',
        firstName: c.employee?.firstName || '',
        lastName: c.employee?.lastName || '',
        pesel: c.employee?.pesel || undefined,
        contributions: {
          emerytalnaEmployer: c.emerytalnaEmployer,
          emerytalnaEmployee: c.emerytalnaEmployee,
          rentowaEmployer: c.rentowaEmployer,
          rentowaEmployee: c.rentowaEmployee,
          chorobowaEmployee: c.chorobowaEmployee,
          wypadkowaEmployer: c.wypadkowaEmployer,
          zdrowotnaEmployee: c.zdrowotnaEmployee,
          fpEmployee: c.fpEmployee,
          fgspEmployee: c.fgspEmployee,
        },
      })),
    };

    return this.prisma.zUSReport.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        reportType: dto.reportType,
        period: dto.period,
        reportDate: new Date(dto.reportDate),
        totalEmployees: reportData.summary.totalEmployees,
        totalContributions: reportData.summary.totalContributions,
        data: reportData as any,
      },
    });
  }

  async getReports(tenantId: string, companyId: string) {
    return this.prisma.zUSReport.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
      include: { contributions: { include: { employee: true } } },
      orderBy: { period: 'desc' },
    });
  }

  async updateRegistration(tenantId: string, registrationId: string, dto: UpdateZUSRegistrationDto) {
    const registration = await this.prisma.zUSRegistration.findFirst({
      where: { id: registrationId, tenant_id: tenantId },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const updateData: any = {};

    if (dto.formType !== undefined) updateData.formType = dto.formType;
    if (dto.registrationDate !== undefined) updateData.registrationDate = new Date(dto.registrationDate);
    if (dto.insuranceTypes !== undefined) updateData.insuranceTypes = dto.insuranceTypes;
    if (dto.contributionBasis !== undefined) updateData.contributionBasis = dto.contributionBasis;
    if (dto.zusReferenceNumber !== undefined) updateData.zusReferenceNumber = dto.zusReferenceNumber;
    if (dto.upoNumber !== undefined) updateData.upoNumber = dto.upoNumber;
    if (dto.upoDate !== undefined) updateData.upoDate = new Date(dto.upoDate);

    return this.prisma.zUSRegistration.update({
      where: { id: registrationId },
      data: updateData,
    });
  }

  async updateReport(tenantId: string, reportId: string, dto: UpdateZUSReportDto) {
    const report = await this.prisma.zUSReport.findFirst({
      where: { id: reportId, tenant_id: tenantId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const updateData: any = {};

    if (dto.reportType !== undefined) updateData.reportType = dto.reportType;
    if (dto.period !== undefined) updateData.period = dto.period;
    if (dto.reportDate !== undefined) updateData.reportDate = new Date(dto.reportDate);
    if (dto.zusReferenceNumber !== undefined) updateData.zusReferenceNumber = dto.zusReferenceNumber;
    if (dto.upoNumber !== undefined) updateData.upoNumber = dto.upoNumber;
    if (dto.upoDate !== undefined) updateData.upoDate = new Date(dto.upoDate);

    return this.prisma.zUSReport.update({
      where: { id: reportId },
      data: updateData,
    });
  }

  async getRegistrations(tenantId: string, companyId: string) {
    return this.prisma.zUSRegistration.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
      include: { employee: true },
      orderBy: { registrationDate: 'desc' },
    });
  }

  async getContributions(tenantId: string, companyId: string, period?: string) {
    const whereClause: any = {
      tenant_id: tenantId,
      company_id: companyId,
    };

    if (period) {
      whereClause.period = period;
    }

    return this.prisma.zUSContribution.findMany({
      where: whereClause,
      include: { employee: true, report: true },
      orderBy: { period: 'desc' },
    });
  }

  // Deadline Management
  getZUSDeadlines() {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    return {
      monthlyReports: {
        // 15th of the following month
        deadline: new Date(currentYear, currentDate.getMonth() + 1, 15),
        description: 'Monthly ZUS reports (RCA, RZA) deadline',
      },
      annualReports: {
        // January 31st of the following year
        deadline: new Date(currentYear + 1, 0, 31),
        description: 'Annual ZUS reports (RSA) deadline',
      },
    };
  }

  // Enhanced Annual Summary for ZUS declarations
  async generateAnnualZUSSummary(tenantId: string, companyId: string, year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const reports = await this.prisma.zUSReport.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        reportDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        contributions: {
          include: { employee: true }
        }
      }
    });

    const totalContributions = reports.reduce((sum, report) => sum + report.totalContributions, 0);
    const totalEmployees = Math.max(...reports.map(r => r.totalEmployees));

    return {
      year,
      totalReports: reports.length,
      totalContributions,
      totalEmployees,
      monthlyBreakdown: reports.map(report => ({
        period: report.period,
        totalContributions: report.totalContributions,
        employeeCount: report.totalEmployees
      })),
      summary: {
        averageMonthlyContributions: totalContributions / reports.length,
        totalEmerytalna: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalEmerytalnaEmployer || 0, 0),
        totalRentowa: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalRentowaEmployer || 0, 0),
        totalChorobowa: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalChorobowaEmployee || 0, 0),
        totalWypadkowa: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalWypadkowaEmployer || 0, 0),
        totalZdrowotna: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalZdrowotnaEmployee || 0, 0),
        totalFP: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalFPEmployee || 0, 0),
        totalFGSP: reports.reduce((sum, r) => sum + (r.data as any)?.summary?.totalFGSPEmployee || 0, 0)
      }
    };
  }

  // JDG ZUS Contribution Tiers

  /**
   * Determine JDG tier based on registration date and annual revenue
   */
  determineJDGTier(registrationDate: Date, annualRevenue?: number): JDGTierType {
    const now = new Date();
    const monthsSinceRegistration = this.monthsBetween(registrationDate, now);

    // First 6 months: ulga na start
    if (monthsSinceRegistration < 6) {
      return 'ulga_na_start';
    }

    // Months 7-30 (6 months ulga + 24 months preferencyjny): ZUS preferencyjny
    if (monthsSinceRegistration < 30) {
      return 'preferencyjny';
    }

    // After preferential period: check Mały ZUS Plus eligibility
    if (annualRevenue !== undefined && annualRevenue < ZUS_REFERENCE_VALUES_2026.malyZusPlusMaxRevenue) {
      return 'maly_zus_plus';
    }

    return 'pelny';
  }

  /**
   * Calculate JDG contributions based on tier
   */
  calculateJDGContributions(
    tier: JDGTierType,
    annualIncome?: number,
  ): ZUSContributionCalculation & { tier: JDGTierType; tierInfo: string; healthBasis: number } {
    const tierConfig = ZUS_JDG_TIERS[tier];
    let socialBasis: number;
    let healthBasis: number;

    switch (tier) {
      case 'ulga_na_start':
        // Only health insurance, no social contributions
        socialBasis = 0;
        healthBasis = ZUS_REFERENCE_VALUES_2026.minimumWage;
        break;

      case 'preferencyjny':
        // 30% of minimum wage as social basis
        socialBasis = ZUS_REFERENCE_VALUES_2026.minBasisPreferencyjny;
        healthBasis = ZUS_REFERENCE_VALUES_2026.minimumWage;
        break;

      case 'maly_zus_plus':
        // Basis proportional to income, within bounds
        if (annualIncome !== undefined) {
          const monthlyIncome = annualIncome / 12;
          const calculatedBasis = monthlyIncome * 0.5; // 50% of avg monthly income
          socialBasis = Math.max(
            ZUS_REFERENCE_VALUES_2026.malyZusPlusMinBasis,
            Math.min(calculatedBasis, ZUS_REFERENCE_VALUES_2026.malyZusPlusMaxBasis),
          );
        } else {
          socialBasis = ZUS_REFERENCE_VALUES_2026.malyZusPlusMinBasis;
        }
        healthBasis = ZUS_REFERENCE_VALUES_2026.minimumWage;
        break;

      case 'pelny':
      default:
        // Full ZUS: 60% of projected average wage
        socialBasis = ZUS_REFERENCE_VALUES_2026.minBasisPelny;
        healthBasis = ZUS_REFERENCE_VALUES_2026.minimumWage;
        break;
    }

    const round = (v: number) => Math.round(v * 100) / 100;

    // Social insurance contributions
    const emerytalnaEmployer = tierConfig.healthOnly ? 0 : round((socialBasis * ZUS_RATES.emerytalna.employer) / 100);
    const emerytalnaEmployee = tierConfig.healthOnly ? 0 : round((socialBasis * ZUS_RATES.emerytalna.employee) / 100);
    const rentowaEmployer = tierConfig.healthOnly ? 0 : round((socialBasis * ZUS_RATES.rentowa.employer) / 100);
    const rentowaEmployee = tierConfig.healthOnly ? 0 : round((socialBasis * ZUS_RATES.rentowa.employee) / 100);
    const chorobowaEmployee = tierConfig.healthOnly ? 0 : round((socialBasis * ZUS_RATES.chorobowa.employee) / 100);
    const wypadkowaEmployer = tierConfig.healthOnly ? 0 : round((socialBasis * ZUS_RATES.wypadkowa.employer) / 100);

    // Health insurance (always applicable)
    const zdrowotnaEmployee = round((healthBasis * ZUS_RATES.zdrowotna.employee) / 100);
    const zdrowotnaDeductible = round((healthBasis * ZUS_RATES.zdrowotna.deductible) / 100);

    // FP + FGSP (exempt for preferential tiers)
    const fpEmployee = tierConfig.fpExempt ? 0 : round((socialBasis * ZUS_RATES.fp.employer) / 100);
    const fgspEmployee = tierConfig.fpExempt ? 0 : round((socialBasis * ZUS_RATES.fgsp.employer) / 100);

    const totalEmployer = emerytalnaEmployer + rentowaEmployer + wypadkowaEmployer + fpEmployee + fgspEmployee;
    const totalEmployee = emerytalnaEmployee + rentowaEmployee + chorobowaEmployee + zdrowotnaEmployee;
    const totalContribution = totalEmployer + totalEmployee;

    return {
      basis: socialBasis,
      healthBasis,
      tier,
      tierInfo: tierConfig.label,
      emerytalnaEmployer,
      emerytalnaEmployee,
      rentowaEmployer,
      rentowaEmployee,
      chorobowaEmployee,
      wypadkowaEmployer,
      zdrowotnaEmployee,
      zdrowotnaDeductible,
      fpEmployee,
      fgspEmployee,
      totalEmployer,
      totalEmployee,
      totalContribution,
    };
  }

  private monthsBetween(start: Date, end: Date): number {
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }

  // Generate XML for ZUS declarations
  generateZUSXML(reportData: any, companyInfo: any, formType: string): string {
    const { period, summary, employees } = reportData;
    const year = period.split('-')[0];
    const month = period.split('-')[1];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Deklaracja xmlns="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2023/06/16/eD/DEKLARACJA/">
  <Naglowek>
    <KodFormularzaDekl>${formType}</KodFormularzaDekl>
    <WariantFormularzaDekl>1</WariantFormularzaDekl>
    <Version>${year}${month}01</Version>
    <DataWytworzeniaDekl>${new Date().toISOString().split('T')[0]}</DataWytworzeniaDekl>
    <NazwaSystemu>Fiskario</NazwaSystemu>
  </Naglowek>
  <Podmiot1>
    <NIP>${companyInfo.nip}</NIP>
    <PelnaNazwa>${companyInfo.name}</PelnaNazwa>
    <REGON>${companyInfo.regon || ''}</REGON>
    <DataPowstania>${companyInfo.establishmentDate || ''}</DataPowstania>
  </Podmiot1>
  <PozycjeSzczegolowe>
    <P_1>${summary.totalEmployees}</P_1>
    <P_2>${Math.round(summary.totalEmerytalnaEmployer)}</P_2>
    <P_3>${Math.round(summary.totalEmerytalnaEmployee)}</P_3>
    <P_4>${Math.round(summary.totalRentowaEmployer)}</P_4>
    <P_5>${Math.round(summary.totalRentowaEmployee)}</P_5>
    <P_6>${Math.round(summary.totalChorobowaEmployee)}</P_6>
    <P_7>${Math.round(summary.totalWypadkowaEmployer)}</P_7>
    <P_8>${Math.round(summary.totalZdrowotnaEmployee)}</P_8>
    <P_9>${Math.round(summary.totalFPEmployee)}</P_9>
    <P_10>${Math.round(summary.totalFGSPEmployee)}</P_10>
    <P_11>${Math.round(summary.totalContributions)}</P_11>
  </PozycjeSzczegolowe>
</Deklaracja>`;

    return xml;
  }
}