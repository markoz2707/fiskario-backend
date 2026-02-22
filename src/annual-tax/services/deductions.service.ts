import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeductionDto, UpdateDeductionDto } from '../dto/annual-tax.dto';
import { getTaxConfig, roundToGrosze } from './tax-config';

@Injectable()
export class DeductionsService {
  private readonly logger = new Logger(DeductionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add a deduction to an annual tax return.
   * Validates deduction type compatibility with form type.
   */
  async create(returnId: string, dto: CreateDeductionDto) {
    // Verify the return exists
    const taxReturn = await this.prisma.annualTaxReturn.findUnique({
      where: { id: returnId },
    });

    if (!taxReturn) {
      throw new NotFoundException(`Annual tax return ${returnId} not found`);
    }

    // Validate deduction compatibility with form type
    this.validateDeductionForFormType(taxReturn.formType, dto);

    // Validate child relief fields
    if (dto.type === 'CHILD_RELIEF') {
      if (!dto.childName) {
        throw new BadRequestException('childName is required for CHILD_RELIEF deduction');
      }
      if (!dto.childPesel) {
        throw new BadRequestException('childPesel is required for CHILD_RELIEF deduction');
      }
      if (!dto.childMonths) {
        throw new BadRequestException('childMonths is required for CHILD_RELIEF deduction');
      }
      // Force category to FROM_TAX for child relief
      dto.category = 'FROM_TAX';
    }

    // Validate and cap amounts per limits
    const config = getTaxConfig(taxReturn.year);
    const cappedAmount = this.capDeductionAmount(dto, config, taxReturn);

    this.logger.log(
      `Creating ${dto.type} deduction for return ${returnId}, amount: ${cappedAmount}`,
    );

    const deduction = await this.prisma.taxDeduction.create({
      data: {
        return_id: returnId,
        type: dto.type,
        category: dto.category,
        description: dto.description,
        amount: cappedAmount,
        documentRef: dto.documentRef || null,
        childName: dto.childName || null,
        childPesel: dto.childPesel || null,
        childMonths: dto.childMonths || null,
      },
    });

    // Recalculate otherDeductions total on the return
    await this.recalculateDeductionTotals(returnId);

    return deduction;
  }

  /**
   * Update a deduction.
   */
  async update(returnId: string, deductionId: string, dto: UpdateDeductionDto) {
    const deduction = await this.prisma.taxDeduction.findFirst({
      where: {
        id: deductionId,
        return_id: returnId,
      },
    });

    if (!deduction) {
      throw new NotFoundException(
        `Deduction ${deductionId} not found for return ${returnId}`,
      );
    }

    this.logger.log(`Updating deduction ${deductionId}`);

    const updated = await this.prisma.taxDeduction.update({
      where: { id: deductionId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.documentRef !== undefined && { documentRef: dto.documentRef }),
        ...(dto.childName !== undefined && { childName: dto.childName }),
        ...(dto.childPesel !== undefined && { childPesel: dto.childPesel }),
        ...(dto.childMonths !== undefined && { childMonths: dto.childMonths }),
      },
    });

    // Recalculate totals
    await this.recalculateDeductionTotals(returnId);

    return updated;
  }

  /**
   * Delete a deduction.
   */
  async delete(returnId: string, deductionId: string) {
    const deduction = await this.prisma.taxDeduction.findFirst({
      where: {
        id: deductionId,
        return_id: returnId,
      },
    });

    if (!deduction) {
      throw new NotFoundException(
        `Deduction ${deductionId} not found for return ${returnId}`,
      );
    }

    this.logger.log(`Deleting deduction ${deductionId}`);

    await this.prisma.taxDeduction.delete({
      where: { id: deductionId },
    });

    // Recalculate totals
    await this.recalculateDeductionTotals(returnId);
  }

