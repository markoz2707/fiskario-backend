import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KsefService } from '../ksef/ksef.service';
import { BuyersService } from './buyers.service';
import { TaxRulesService } from '../tax-rules/tax-rules.service';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { MobileTaxCalculationDto, MobileTaxCalculationResponseDto } from '../tax-rules/dto/mobile-tax-calculation.dto';

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private prisma: PrismaService,
    private ksefService: KsefService,
    private buyersService: BuyersService,
    private taxRulesService: TaxRulesService,
  ) {}

  async createInvoice(tenant_id: string, data: any) {
    this.logger.log(`Creating invoice for tenant ${tenant_id}`);
    // Validate KSeF compliance
    this.validateKSeF(data);

    // Generate invoice number
    const number = await this.generateInvoiceNumber(tenant_id, data.series);

    // Calculate totals
    const { totalNet, totalVat, totalGross } = this.calculateTotals(data.items);

    // Create or find buyer
    let buyer_id: string | null = null;
    if (data.buyerName) {
      // Try to find existing buyer by NIP first
      if (data.buyerNip) {
        const existingBuyers = await this.buyersService.findBuyersByNip(tenant_id, data.buyerNip);
        if (existingBuyers.length > 0) {
          buyer_id = existingBuyers[0].id;
        }
      }

      // If no existing buyer found, create a new one
      if (!buyer_id) {
        const newBuyer = await this.buyersService.createBuyer(tenant_id, {
          name: data.buyerName,
          nip: data.buyerNip,
          address: data.buyerAddress,
          city: data.buyerCity,
          postalCode: data.buyerPostalCode,
          country: data.buyerCountry || 'PL',
          email: data.buyerEmail,
          phone: data.buyerPhone,
          website: data.buyerWebsite,
          notes: data.buyerNotes,
          isActive: true,
        });
        buyer_id = newBuyer.id;
      }
    }

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        tenant_id,
        company_id: data.company_id,
        buyer_id,
        number,
        series: data.series,
        date: new Date(data.date),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        totalNet,
        totalVat,
        totalGross,
        items: {
          create: data.items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            gtu: item.gtu,
            netAmount: item.quantity * item.unitPrice,
            vatAmount: (item.quantity * item.unitPrice) * (item.vatRate / 100),
            grossAmount: (item.quantity * item.unitPrice) * (1 + item.vatRate / 100),
          })),
        },
      },
      include: {
        items: true,
        buyer: true
      },
    });

    // Generate PDF
    const pdfPath = await this.generatePDF(invoice);

    // Update invoice with pdfUrl
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfUrl: pdfPath },
    });

    // Queue KSeF submission
    await this.queueKSeFSubmission(invoice.id, tenant_id);

    return invoice;
  }

  private validateKSeF(data: any) {
    // Basic validation for KSeF
    if (!data.buyerNip || !data.buyerName) {
      throw new Error('Buyer NIP and name are required for KSeF');
    }
    // Check GTU codes, VAT rates, etc.
    // For simplicity, assume valid
  }

  private async generateInvoiceNumber(tenant_id: string, series: string): Promise<string> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { tenant_id, series },
      orderBy: { createdAt: 'desc' },
    });
    const lastNumber = lastInvoice ? parseInt(lastInvoice.number.split('/')[1]) : 0;
    return `${series}/${(lastNumber + 1).toString().padStart(4, '0')}`;
  }

  private calculateTotals(items: any[]) {
    let totalNet = 0;
    let totalVat = 0;
    items.forEach(item => {
      const net = item.quantity * item.unitPrice;
      const vat = net * (item.vatRate / 100);
      totalNet += net;
      totalVat += vat;
    });
    const totalGross = totalNet + totalVat;
    return { totalNet, totalVat, totalGross };
  }

  private async generatePDF(invoice: any): Promise<string> {
    const doc = new PDFDocument();
    const fileName = `invoice-${invoice.id}.pdf`;
    const filePath = path.join(__dirname, '../../uploads', fileName);
    // Ensure uploads dir exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.text(`Invoice: ${invoice.number}`);
    doc.text(`Date: ${invoice.date.toDateString()}`);
    // Add more content

    doc.end();
    return new Promise((resolve) => {
      stream.on('finish', () => resolve(fileName));
    });
  }

  private async queueKSeFSubmission(invoiceId: string, tenant_id: string) {
    try {
      // Get invoice details
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true },
      });

      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      // Convert to KSeF format
      const ksefInvoiceDto = this.convertToKSeFDto(invoice);

      // Check if KSeF is authenticated
      const authStatus = this.ksefService.getAuthStatus();
      if (!authStatus.authenticated) {
        this.logger.warn('KSeF not authenticated, queuing for later submission');
        await this.prisma.taskQueue.create({
          data: {
            tenant_id,
            type: 'ksef_submission',
            payload: { invoiceId },
          },
        });
        return;
      }

      // Submit to KSeF
      await this.ksefService.submitInvoice(ksefInvoiceDto, tenant_id);

      this.logger.log(`Invoice ${invoice.number} successfully submitted to KSeF`);

    } catch (error) {
      this.logger.error(`Failed to submit invoice ${invoiceId} to KSeF`, error);

      // Queue for retry
      await this.prisma.taskQueue.create({
        data: {
          tenant_id,
          type: 'ksef_submission_retry',
          payload: { invoiceId },
          status: 'pending',
          retryCount: 0,
        },
      });
    }
  }

  private convertToKSeFDto(invoice: any): any {
    return {
      invoiceNumber: invoice.number,
      issueDate: invoice.date.toISOString().split('T')[0],
      dueDate: invoice.dueDate?.toISOString().split('T')[0] || invoice.date.toISOString().split('T')[0],
      sellerName: 'Your Company Name', // TODO: Get from company data
      sellerNip: '1234567890', // TODO: Get from company data
      sellerAddress: 'Company Address', // TODO: Get from company data
      buyerName: invoice.buyer?.name || '',
      buyerNip: invoice.buyer?.nip || '',
      buyerAddress: invoice.buyer?.address || '',
      items: invoice.items.map(item => ({
        name: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        gtu: item.gtu,
        netAmount: item.netAmount,
        vatAmount: item.vatAmount,
        grossAmount: item.grossAmount,
      })),
      totalNet: invoice.totalNet,
      totalVat: invoice.totalVat,
      totalGross: invoice.totalGross,
      paymentMethod: 'przelew',
    };
  }

  // Mobile-specific methods
  async calculateMobileInvoice(tenant_id: string, calculationDto: MobileTaxCalculationDto): Promise<MobileTaxCalculationResponseDto> {
    // Use the tax rules service to calculate taxes
    return await this.taxRulesService.calculateTaxForMobile(tenant_id, calculationDto);
  }

  async previewMobileInvoice(tenant_id: string, calculationDto: MobileTaxCalculationDto): Promise<any> {
    // Calculate the invoice totals
    const taxCalculation = await this.calculateMobileInvoice(tenant_id, calculationDto);

    // Get company information for invoice preview
    const company = await this.prisma.company.findFirst({
      where: { id: calculationDto.companyId, tenant_id },
    });

    if (!company) {
      throw new Error(`Company with ID ${calculationDto.companyId} not found`);
    }

    // Create a preview response with formatted data for mobile
    return {
      success: true,
      preview: {
        company: {
          name: company.name,
          nip: company.nip,
          address: company.address,
        },
        items: calculationDto.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate || 23,
          netAmount: item.quantity * item.unitPrice,
          vatAmount: (item.quantity * item.unitPrice) * ((item.vatRate || 23) / 100),
          grossAmount: (item.quantity * item.unitPrice) * (1 + (item.vatRate || 23) / 100),
        })),
        totals: {
          totalNet: taxCalculation.totalNet,
          totalVat: taxCalculation.totalVat,
          totalGross: taxCalculation.totalGross,
        },
        vatBreakdown: taxCalculation.vatBreakdown,
        appliedRules: taxCalculation.appliedRules,
        estimatedFileSize: Math.round(JSON.stringify(calculationDto).length * 0.7), // Rough estimate
        processingTime: '2-3 seconds',
      },
    };
  }

  async getMobileInvoiceTemplates(tenant_id: string, companyId: string): Promise<any[]> {
    // Get company tax settings for available templates
    const companySettings = await this.prisma.companyTaxSettings.findMany({
      where: { company_id: companyId },
      include: { taxForm: true },
    });

    return companySettings.map(setting => ({
      id: setting.taxForm.id,
      name: setting.taxForm.name,
      code: setting.taxForm.code,
      description: setting.taxForm.description,
      category: setting.taxForm.category,
      isSelected: setting.isSelected,
      settings: setting.settings,
      fields: this.generateTemplateFields(setting.taxForm),
    }));
  }

  async validateMobileInvoice(tenant_id: string, calculationDto: MobileTaxCalculationDto): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!calculationDto.companyId) {
      errors.push('Company ID is required');
    }

    if (!calculationDto.items || calculationDto.items.length === 0) {
      errors.push('At least one item is required');
    } else {
      calculationDto.items.forEach((item, index) => {
        if (!item.description?.trim()) {
          errors.push(`Item ${index + 1}: Description is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
        }
        if (!item.unitPrice || item.unitPrice < 0) {
          errors.push(`Item ${index + 1}: Unit price must be greater than or equal to 0`);
        }
        if (item.vatRate !== undefined && (item.vatRate < 0 || item.vatRate > 100)) {
          errors.push(`Item ${index + 1}: VAT rate must be between 0 and 100`);
        }
      });
    }

    // Check for potential issues
    const highValueItems = calculationDto.items.filter(item => (item.quantity * item.unitPrice) > 10000);
    if (highValueItems.length > 0) {
      warnings.push(`${highValueItems.length} high-value item(s) detected - please verify amounts`);
    }

    const zeroVatItems = calculationDto.items.filter(item => item.vatRate === 0);
    if (zeroVatItems.length > 0) {
      warnings.push(`${zeroVatItems.length} zero-VAT item(s) - ensure proper VAT exemption justification`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private generateTemplateFields(taxForm: any): any[] {
    // Generate mobile-friendly field definitions based on tax form
    const baseFields = [
      { name: 'invoiceNumber', type: 'text', required: true, label: 'Invoice Number' },
      { name: 'date', type: 'date', required: true, label: 'Invoice Date' },
      { name: 'dueDate', type: 'date', required: false, label: 'Due Date' },
      { name: 'buyerName', type: 'text', required: true, label: 'Buyer Name' },
      { name: 'buyerNip', type: 'text', required: false, label: 'Buyer NIP' },
      { name: 'buyerAddress', type: 'textarea', required: false, label: 'Buyer Address' },
    ];

    // Add tax form specific fields
    if (taxForm.code === 'VAT') {
      baseFields.push(
        { name: 'vatPayer', type: 'boolean', required: false, label: 'VAT Payer' },
        { name: 'gtuCodes', type: 'multiselect', required: false, label: 'GTU Codes' },
      );
    }

    return baseFields;
  }

  async getInvoices(tenant_id: string, filters?: {
    companyId?: string;
    buyerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    this.logger.log(`Getting invoices for tenant ${tenant_id} with filters:`, filters);

    const whereClause: any = {
      tenant_id,
    };

    // Add filters
    if (filters?.companyId) {
      whereClause.company_id = filters.companyId;
    }

    if (filters?.buyerId) {
      whereClause.buyer_id = filters.buyerId;
    }

    if (filters?.status) {
      whereClause.status = filters.status;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      whereClause.date = {};
      if (filters.dateFrom) {
        whereClause.date.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        whereClause.date.lte = new Date(filters.dateTo);
      }
    }

    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
      include: {
        items: true,
        buyer: true,
        company: true,
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    return invoices;
  }

  async getInvoiceById(tenant_id: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenant_id,
      },
      include: {
        items: true,
        buyer: true,
        company: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    return invoice;
  }

  async updateInvoice(tenant_id: string, invoiceId: string, data: any) {
    this.logger.log(`Updating invoice ${invoiceId} for tenant ${tenant_id}`);

    // Get existing invoice
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenant_id,
      },
    });

    if (!existingInvoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    // Calculate new totals if items are being updated
    let totalNet = existingInvoice.totalNet;
    let totalVat = existingInvoice.totalVat;
    let totalGross = existingInvoice.totalGross;

    if (data.items) {
      const totals = this.calculateTotals(data.items);
      totalNet = totals.totalNet;
      totalVat = totals.totalVat;
      totalGross = totals.totalGross;
    }

    // Update invoice
    const updatedInvoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        number: data.number || existingInvoice.number,
        series: data.series || existingInvoice.series,
        date: data.date ? new Date(data.date) : existingInvoice.date,
        dueDate: data.dueDate ? new Date(data.dueDate) : existingInvoice.dueDate,
        totalNet,
        totalVat,
        totalGross,
        status: data.status || existingInvoice.status,
        // Update items if provided
        ...(data.items && {
          items: {
            deleteMany: {},
            create: data.items.map(item => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              vatRate: item.vatRate,
              gtu: item.gtu,
              netAmount: item.quantity * item.unitPrice,
              vatAmount: (item.quantity * item.unitPrice) * (item.vatRate / 100),
              grossAmount: (item.quantity * item.unitPrice) * (1 + item.vatRate / 100),
            })),
          },
        }),
      },
      include: {
        items: true,
        buyer: true,
        company: true,
      },
    });

    return updatedInvoice;
  }

  async deleteInvoice(tenant_id: string, invoiceId: string) {
    this.logger.log(`Deleting invoice ${invoiceId} for tenant ${tenant_id}`);

    // Check if invoice exists
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenant_id,
      },
    });

    if (!existingInvoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    // Delete invoice (this will cascade delete items due to schema setup)
    await this.prisma.invoice.delete({
      where: { id: invoiceId },
    });
  }
}
