import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * DepreciationService handles the core depreciation calculation logic
 * for Polish fixed asset depreciation methods.
 *
 * Supported methods:
 * - LINEAR (liniowa): monthlyAmount = (initialValue * annualRate / 100) / 12
 * - DEGRESSIVE (degresywna): First year uses doubled rate on decreasing basis,
 *   switches to linear when linear amount exceeds degressive amount
 * - ONE_TIME (jednorazowa): Full depreciation in month of activation (assets up to 10,000 PLN)
 */
@Injectable()
export class DepreciationService {
  private readonly logger = new Logger(DepreciationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate monthly depreciation for a single asset.
   * Creates a DepreciationEntry and updates the asset's totalDepreciation and currentValue.
   */
  async calculateMonthlyDepreciation(
    tenantId: string,
    companyId: string,
    assetId: string,
    year: number,
    month: number,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenant_id: tenantId, company_id: companyId },
      include: { depreciationEntries: { orderBy: [{ year: 'asc' }, { month: 'asc' }] } },
    });

    if (!asset) {
      throw new BadRequestException(`Srodek trwaly ${assetId} nie zostal znaleziony`);
    }

    if (asset.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Srodek trwaly "${asset.name}" nie jest aktywny (status: ${asset.status})`,
      );
    }

    if (asset.isFullyDepreciated) {
      throw new BadRequestException(
        `Srodek trwaly "${asset.name}" jest juz w pelni zamortyzowany`,
      );
    }

    // Check if depreciation for this month already exists
    const existingEntry = await this.prisma.depreciationEntry.findUnique({
      where: { asset_id_month_year: { asset_id: assetId, month, year } },
    });

    if (existingEntry) {
      this.logger.warn(
        `Odpis amortyzacyjny za ${month}/${year} juz istnieje dla srodka ${asset.name}`,
      );
      return existingEntry;
    }

    // Verify the period is valid for depreciation
    const activationDate = new Date(asset.activationDate);
    const periodDate = new Date(year, month - 1, 1);
    // Depreciation starts from the month AFTER activation
    const firstDepreciationMonth = new Date(
      activationDate.getFullYear(),
      activationDate.getMonth() + 1,
      1,
    );

    // For ONE_TIME method, depreciation is in the month of activation
    if (asset.depreciationMethod === 'ONE_TIME') {
      const activationMonth = activationDate.getMonth() + 1;
      const activationYear = activationDate.getFullYear();
      if (month !== activationMonth || year !== activationYear) {
        throw new BadRequestException(
          `Amortyzacja jednorazowa dotyczy tylko miesiaca przyjecia do uzywania (${activationMonth}/${activationYear})`,
        );
      }
    } else {
      if (periodDate < firstDepreciationMonth) {
        throw new BadRequestException(
          `Amortyzacja rozpoczyna sie od miesiaca nastepujacego po przyjęciu do uzywania (${firstDepreciationMonth.getMonth() + 1}/${firstDepreciationMonth.getFullYear()})`,
        );
      }
    }

    // Check deactivation date
    if (asset.deactivationDate) {
      const deactivationDate = new Date(asset.deactivationDate);
      if (periodDate > deactivationDate) {
        throw new BadRequestException(
          `Srodek trwaly zostal wycofany w ${deactivationDate.getMonth() + 1}/${deactivationDate.getFullYear()}`,
        );
      }
    }

    // Calculate depreciation amount
    const depreciationBasis = asset.initialValue + asset.improvementValue;
    const remainingToDepreciate = depreciationBasis - asset.salvageValue - asset.totalDepreciation;

    if (remainingToDepreciate <= 0) {
      // Mark as fully depreciated
      await this.prisma.fixedAsset.update({
        where: { id: assetId },
        data: { isFullyDepreciated: true },
      });
      throw new BadRequestException(
        `Srodek trwaly "${asset.name}" jest juz w pelni zamortyzowany`,
      );
    }

    let amount = this.calculateAmount(
      asset.depreciationMethod,
      depreciationBasis,
      asset.annualRate,
      asset.totalDepreciation,
      asset.salvageValue,
      year,
      month,
      asset.activationDate,
      asset.depreciationEntries,
    );

    // Ensure we don't depreciate below salvage value
    if (amount > remainingToDepreciate) {
      amount = remainingToDepreciate;
    }

    // Round to 2 decimal places (grosze)
    amount = Math.round(amount * 100) / 100;

    if (amount <= 0) {
      throw new BadRequestException(
        `Obliczona kwota odpisu amortyzacyjnego wynosi 0 PLN`,
      );
    }

    const newTotalDepreciation = Math.round((asset.totalDepreciation + amount) * 100) / 100;
    const newCurrentValue = Math.round((depreciationBasis - newTotalDepreciation) * 100) / 100;
    const isFullyDepreciated = newTotalDepreciation >= depreciationBasis - asset.salvageValue;

    // Create entry and update asset in a transaction
    const [entry] = await this.prisma.$transaction([
      this.prisma.depreciationEntry.create({
        data: {
          tenant_id: tenantId,
          company_id: companyId,
          asset_id: assetId,
          month,
          year,
          amount,
          cumulativeAmount: newTotalDepreciation,
          remainingValue: newCurrentValue,
          method: asset.depreciationMethod,
          rate: asset.annualRate,
          basis: depreciationBasis,
          isBooked: false,
        },
      }),
      this.prisma.fixedAsset.update({
        where: { id: assetId },
        data: {
          totalDepreciation: newTotalDepreciation,
          currentValue: newCurrentValue,
          isFullyDepreciated,
        },
      }),
    ]);

    this.logger.log(
      `Naliczono amortyzacje ${amount} PLN za ${month}/${year} dla "${asset.name}"`,
    );

    return entry;
  }

  /**
   * Calculate depreciation amount based on method.
   */
  private calculateAmount(
    method: string,
    depreciationBasis: number,
    annualRate: number,
    totalDepreciation: number,
    salvageValue: number,
    year: number,
    month: number,
    activationDate: Date,
    existingEntries: any[],
  ): number {
    switch (method) {
      case 'LINEAR':
        return this.calculateLinear(depreciationBasis, annualRate);

      case 'DEGRESSIVE':
        return this.calculateDegressive(
          depreciationBasis,
          annualRate,
          totalDepreciation,
          salvageValue,
          year,
          month,
          activationDate,
          existingEntries,
        );

      case 'ONE_TIME':
        return this.calculateOneTime(depreciationBasis, salvageValue);

      default:
        throw new BadRequestException(`Nieznana metoda amortyzacji: ${method}`);
    }
  }

  /**
   * LINEAR depreciation: monthlyAmount = (basis * annualRate / 100) / 12
   */
  private calculateLinear(depreciationBasis: number, annualRate: number): number {
    const annualAmount = depreciationBasis * (annualRate / 100);
    return annualAmount / 12;
  }

  /**
   * DEGRESSIVE depreciation (metoda degresywna / metoda malejacego salda):
   * - Uses a coefficient (wspolczynnik) of 2.0 applied to the annual rate
   * - Calculated on the decreasing net book value (wartosc netto)
   * - When the degressive monthly amount falls below the linear monthly amount,
   *   the method switches to linear for the remaining useful life
   */
  private calculateDegressive(
    depreciationBasis: number,
    annualRate: number,
    totalDepreciation: number,
    salvageValue: number,
    year: number,
    month: number,
    activationDate: Date,
    existingEntries: any[],
  ): number {
    const coefficient = 2.0; // Polish tax law coefficient for degressive method
    const degressiveRate = annualRate * coefficient;

    // Net book value at start of this year
    const entriesBeforeThisYear = existingEntries.filter((e) => e.year < year);
    const depreciationBeforeThisYear = entriesBeforeThisYear.reduce(
      (sum: number, e: any) => sum + e.amount,
      0,
    );
    const netValueStartOfYear = depreciationBasis - depreciationBeforeThisYear;

    // Degressive monthly amount based on net value at start of year
    const degressiveAnnual = netValueStartOfYear * (degressiveRate / 100);
    const degressiveMonthly = degressiveAnnual / 12;

    // Linear monthly amount (based on original basis)
    const linearMonthly = this.calculateLinear(depreciationBasis, annualRate);

    // Switch to linear when linear amount exceeds degressive amount
    if (linearMonthly >= degressiveMonthly) {
      return linearMonthly;
    }

    return degressiveMonthly;
  }

  /**
   * ONE_TIME depreciation (amortyzacja jednorazowa):
   * Full amount in the month of activation.
   * Only for assets with initial value up to 10,000 PLN (de minimis aid).
   */
  private calculateOneTime(depreciationBasis: number, salvageValue: number): number {
    return depreciationBasis - salvageValue;
  }

  /**
   * Calculate full year depreciation for a single asset.
   * Generates entries for all applicable months in the given year.
   */
  async calculateYearlyDepreciation(
    tenantId: string,
    companyId: string,
    assetId: string,
    year: number,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenant_id: tenantId, company_id: companyId },
    });

    if (!asset) {
      throw new BadRequestException(`Srodek trwaly ${assetId} nie zostal znaleziony`);
    }

    const results: any[] = [];
    const activationDate = new Date(asset.activationDate);

    if (asset.depreciationMethod === 'ONE_TIME') {
      // One-time depreciation only happens in activation month
      const activationYear = activationDate.getFullYear();
      if (activationYear === year) {
        try {
          const entry = await this.calculateMonthlyDepreciation(
            tenantId,
            companyId,
            assetId,
            year,
            activationDate.getMonth() + 1,
          );
          results.push(entry);
        } catch (error) {
          this.logger.warn(`Pominieto miesiac aktywacji: ${error.message}`);
        }
      }
      return results;
    }

    // For LINEAR and DEGRESSIVE: iterate through months
    for (let month = 1; month <= 12; month++) {
      try {
        const entry = await this.calculateMonthlyDepreciation(
          tenantId,
          companyId,
          assetId,
          year,
          month,
        );
        results.push(entry);
      } catch (error) {
        // Skip months before activation or after full depreciation
        this.logger.debug(
          `Pominieto ${month}/${year} dla "${asset.name}": ${error.message}`,
        );
      }
    }

    return results;
  }

  /**
   * Generate monthly depreciation for ALL active assets of a company.
   */
  async generateMonthlyDepreciationForAll(
    tenantId: string,
    companyId: string,
    year: number,
    month: number,
  ) {
    const activeAssets = await this.prisma.fixedAsset.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        status: 'ACTIVE',
        isFullyDepreciated: false,
      },
    });

    const results: { assetId: string; assetName: string; amount?: number; error?: string }[] = [];

    for (const asset of activeAssets) {
      try {
        const entry = await this.calculateMonthlyDepreciation(
          tenantId,
          companyId,
          asset.id,
          year,
          month,
        );
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          amount: entry.amount,
        });
      } catch (error) {
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          error: error.message,
        });
      }
    }

    const totalDepreciation = results
      .filter((r) => r.amount)
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    return {
      period: `${month}/${year}`,
      assetsProcessed: results.length,
      successCount: results.filter((r) => r.amount).length,
      errorCount: results.filter((r) => r.error).length,
      totalDepreciation: Math.round(totalDepreciation * 100) / 100,
      details: results,
    };
  }

  /**
   * Get depreciation entries for a specific asset.
   */
  async getDepreciationEntries(
    tenantId: string,
    companyId: string,
    assetId: string,
    filters?: { year?: number; month?: number; isBooked?: boolean; page?: number; limit?: number },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId,
      company_id: companyId,
      asset_id: assetId,
    };

    if (filters?.year) where.year = filters.year;
    if (filters?.month) where.month = filters.month;
    if (filters?.isBooked !== undefined) where.isBooked = filters.isBooked;

    const [entries, total] = await Promise.all([
      this.prisma.depreciationEntry.findMany({
        where,
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.depreciationEntry.count({ where }),
    ]);

    return { entries, total, page, limit };
  }
}
