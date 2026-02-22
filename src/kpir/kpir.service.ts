import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKPiREntryDto, UpdateKPiREntryDto } from './dto/create-kpir-entry.dto';
import { KPiRFiltersDto } from './dto/kpir-filters.dto';
import { KPiRNumberingService } from './services/kpir-numbering.service';

@Injectable()
export class KPiRService {
  private readonly logger = new Logger(KPiRService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: KPiRNumberingService,
  ) {}

  // Create new KPiR entry
  async createEntry(tenantId: string, companyId: string, dto: CreateKPiREntryDto) {
    const entryDate = new Date(dto.entryDate);
    const month = entryDate.getMonth() + 1;
    const year = entryDate.getFullYear();

    const lp = await this.numberingService.getNextNumber(tenantId, companyId, year);

    const totalRevenue = (dto.salesRevenue || 0) + (dto.otherRevenue || 0);
    const totalExpenses = (dto.purchaseCost || 0) + (dto.sideExpenses || 0) + (dto.salaries || 0) + (dto.otherExpenses || 0);

    return this.prisma.kPiREntry.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        lp,
        entryDate,
        documentNumber: dto.documentNumber,
        counterpartyName: dto.counterpartyName || null,
        counterpartyAddress: dto.counterpartyAddress || null,
        description: dto.description,
        salesRevenue: dto.salesRevenue || 0,
        otherRevenue: dto.otherRevenue || 0,
        totalRevenue,
        purchaseCost: dto.purchaseCost || 0,
        sideExpenses: dto.sideExpenses || 0,
        salaries: dto.salaries || 0,
        otherExpenses: dto.otherExpenses || 0,
        totalExpenses,
        otherColumn: dto.otherColumn || null,
        researchCosts: dto.researchCosts || 0,
        comments: dto.comments || null,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId || null,
        month,
        year,
        isCorrection: dto.isCorrection || false,
        correctedEntryId: dto.correctedEntryId || null,
      },
    });
  }

  // Get single entry by ID
  async getEntry(tenantId: string, companyId: string, entryId: string) {
    const entry = await this.prisma.kPiREntry.findFirst({
      where: { id: entryId, tenant_id: tenantId, company_id: companyId },
    });
    if (!entry) throw new NotFoundException('KPiR entry not found');
    return entry;
  }

  // List entries with filters and pagination
  async listEntries(tenantId: string, companyId: string, filters: KPiRFiltersDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId,
      company_id: companyId,
    };

    if (filters.year) where.year = filters.year;
    if (filters.month) where.month = filters.month;
    if (filters.sourceType) where.sourceType = filters.sourceType;

    if (filters.dateFrom || filters.dateTo) {
      where.entryDate = {};
      if (filters.dateFrom) where.entryDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.entryDate.lte = new Date(filters.dateTo);
    }

    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { counterpartyName: { contains: filters.search, mode: 'insensitive' } },
        { documentNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.prisma.kPiREntry.findMany({
        where,
        orderBy: [{ year: 'asc' }, { month: 'asc' }, { lp: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.kPiREntry.count({ where }),
    ]);

    // Calculate summary for filtered results
    const aggregation = await this.prisma.kPiREntry.aggregate({
      where,
      _sum: {
        totalRevenue: true,
        totalExpenses: true,
      },
    });

    const totalRevenue = aggregation._sum.totalRevenue || 0;
    const totalExpenses = aggregation._sum.totalExpenses || 0;

    return {
      entries,
      total,
      page,
      limit,
      summary: {
        totalRevenue,
        totalExpenses,
        income: totalRevenue - totalExpenses,
      },
    };
  }

  // Update entry
  async updateEntry(tenantId: string, companyId: string, entryId: string, dto: UpdateKPiREntryDto) {
    await this.getEntry(tenantId, companyId, entryId); // throws if not found

    const updateData: any = { ...dto };

    if (dto.entryDate) {
      updateData.entryDate = new Date(dto.entryDate);
      updateData.month = updateData.entryDate.getMonth() + 1;
      updateData.year = updateData.entryDate.getFullYear();
    }

    // Recalculate totals if any revenue/cost field changed
    const needsRecalc = dto.salesRevenue !== undefined || dto.otherRevenue !== undefined
      || dto.purchaseCost !== undefined || dto.sideExpenses !== undefined
      || dto.salaries !== undefined || dto.otherExpenses !== undefined;

    if (needsRecalc) {
      const existing = await this.prisma.kPiREntry.findUnique({ where: { id: entryId } });
      const sr = dto.salesRevenue ?? existing!.salesRevenue;
      const or = dto.otherRevenue ?? existing!.otherRevenue;
      const pc = dto.purchaseCost ?? existing!.purchaseCost;
      const se = dto.sideExpenses ?? existing!.sideExpenses;
      const sal = dto.salaries ?? existing!.salaries;
      const oe = dto.otherExpenses ?? existing!.otherExpenses;
      updateData.totalRevenue = sr + or;
      updateData.totalExpenses = pc + se + sal + oe;
    }

    return this.prisma.kPiREntry.update({
      where: { id: entryId },
      data: updateData,
    });
  }

  // Delete entry
  async deleteEntry(tenantId: string, companyId: string, entryId: string) {
    await this.getEntry(tenantId, companyId, entryId);
    return this.prisma.kPiREntry.delete({ where: { id: entryId } });
  }

  // Check if invoice is already booked
  async isInvoiceBooked(tenantId: string, companyId: string, invoiceId: string): Promise<boolean> {
    const count = await this.prisma.kPiREntry.count({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        sourceId: invoiceId,
        sourceType: { in: ['INVOICE_SALES', 'INVOICE_PURCHASE'] },
        isCorrection: false,
      },
    });
    return count > 0;
  }

  // Get entries by source
  async getEntriesBySource(tenantId: string, companyId: string, sourceType: string, sourceId: string) {
    return this.prisma.kPiREntry.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        sourceType,
        sourceId,
      },
      orderBy: { lp: 'asc' },
    });
  }
}
