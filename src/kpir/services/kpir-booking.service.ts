import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KPiRNumberingService } from './kpir-numbering.service';

@Injectable()
export class KPiRBookingService {
  private readonly logger = new Logger(KPiRBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: KPiRNumberingService,
  ) {}

  /**
   * Automatically book a sales invoice (faktura sprzedazy) into KPiR.
   * Sales invoices go to column 7 (salesRevenue).
   */
  async bookSalesInvoice(tenantId: string, companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId, company_id: companyId },
      include: { buyer: true, items: true },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    // Check if already booked
    const existing = await this.prisma.kPiREntry.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        sourceId: invoiceId,
        sourceType: 'INVOICE_SALES',
        isCorrection: false,
      },
    });

    if (existing) {
      this.logger.warn(`Invoice ${invoiceId} already booked as KPiR entry ${existing.id}`);
      return existing;
    }

    const entryDate = invoice.date;
    const month = entryDate.getMonth() + 1;
    const year = entryDate.getFullYear();
    const lp = await this.numberingService.getNextNumber(tenantId, companyId, year);

    // Build description from invoice items
    const itemDescriptions = invoice.items
      .map(item => item.description)
      .join(', ');
    const description = `Sprzedaz: ${itemDescriptions}`.substring(0, 500);

    return this.prisma.kPiREntry.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        lp,
        entryDate,
        documentNumber: `${invoice.series}/${invoice.number}`,
        counterpartyName: invoice.buyer?.name || null,
        counterpartyAddress: invoice.buyer?.address || null,
        description,
        salesRevenue: invoice.totalNet,
        otherRevenue: 0,
        totalRevenue: invoice.totalNet,
        purchaseCost: 0,
        sideExpenses: 0,
        salaries: 0,
        otherExpenses: 0,
        totalExpenses: 0,
        researchCosts: 0,
        sourceType: 'INVOICE_SALES',
        sourceId: invoiceId,
        month,
        year,
        isCorrection: false,
      },
    });
  }

  /**
   * Automatically book a purchase invoice (faktura zakupu) into KPiR.
   * Purchase invoices go to column 10 (purchaseCost) for goods/materials
   * or column 13 (otherExpenses) for services/other costs.
   */
  async bookPurchaseInvoice(
    tenantId: string,
    companyId: string,
    invoiceId: string,
    options?: { costColumn?: 'purchaseCost' | 'sideExpenses' | 'otherExpenses' },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId, company_id: companyId, isIncoming: true },
      include: { buyer: true, items: true },
    });

    if (!invoice) {
      throw new Error(`Purchase invoice ${invoiceId} not found`);
    }

    const existing = await this.prisma.kPiREntry.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        sourceId: invoiceId,
        sourceType: 'INVOICE_PURCHASE',
        isCorrection: false,
      },
    });

    if (existing) {
      this.logger.warn(`Purchase invoice ${invoiceId} already booked as KPiR entry ${existing.id}`);
      return existing;
    }

    const entryDate = invoice.date;
    const month = entryDate.getMonth() + 1;
    const year = entryDate.getFullYear();
    const lp = await this.numberingService.getNextNumber(tenantId, companyId, year);

    const costColumn = options?.costColumn || 'otherExpenses';
    const itemDescriptions = invoice.items
      .map(item => item.description)
      .join(', ');
    const description = `Zakup: ${itemDescriptions}`.substring(0, 500);

    const costData = {
      purchaseCost: 0,
      sideExpenses: 0,
      otherExpenses: 0,
    };
    costData[costColumn] = invoice.totalNet;

    return this.prisma.kPiREntry.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        lp,
        entryDate,
        documentNumber: `${invoice.series}/${invoice.number}`,
        counterpartyName: invoice.buyer?.name || null,
        counterpartyAddress: invoice.buyer?.address || null,
        description,
        salesRevenue: 0,
        otherRevenue: 0,
        totalRevenue: 0,
        ...costData,
        salaries: 0,
        totalExpenses: invoice.totalNet,
        researchCosts: 0,
        sourceType: 'INVOICE_PURCHASE',
        sourceId: invoiceId,
        month,
        year,
        isCorrection: false,
      },
    });
  }

  /**
   * Book ZUS social contribution (skladki spoleczne) into KPiR column 13.
   * Only social contributions (emerytalna, rentowa, chorobowa, wypadkowa) go to KPiR.
   * Health contribution (zdrowotna) does NOT go to KPiR - it's deducted from tax.
   */
  async bookZUSContribution(
    tenantId: string,
    companyId: string,
    contributionId: string,
  ) {
    const contribution = await this.prisma.zUSContribution.findFirst({
      where: { id: contributionId, tenant_id: tenantId, company_id: companyId },
    });

    if (!contribution) {
      throw new Error(`ZUS contribution ${contributionId} not found`);
    }

    const existing = await this.prisma.kPiREntry.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        sourceId: contributionId,
        sourceType: 'ZUS_CONTRIBUTION',
        isCorrection: false,
      },
    });

    if (existing) {
      return existing;
    }

    // Sum only social contributions (not health!)
    const socialContributions =
      contribution.emerytalnaEmployer +
      contribution.rentowaEmployer +
      contribution.wypadkowaEmployer +
      contribution.fpEmployee +
      contribution.fgspEmployee;

    if (socialContributions <= 0) {
      this.logger.log(`No social contributions to book for ${contributionId}`);
      return null;
    }

    const entryDate = contribution.contributionDate;
    const month = entryDate.getMonth() + 1;
    const year = entryDate.getFullYear();
    const lp = await this.numberingService.getNextNumber(tenantId, companyId, year);

    return this.prisma.kPiREntry.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        lp,
        entryDate,
        documentNumber: `ZUS/${contribution.period}`,
        counterpartyName: 'Zaklad Ubezpieczen Spolecznych',
        description: `Skladki ZUS spoleczne za okres ${contribution.period}`,
        salesRevenue: 0,
        otherRevenue: 0,
        totalRevenue: 0,
        purchaseCost: 0,
        sideExpenses: 0,
        salaries: 0,
        otherExpenses: socialContributions,
        totalExpenses: socialContributions,
        researchCosts: 0,
        sourceType: 'ZUS_CONTRIBUTION',
        sourceId: contributionId,
        month,
        year,
        isCorrection: false,
      },
    });
  }

  /**
   * Book a salary payment into KPiR column 12.
   */
  async bookSalary(
    tenantId: string,
    companyId: string,
    data: {
      date: Date;
      employeeName: string;
      period: string;
      grossAmount: number;
      documentNumber: string;
    },
  ) {
    const month = data.date.getMonth() + 1;
    const year = data.date.getFullYear();
    const lp = await this.numberingService.getNextNumber(tenantId, companyId, year);

    return this.prisma.kPiREntry.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        lp,
        entryDate: data.date,
        documentNumber: data.documentNumber,
        counterpartyName: data.employeeName,
        description: `Wynagrodzenie za okres ${data.period}`,
        salesRevenue: 0,
        otherRevenue: 0,
        totalRevenue: 0,
        purchaseCost: 0,
        sideExpenses: 0,
        salaries: data.grossAmount,
        otherExpenses: 0,
        totalExpenses: data.grossAmount,
        researchCosts: 0,
        sourceType: 'SALARY',
        month,
        year,
        isCorrection: false,
      },
    });
  }
}
