import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxCalculationDto, DeclarationType, VATRegisterType, CreateVATRegisterDto } from '../dto/tax-calculation.dto';

@Injectable()
export class TaxCalculationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate VAT-7 declaration based on VAT registers for a given period
   */
  async calculateVAT7(tenantId: string, companyId: string, period: string): Promise<any> {
    // Get all VAT registers for the period
    const vatRegisters = await this.prisma.vATRegister.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: period,
      },
    });

    if (vatRegisters.length === 0) {
      throw new NotFoundException(`No VAT register entries found for period ${period}`);
    }

    // Separate sales and purchases
    const sales = vatRegisters.filter(reg => reg.type === VATRegisterType.SPRZEDAZ);
    const purchases = vatRegisters.filter(reg => reg.type === VATRegisterType.ZAKUP);

    // Calculate totals
    const totalSalesNet = sales.reduce((sum, reg) => sum + reg.netAmount, 0);
    const totalSalesVAT = sales.reduce((sum, reg) => sum + reg.vatAmount, 0);
    const totalPurchasesNet = purchases.reduce((sum, reg) => sum + reg.netAmount, 0);
    const totalPurchasesVAT = purchases.reduce((sum, reg) => sum + reg.vatAmount, 0);

    // VAT to pay/return calculation
    const vatDue = totalSalesVAT - totalPurchasesVAT;

    const calculation = {
      period,
      declarationType: DeclarationType.VAT_7,
      totalRevenue: totalSalesNet,
      vatCollectedSales: totalSalesVAT,
      vatPaidPurchases: totalPurchasesVAT,
      vatDue,
      totalCosts: totalPurchasesNet,
      details: {
        sales,
        purchases,
        summary: {
          totalSalesNet,
          totalSalesVAT,
          totalPurchasesNet,
          totalPurchasesVAT,
        }
      }
    };

    return calculation;
  }

  /**
   * Calculate JPK_V7 (monthly/quarterly) based on VAT registers
   */
  async calculateJPKV7(tenantId: string, companyId: string, period: string, variant: 'M' | 'K'): Promise<any> {
    const vatRegisters = await this.prisma.vATRegister.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: period,
      },
      orderBy: [
        { type: 'asc' },
        { invoiceDate: 'asc' }
      ]
    });

    if (vatRegisters.length === 0) {
      throw new NotFoundException(`No VAT register entries found for period ${period}`);
    }

    // Group by VAT rate and type
    const salesByRate = this.groupByVATRate(vatRegisters.filter(reg => reg.type === VATRegisterType.SPRZEDAZ));
    const purchasesByRate = this.groupByVATRate(vatRegisters.filter(reg => reg.type === VATRegisterType.ZAKUP));

    // Calculate totals for JPK_V7 structure
    const totalSalesNet = vatRegisters
      .filter(reg => reg.type === VATRegisterType.SPRZEDAZ)
      .reduce((sum, reg) => sum + reg.netAmount, 0);

    const totalSalesVAT = vatRegisters
      .filter(reg => reg.type === VATRegisterType.SPRZEDAZ)
      .reduce((sum, reg) => sum + reg.vatAmount, 0);

    const totalPurchasesNet = vatRegisters
      .filter(reg => reg.type === VATRegisterType.ZAKUP)
      .reduce((sum, reg) => sum + reg.netAmount, 0);

    const totalPurchasesVAT = vatRegisters
      .filter(reg => reg.type === VATRegisterType.ZAKUP)
      .reduce((sum, reg) => sum + reg.vatAmount, 0);

    const vatDue = totalSalesVAT - totalPurchasesVAT;

    const calculation = {
      period,
      variant,
      declarationType: variant === 'M' ? DeclarationType.JPK_V7M : DeclarationType.JPK_V7K,
      totalRevenue: totalSalesNet,
      vatCollectedSales: totalSalesVAT,
      vatPaidPurchases: totalPurchasesVAT,
      vatDue,
      totalCosts: totalPurchasesNet,
      details: {
        salesByRate,
        purchasesByRate,
        vatRegisters,
        summary: {
          totalSalesNet,
          totalSalesVAT,
          totalPurchasesNet,
          totalPurchasesVAT,
          vatDue,
        }
      }
    };

    return calculation;
  }

  /**
   * Calculate PIT advance payment (zaliczka na podatek dochodowy)
   */
  async calculatePITAdvance(tenantId: string, companyId: string, period: string): Promise<any> {
    // Get tax calculation data for the period
    const taxCalc = await this.prisma.taxCalculation.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: period,
        declarationType: DeclarationType.PIT_36,
      },
    });

    if (!taxCalc) {
      throw new NotFoundException(`No tax calculation found for period ${period}`);
    }

    // Polish PIT tax brackets and rates (2024)
    const taxBrackets = [
      { threshold: 120000, rate: 0.12 }, // 12% up to 120,000 PLN
      { threshold: Infinity, rate: 0.32 } // 32% above 120,000 PLN
    ];

    const taxableIncome = taxCalc.taxableIncome;
    let taxDue = 0;

    if (taxableIncome <= 0) {
      taxDue = 0;
    } else if (taxableIncome <= taxBrackets[0].threshold) {
      taxDue = taxableIncome * taxBrackets[0].rate;
    } else {
      taxDue = taxBrackets[0].threshold * taxBrackets[0].rate +
               (taxableIncome - taxBrackets[0].threshold) * taxBrackets[1].rate;
    }

    const advanceToPay = Math.max(0, taxDue - taxCalc.previousAdvance);

    return {
      period,
      declarationType: DeclarationType.PIT_36,
      taxableIncome,
      taxBase: taxableIncome,
      taxDue,
      previousAdvance: taxCalc.previousAdvance,
      advanceToPay,
      details: {
        taxBrackets,
        calculation: {
          firstBracket: Math.min(taxableIncome, taxBrackets[0].threshold) * taxBrackets[0].rate,
          secondBracket: taxableIncome > taxBrackets[0].threshold ?
            (taxableIncome - taxBrackets[0].threshold) * taxBrackets[1].rate : 0,
        }
      }
    };
  }

  /**
   * Calculate CIT (corporate income tax)
   */
  async calculateCIT(tenantId: string, companyId: string, period: string): Promise<any> {
    const taxCalc = await this.prisma.taxCalculation.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: period,
        declarationType: DeclarationType.CIT_8,
      },
    });

    if (!taxCalc) {
      throw new NotFoundException(`No tax calculation found for period ${period}`);
    }

    // Polish CIT rate is 19% for standard companies, 9% for small taxpayers
    const citRate = 0.19; // Standard rate
    const smallTaxpayerRate = 0.09;

    const taxableIncome = taxCalc.taxableIncome;
    const taxDue = taxableIncome > 0 ? taxableIncome * citRate : 0;

    return {
      period,
      declarationType: DeclarationType.CIT_8,
      taxableIncome,
      taxBase: taxableIncome,
      taxDue,
      citRate,
      details: {
        standardRate: citRate,
        smallTaxpayerRate,
        appliedRate: citRate,
      }
    };
  }

  /**
   * Calculate PIT-36 (annual tax return for businesses)
   */
  async calculatePIT36(tenantId: string, companyId: string, year: number): Promise<any> {
    // Get all tax calculations for the year
    const taxCalcs = await this.prisma.taxCalculation.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: {
          startsWith: year.toString()
        },
        declarationType: DeclarationType.PIT_36,
      },
    });

    // Calculate annual totals
    const totalRevenue = taxCalcs.reduce((sum, calc) => sum + (calc.totalRevenue || 0), 0);
    const totalCosts = taxCalcs.reduce((sum, calc) => sum + (calc.totalCosts || 0), 0);
    const totalTaxDeductibleCosts = taxCalcs.reduce((sum, calc) => sum + (calc.taxDeductibleCosts || 0), 0);

    const taxableIncome = totalRevenue - totalTaxDeductibleCosts;

    // Polish PIT tax brackets and rates (2024)
    const taxBrackets = [
      { threshold: 120000, rate: 0.12 }, // 12% up to 120,000 PLN
      { threshold: Infinity, rate: 0.32 } // 32% above 120,000 PLN
    ];

    let taxDue = 0;
    if (taxableIncome <= 0) {
      taxDue = 0;
    } else if (taxableIncome <= taxBrackets[0].threshold) {
      taxDue = taxableIncome * taxBrackets[0].rate;
    } else {
      taxDue = taxBrackets[0].threshold * taxBrackets[0].rate +
               (taxableIncome - taxBrackets[0].threshold) * taxBrackets[1].rate;
    }

    return {
      year,
      period: year.toString(),
      declarationType: DeclarationType.PIT_36,
      totalRevenue,
      totalCosts,
      taxDeductibleCosts: totalTaxDeductibleCosts,
      taxableIncome,
      taxBase: taxableIncome,
      taxDue,
      details: {
        taxBrackets,
        monthlyCalculations: taxCalcs,
        calculation: {
          firstBracket: Math.min(taxableIncome, taxBrackets[0].threshold) * taxBrackets[0].rate,
          secondBracket: taxableIncome > taxBrackets[0].threshold ?
            (taxableIncome - taxBrackets[0].threshold) * taxBrackets[1].rate : 0,
        }
      }
    };
  }

  /**
   * Calculate PIT-36L (linear tax - 19% flat rate)
   */
  async calculatePIT36L(tenantId: string, companyId: string, year: number): Promise<any> {
    // Get all tax calculations for the year
    const taxCalcs = await this.prisma.taxCalculation.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: {
          startsWith: year.toString()
        },
        declarationType: DeclarationType.PIT_36L,
      },
    });

    // Calculate annual totals
    const totalRevenue = taxCalcs.reduce((sum, calc) => sum + (calc.totalRevenue || 0), 0);
    const totalCosts = taxCalcs.reduce((sum, calc) => sum + (calc.totalCosts || 0), 0);

    const taxableIncome = totalRevenue - totalCosts;
    const taxDue = taxableIncome > 0 ? taxableIncome * 0.19 : 0; // 19% flat rate

    return {
      year,
      period: year.toString(),
      declarationType: DeclarationType.PIT_36L,
      totalRevenue,
      totalCosts,
      taxableIncome,
      taxBase: taxableIncome,
      taxDue,
      taxRate: 0.19,
      details: {
        monthlyCalculations: taxCalcs,
        calculation: {
          taxDue: taxableIncome * 0.19
        }
      }
    };
  }

  /**
   * Calculate CIT-8 (corporate income tax return)
   */
  async calculateCIT8(tenantId: string, companyId: string, year: number): Promise<any> {
    // Get all tax calculations for the year
    const taxCalcs = await this.prisma.taxCalculation.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: {
          startsWith: year.toString()
        },
        declarationType: DeclarationType.CIT_8,
      },
    });

    // Calculate annual totals
    const totalRevenue = taxCalcs.reduce((sum, calc) => sum + (calc.totalRevenue || 0), 0);
    const totalCosts = taxCalcs.reduce((sum, calc) => sum + (calc.totalCosts || 0), 0);
    const totalTaxDeductibleCosts = taxCalcs.reduce((sum, calc) => sum + (calc.taxDeductibleCosts || 0), 0);

    const taxableIncome = totalRevenue - totalTaxDeductibleCosts;
    const taxDue = taxableIncome > 0 ? taxableIncome * 0.19 : 0; // 19% CIT rate

    return {
      year,
      period: year.toString(),
      declarationType: DeclarationType.CIT_8,
      totalRevenue,
      totalCosts,
      taxDeductibleCosts: totalTaxDeductibleCosts,
      taxableIncome,
      taxBase: taxableIncome,
      taxDue,
      taxRate: 0.19,
      details: {
        monthlyCalculations: taxCalcs,
        calculation: {
          taxDue: taxableIncome * 0.19
        }
      }
    };
  }

  /**
   * Calculate CIT-8AB (simplified corporate tax for small taxpayers)
   */
  async calculateCIT8AB(tenantId: string, companyId: string, year: number): Promise<any> {
    // Get all tax calculations for the year
    const taxCalcs = await this.prisma.taxCalculation.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        period: {
          startsWith: year.toString()
        },
        declarationType: DeclarationType.CIT_8AB,
      },
    });

    // Calculate annual totals
    const totalRevenue = taxCalcs.reduce((sum, calc) => sum + (calc.totalRevenue || 0), 0);
    const totalCosts = taxCalcs.reduce((sum, calc) => sum + (calc.totalCosts || 0), 0);

    // For CIT-8AB, simplified tax base calculation
    const simplifiedTaxBase = Math.max(0, totalRevenue - totalCosts);
    const taxDue = simplifiedTaxBase * 0.09; // 9% rate for small taxpayers

    return {
      year,
      period: year.toString(),
      declarationType: DeclarationType.CIT_8AB,
      totalRevenue,
      totalCosts,
      simplifiedTaxBase,
      taxBase: simplifiedTaxBase,
      taxDue,
      taxRate: 0.09,
      details: {
        monthlyCalculations: taxCalcs,
        calculation: {
          taxDue: simplifiedTaxBase * 0.09
        }
      }
    };
  }

  /**
   * Calculate VAT-UE (EU VAT declaration for intra-community transactions)
   */
  async calculateVATUE(tenantId: string, companyId: string, period: string): Promise<any> {
    // Get EU transactions for the quarter - using existing invoice data for now
    const euInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        date: {
          gte: new Date(period.split('-')[0] + '-' + period.split('-')[1] + '-01'),
          lt: new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]) + 1, 1)
        }
      },
      include: {
        items: true
      }
    });

    // For now, assume all invoices are potential EU transactions
    // In a real implementation, you'd have EU-specific flags
    const euAcquisitions = euInvoices.filter(inv => inv.totalVat === 0); // Simplified assumption
    const euSupplies = euInvoices.filter(inv => inv.totalVat > 0);

    const totalAcquisitions = euAcquisitions.reduce((sum, inv) => sum + inv.totalNet, 0);
    const totalAcquisitionsVAT = euAcquisitions.reduce((sum, inv) => sum + inv.totalVat, 0);
    const totalSupplies = euSupplies.reduce((sum, inv) => sum + inv.totalNet, 0);
    const totalSuppliesVAT = euSupplies.reduce((sum, inv) => sum + inv.totalVat, 0);

    return {
      period,
      declarationType: DeclarationType.VAT_UE,
      euAcquisitions: {
        total: totalAcquisitions,
        vat: totalAcquisitionsVAT,
        count: euAcquisitions.length
      },
      euSupplies: {
        total: totalSupplies,
        vat: totalSuppliesVAT,
        count: euSupplies.length
      },
      details: {
        acquisitions: euAcquisitions,
        supplies: euSupplies
      }
    };
  }

  /**
   * Calculate PCC-3 (civil law transactions tax)
   */
  async calculatePCC3(tenantId: string, companyId: string, period: string): Promise<any> {
    // Get civil law transactions for the quarter - using existing invoice data for now
    const civilTransactions = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        date: {
          gte: new Date(period.split('-')[0] + '-' + period.split('-')[1] + '-01'),
          lt: new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]) + 1, 1)
        }
      }
    });

    const totalTaxDue = civilTransactions.reduce((sum, t) => sum + (t.totalNet * 0.02), 0); // 2% PCC rate

    return {
      period,
      declarationType: DeclarationType.PCC_3,
      transactions: civilTransactions,
      totalTaxDue,
      transactionCount: civilTransactions.length,
      taxRate: 0.02,
      details: {
        transactions: civilTransactions
      }
    };
  }

  /**
   * Add VAT register entry from invoice or manual input
   */
  async addVATRegisterEntry(tenantId: string, companyId: string, dto: CreateVATRegisterDto): Promise<any> {
    // Validate period format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(dto.period)) {
      throw new BadRequestException('Period must be in YYYY-MM format');
    }

    const vatRegister = await this.prisma.vATRegister.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        type: dto.type,
        period: dto.period,
        counterpartyName: dto.counterpartyName,
        counterpartyNIP: dto.counterpartyNIP,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        netAmount: dto.netAmount,
        vatAmount: dto.vatAmount,
        vatRate: dto.vatRate,
        gtuCode: dto.gtuCode,
        documentType: dto.documentType || 'invoice',
      },
    });

    return vatRegister;
  }

  /**
   * Get VAT registers for a specific period
   */
  async getVATRegisters(tenantId: string, companyId: string, period: string, type?: VATRegisterType): Promise<any[]> {
    const whereClause: any = {
      tenant_id: tenantId,
      company_id: companyId,
      period: period,
    };

    if (type) {
      whereClause.type = type;
    }

    return await this.prisma.vATRegister.findMany({
      where: whereClause,
      orderBy: [
        { type: 'asc' },
        { invoiceDate: 'asc' }
      ]
    });
  }

  /**
   * Helper method to group VAT registers by VAT rate
   */
  private groupByVATRate(registers: any[]): any {
    return registers.reduce((groups, register) => {
      const rate = register.vatRate;
      if (!groups[rate]) {
        groups[rate] = {
          rate,
          netAmount: 0,
          vatAmount: 0,
          count: 0,
          entries: []
        };
      }

      groups[rate].netAmount += register.netAmount;
      groups[rate].vatAmount += register.vatAmount;
      groups[rate].count += 1;
      groups[rate].entries.push(register);

      return groups;
    }, {});
  }

  /**
   * Auto-populate VAT registers from KSeF invoices
   */
  async populateVATRegistersFromKSeF(tenantId: string, companyId: string, period: string): Promise<any> {
    // Get invoices from KSeF service for the period
    // This would integrate with the existing KSeF service
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        date: {
          gte: new Date(period + '-01'),
          lt: new Date(new Date(period + '-01').getFullYear(), new Date(period + '-01').getMonth() + 1, 1)
        }
      },
      include: {
        items: true,
        buyer: true
      }
    });

    const vatRegisters: any[] = [];

    for (const invoice of invoices) {
      // Create sales register entry
      if (invoice.totalVat > 0) {
        const vatRegister = await this.prisma.vATRegister.create({
          data: {
            tenant_id: tenantId,
            company_id: companyId,
            type: VATRegisterType.SPRZEDAZ,
            period: period,
            counterpartyName: invoice.buyer?.name || 'Unknown Buyer',
            counterpartyNIP: invoice.buyer?.nip || null,
            invoiceNumber: `${invoice.series}${invoice.number}`,
            invoiceDate: invoice.date,
            netAmount: invoice.totalNet,
            vatAmount: invoice.totalVat,
            vatRate: invoice.items.length > 0 ? invoice.items[0].vatRate : 23, // Default VAT rate
            documentType: 'invoice',
          },
        });
        vatRegisters.push(vatRegister);
      }
    }

    return vatRegisters;
  }
}