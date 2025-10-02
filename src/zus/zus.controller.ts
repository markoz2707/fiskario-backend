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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZusService } from './zus.service';
import { CreateZUSEmployeeDto, UpdateZUSEmployeeDto } from './dto/zus-employee.dto';
import { CreateZUSRegistrationDto, UpdateZUSRegistrationDto } from './dto/zus-registration.dto';
import { CreateZUSReportDto, UpdateZUSReportDto } from './dto/zus-report.dto';

@Controller('zus')
@UseGuards(JwtAuthGuard)
export class ZusController {
  constructor(private readonly zusService: ZusService) {}

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
    // Implementation for updating registration
    return { message: 'Registration update not implemented yet', registrationId };
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
    // Implementation for updating report
    return { message: 'Report update not implemented yet', reportId };
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
}