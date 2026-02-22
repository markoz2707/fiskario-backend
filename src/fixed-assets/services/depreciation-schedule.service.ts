import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * DepreciationScheduleService generates projected depreciation plans (harmonogram amortyzacji)
 * for fixed assets, showing month-by-month anticipated depreciation.
 *
 * This is a read-only projection - it does not create actual DepreciationEntry records.
 * Use DepreciationService.calculateMonthlyDepreciation() to create real entries.
 */

export interface ScheduleEntry {
  month: number;
  year: number;
  amount: number;
  cumulativeAmount: number;
  remainingValue: number;
  method: string;
  rate: number;
}

@Injectable()
export class DepreciationScheduleService {
  private readonly logger = new Logger(DepreciationScheduleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a complete depreciation schedule (plan amortyzacji) for an asset.
   * Returns projected monthly entries from activation until fully depreciated.
   */
  async generateSchedule(
    tenantId: string,
    companyId: string,
    assetId: string,
  ): Promise<{
    asset: {
      id: string;
      name: string;
      inventoryNumber: string;
      initialValue: number;
      improvementValue: number;
      salvageValue: number;
      depreciationMethod: string;
      annualRate: number;
    };
    schedule: ScheduleEntry[];
    summary: {
      totalMonths: number;
      totalDepreciation: number;
      estimatedEndDate: string;
    };
  }> {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenant_id: tenantId, company_id: companyId },
      include: {
        depreciationEntries: {
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
    });

    if (!asset) {
      throw new BadRequestException(`Srodek trwaly ${assetId} nie zostal znaleziony`);
    }

    const depreciationBasis = asset.initialValue + asset.improvementValue;
    const depreciableAmount = depreciationBasis - asset.salvageValue;

    if (depreciableAmount <= 0) {
      return {
        asset: {
          id: asset.id,
          name: asset.name,
          inventoryNumber: asset.inventoryNumber,
          initialValue: asset.initialValue,
          improvementValue: asset.improvementValue,
          salvageValue: asset.salvageValue,
          depreciationMethod: asset.depreciationMethod,
          annualRate: asset.annualRate,
        },
        schedule: [],
        summary: {
          totalMonths: 0,
          totalDepreciation: 0,
          estimatedEndDate: new Date().toISOString().split('T')[0],
        },
      };
    }

    const schedule: ScheduleEntry[] = [];

    switch (asset.depreciationMethod) {
      case 'LINEAR':
        this.generateLinearSchedule(schedule, asset, depreciationBasis, depreciableAmount);
        break;
      case 'DEGRESSIVE':
        this.generateDegressiveSchedule(schedule, asset, depreciationBasis, depreciableAmount);
        break;
      case 'ONE_TIME':
        this.generateOneTimeSchedule(schedule, asset, depreciationBasis, depreciableAmount);
        break;
      default:
        throw new BadRequestException(
          `Nieznana metoda amortyzacji: ${asset.depreciationMethod}`,
        );
    }

    const totalDepreciation = schedule.reduce((sum, entry) => sum + entry.amount, 0);
    const lastEntry = schedule[schedule.length - 1];
    const estimatedEndDate = lastEntry
      ? `${lastEntry.year}-${String(lastEntry.month).padStart(2, '0')}-01`
      : new Date().toISOString().split('T')[0];

    return {
      asset: {
        id: asset.id,
        name: asset.name,
        inventoryNumber: asset.inventoryNumber,
        initialValue: asset.initialValue,
        improvementValue: asset.improvementValue,
        salvageValue: asset.salvageValue,
        depreciationMethod: asset.depreciationMethod,
        annualRate: asset.annualRate,
      },
      schedule,
      summary: {
        totalMonths: schedule.length,
        totalDepreciation: Math.round(totalDepreciation * 100) / 100,
        estimatedEndDate,
      },
    };
  }

  /**
   * Generate LINEAR depreciation schedule.
   * monthlyAmount = (basis * annualRate / 100) / 12
   */
  private generateLinearSchedule(
    schedule: ScheduleEntry[],
    asset: any,
    depreciationBasis: number,
    depreciableAmount: number,
  ): void {
    const activationDate = new Date(asset.activationDate);
    // Depreciation starts from the month after activation
    let currentMonth = activationDate.getMonth() + 2; // +1 for 0-indexed, +1 for next month
    let currentYear = activationDate.getFullYear();

    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }

