import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AnnualTaxService } from './annual-tax.service';
import { EmploymentIncomeService } from './services/employment-income.service';
import { DeductionsService } from './services/deductions.service';
import { XMLExportService } from './services/xml-export.service';
import {
  CreateAnnualReturnDto,
  UpdateAnnualReturnDto,
  ListReturnsQueryDto,
  CreateDeductionDto,
  UpdateDeductionDto,
  CreateEmploymentIncomeDto,
  UpdateEmploymentIncomeDto,
  ListEmploymentIncomeQueryDto,
  CompareFormsDto,
} from './dto/annual-tax.dto';

interface AuthenticatedUser {
  userId: string;
  email: string;
  tenant_id: string;
  company_id?: string;
}

@Controller('annual-tax')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnualTaxController {
  constructor(
    private readonly annualTaxService: AnnualTaxService,
    private readonly employmentIncomeService: EmploymentIncomeService,
    private readonly deductionsService: DeductionsService,
    private readonly xmlExportService: XMLExportService,
  ) {}

  // ============================================================
  // Annual Tax Returns
  // ============================================================

  /**
   * POST /annual-tax/:companyId/returns
   * Create a new annual tax return.
   */
  @Post(':companyId/returns')
  @Roles('user', 'admin')
  async createReturn(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CreateAnnualReturnDto,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.userId;
    return this.annualTaxService.createReturn(tenantId, companyId, userId, dto);
  }

  /**
   * GET /annual-tax/:companyId/returns
   * List annual tax returns with optional filters (year, formType, status).
   */
  @Get(':companyId/returns')
  @Roles('user', 'admin')
  async listReturns(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query() query: ListReturnsQueryDto,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.userId;
    return this.annualTaxService.listReturns(tenantId, companyId, userId, query);
  }

  /**
   * GET /annual-tax/:companyId/returns/:returnId
   * Get a single annual tax return with all deductions.
   */
  @Get(':companyId/returns/:returnId')
  @Roles('user', 'admin')
  async getReturn(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.annualTaxService.getReturn(tenantId, companyId, returnId);
  }

  /**
   * PUT /annual-tax/:companyId/returns/:returnId
   * Update an annual tax return.
   */
  @Put(':companyId/returns/:returnId')
  @Roles('user', 'admin')
  async updateReturn(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
    @Body() dto: UpdateAnnualReturnDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.annualTaxService.updateReturn(tenantId, companyId, returnId, dto);
  }

  /**
   * DELETE /annual-tax/:companyId/returns/:returnId
   * Delete an annual tax return (only DRAFT/READY).
   */
  @Delete(':companyId/returns/:returnId')
  @Roles('user', 'admin')
  async deleteReturn(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
  ) {
    const tenantId = req.user.tenant_id;
    await this.annualTaxService.deleteReturn(tenantId, companyId, returnId);
    return { success: true };
  }

  /**
   * POST /annual-tax/:companyId/returns/:returnId/calculate
   * Calculate tax for a return (triggers PIT-36/36L/28 calculation engine).
   */
  @Post(':companyId/returns/:returnId/calculate')
  @Roles('user', 'admin')
  async calculateTax(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.annualTaxService.calculateTax(tenantId, companyId, returnId);
  }

  /**
   * GET /annual-tax/:companyId/returns/:returnId/summary
   * Get a detailed calculation summary.
   */
  @Get(':companyId/returns/:returnId/summary')
  @Roles('user', 'admin')
  async getSummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.annualTaxService.getSummary(tenantId, companyId, returnId);
  }

  /**
   * POST /annual-tax/:companyId/returns/:returnId/compare
   * Compare tax under alternative forms (PIT-36 vs PIT-36L vs PIT-28).
   */
  @Post(':companyId/returns/:returnId/compare')
  @Roles('user', 'admin')
  async compareWithAlternatives(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
    @Body() dto: CompareFormsDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.annualTaxService.compareWithAlternatives(
      tenantId,
      companyId,
      returnId,
      dto.forms,
    );
  }

  /**
   * POST /annual-tax/:companyId/returns/:returnId/export-xml
   * Export the annual tax return as an XML file conforming to MF schema.
   * Supports PIT-36, PIT-36L, and PIT-28.
   */
  @Post(':companyId/returns/:returnId/export-xml')
  @Roles('user', 'admin')
  async exportToXML(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
  ) {
    const tenantId = req.user.tenant_id;
    // Verify the return belongs to this tenant/company
    await this.annualTaxService.getReturn(tenantId, companyId, returnId);
    const result = await this.xmlExportService.exportToFile(tenantId, returnId);
    return {
      filePath: result.filePath,
      downloadUrl: result.downloadUrl,
    };
  }

  // ============================================================
  // Tax Deductions
  // ============================================================

  /**
   * POST /annual-tax/:companyId/returns/:returnId/deductions
   * Add a deduction to an annual tax return.
   */
  @Post(':companyId/returns/:returnId/deductions')
  @Roles('user', 'admin')
  async addDeduction(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
    @Body() dto: CreateDeductionDto,
  ) {
    // Verify the return belongs to this tenant/company
    const tenantId = req.user.tenant_id;
    await this.annualTaxService.getReturn(tenantId, companyId, returnId);
    return this.deductionsService.create(returnId, dto);
  }

  /**
   * PUT /annual-tax/:companyId/returns/:returnId/deductions/:deductionId
   * Update a deduction.
   */
  @Put(':companyId/returns/:returnId/deductions/:deductionId')
  @Roles('user', 'admin')
  async updateDeduction(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
    @Param('deductionId') deductionId: string,
    @Body() dto: UpdateDeductionDto,
  ) {
    const tenantId = req.user.tenant_id;
    await this.annualTaxService.getReturn(tenantId, companyId, returnId);
    return this.deductionsService.update(returnId, deductionId, dto);
  }

  /**
   * DELETE /annual-tax/:companyId/returns/:returnId/deductions/:deductionId
   * Delete a deduction.
   */
  @Delete(':companyId/returns/:returnId/deductions/:deductionId')
  @Roles('user', 'admin')
  async deleteDeduction(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('returnId') returnId: string,
    @Param('deductionId') deductionId: string,
  ) {
    const tenantId = req.user.tenant_id;
    await this.annualTaxService.getReturn(tenantId, companyId, returnId);
    await this.deductionsService.delete(returnId, deductionId);
    return { success: true };
  }

  // ============================================================
  // Employment Income (PIT-11)
  // ============================================================

  /**
   * POST /annual-tax/:companyId/employment-income
   * Add employment income record (PIT-11 data).
   */
  @Post(':companyId/employment-income')
  @Roles('user', 'admin')
  async addEmploymentIncome(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CreateEmploymentIncomeDto,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.userId;
    return this.employmentIncomeService.create(tenantId, companyId, userId, dto);
  }

  /**
   * GET /annual-tax/:companyId/employment-income?year=
   * List employment income records for a year.
   */
  @Get(':companyId/employment-income')
  @Roles('user', 'admin')
  async listEmploymentIncome(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query() query: ListEmploymentIncomeQueryDto,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.userId;
    return this.employmentIncomeService.list(tenantId, companyId, userId, query.year);
  }

  /**
   * PUT /annual-tax/:companyId/employment-income/:incomeId
   * Update an employment income record.
   */
  @Put(':companyId/employment-income/:incomeId')
  @Roles('user', 'admin')
  async updateEmploymentIncome(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('incomeId') incomeId: string,
    @Body() dto: UpdateEmploymentIncomeDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.employmentIncomeService.update(tenantId, companyId, incomeId, dto);
  }

  /**
   * DELETE /annual-tax/:companyId/employment-income/:incomeId
   * Delete an employment income record.
   */
  @Delete(':companyId/employment-income/:incomeId')
  @Roles('user', 'admin')
  async deleteEmploymentIncome(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('incomeId') incomeId: string,
  ) {
    const tenantId = req.user.tenant_id;
    await this.employmentIncomeService.delete(tenantId, companyId, incomeId);
    return { success: true };
  }
}
