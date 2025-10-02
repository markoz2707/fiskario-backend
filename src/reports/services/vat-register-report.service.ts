import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VATRegisterReportDto, VATRegisterFiltersDto } from '../dto/vat-register-report.dto';

export interface VATRegisterEntry {
  id: string;
  type: 'sprzedaz' | 'zakup';
  period: string;
  counterpartyName: string;
  counterpartyNIP?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  gtuCode?: string;
  documentType?: string;
}

export interface VATRegisterSummary {
  totalNet: number;
  totalVat: number;
  totalGross: number;
  entryCount: number;
  byVatRate: Record<number, { net: number; vat: number; count: number }>;
  byGTU: Record<string, { net: number; vat: number; count: number }>;
}

@Injectable()
export class VATRegisterReportService {
  private readonly logger = new Logger(VATRegisterReportService.name);

  constructor(private prisma: PrismaService) {}

  async generateReport(
    tenantId: string,
    companyId: string,
    filters: VATRegisterFiltersDto,
  ): Promise<VATRegisterReportDto> {
    try {
      this.logger.log(`Generating VAT register report for tenant ${tenantId}, company ${companyId}`);

      const { startDate, endDate, period } = this.getDateRange(filters);

      // Get VAT register entries
      const entries = await this.getVATRegisterEntries(tenantId, companyId, startDate, endDate, filters);

      // Generate summary
      const summary = this.generateSummary(entries);

      return {
        period,
        filters,
        entries,
        summary,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error generating VAT register report: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getDetailedReport(
    tenantId: string,
    companyId: string,
    filters: VATRegisterFiltersDto,
  ): Promise<{
    sales: VATRegisterEntry[];
    purchases: VATRegisterEntry[];
    summary: {
      sales: VATRegisterSummary;
      purchases: VATRegisterSummary;
      netVat: number; // Sales VAT - Purchase VAT
    };
  }> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get sales entries
    const salesEntries = await this.getVATRegisterEntries(
      tenantId,
      companyId,
      startDate,
      endDate,
      { ...filters, type: 'sprzedaz' }
    );

    // Get purchase entries
    const purchaseEntries = await this.getVATRegisterEntries(
      tenantId,
      companyId,
      startDate,
      endDate,
      { ...filters, type: 'zakup' }
    );

    const salesSummary = this.generateSummary(salesEntries);
    const purchasesSummary = this.generateSummary(purchaseEntries);

    return {
      sales: salesEntries,
      purchases: purchaseEntries,
      summary: {
        sales: salesSummary,
        purchases: purchasesSummary,
        netVat: salesSummary.totalVat - purchasesSummary.totalVat,
      },
    };
  }

  private getDateRange(filters: VATRegisterFiltersDto): { startDate: Date; endDate: Date; period: string } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let period: string;

    if (filters.startDate && filters.endDate) {
      startDate = new Date(filters.startDate);
      endDate = new Date(filters.endDate);
      period = `${filters.startDate}_${filters.endDate}`;
    } else if (filters.period) {
      // Handle specific period format (YYYY-MM)
      const [year, month] = filters.period.split('-').map(Number);
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0); // Last day of month
      period = filters.period;
    } else {
      // Default to current month
      const year = now.getFullYear();
      const month = now.getMonth();
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
      period = `${year}-${(month + 1).toString().padStart(2, '0')}`;
    }

    return { startDate, endDate, period };
  }

  private async getVATRegisterEntries(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
    filters: VATRegisterFiltersDto,
  ): Promise<VATRegisterEntry[]> {
    const whereClause: any = {
      tenant_id: tenantId,
      company_id: companyId,
      invoiceDate: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (filters.type) {
      whereClause.type = filters.type;
    }

    if (filters.vatRate) {
      whereClause.vatRate = filters.vatRate;
    }

    if (filters.gtuCode) {
      whereClause.gtuCode = filters.gtuCode;
    }

    if (filters.counterpartyName) {
      whereClause.counterpartyName = {
        contains: filters.counterpartyName,
        mode: 'insensitive',
      };
    }

    const entries = await this.prisma.vATRegister.findMany({
      where: whereClause,
      orderBy: [
        { invoiceDate: 'desc' },
        { counterpartyName: 'asc' },
      ],
    });

    return entries.map(entry => ({
      id: entry.id,
      type: entry.type as 'sprzedaz' | 'zakup',
      period: entry.period,
      counterpartyName: entry.counterpartyName,
      counterpartyNIP: entry.counterpartyNIP || undefined,
      invoiceNumber: entry.invoiceNumber,
      invoiceDate: entry.invoiceDate,
      netAmount: entry.netAmount,
      vatAmount: entry.vatAmount,
      vatRate: entry.vatRate,
      gtuCode: entry.gtuCode || undefined,
      documentType: entry.documentType || undefined,
    }));
  }

  private generateSummary(entries: VATRegisterEntry[]): VATRegisterSummary {
    const summary: VATRegisterSummary = {
      totalNet: 0,
      totalVat: 0,
      totalGross: 0,
      entryCount: entries.length,
      byVatRate: {},
      byGTU: {},
    };

    for (const entry of entries) {
      summary.totalNet += entry.netAmount;
      summary.totalVat += entry.vatAmount;
      summary.totalGross += entry.netAmount + entry.vatAmount;

      // Group by VAT rate
      if (!summary.byVatRate[entry.vatRate]) {
        summary.byVatRate[entry.vatRate] = { net: 0, vat: 0, count: 0 };
      }
      summary.byVatRate[entry.vatRate].net += entry.netAmount;
      summary.byVatRate[entry.vatRate].vat += entry.vatAmount;
      summary.byVatRate[entry.vatRate].count += 1;

      // Group by GTU code if present
      if (entry.gtuCode) {
        if (!summary.byGTU[entry.gtuCode]) {
          summary.byGTU[entry.gtuCode] = { net: 0, vat: 0, count: 0 };
        }
        summary.byGTU[entry.gtuCode].net += entry.netAmount;
        summary.byGTU[entry.gtuCode].vat += entry.vatAmount;
        summary.byGTU[entry.gtuCode].count += 1;
      }
    }

    return summary;
  }
}