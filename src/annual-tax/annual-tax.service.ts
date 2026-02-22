import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PIT36CalculationService } from './services/pit36-calculation.service';
import { PIT36LCalculationService } from './services/pit36l-calculation.service';
import { PIT28CalculationService } from './services/pit28-calculation.service';
import { EmploymentIncomeService } from './services/employment-income.service';
import { DeductionsService } from './services/deductions.service';
import {
  CreateAnnualReturnDto,
  UpdateAnnualReturnDto,
  ListReturnsQueryDto,
  CalculationSummary,
  FormComparison,
} from './dto/annual-tax.dto';
import { getTaxConfig, roundToGrosze } from './services/tax-config';

@Injectable()
export class AnnualTaxService {
  private readonly logger = new Logger(AnnualTaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pit36Service: PIT36CalculationService,
    private readonly pit36lService: PIT36LCalculationService,
    private readonly pit28Service: PIT28CalculationService,
    private readonly employmentIncomeService: EmploymentIncomeService,
    private readonly deductionsService: DeductionsService,
  ) {}

  // ============================================================
  // CRUD operations for AnnualTaxReturn
  // ============================================================

  /**
   * Create a new annual tax return.
   * Enforces unique constraint: [tenant_id, user_id, year, formType].
   */
  async createReturn(
    tenantId: string,
    companyId: string,
    userId: string,
    dto: CreateAnnualReturnDto,
  ) {
    this.logger.log(
      `Creating ${dto.formType} return for year ${dto.year}, user ${userId}`,
    );

    // Check for existing return with same year + formType
    const existing = await this.prisma.annualTaxReturn.findUnique({
      where: {
        tenant_id_user_id_year_formType: {
          tenant_id: tenantId,
          user_id: userId,
          year: dto.year,
          formType: dto.formType,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `A ${dto.formType} return for year ${dto.year} already exists (id: ${existing.id}). Use PUT to update.`,
      );
    }

    // Validate form-specific constraints
    if (dto.formType === 'PIT_36L' && dto.jointFiling) {
      throw new BadRequestException(
        'Joint filing (wspolne rozliczenie) is not available for PIT-36L',
      );
    }
    if (dto.formType === 'PIT_28' && dto.jointFiling) {
      throw new BadRequestException(
        'Joint filing (wspolne rozliczenie) is not available for PIT-28',
      );
    }

    return this.prisma.annualTaxReturn.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        year: dto.year,
        formType: dto.formType,
        businessIncome: dto.businessIncome || 0,
        businessCosts: dto.businessCosts || 0,
        businessProfit: Math.max(0, (dto.businessIncome || 0) - (dto.businessCosts || 0)),
        zusDeduction: dto.zusDeduction || 0,
        healthDeduction: dto.healthDeduction || 0,
        jointFiling: dto.jointFiling || false,
        spouseIncome: dto.spouseIncome || null,
        spouseCosts: dto.spouseCosts || null,
        spouseTaxAdvances: dto.spouseTaxAdvances || null,
        spousePesel: dto.spousePesel || null,
        ryczaltRevenue: dto.ryczaltRevenue || null,
        ryczaltRate: dto.ryczaltRate || null,
        notes: dto.notes || null,
        status: 'DRAFT',
      },
      include: { deductions: true },
    });
  }

  /**
   * List annual tax returns with optional filters.
   */
  async listReturns(
    tenantId: string,
    companyId: string,
    userId: string,
    query: ListReturnsQueryDto,
  ) {
    const where: any = {
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
    };

    if (query.year) where.year = query.year;
    if (query.formType) where.formType = query.formType;
    if (query.status) where.status = query.status;

    const returns = await this.prisma.annualTaxReturn.findMany({
      where,
      include: { deductions: true },
      orderBy: [{ year: 'desc' }, { formType: 'asc' }],
    });

    return {
      returns,
      count: returns.length,
    };
  }

  /**
   * Get a single annual tax return by ID, with all deductions.
   */
  async getReturn(tenantId: string, companyId: string, returnId: string) {
    const taxReturn = await this.prisma.annualTaxReturn.findFirst({
      where: {
        id: returnId,
        tenant_id: tenantId,
        company_id: companyId,
      },
      include: { deductions: true },
    });

    if (!taxReturn) {
      throw new NotFoundException(`Annual tax return ${returnId} not found`);
    }

    return taxReturn;
  }

  /**
   * Update an annual tax return.
   */
  async updateReturn(
    tenantId: string,
    companyId: string,
    returnId: string,
    dto: UpdateAnnualReturnDto,
  ) {
    const existing = await this.getReturn(tenantId, companyId, returnId);

    // Validate status transitions
    if (existing.status === 'SUBMITTED' || existing.status === 'ACCEPTED') {
      if (dto.status !== 'CORRECTED' && dto.status !== undefined) {
        throw new BadRequestException(
          `Cannot modify a ${existing.status} return. Create a correction instead.`,
        );
      }
    }

    // Validate form-specific constraints
    if (existing.formType === 'PIT_36L' && dto.jointFiling) {
      throw new BadRequestException(
        'Joint filing (wspolne rozliczenie) is not available for PIT-36L',
      );
    }

    this.logger.log(`Updating annual tax return ${returnId}`);

    // Recalculate businessProfit if income/costs changed
    const businessIncome =
      dto.businessIncome !== undefined ? dto.businessIncome : existing.businessIncome;
    const businessCosts =
      dto.businessCosts !== undefined ? dto.businessCosts : existing.businessCosts;

    return this.prisma.annualTaxReturn.update({
      where: { id: returnId },
      data: {
        ...(dto.businessIncome !== undefined && { businessIncome: dto.businessIncome }),
        ...(dto.businessCosts !== undefined && { businessCosts: dto.businessCosts }),
        ...((dto.businessIncome !== undefined || dto.businessCosts !== undefined) && {
          businessProfit: Math.max(0, businessIncome - businessCosts),
        }),
        ...(dto.zusDeduction !== undefined && { zusDeduction: dto.zusDeduction }),
        ...(dto.healthDeduction !== undefined && {
          healthDeduction: dto.healthDeduction,
        }),
        ...(dto.otherDeductions !== undefined && {
          otherDeductions: dto.otherDeductions,
        }),
        ...(dto.advancesPaid !== undefined && { advancesPaid: dto.advancesPaid }),
        ...(dto.jointFiling !== undefined && { jointFiling: dto.jointFiling }),
        ...(dto.spouseIncome !== undefined && { spouseIncome: dto.spouseIncome }),
        ...(dto.spouseCosts !== undefined && { spouseCosts: dto.spouseCosts }),
        ...(dto.spouseTaxAdvances !== undefined && {
          spouseTaxAdvances: dto.spouseTaxAdvances,
        }),
        ...(dto.spousePesel !== undefined && { spousePesel: dto.spousePesel }),
        ...(dto.ryczaltRevenue !== undefined && { ryczaltRevenue: dto.ryczaltRevenue }),
        ...(dto.ryczaltRate !== undefined && { ryczaltRate: dto.ryczaltRate }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { deductions: true },
    });
  }

  /**
   * Delete an annual tax return and all associated deductions.
   */
  async deleteReturn(tenantId: string, companyId: string, returnId: string) {
    const existing = await this.getReturn(tenantId, companyId, returnId);

    if (existing.status === 'SUBMITTED' || existing.status === 'ACCEPTED') {
      throw new BadRequestException(
        `Cannot delete a ${existing.status} return. Create a correction instead.`,
      );
    }

    this.logger.log(`Deleting annual tax return ${returnId}`);

    // Deductions cascade-delete via Prisma relation
    await this.prisma.annualTaxReturn.delete({
      where: { id: returnId },
    });
  }

  // ============================================================
  // Tax Calculation
  // ============================================================

  /**
   * Calculate tax for a given return.
   * Dispatches to the appropriate calculation engine based on formType.
   * Auto-populates employment income from PIT-11 records.
   */
  async calculateTax(tenantId: string, companyId: string, returnId: string) {
    const taxReturn = await this.getReturn(tenantId, companyId, returnId);

    this.logger.log(
      `Calculating ${taxReturn.formType} tax for return ${returnId}, year ${taxReturn.year}`,
    );

    // Update status to CALCULATING
    await this.prisma.annualTaxReturn.update({
      where: { id: returnId },
      data: { status: 'CALCULATING' },
    });

    try {
      // Get deductions structured for calculation
      const deductions = await this.deductionsService.getForCalculation(returnId);

      // Get employment data from PIT-11 records
      const employmentData = await this.employmentIncomeService.getAggregatedForTax(
        tenantId,
        companyId,
        taxReturn.user_id,
        taxReturn.year,
      );

      let result: any;

      switch (taxReturn.formType) {
        case 'PIT_36':
          result = await this.calculatePIT36(taxReturn, employmentData, deductions);
          break;
        case 'PIT_36L':
          result = await this.calculatePIT36L(taxReturn, deductions);
          break;
        case 'PIT_28':
          result = await this.calculatePIT28(taxReturn, deductions);
          break;
        default:
          throw new BadRequestException(
            `Unsupported form type: ${taxReturn.formType}`,
          );
      }

      // Update return with calculated values
      const updated = await this.prisma.annualTaxReturn.update({
        where: { id: returnId },
        data: {
          ...result.updateData,
          status: 'READY',
        },
        include: { deductions: true },
      });

      return {
        taxReturn: updated,
        calculation: result.calculation,
      };
    } catch (error) {
      // Reset status on failure
      await this.prisma.annualTaxReturn.update({
        where: { id: returnId },
        data: { status: 'DRAFT' },
      });
      throw error;
    }
  }

  /**
   * Calculate PIT-36 and return update data.
   */
  private async calculatePIT36(
    taxReturn: any,
    employmentData: any,
    deductions: { fromIncome: any[]; fromTax: any[] },
  ) {
    const result = this.pit36Service.calculate({
      year: taxReturn.year,
      businessIncome: taxReturn.businessIncome,
      businessCosts: taxReturn.businessCosts,
      employmentIncome: employmentData.employmentIncome,
      employmentCosts: employmentData.employmentCosts,
      employmentTaxPaid: employmentData.employmentTaxPaid,
      zusDeduction: taxReturn.zusDeduction,
      healthDeduction: taxReturn.healthDeduction,
      advancesPaid: taxReturn.advancesPaid,
      jointFiling: taxReturn.jointFiling,
      spouseIncome: taxReturn.spouseIncome || 0,
      spouseCosts: taxReturn.spouseCosts || 0,
      spouseTaxAdvances: taxReturn.spouseTaxAdvances || 0,
      deductions,
    });

    return {
      calculation: result,
      updateData: {
        employmentIncome: employmentData.employmentIncome,
        employmentCosts: employmentData.employmentCosts,
        employmentProfit: employmentData.employmentProfit,
        employmentTaxPaid: employmentData.employmentTaxPaid,
        businessProfit: result.businessProfit,
        totalIncome: result.totalIncome,
        otherDeductions: result.deductionsFromIncome,
        taxBase: result.taxBase,
        taxCalculated: result.taxCalculated,
        taxCredits: result.taxCredits,
        taxDue: result.taxDue,
        advancesPaid: result.advancesPaid,
        finalAmount: result.finalAmount,
      },
    };
  }

  /**
   * Calculate PIT-36L and return update data.
   */
  private async calculatePIT36L(
    taxReturn: any,
    deductions: { fromIncome: any[]; fromTax: any[] },
  ) {
    const result = this.pit36lService.calculate({
      year: taxReturn.year,
      businessIncome: taxReturn.businessIncome,
      businessCosts: taxReturn.businessCosts,
      zusDeduction: taxReturn.zusDeduction,
      healthInsurancePaid: taxReturn.healthDeduction,
      advancesPaid: taxReturn.advancesPaid,
      deductions: { fromIncome: deductions.fromIncome },
    });

    return {
      calculation: result,
      updateData: {
        businessProfit: result.businessProfit,
        totalIncome: result.totalIncome,
        otherDeductions: result.deductionsFromIncome,
        healthDeduction: result.healthDeduction,
        taxBase: result.taxBase,
        taxCalculated: result.taxCalculated,
        taxCredits: 0, // PIT-36L has no tax credits (ulgi od podatku)
        taxDue: result.taxDue,
        advancesPaid: result.advancesPaid,
        finalAmount: result.finalAmount,
      },
    };
  }

  /**
   * Calculate PIT-28 and return update data.
   */
  private async calculatePIT28(
    taxReturn: any,
    deductions: { fromIncome: any[]; fromTax: any[] },
  ) {
    const result = this.pit28Service.calculate({
      year: taxReturn.year,
      ryczaltRevenue: taxReturn.ryczaltRevenue || 0,
      ryczaltRateType: this.getRyczaltRateType(taxReturn.ryczaltRate),
      ryczaltRate: taxReturn.ryczaltRate || undefined,
      zusDeduction: taxReturn.zusDeduction,
      healthInsurancePaid: taxReturn.healthDeduction,
      advancesPaid: taxReturn.advancesPaid,
      deductions: { fromIncome: deductions.fromIncome },
    });

    return {
      calculation: result,
      updateData: {
        ryczaltRevenue: result.ryczaltRevenue,
        ryczaltRate: result.ryczaltRate,
        ryczaltTax: result.ryczaltTax,
        businessIncome: result.ryczaltRevenue,
        businessCosts: 0, // Ryczalt has no costs
        businessProfit: result.ryczaltRevenue,
        totalIncome: result.ryczaltRevenue,
        otherDeductions: result.otherDeductions,
        healthDeduction: result.healthDeduction,
        taxBase: result.taxBase,
        taxCalculated: result.ryczaltTax,
        taxCredits: 0,
        taxDue: result.taxDue,
        advancesPaid: result.advancesPaid,
        finalAmount: result.finalAmount,
      },
    };
  }

  /**
   * Map ryczalt numeric rate to rate type string.
   */
  private getRyczaltRateType(rate: number | null): string {
    if (!rate) return 'SERVICES';

    const rateMap: Record<number, string> = {
      0.12: 'IT',
      0.15: 'FREE_PROFESSIONS',
      0.085: 'SERVICES',
      0.03: 'TRADE',
      0.055: 'PRODUCTION',
      0.125: 'RENT_HIGH',
    };

    return rateMap[rate] || 'SERVICES';
  }

  // ============================================================
  // Summary & Comparison
  // ============================================================

  /**
   * Get a detailed calculation summary for a return.
   */
  async getSummary(
    tenantId: string,
    companyId: string,
    returnId: string,
  ): Promise<CalculationSummary> {
    const taxReturn = await this.getReturn(tenantId, companyId, returnId);
    const deductionsData = await this.deductionsService.getForReturn(returnId);

    return {
      formType: taxReturn.formType,
      year: taxReturn.year,
      businessIncome: taxReturn.businessIncome,
      businessCosts: taxReturn.businessCosts,
      businessProfit: taxReturn.businessProfit,
      employmentIncome: taxReturn.employmentIncome,
      employmentCosts: taxReturn.employmentCosts,
      employmentProfit: taxReturn.employmentProfit,
      totalIncome: taxReturn.totalIncome,
      zusDeduction: taxReturn.zusDeduction,
      healthDeduction: taxReturn.healthDeduction,
      otherDeductions: taxReturn.otherDeductions,
      taxBase: taxReturn.taxBase,
      taxCalculated: taxReturn.taxCalculated,
      taxCredits: taxReturn.taxCredits,
      taxDue: taxReturn.taxDue,
      advancesPaid: taxReturn.advancesPaid,
      finalAmount: taxReturn.finalAmount,
      jointFiling: taxReturn.jointFiling,
      deductions: {
        fromIncome: deductionsData.fromIncome.map((d) => ({
          type: d.type,
          amount: d.amount,
          description: d.description,
        })),
        fromTax: deductionsData.fromTax.map((d) => ({
          type: d.type,
          amount: d.amount,
          description: d.description,
        })),
      },
    };
  }

  /**
   * Compare the current return's tax form with alternative forms.
   * Calculates what the tax would be under PIT-36, PIT-36L, and PIT-28.
   */
  async compareWithAlternatives(
    tenantId: string,
    companyId: string,
    returnId: string,
    requestedForms?: string[],
  ): Promise<FormComparison[]> {
    const taxReturn = await this.getReturn(tenantId, companyId, returnId);
    const deductions = await this.deductionsService.getForCalculation(returnId);

    const employmentData = await this.employmentIncomeService.getAggregatedForTax(
      tenantId,
      companyId,
      taxReturn.user_id,
      taxReturn.year,
    );

    const formsToCompare = requestedForms || ['PIT_36', 'PIT_36L', 'PIT_28'];
    const comparisons: FormComparison[] = [];

    for (const form of formsToCompare) {
      try {
        const comparison = this.calculateForComparison(
          form,
          taxReturn,
          employmentData,
          deductions,
        );
        comparisons.push(comparison);
      } catch (error) {
        comparisons.push({
          formType: form,
          taxDue: 0,
          finalAmount: 0,
          effectiveRate: 0,
          available: false,
          reason: error instanceof Error ? error.message : 'Calculation error',
        });
      }
    }

    // Sort by finalAmount (lowest tax first)
    comparisons.sort((a, b) => {
      if (!a.available) return 1;
      if (!b.available) return -1;
      return a.finalAmount - b.finalAmount;
    });

    return comparisons;
  }

  /**
   * Calculate tax for a specific form type for comparison purposes.
   */
  private calculateForComparison(
    formType: string,
    taxReturn: any,
    employmentData: any,
    deductions: { fromIncome: any[]; fromTax: any[] },
  ): FormComparison {
    const totalIncome = taxReturn.businessIncome - taxReturn.businessCosts;

    switch (formType) {
      case 'PIT_36': {
        const result = this.pit36Service.calculate({
          year: taxReturn.year,
          businessIncome: taxReturn.businessIncome,
          businessCosts: taxReturn.businessCosts,
          employmentIncome: employmentData.employmentIncome,
          employmentCosts: employmentData.employmentCosts,
          employmentTaxPaid: employmentData.employmentTaxPaid,
          zusDeduction: taxReturn.zusDeduction,
          healthDeduction: taxReturn.healthDeduction,
          advancesPaid: taxReturn.advancesPaid,
          jointFiling: taxReturn.jointFiling,
          spouseIncome: taxReturn.spouseIncome || 0,
          spouseCosts: taxReturn.spouseCosts || 0,
          spouseTaxAdvances: taxReturn.spouseTaxAdvances || 0,
          deductions,
        });
        return {
          formType: 'PIT_36',
          taxDue: result.taxDue,
          finalAmount: result.finalAmount,
          effectiveRate: result.effectiveRate,
          available: true,
        };
      }

      case 'PIT_36L': {
        if (employmentData.employmentIncome > 0) {
          // PIT-36L only covers JDG income; employment must be filed separately
        }
        // Filter out unsupported deductions
        const linearDeductions = {
          fromIncome: deductions.fromIncome.filter(
            (d) => d.type !== 'CHILD_RELIEF',
          ),
        };
        const result = this.pit36lService.calculate({
          year: taxReturn.year,
          businessIncome: taxReturn.businessIncome,
          businessCosts: taxReturn.businessCosts,
          zusDeduction: taxReturn.zusDeduction,
          healthInsurancePaid: taxReturn.healthDeduction,
          advancesPaid: taxReturn.advancesPaid,
          deductions: linearDeductions,
        });
        return {
          formType: 'PIT_36L',
          taxDue: result.taxDue,
          finalAmount: result.finalAmount,
          effectiveRate: result.effectiveRate,
          available: true,
          reason: employmentData.employmentIncome > 0
            ? 'Dochod z etatu nalezy rozliczyc oddzielnie na PIT-37'
            : undefined,
        };
      }

      case 'PIT_28': {
        if (taxReturn.businessCosts > 0) {
          // Ryczalt has no costs - use revenue only
        }
        const result = this.pit28Service.calculate({
          year: taxReturn.year,
          ryczaltRevenue: taxReturn.ryczaltRevenue || taxReturn.businessIncome,
          ryczaltRateType: this.getRyczaltRateType(taxReturn.ryczaltRate),
          ryczaltRate: taxReturn.ryczaltRate || undefined,
          zusDeduction: taxReturn.zusDeduction,
          healthInsurancePaid: taxReturn.healthDeduction,
          advancesPaid: taxReturn.advancesPaid,
          deductions: {
            fromIncome: deductions.fromIncome.filter(
              (d) => d.type !== 'CHILD_RELIEF',
            ),
          },
        });
        return {
          formType: 'PIT_28',
          taxDue: result.taxDue,
          finalAmount: result.finalAmount,
          effectiveRate: result.effectiveRate,
          available: true,
          reason: 'Ryczalt nie uwzglednia kosztow uzyskania przychodu',
        };
      }

      default:
        throw new BadRequestException(`Unknown form type: ${formType}`);
    }
  }
}