    const annualAmount = depreciationBasis * (asset.annualRate / 100);
    const monthlyAmount = Math.round((annualAmount / 12) * 100) / 100;

    let cumulativeAmount = 0;
    const maxIterations = 600; // 50 years max safety limit

    for (let i = 0; i < maxIterations; i++) {
      const remaining = depreciableAmount - cumulativeAmount;
      if (remaining <= 0) break;

      const amount = Math.min(monthlyAmount, remaining);
      const roundedAmount = Math.round(amount * 100) / 100;

      if (roundedAmount <= 0) break;

      cumulativeAmount = Math.round((cumulativeAmount + roundedAmount) * 100) / 100;
      const remainingValue = Math.round((depreciationBasis - cumulativeAmount) * 100) / 100;

      schedule.push({
        month: currentMonth,
        year: currentYear,
        amount: roundedAmount,
        cumulativeAmount,
        remainingValue,
        method: 'LINEAR',
        rate: asset.annualRate,
      });

      // Advance to next month
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
  }

  /**
   * Generate DEGRESSIVE depreciation schedule.
   * Uses coefficient of 2.0 on the net book value at start of each year.
   * Switches to linear when linear amount exceeds degressive amount.
   */
  private generateDegressiveSchedule(
    schedule: ScheduleEntry[],
    asset: any,
    depreciationBasis: number,
    depreciableAmount: number,
  ): void {
    const activationDate = new Date(asset.activationDate);
    let currentMonth = activationDate.getMonth() + 2;
    let currentYear = activationDate.getFullYear();

    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }

    const coefficient = 2.0;
    const degressiveRate = asset.annualRate * coefficient;
    const linearMonthly = Math.round(
      ((depreciationBasis * (asset.annualRate / 100)) / 12) * 100,
    ) / 100;

    let cumulativeAmount = 0;
    let yearStartCumulative = 0;
    let trackYear = currentYear;
    const maxIterations = 600;

    for (let i = 0; i < maxIterations; i++) {
      const remaining = depreciableAmount - cumulativeAmount;
      if (remaining <= 0) break;

      // Recalculate at start of each new year
      if (currentYear !== trackYear) {
        yearStartCumulative = cumulativeAmount;
        trackYear = currentYear;
      }

      // Net value at start of this year for degressive calculation
      const netValueStartOfYear = depreciationBasis - yearStartCumulative;
      const degressiveAnnual = netValueStartOfYear * (degressiveRate / 100);
      const degressiveMonthly = Math.round((degressiveAnnual / 12) * 100) / 100;

      // Use the higher of degressive and linear amounts
      const monthlyAmount = degressiveMonthly >= linearMonthly ? degressiveMonthly : linearMonthly;

      const amount = Math.min(monthlyAmount, remaining);
      const roundedAmount = Math.round(amount * 100) / 100;

      if (roundedAmount <= 0) break;

      cumulativeAmount = Math.round((cumulativeAmount + roundedAmount) * 100) / 100;
      const remainingValue = Math.round((depreciationBasis - cumulativeAmount) * 100) / 100;

      schedule.push({
        month: currentMonth,
        year: currentYear,
        amount: roundedAmount,
        cumulativeAmount,
        remainingValue,
        method: degressiveMonthly >= linearMonthly ? 'DEGRESSIVE' : 'LINEAR',
        rate: degressiveMonthly >= linearMonthly ? degressiveRate : asset.annualRate,
      });

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
  }

  /**
   * Generate ONE_TIME depreciation schedule.
   * Full amount in the month of activation.
   */
  private generateOneTimeSchedule(
    schedule: ScheduleEntry[],
    asset: any,
    depreciationBasis: number,
    depreciableAmount: number,
  ): void {
    const activationDate = new Date(asset.activationDate);
    const amount = Math.round(depreciableAmount * 100) / 100;

    schedule.push({
      month: activationDate.getMonth() + 1,
      year: activationDate.getFullYear(),
      amount,
      cumulativeAmount: amount,
      remainingValue: Math.round((depreciationBasis - amount) * 100) / 100,
      method: 'ONE_TIME',
      rate: 100,
    });
  }
}
