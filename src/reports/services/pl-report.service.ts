import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PLReportDto, PLReportFiltersDto } from '../dto/pl-report.dto';

export interface PLData {
  period: string;
  revenue: {
    total: number;
    sales: number;
    other: number;
  };
  costs: {
    total: number;
    materials: number;
    services: number;
    salaries: number;
    other: number;
  };
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  vat: {
    collected: number;
    paid: number;
    due: number;
  };
}

@Injectable()
export class PLReportService {
  private readonly logger = new Logger(PLReportService.name);

  constructor(private prisma: PrismaService) {}

  async generateReport(
    tenantId: string,
    companyId: string,
    filters: PLReportFiltersDto,
  ): Promise<PLData> {
    try {
      this.logger.log(`Generating P&L report for tenant ${tenantId}, company ${companyId}`);

      // Get date range from filters
      const { startDate, endDate, period } = this.getDateRange(filters);

      // Aggregate revenue data from invoices
      const revenueData = await this.getRevenueData(tenantId, companyId, startDate, endDate);

      // Aggregate cost data from invoices and VAT registers
      const costData = await this.getCostData(tenantId, companyId, startDate, endDate);

      // Get VAT data
      const vatData = await this.getVATData(tenantId, companyId, startDate, endDate);

      // Calculate profits
      const grossProfit = revenueData.total - costData.total;
      const operatingProfit = grossProfit; // Simplified - no depreciation/amortization yet
      const netProfit = operatingProfit - vatData.due;

      return {
        period,
        revenue: revenueData,
        costs: costData,
        grossProfit,
        operatingProfit,
        netProfit,
        vat: vatData,
      };
    } catch (error) {
      this.logger.error(`Error generating P&L report: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getDateRange(filters: PLReportFiltersDto): { startDate: Date; endDate: Date; period: string } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let period: string;

    if (filters.startDate && filters.endDate) {
      startDate = new Date(filters.startDate);
      endDate = new Date(filters.endDate);
      period = `${filters.startDate}_${filters.endDate}`;
    } else {
      // Default to current year
      const year = filters.year || now.getFullYear();
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31);
      period = year.toString();
    }

    return { startDate, endDate, period };
  }

  private async getRevenueData(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ) {
    // Get sales invoices (revenue)
    const salesInvoices = await this.prisma.invoice.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['issued', 'sent'],
        },
      },
      _sum: {
        totalGross: true,
      },
    });

    // Get VAT register sales data for additional revenue validation
    const vatSales = await this.prisma.vATRegister.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        type: 'sprzedaz',
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        netAmount: true,
        vatAmount: true,
      },
    });

    const total = (salesInvoices._sum.totalGross || 0);
    const sales = total;
    const other = 0; // Placeholder for other revenue types

    return {
      total,
      sales,
      other,
    };
  }

  private async getCostData(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ) {
    // Get purchase invoices (costs)
    const purchaseInvoices = await this.prisma.invoice.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['issued', 'sent'],
        },
        // Assuming purchase invoices are identified by buyer being the company
        buyerNip: {
          not: null, // This is a simplification - in reality you'd need better logic
        },
      },
      _sum: {
        totalGross: true,
      },
    });

    // Get VAT register purchase data
    const vatPurchases = await this.prisma.vATRegister.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        type: 'zakup',
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        netAmount: true,
        vatAmount: true,
      },
    });

    // Get ZUS contributions as salary costs
    const zusContributions = await this.prisma.zUSContribution.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: {
          gte: startDate.toISOString().slice(0, 7),
          lte: endDate.toISOString().slice(0, 7),
        },
      },
      _sum: {
        emerytalnaEmployer: true,
        rentowaEmployer: true,
        chorobowaEmployee: true,
        wypadkowaEmployer: true,
        zdrowotnaEmployee: true,
        fpEmployee: true,
        fgspEmployee: true,
      },
    });

    const totalCosts = (purchaseInvoices._sum.totalGross || 0);
    const materials = (vatPurchases._sum.netAmount || 0);
    const services = 0; // Placeholder for service costs
    const salaries = this.calculateTotalZUSContributions(zusContributions);
    const other = totalCosts - materials - salaries;

    return {
      total: totalCosts,
      materials,
      services,
      salaries,
      other,
    };
  }

  private async getVATData(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ) {
    // Get VAT collected from sales
    const vatCollected = await this.prisma.vATRegister.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        type: 'sprzedaz',
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        vatAmount: true,
      },
    });

    // Get VAT paid on purchases
    const vatPaid = await this.prisma.vATRegister.aggregate({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        type: 'zakup',
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        vatAmount: true,
      },
    });

    // Get tax calculations for the period
    const taxCalculations = await this.prisma.taxCalculation.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: {
          gte: startDate.toISOString().slice(0, 7),
          lte: endDate.toISOString().slice(0, 7),
        },
        declarationType: {
          in: ['VAT-7', 'JPK_V7M', 'JPK_V7K'],
        },
      },
    });

    const collected = vatCollected._sum.vatAmount || 0;
    const paid = vatPaid._sum.vatAmount || 0;
    const due = Math.max(0, collected - paid); // Simplified VAT calculation

    return {
      collected,
      paid,
      due,
    };
  }

  private calculateTotalZUSContributions(zusData: any): number {
    return (
      (zusData._sum.emerytalnaEmployer || 0) +
      (zusData._sum.rentowaEmployer || 0) +
      (zusData._sum.chorobowaEmployee || 0) +
      (zusData._sum.wypadkowaEmployer || 0) +
      (zusData._sum.zdrowotnaEmployee || 0) +
      (zusData._sum.fpEmployee || 0) +
      (zusData._sum.fgspEmployee || 0)
    );
  }
}