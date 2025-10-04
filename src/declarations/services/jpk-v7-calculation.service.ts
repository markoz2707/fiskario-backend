import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VATRegisterReportService } from '../../reports/services/vat-register-report.service';
import { GTUAssignmentService } from './gtu-assignment.service';
import { ProcedureCodeService } from './procedure-code.service';

export interface JPKV7CalculationData {
  period: string;
  variant: 'M' | 'K';
  companyId: string;
  tenantId: string;
}

export interface JPKV7CalculationResult {
  period: string;
  variant: 'M' | 'K';
  companyInfo: any;
  declaration: {
    totalSalesVAT: number;
    vatPaidPurchases: number;
    vatDue: number;
    vatToReturn?: number;
    additionalCommitment?: number;
    badDebtLoss?: number;
    vatFromIntraEUBadDebt?: number;
    vatFromImportBadDebt?: number;
  };
  salesEntries: any[];
  purchaseEntries: any[];
  summary: {
    totalSalesNet: number;
    totalSalesVAT: number;
    totalSalesGross: number;
    totalPurchasesNet: number;
    totalPurchasesVAT: number;
    totalPurchasesGross: number;
    netVAT: number;
  };
  metadata: {
    calculatedAt: Date;
    calculationVersion: string;
    dataSource: string;
  };
}

@Injectable()
export class JPKV7CalculationService {
  private readonly logger = new Logger(JPKV7CalculationService.name);

  constructor(
    private prisma: PrismaService,
    private vatRegisterService: VATRegisterReportService,
    private gtuAssignment: GTUAssignmentService,
    private procedureCode: ProcedureCodeService
  ) {}

