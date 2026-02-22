import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZusService } from './zus.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZUSEmployeeDto, UpdateZUSEmployeeDto } from './dto/zus-employee.dto';
import { CreateZUSRegistrationDto, UpdateZUSRegistrationDto } from './dto/zus-registration.dto';
import { CreateZUSReportDto, UpdateZUSReportDto } from './dto/zus-report.dto';

@Controller('zus')
@UseGuards(JwtAuthGuard)
export class ZusController {
  constructor(
    private readonly zusService: ZusService,
    private readonly prisma: PrismaService
  ) {}

  // Employee Management Endpoints
  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(@Request() req, @Body() dto: CreateZUSEmployeeDto) {
    return this.zusService.createEmployee(req.user.tenant_id, req.user.company_id, dto);
  }

  @Get('employees')
  async getEmployees(@Request() req) {
    return this.zusService.getEmployees(req.user.tenant_id, req.user.company_id);
  }

  @Put('employees/:employeeId')
  async updateEmployee(
    @Request() req,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateZUSEmployeeDto,
  ) {
    return this.zusService.updateEmployee(req.user.tenant_id, employeeId, dto);
  }

  // Registration Forms Endpoints (ZUA, ZZA, ZWUA)
  @Post('registrations')
  @HttpCode(HttpStatus.CREATED)
  async createRegistration(@Request() req, @Body() dto: CreateZUSRegistrationDto) {
    return this.zusService.createRegistration(req.user.tenant_id, req.user.company_id, dto);
  }

  @Get('registrations')
  async getRegistrations(@Request() req) {
    return this.zusService.getRegistrations(req.user.tenant_id, req.user.company_id);
  }

  @Put('registrations/:registrationId')
  async updateRegistration(
    @Request() req,
    @Param('registrationId') registrationId: string,
    @Body() dto: UpdateZUSRegistrationDto,
  ) {
    return this.zusService.updateRegistration(req.user.tenant_id, registrationId, dto);
  }

  // Monthly/Annual Reports Endpoints (RCA, RZA, RSA, DRA, RPA)
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  async createReport(@Request() req, @Body() dto: CreateZUSReportDto) {
    return this.zusService.createReport(req.user.tenant_id, req.user.company_id, dto);
  }

  @Get('reports')
  async getReports(@Request() req) {
    return this.zusService.getReports(req.user.tenant_id, req.user.company_id);
  }

  @Put('reports/:reportId')
  async updateReport(
    @Request() req,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateZUSReportDto,
  ) {
    return this.zusService.updateReport(req.user.tenant_id, reportId, dto);
  }

  // Contribution Calculations
  @Post('contributions/calculate/:employeeId')
  @HttpCode(HttpStatus.CREATED)
  async calculateEmployeeContributions(
    @Request() req,
    @Param('employeeId') employeeId: string,
    @Query('period') period: string,
  ) {
    return this.zusService.calculateEmployeeContributions(req.user.tenant_id, employeeId, period);
  }

  @Get('contributions')
  async getContributions(@Request() req, @Query('period') period?: string) {
    return this.zusService.getContributions(req.user.tenant_id, req.user.company_id, period);
  }

  // Deadline Information
  @Get('deadlines')
  async getDeadlines() {
    return this.zusService.getZUSDeadlines();
  }

  // Bulk Operations
  @Post('reports/generate-monthly')
  @HttpCode(HttpStatus.CREATED)
  async generateMonthlyReports(@Request() req, @Query('period') period: string) {
    // Generate monthly reports for all employees
    const employees = await this.zusService.getEmployees(req.user.tenant_id, req.user.company_id);

    const results: Array<{employeeId: string, success: boolean, contribution?: any, error?: string}> = [];
    for (const employee of employees) {
      try {
        const contribution = await this.zusService.calculateEmployeeContributions(
          req.user.tenant_id,
          employee.id,
          period,
        );
        results.push({ employeeId: employee.id, success: true, contribution });
      } catch (error) {
        results.push({ employeeId: employee.id, success: false, error: error.message });
      }
    }

    return {
      message: `Processed ${employees.length} employees`,
      results,
    };
  }

  @Post('reports/generate-annual')
  @HttpCode(HttpStatus.CREATED)
  async generateAnnualReport(@Request() req, @Query('year') year: string) {
    // Generate annual report by aggregating monthly data
    const period = `${year}-12`; // December of the given year

    return this.zusService.createReport(req.user.tenant_id, req.user.company_id, {
      reportType: 'RSA',
      period,
      reportDate: new Date().toISOString(),
    });
  }

  // Enhanced Annual Summary
  @Post('annual-summary')
  async generateAnnualSummary(@Request() req, @Body() body: { year: number }) {
    try {
      const { year } = body;
      const summary = await this.zusService.generateAnnualZUSSummary(
        req.user.tenant_id,
        req.user.company_id,
        year
      );

      return {
        success: true,
        data: summary,
        message: `Annual ZUS summary generated for year ${year}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to generate annual ZUS summary',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Generate ZUS XML declaration
  @Post('generate-xml')
  async generateZUSXML(@Request() req, @Body() body: { reportId: string, formType: string }) {
    try {
      const { reportId, formType } = body;

      const report = await this.prisma.zUSReport.findFirst({
        where: {
          id: reportId,
          tenant_id: req.user.tenant_id
        }
      });

      if (!report) {
        throw new NotFoundException('ZUS report not found');
      }

      // Get company info
      const company = await this.getCompanyInfo(req.user.tenant_id, req.user.company_id);

      const xmlContent = this.zusService.generateZUSXML(report.data, company, formType);

      return {
        success: true,
        data: {
          xmlContent,
          formType,
          period: report.period,
          fileName: `${formType}_${report.period}_${company.nip}.xml`
        },
        message: `ZUS XML generated successfully for ${formType}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to generate ZUS XML',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // JDG ZUS Contribution Tiers
  @Post(':companyId/jdg-contributions')
  async calculateJDGContributions(
    @Request() req,
    @Param('companyId') companyId: string,
    @Body() body: {
      registrationDate: string;
      annualRevenue?: number;
      annualIncome?: number;
      forceTier?: string;
    },
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const registrationDate = new Date(body.registrationDate);

      // Determine tier (or use forced tier)
      const tier = body.forceTier
        ? (body.forceTier as any)
        : this.zusService.determineJDGTier(registrationDate, body.annualRevenue);

      const calculation = this.zusService.calculateJDGContributions(tier, body.annualIncome);

      return {
        success: true,
        data: {
          ...calculation,
          companyId,
          registrationDate: body.registrationDate,
          annualRevenue: body.annualRevenue,
          annualIncome: body.annualIncome,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate JDG contributions',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':companyId/jdg-tiers')
  async getJDGTiers() {
    const { ZUS_JDG_TIERS } = require('./dto/zus-contribution.dto');
    return {
      success: true,
      data: ZUS_JDG_TIERS,
    };
  }

  private async getCompanyInfo(tenantId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenant_id: tenantId },
    });
    return {
      nip: company?.nip || '',
      name: company?.name || 'Brak danych firmy',
      regon: company?.regon || '',
    };
  }
}