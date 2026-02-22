import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateEmploymentIncomeDto,
  UpdateEmploymentIncomeDto,
} from '../dto/annual-tax.dto';

@Injectable()
export class EmploymentIncomeService {
  private readonly logger = new Logger(EmploymentIncomeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new employment income record (PIT-11 data).
   * Enforces unique constraint: [tenant_id, user_id, year, employerNip].
   */
  async create(
    tenantId: string,
    companyId: string,
    userId: string,
    dto: CreateEmploymentIncomeDto,
  ) {
    this.logger.log(
      `Creating employment income for user ${userId}, year ${dto.year}, employer NIP ${dto.employerNip}`,
    );

    // Check for duplicate
    const existing = await this.prisma.employmentIncome.findUnique({
      where: {
        tenant_id_user_id_year_employerNip: {
          tenant_id: tenantId,
          user_id: userId,
          year: dto.year,
          employerNip: dto.employerNip,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Employment income for employer NIP ${dto.employerNip} in year ${dto.year} already exists. Use PUT to update.`,
      );
    }

    return this.prisma.employmentIncome.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        year: dto.year,
        employerName: dto.employerName,
        employerNip: dto.employerNip,
        employerAddress: dto.employerAddress || null,
        grossIncome: dto.grossIncome,
        taxDeductibleCosts: dto.taxDeductibleCosts,
        netIncome: dto.netIncome,
        taxAdvancePaid: dto.taxAdvancePaid,
        zusEmerytalnaEmpl: dto.zusEmerytalnaEmpl || 0,
        zusRentowaEmpl: dto.zusRentowaEmpl || 0,
        zusChorobowaEmpl: dto.zusChorobowaEmpl || 0,
        zusHealthEmpl: dto.zusHealthEmpl || 0,
        pitFormNumber: dto.pitFormNumber || 'PIT-11',
        sourceMethod: dto.sourceMethod || 'MANUAL',
        documentUrl: dto.documentUrl || null,
      },
    });
  }

  /**
   * List employment income records for a user in a given year.
   */
  async list(tenantId: string, companyId: string, userId: string, year: number) {
    const records = await this.prisma.employmentIncome.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        year,
      },
      orderBy: { employerName: 'asc' },
    });

    // Calculate aggregated summary
    const summary = records.reduce(
      (acc, r) => ({
        totalGrossIncome: acc.totalGrossIncome + r.grossIncome,
        totalTaxDeductibleCosts: acc.totalTaxDeductibleCosts + r.taxDeductibleCosts,
        totalNetIncome: acc.totalNetIncome + r.netIncome,
        totalTaxAdvancePaid: acc.totalTaxAdvancePaid + r.taxAdvancePaid,
        totalZusSocial:
          acc.totalZusSocial +
          r.zusEmerytalnaEmpl +
          r.zusRentowaEmpl +
          r.zusChorobowaEmpl,
        totalZusHealth: acc.totalZusHealth + r.zusHealthEmpl,
      }),
      {
        totalGrossIncome: 0,
        totalTaxDeductibleCosts: 0,
        totalNetIncome: 0,
        totalTaxAdvancePaid: 0,
        totalZusSocial: 0,
        totalZusHealth: 0,
      },
    );

    return {
      records,
      count: records.length,
      year,
      summary,
    };
  }

  /**
   * Get a single employment income record by ID.
   */
  async getById(tenantId: string, companyId: string, incomeId: string) {
    const record = await this.prisma.employmentIncome.findFirst({
      where: {
        id: incomeId,
        tenant_id: tenantId,
        company_id: companyId,
      },
    });

    if (!record) {
      throw new NotFoundException(`Employment income record ${incomeId} not found`);
    }

    return record;
  }

  /**
   * Update an employment income record.
   */
  async update(
    tenantId: string,
    companyId: string,
    incomeId: string,
    dto: UpdateEmploymentIncomeDto,
  ) {
    await this.getById(tenantId, companyId, incomeId); // Throws if not found

    this.logger.log(`Updating employment income ${incomeId}`);

    return this.prisma.employmentIncome.update({
      where: { id: incomeId },
      data: {
        ...(dto.employerName !== undefined && { employerName: dto.employerName }),
        ...(dto.employerAddress !== undefined && { employerAddress: dto.employerAddress }),
        ...(dto.grossIncome !== undefined && { grossIncome: dto.grossIncome }),
        ...(dto.taxDeductibleCosts !== undefined && {
          taxDeductibleCosts: dto.taxDeductibleCosts,
        }),
        ...(dto.netIncome !== undefined && { netIncome: dto.netIncome }),
        ...(dto.taxAdvancePaid !== undefined && { taxAdvancePaid: dto.taxAdvancePaid }),
        ...(dto.zusEmerytalnaEmpl !== undefined && {
          zusEmerytalnaEmpl: dto.zusEmerytalnaEmpl,
        }),
        ...(dto.zusRentowaEmpl !== undefined && { zusRentowaEmpl: dto.zusRentowaEmpl }),
        ...(dto.zusChorobowaEmpl !== undefined && {
          zusChorobowaEmpl: dto.zusChorobowaEmpl,
        }),
        ...(dto.zusHealthEmpl !== undefined && { zusHealthEmpl: dto.zusHealthEmpl }),
        ...(dto.pitFormNumber !== undefined && { pitFormNumber: dto.pitFormNumber }),
        ...(dto.sourceMethod !== undefined && { sourceMethod: dto.sourceMethod }),
        ...(dto.documentUrl !== undefined && { documentUrl: dto.documentUrl }),
      },
    });
  }

  /**
   * Delete an employment income record.
   */
  async delete(tenantId: string, companyId: string, incomeId: string) {
    await this.getById(tenantId, companyId, incomeId); // Throws if not found

    this.logger.log(`Deleting employment income ${incomeId}`);

    await this.prisma.employmentIncome.delete({
      where: { id: incomeId },
    });
  }

  /**
   * Get aggregated employment data for tax calculation.
   * Returns combined totals from all PIT-11 records for a user in a given year.
   */
  async getAggregatedForTax(
    tenantId: string,
    companyId: string,
    userId: string,
    year: number,
  ): Promise<{
    employmentIncome: number;
    employmentCosts: number;
    employmentProfit: number;
    employmentTaxPaid: number;
    zusSocial: number;
    zusHealth: number;
  }> {
    const records = await this.prisma.employmentIncome.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        year,
      },
    });

    const result = records.reduce(
      (acc, r) => ({
        employmentIncome: acc.employmentIncome + r.grossIncome,
        employmentCosts: acc.employmentCosts + r.taxDeductibleCosts,
        employmentProfit: acc.employmentProfit + r.netIncome,
        employmentTaxPaid: acc.employmentTaxPaid + r.taxAdvancePaid,
        zusSocial:
          acc.zusSocial +
          r.zusEmerytalnaEmpl +
          r.zusRentowaEmpl +
          r.zusChorobowaEmpl,
        zusHealth: acc.zusHealth + r.zusHealthEmpl,
      }),
      {
        employmentIncome: 0,
        employmentCosts: 0,
        employmentProfit: 0,
        employmentTaxPaid: 0,
        zusSocial: 0,
        zusHealth: 0,
      },
    );

    return result;
  }
}
