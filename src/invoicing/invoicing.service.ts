import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KsefService } from '../ksef/ksef.service';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private prisma: PrismaService,
    private ksefService: KsefService,
  ) {}

  async createInvoice(tenant_id: string, data: any) {
    this.logger.log(`Creating invoice for tenant ${tenant_id}`);
    // Validate KSeF compliance
    this.validateKSeF(data);

    // Generate invoice number
    const number = await this.generateInvoiceNumber(tenant_id, data.series);

    // Calculate totals
    const { totalNet, totalVat, totalGross } = this.calculateTotals(data.items);

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        tenant_id,
        company_id: data.company_id,
        number,
        series: data.series,
        date: new Date(data.date),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        buyerName: data.buyerName,
        buyerNip: data.buyerNip,
        buyerAddress: data.buyerAddress,
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
      include: { items: true },
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
      buyerName: invoice.buyerName,
      buyerNip: invoice.buyerNip || '',
      buyerAddress: invoice.buyerAddress || '',
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
}