  /**
   * Get all deductions for a return, grouped by category.
   */
  async getForReturn(returnId: string) {
    const deductions = await this.prisma.taxDeduction.findMany({
      where: { return_id: returnId },
      orderBy: [{ category: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
    });

    const fromIncome = deductions.filter((d) => d.category === 'FROM_INCOME');
    const fromTax = deductions.filter((d) => d.category === 'FROM_TAX');

    const totalFromIncome = roundToGrosze(
      fromIncome.reduce((sum, d) => sum + d.amount, 0),
    );
    const totalFromTax = roundToGrosze(
      fromTax.reduce((sum, d) => sum + d.amount, 0),
    );

    return {
      deductions,
      fromIncome,
      fromTax,
      totals: {
        fromIncome: totalFromIncome,
        fromTax: totalFromTax,
        total: roundToGrosze(totalFromIncome + totalFromTax),
      },
    };
  }

  /**
   * Get deductions structured for calculation engine.
   */
  async getForCalculation(returnId: string): Promise<{
    fromIncome: Array<{ type: string; amount: number; childMonths?: number }>;
    fromTax: Array<{ type: string; amount: number; childMonths?: number }>;
  }> {
    const deductions = await this.prisma.taxDeduction.findMany({
      where: { return_id: returnId },
    });

    return {
      fromIncome: deductions
        .filter((d) => d.category === 'FROM_INCOME')
        .map((d) => ({
          type: d.type,
          amount: d.amount,
          childMonths: d.childMonths || undefined,
        })),
      fromTax: deductions
        .filter((d) => d.category === 'FROM_TAX')
        .map((d) => ({
          type: d.type,
          amount: d.amount,
          childMonths: d.childMonths || undefined,
        })),
    };
  }

  /**
   * Validate deduction type is compatible with the form type.
   */
  private validateDeductionForFormType(formType: string, dto: CreateDeductionDto) {
    // PIT-36L does not support child relief
    if (formType === 'PIT_36L' && dto.type === 'CHILD_RELIEF') {
      throw new BadRequestException(
        'Child relief (ulga na dzieci) is not available for PIT-36L (podatek liniowy)',
      );
    }

    // PIT-28 does not support child relief
    if (formType === 'PIT_28' && dto.type === 'CHILD_RELIEF') {
      throw new BadRequestException(
        'Child relief (ulga na dzieci) is not available for PIT-28 (ryczalt)',
      );
    }

    // PIT-28 and PIT-36L: health insurance is handled differently (not as a standard deduction)
    if (
      (formType === 'PIT_28' || formType === 'PIT_36L') &&
      dto.type === 'HEALTH_INSURANCE' &&
      dto.category === 'FROM_TAX'
    ) {
      throw new BadRequestException(
        `Health insurance deduction for ${formType} is calculated automatically. Do not add it as a manual deduction.`,
      );
    }
  }

  /**
   * Cap deduction amount based on statutory limits.
   */
  private capDeductionAmount(
    dto: CreateDeductionDto,
    config: ReturnType<typeof getTaxConfig>,
    taxReturn: any,
  ): number {
    let amount = dto.amount;

    switch (dto.type) {
      case 'INTERNET':
        amount = Math.min(amount, config.internetRelief);
        break;
      case 'IKZE':
        amount = Math.min(amount, config.ikzeLimit);
        break;
      case 'THERMOMODERNIZATION':
        amount = Math.min(amount, config.thermomodernizationLimit);
        break;
      case 'CHILD_RELIEF': {
        // Calculate monthly pro-rated amount
        const months = dto.childMonths || 12;
        // Use the highest single-child relief as max per child
        const maxPerChild = config.childRelief.three; // 2700 is the max per child
        amount = Math.min(amount, roundToGrosze((maxPerChild / 12) * months));
        break;
      }
      default:
        // No cap for OTHER, REHABILITATION, etc.
        break;
    }

    return roundToGrosze(amount);
  }

  /**
   * Recalculate and update the otherDeductions, taxCredits fields on the return.
   */
  private async recalculateDeductionTotals(returnId: string) {
    const deductions = await this.prisma.taxDeduction.findMany({
      where: { return_id: returnId },
    });

    const otherDeductions = roundToGrosze(
      deductions
        .filter((d) => d.category === 'FROM_INCOME')
        .reduce((sum, d) => sum + d.amount, 0),
    );

    const taxCredits = roundToGrosze(
      deductions
        .filter((d) => d.category === 'FROM_TAX')
        .reduce((sum, d) => sum + d.amount, 0),
    );

    await this.prisma.annualTaxReturn.update({
      where: { id: returnId },
      data: {
        otherDeductions,
        taxCredits,
      },
    });
  }
}
