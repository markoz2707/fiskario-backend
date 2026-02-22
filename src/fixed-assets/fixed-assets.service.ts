import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
  FixedAssetFiltersDto,
  KST_GROUPS,
} from './dto/create-fixed-asset.dto';

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new fixed asset (srodek trwaly).
   */
  async createAsset(tenantId: string, companyId: string, dto: CreateFixedAssetDto) {
    // Validate ONE_TIME method for assets up to 10,000 PLN
    if (dto.depreciationMethod === 'ONE_TIME' && dto.initialValue > 10000) {
      throw new BadRequestException(
        'Amortyzacja jednorazowa jest dostepna tylko dla srodkow trwalych o wartosci do 10 000 PLN',
      );
    }

    // Validate KST group 0 and 9 cannot be depreciated
    if (dto.kstGroup && ['0', '9'].includes(dto.kstGroup) && dto.annualRate > 0) {
      throw new BadRequestException(
        `Grupa KST ${dto.kstGroup} (${KST_GROUPS[dto.kstGroup]?.name}) nie podlega amortyzacji (stawka musi wynosic 0%)`,
      );
    }

    // Validate annual rate against KST group typical rates (warning only logged)
    if (dto.kstGroup && KST_GROUPS[dto.kstGroup]) {
      const group = KST_GROUPS[dto.kstGroup];
      if (dto.annualRate > group.maxRate && group.maxRate > 0) {
        this.logger.warn(
          `Stawka ${dto.annualRate}% przekracza typowa stawke dla grupy KST ${dto.kstGroup} (${group.name}): max ${group.maxRate}%`,
        );
      }
    }

    const monthlyRate = dto.annualRate / 12;
    const currentValue = dto.initialValue + (dto.improvementValue || 0);

    return this.prisma.fixedAsset.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        name: dto.name,
        inventoryNumber: dto.inventoryNumber,
        kstCode: dto.kstCode || null,
        kstGroup: dto.kstGroup || null,
        description: dto.description || null,
        acquisitionDate: new Date(dto.acquisitionDate),
        activationDate: new Date(dto.activationDate),
        documentNumber: dto.documentNumber || null,
        sourceInvoiceId: dto.sourceInvoiceId || null,
        initialValue: dto.initialValue,
        currentValue,
        improvementValue: dto.improvementValue || 0,
        salvageValue: dto.salvageValue || 0,
        depreciationMethod: dto.depreciationMethod,
        annualRate: dto.annualRate,
        monthlyRate,
        totalDepreciation: 0,
        isFullyDepreciated: false,
        status: 'ACTIVE',
        category: dto.category || null,
      },
    });
  }

  /**
   * Get a single fixed asset by ID.
   */
  async getAsset(tenantId: string, companyId: string, assetId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenant_id: tenantId, company_id: companyId },
      include: {
        depreciationEntries: {
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
          take: 12, // Last 12 entries
        },
      },
    });

    if (!asset) {
      throw new NotFoundException(`Srodek trwaly ${assetId} nie zostal znaleziony`);
    }

    return asset;
  }

  /**
   * List fixed assets with filters and pagination.
   */
  async listAssets(tenantId: string, companyId: string, filters: FixedAssetFiltersDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId,
      company_id: companyId,
    };

    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = filters.category;
    if (filters.kstGroup) where.kstGroup = filters.kstGroup;
    if (filters.depreciationMethod) where.depreciationMethod = filters.depreciationMethod;
    if (filters.isFullyDepreciated !== undefined) {
      where.isFullyDepreciated = filters.isFullyDepreciated;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { inventoryNumber: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { kstCode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [assets, total] = await Promise.all([
      this.prisma.fixedAsset.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.fixedAsset.count({ where }),
    ]);

    return { assets, total, page, limit };
  }

  /**
   * Update a fixed asset.
   */
  async updateAsset(
    tenantId: string,
    companyId: string,
    assetId: string,
    dto: UpdateFixedAssetDto,
  ) {
    const existing = await this.getAsset(tenantId, companyId, assetId);

    // Prevent changing depreciation method if entries already exist
    if (dto.depreciationMethod && dto.depreciationMethod !== existing.depreciationMethod) {
      const entryCount = await this.prisma.depreciationEntry.count({
        where: { asset_id: assetId },
      });
      if (entryCount > 0) {
        throw new BadRequestException(
          'Nie mozna zmienic metody amortyzacji po naliczeniu odpisow. Usun istniejace odpisy lub utworz nowy srodek trwaly.',
        );
      }
    }

    // Prevent changing initial value if entries already exist
    if (dto.depreciationMethod === 'ONE_TIME') {
      const newValue = existing.initialValue + (dto.improvementValue ?? existing.improvementValue);
      if (newValue > 10000) {
        throw new BadRequestException(
          'Amortyzacja jednorazowa jest dostepna tylko dla srodkow trwalych o wartosci do 10 000 PLN',
        );
      }
    }

    const updateData: any = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.inventoryNumber !== undefined) updateData.inventoryNumber = dto.inventoryNumber;
    if (dto.kstCode !== undefined) updateData.kstCode = dto.kstCode;
    if (dto.kstGroup !== undefined) updateData.kstGroup = dto.kstGroup;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.acquisitionDate !== undefined) updateData.acquisitionDate = new Date(dto.acquisitionDate);
    if (dto.activationDate !== undefined) updateData.activationDate = new Date(dto.activationDate);
    if (dto.deactivationDate !== undefined) updateData.deactivationDate = new Date(dto.deactivationDate);
    if (dto.documentNumber !== undefined) updateData.documentNumber = dto.documentNumber;
    if (dto.sourceInvoiceId !== undefined) updateData.sourceInvoiceId = dto.sourceInvoiceId;
    if (dto.improvementValue !== undefined) {
      updateData.improvementValue = dto.improvementValue;
      // Recalculate current value
      updateData.currentValue =
        existing.initialValue + dto.improvementValue - existing.totalDepreciation;
    }
    if (dto.salvageValue !== undefined) updateData.salvageValue = dto.salvageValue;
    if (dto.depreciationMethod !== undefined) updateData.depreciationMethod = dto.depreciationMethod;
    if (dto.annualRate !== undefined) {
      updateData.annualRate = dto.annualRate;
      updateData.monthlyRate = dto.annualRate / 12;
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      // Set deactivation date if status changes from ACTIVE
      if (dto.status !== 'ACTIVE' && !existing.deactivationDate) {
        updateData.deactivationDate = new Date();
      }
    }
    if (dto.category !== undefined) updateData.category = dto.category;

    return this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: updateData,
    });
  }

  /**
   * Soft delete a fixed asset (set status to LIQUIDATED).
   */
  async deleteAsset(tenantId: string, companyId: string, assetId: string) {
    await this.getAsset(tenantId, companyId, assetId);

    return this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: {
        status: 'LIQUIDATED',
        deactivationDate: new Date(),
      },
    });
  }

  /**
   * Get summary of fixed assets for a company.
   * Includes total values, depreciation totals, and breakdowns by category/KST group.
   */
  async getAssetSummary(tenantId: string, companyId: string) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
    });

    // Overall totals
    const totalInitialValue = assets.reduce((sum, a) => sum + a.initialValue, 0);
    const totalCurrentValue = assets.reduce((sum, a) => sum + a.currentValue, 0);
    const totalDepreciation = assets.reduce((sum, a) => sum + a.totalDepreciation, 0);
    const totalImprovementValue = assets.reduce((sum, a) => sum + a.improvementValue, 0);

    // Counts by status
    const statusCounts = {
      ACTIVE: 0,
      SOLD: 0,
      LIQUIDATED: 0,
      TRANSFERRED: 0,
    };
    assets.forEach((a) => {
      if (statusCounts[a.status] !== undefined) {
        statusCounts[a.status]++;
      }
    });

    // Breakdown by KST group
    const byKstGroup: Record<
      string,
      { group: string; name: string; count: number; initialValue: number; currentValue: number; depreciation: number }
    > = {};

    assets.forEach((a) => {
      const group = a.kstGroup || 'BRAK';
      if (!byKstGroup[group]) {
        byKstGroup[group] = {
          group,
          name: KST_GROUPS[group]?.name || 'Bez grupy KST',
          count: 0,
          initialValue: 0,
          currentValue: 0,
          depreciation: 0,
        };
      }
      byKstGroup[group].count++;
      byKstGroup[group].initialValue += a.initialValue;
      byKstGroup[group].currentValue += a.currentValue;
      byKstGroup[group].depreciation += a.totalDepreciation;
    });

    // Breakdown by category
    const byCategory: Record<
      string,
      { category: string; count: number; initialValue: number; currentValue: number; depreciation: number }
    > = {};

    assets.forEach((a) => {
      const cat = a.category || 'Bez kategorii';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          category: cat,
          count: 0,
          initialValue: 0,
          currentValue: 0,
          depreciation: 0,
        };
      }
      byCategory[cat].count++;
      byCategory[cat].initialValue += a.initialValue;
      byCategory[cat].currentValue += a.currentValue;
      byCategory[cat].depreciation += a.totalDepreciation;
    });

    // Breakdown by depreciation method
    const byMethod: Record<
      string,
      { method: string; count: number; initialValue: number; depreciation: number }
    > = {};

    assets.forEach((a) => {
      const method = a.depreciationMethod;
      if (!byMethod[method]) {
        byMethod[method] = { method, count: 0, initialValue: 0, depreciation: 0 };
      }
      byMethod[method].count++;
      byMethod[method].initialValue += a.initialValue;
      byMethod[method].depreciation += a.totalDepreciation;
    });

    // Fully depreciated count
    const fullyDepreciatedCount = assets.filter((a) => a.isFullyDepreciated).length;

    return {
      totalAssets: assets.length,
      totalInitialValue: Math.round(totalInitialValue * 100) / 100,
      totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
      totalDepreciation: Math.round(totalDepreciation * 100) / 100,
      totalImprovementValue: Math.round(totalImprovementValue * 100) / 100,
      depreciationPercentage:
        totalInitialValue > 0
          ? Math.round((totalDepreciation / totalInitialValue) * 10000) / 100
          : 0,
      statusCounts,
      fullyDepreciatedCount,
      byKstGroup: Object.values(byKstGroup).map((g) => ({
        ...g,
        initialValue: Math.round(g.initialValue * 100) / 100,
        currentValue: Math.round(g.currentValue * 100) / 100,
        depreciation: Math.round(g.depreciation * 100) / 100,
      })),
      byCategory: Object.values(byCategory).map((c) => ({
        ...c,
        initialValue: Math.round(c.initialValue * 100) / 100,
        currentValue: Math.round(c.currentValue * 100) / 100,
        depreciation: Math.round(c.depreciation * 100) / 100,
      })),
      byMethod: Object.values(byMethod).map((m) => ({
        ...m,
        initialValue: Math.round(m.initialValue * 100) / 100,
        depreciation: Math.round(m.depreciation * 100) / 100,
      })),
    };
  }
}