  /**
   * Calculate complete JPK_V7 data for a given period
   */
  async calculateJPKV7Data(data: JPKV7CalculationData): Promise<JPKV7CalculationResult> {
    try {
      this.logger.log(`Calculating JPK_V7${data.variant} data for period ${data.period}, company ${data.companyId}`);

      // Get VAT register data for the period
      const vatRegisterData = await this.getVATRegisterData(data);

      // Get company information
      const companyInfo = await this.getCompanyInfo(data.companyId);

      // Calculate sales data
      const salesCalculation = this.calculateSalesData(vatRegisterData.sales);

      // Calculate purchase data
      const purchasesCalculation = this.calculatePurchasesData(vatRegisterData.purchases);

      // Calculate declaration amounts
      const declaration = this.calculateDeclarationAmounts(salesCalculation, purchasesCalculation);

      // Prepare sales entries with GTU and procedure codes
      const salesEntries = this.prepareSalesEntries(vatRegisterData.sales);

      // Prepare purchase entries with GTU and procedure codes
      const purchaseEntries = this.preparePurchaseEntries(vatRegisterData.purchases);

      const result: JPKV7CalculationResult = {
        period: data.period,
        variant: data.variant,
        companyInfo,
        declaration,
        salesEntries,
        purchaseEntries,
        summary: {
          totalSalesNet: salesCalculation.totalNet,
          totalSalesVAT: salesCalculation.totalVAT,
          totalSalesGross: salesCalculation.totalGross,
          totalPurchasesNet: purchasesCalculation.totalNet,
          totalPurchasesVAT: purchasesCalculation.totalVAT,
          totalPurchasesGross: purchasesCalculation.totalGross,
          netVAT: declaration.vatDue
        },
        metadata: {
          calculatedAt: new Date(),
          calculationVersion: '1.0',
          dataSource: 'VAT Register'
        }
      };

      this.logger.log(`JPK_V7${data.variant} calculation completed for period ${data.period}`);
      return result;
    } catch (error) {
      this.logger.error(`Error calculating JPK_V7 data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get VAT register data for the period
   */
  private async getVATRegisterData(data: JPKV7CalculationData): Promise<{
    sales: any[];
    purchases: any[];
  }> {
    const { startDate, endDate } = this.getPeriodDateRange(data.period, data.variant);

    // Get sales entries
    const sales = await this.prisma.vATRegister.findMany({
      where: {
        tenant_id: data.tenantId,
        company_id: data.companyId,
        type: 'sprzedaz',
        invoiceDate: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: [
        { invoiceDate: 'asc' },
        { counterpartyName: 'asc' }
      ]
    });

    // Get purchase entries
    const purchases = await this.prisma.vATRegister.findMany({
      where: {
        tenant_id: data.tenantId,
        company_id: data.companyId,
        type: 'zakup',
        invoiceDate: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: [
        { invoiceDate: 'asc' },
        { counterpartyName: 'asc' }
      ]
    });

    return { sales, purchases };
  }

  /**
   * Get company information
   */
  private async getCompanyInfo(companyId: string): Promise<any> {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        nip: true,
        address: true,
        vatPayer: true,
        taxForm: true
      }
    });
  }

  /**
   * Calculate sales data totals
   */
  private calculateSalesData(salesEntries: any[]): {
    totalNet: number;
    totalVAT: number;
    totalGross: number;
    byRate: Record<number, { net: number; vat: number; count: number }>;
  } {
    const result = {
      totalNet: 0,
      totalVAT: 0,
      totalGross: 0,
      byRate: {} as Record<number, { net: number; vat: number; count: number }>
    };

    for (const entry of salesEntries) {
      result.totalNet += entry.netAmount;
      result.totalVAT += entry.vatAmount;
      result.totalGross += entry.netAmount + entry.vatAmount;

      const rate = entry.vatRate;
      if (!result.byRate[rate]) {
        result.byRate[rate] = { net: 0, vat: 0, count: 0 };
      }
      result.byRate[rate].net += entry.netAmount;
      result.byRate[rate].vat += entry.vatAmount;
      result.byRate[rate].count += 1;
    }

    return result;
  }

  /**
   * Calculate purchase data totals
   */
  private calculatePurchasesData(purchaseEntries: any[]): {
    totalNet: number;
    totalVAT: number;
    totalGross: number;
    byRate: Record<number, { net: number; vat: number; count: number }>;
  } {
    const result = {
      totalNet: 0,
      totalVAT: 0,
      totalGross: 0,
      byRate: {} as Record<number, { net: number; vat: number; count: number }>
    };

    for (const entry of purchaseEntries) {
      result.totalNet += entry.netAmount;
      result.totalVAT += entry.vatAmount;
      result.totalGross += entry.netAmount + entry.vatAmount;

      const rate = entry.vatRate;
      if (!result.byRate[rate]) {
        result.byRate[rate] = { net: 0, vat: 0, count: 0 };
      }
      result.byRate[rate].net += entry.netAmount;
      result.byRate[rate].vat += entry.vatAmount;
      result.byRate[rate].count += 1;
    }

    return result;
  }

  /**
   * Calculate declaration amounts
   */
  private calculateDeclarationAmounts(
    sales: { totalNet: number; totalVAT: number; totalGross: number },
    purchases: { totalNet: number; totalVAT: number; totalGross: number }
  ): JPKV7CalculationResult['declaration'] {
    const totalSalesVAT = Math.round(sales.totalVAT);
    const vatPaidPurchases = Math.round(purchases.totalVAT);
    const vatDue = Math.round(totalSalesVAT - vatPaidPurchases);

    return {
      totalSalesVAT,
      vatPaidPurchases,
      vatDue,
      vatToReturn: vatDue < 0 ? Math.abs(vatDue) : 0,
      additionalCommitment: 0,
      badDebtLoss: 0,
      vatFromIntraEUBadDebt: 0,
      vatFromImportBadDebt: 0
    };
  }

  /**
   * Prepare sales entries with GTU and procedure codes
   */
  private prepareSalesEntries(salesEntries: any[]): any[] {
    return salesEntries.map((entry, index) => {
      // Assign GTU codes
      const gtuResult = this.gtuAssignment.assignGTUCodes(
        entry.invoiceNumber,
        'sales',
        entry.netAmount + entry.vatAmount
      );

      // Assign procedure codes
      const procedureResult = this.procedureCode.assignProcedureCodes({
        description: entry.invoiceNumber,
        amount: entry.netAmount + entry.vatAmount,
        vatRate: entry.vatRate,
        isExport: false, // This would need to be determined from business logic
        isSensitiveGoods: gtuResult.gtuCodes.some(code => ['GTU_01', 'GTU_02', 'GTU_03', 'GTU_04'].includes(code))
      });

      return {
        lpSprzedazy: index + 1,
        nrKontrahenta: entry.counterpartyNIP,
        nazwaKontrahenta: entry.counterpartyName,
        adresKontrahenta: '', // Would need to be populated from counterparty data
        dowodSprzedazy: entry.invoiceNumber,
        dataWystawienia: entry.invoiceDate.toISOString().split('T')[0],
        dataSprzedazy: entry.invoiceDate.toISOString().split('T')[0],
        k_10: Math.round(entry.netAmount),
        k_11: Math.round(entry.vatAmount),
        k_12: Math.round(entry.netAmount + entry.vatAmount),
        k_13: entry.vatRate,
        k_14: 0,
        k_15: 0,
        k_16: 0,
        k_17: 0,
        k_18: 0,
        k_19: 0,
        k_20: gtuResult.gtuCodes.join(','),
        k_21: procedureResult.procedureCodes.join(','),
        k_22: 'Faktura',
        k_23: ''
      };
    });
  }

  /**
   * Prepare purchase entries with GTU and procedure codes
   */
  private preparePurchaseEntries(purchaseEntries: any[]): any[] {
    return purchaseEntries.map((entry, index) => {
      // Assign GTU codes
      const gtuResult = this.gtuAssignment.assignGTUCodes(
        entry.invoiceNumber,
        'purchases',
        entry.netAmount + entry.vatAmount
      );

      // Assign procedure codes
      const procedureResult = this.procedureCode.assignProcedureCodes({
        description: entry.invoiceNumber,
        amount: entry.netAmount + entry.vatAmount,
        vatRate: entry.vatRate,
        isImport: false, // This would need to be determined from business logic
        isSensitiveGoods: gtuResult.gtuCodes.some(code => ['GTU_01', 'GTU_02', 'GTU_03', 'GTU_04'].includes(code))
      });

      return {
        lpZakupu: index + 1,
        nrDostawcy: entry.counterpartyNIP,
        nazwaDostawcy: entry.counterpartyName,
        adresDostawcy: '', // Would need to be populated from counterparty data
        dowodZakupu: entry.invoiceNumber,
        dataZakupu: entry.invoiceDate.toISOString().split('T')[0],
        dataWplywu: entry.invoiceDate.toISOString().split('T')[0],
        k_40: Math.round(entry.netAmount),
        k_41: Math.round(entry.vatAmount),
        k_42: Math.round(entry.netAmount + entry.vatAmount),
        k_43: entry.vatRate,
        k_44: 0,
        k_45: 0,
        k_46: 0,
        k_47: 0,
        k_48: 0,
        k_49: 0,
        k_50: gtuResult.gtuCodes.join(','),
        k_51: procedureResult.procedureCodes.join(','),
        k_52: 'Faktura',
        k_53: ''
      };
    });
  }

  /**
   * Get date range for period and variant
   */
  private getPeriodDateRange(period: string, variant: 'M' | 'K'): { startDate: Date; endDate: Date } {
    const [year, monthOrQuarter] = period.split('-');

    if (variant === 'M') {
      // Monthly
      const month = parseInt(monthOrQuarter);
      const startDate = new Date(parseInt(year), month - 1, 1);
      const endDate = new Date(parseInt(year), month, 0);
      return { startDate, endDate };
    } else {
      // Quarterly
      const quarter = parseInt(monthOrQuarter);
      const startMonth = (quarter - 1) * 3;
      const startDate = new Date(parseInt(year), startMonth, 1);
      const endDate = new Date(parseInt(year), startMonth + 3, 0);
      return { startDate, endDate };
    }
  }

  /**
   * Validate calculation data
   */
  async validateCalculationData(data: JPKV7CalculationData): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate period format
    if (!/^\d{4}-\d{1,2}$/.test(data.period)) {
      errors.push('Invalid period format. Expected YYYY-MM or YYYY-QX');
    }

    // Validate variant
    if (!['M', 'K'].includes(data.variant)) {
      errors.push('Invalid variant. Expected M (monthly) or K (quarterly)');
    }

    // Check if company exists
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId }
    });

    if (!company) {
      errors.push('Company not found');
    }

    // Check if there's data for the period
    const { startDate, endDate } = this.getPeriodDateRange(data.period, data.variant);
    const entryCount = await this.prisma.vATRegister.count({
      where: {
        tenant_id: data.tenantId,
        company_id: data.companyId,
        invoiceDate: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    if (entryCount === 0) {
      warnings.push('No VAT register entries found for the specified period');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}