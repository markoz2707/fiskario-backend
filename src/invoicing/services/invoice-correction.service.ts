import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KsefService } from '../../ksef/ksef.service';
import { CreateCorrectionInvoiceDto } from '../dto/correction-invoice.dto';

@Injectable()
export class InvoiceCorrectionService {
  private readonly logger = new Logger(InvoiceCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ksefService: KsefService,
  ) {}

  async createCorrection(tenantId: string, dto: CreateCorrectionInvoiceDto) {
    // 1. Fetch and validate original invoice
    const originalInvoice = await this.prisma.invoice.findFirst({
      where: { id: dto.originalInvoiceId, tenant_id: tenantId },
      include: { items: true, buyer: true, company: true },
    });

    if (!originalInvoice) {
      throw new NotFoundException('Original invoice not found');
    }

    if (originalInvoice.type === 'correction') {
      throw new BadRequestException('Cannot create correction of a correction invoice. Correct the original invoice instead.');
    }

    // 2. Calculate correction amounts
    const { correctedItems, totalNet, totalVat, totalGross } = this.calculateCorrectionAmounts(
      originalInvoice,
      dto,
    );

    // 3. Generate correction invoice number
    const correctionNumber = await this.generateCorrectionNumber(tenantId, dto.series || originalInvoice.series);

    // 4. Create correction invoice
    const correctionInvoice = await this.prisma.invoice.create({
      data: {
        tenant_id: tenantId,
        company_id: dto.company_id,
        buyer_id: originalInvoice.buyer_id,
        number: correctionNumber,
        series: dto.series || originalInvoice.series,
        date: new Date(dto.correctionDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        totalNet,
        totalVat,
        totalGross,
        type: 'correction',
        correctionOf: originalInvoice.id,
        correctionReason: dto.correctionReason,
        items: {
          create: correctedItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            gtu: item.gtu,
            netAmount: item.netAmount,
            vatAmount: item.vatAmount,
            grossAmount: item.grossAmount,
          })),
        },
      },
      include: { items: true, buyer: true, company: true },
    });

    // 5. Queue KSeF submission for correction (od 1.04.2026 obowiązkowe)
    await this.queueKSeFCorrectionSubmission(correctionInvoice, originalInvoice);

    this.logger.log(
      `Correction invoice ${correctionNumber} created for original ${originalInvoice.number}`,
    );

    return correctionInvoice;
  }

  async getCorrections(tenantId: string, originalInvoiceId: string) {
    return this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        correctionOf: originalInvoiceId,
        type: 'correction',
      },
      include: { items: true, buyer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private calculateCorrectionAmounts(
    originalInvoice: any,
    dto: CreateCorrectionInvoiceDto,
  ) {
    const correctedItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      gtu?: string;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
    }> = [];

    if (dto.correctionType === 'to_zero') {
      // Korekta do zera: reverse all items (negative amounts)
      for (const item of originalInvoice.items) {
        correctedItems.push({
          description: item.description,
          quantity: -item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          gtu: item.gtu,
          netAmount: -item.netAmount,
          vatAmount: -item.vatAmount,
          grossAmount: -item.grossAmount,
        });
      }
    } else if (dto.correctionType === 'full' && dto.correctedItems) {
      // Korekta pełna: difference between original and corrected
      for (const corrItem of dto.correctedItems) {
        const originalItem = corrItem.originalItemId
          ? originalInvoice.items.find((i: any) => i.id === corrItem.originalItemId)
          : null;

        const newNet = corrItem.quantity * corrItem.unitPrice;
        const newVat = newNet * (corrItem.vatRate / 100);
        const newGross = newNet + newVat;

        if (originalItem) {
          // Difference correction
          correctedItems.push({
            description: corrItem.description,
            quantity: corrItem.quantity - originalItem.quantity,
            unitPrice: corrItem.unitPrice,
            vatRate: corrItem.vatRate,
            gtu: corrItem.gtu,
            netAmount: newNet - originalItem.netAmount,
            vatAmount: newVat - originalItem.vatAmount,
            grossAmount: newGross - originalItem.grossAmount,
          });
        } else {
          // New item added in correction
          correctedItems.push({
            description: corrItem.description,
            quantity: corrItem.quantity,
            unitPrice: corrItem.unitPrice,
            vatRate: corrItem.vatRate,
            gtu: corrItem.gtu,
            netAmount: newNet,
            vatAmount: newVat,
            grossAmount: newGross,
          });
        }
      }
    } else if (dto.correctionType === 'partial' && dto.correctedItems) {
      // Korekta częściowa: only specified items
      for (const corrItem of dto.correctedItems) {
        const originalItem = corrItem.originalItemId
          ? originalInvoice.items.find((i: any) => i.id === corrItem.originalItemId)
          : null;

        const newNet = corrItem.quantity * corrItem.unitPrice;
        const newVat = newNet * (corrItem.vatRate / 100);
        const newGross = newNet + newVat;

        const diffNet = originalItem ? newNet - originalItem.netAmount : newNet;
        const diffVat = originalItem ? newVat - originalItem.vatAmount : newVat;
        const diffGross = originalItem ? newGross - originalItem.grossAmount : newGross;

        correctedItems.push({
          description: corrItem.description,
          quantity: originalItem ? corrItem.quantity - originalItem.quantity : corrItem.quantity,
          unitPrice: corrItem.unitPrice,
          vatRate: corrItem.vatRate,
          gtu: corrItem.gtu,
          netAmount: diffNet,
          vatAmount: diffVat,
          grossAmount: diffGross,
        });
      }
    }

    const totalNet = correctedItems.reduce((sum, i) => sum + i.netAmount, 0);
    const totalVat = correctedItems.reduce((sum, i) => sum + i.vatAmount, 0);
    const totalGross = correctedItems.reduce((sum, i) => sum + i.grossAmount, 0);

    return { correctedItems, totalNet, totalVat, totalGross };
  }

  private async generateCorrectionNumber(tenantId: string, series: string): Promise<string> {
    const corrSeries = `KOR/${series}`;
    const lastCorrection = await this.prisma.invoice.findFirst({
      where: { tenant_id: tenantId, series: corrSeries, type: 'correction' },
      orderBy: { createdAt: 'desc' },
    });
    const lastNum = lastCorrection ? parseInt(lastCorrection.number.split('/').pop() || '0') : 0;
    return `${corrSeries}/${(lastNum + 1).toString().padStart(4, '0')}`;
  }

  private async queueKSeFCorrectionSubmission(correctionInvoice: any, originalInvoice: any) {
    try {
      const ksefDto = {
        invoiceNumber: correctionInvoice.number,
        issueDate: correctionInvoice.date.toISOString().split('T')[0],
        dueDate: correctionInvoice.dueDate?.toISOString().split('T')[0] || correctionInvoice.date.toISOString().split('T')[0],
        sellerName: correctionInvoice.company?.name || '',
        sellerNip: correctionInvoice.company?.nip || '',
        sellerAddress: correctionInvoice.company?.address || '',
        buyerName: correctionInvoice.buyer?.name || '',
        buyerNip: correctionInvoice.buyer?.nip || '',
        buyerAddress: correctionInvoice.buyer?.address || '',
        // KSeF correction-specific fields
        correctionOf: originalInvoice.number,
        correctionOfKsefId: originalInvoice.ksefReferenceNumber || undefined,
        correctionReason: correctionInvoice.correctionReason,
        items: correctionInvoice.items.map((item: any) => ({
          name: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          gtu: item.gtu,
          netAmount: item.netAmount,
          vatAmount: item.vatAmount,
          grossAmount: item.grossAmount,
        })),
        totalNet: correctionInvoice.totalNet,
        totalVat: correctionInvoice.totalVat,
        totalGross: correctionInvoice.totalGross,
        paymentMethod: 'przelew',
        isCorrection: true,
      };

      const authStatus = this.ksefService.getAuthStatus();
      if (!authStatus.authenticated) {
        this.logger.warn('KSeF not authenticated, queuing correction for later submission');
        await this.prisma.taskQueue.create({
          data: {
            tenant_id: correctionInvoice.tenant_id,
            type: 'ksef_correction_submission',
            payload: { invoiceId: correctionInvoice.id, ksefDto },
          },
        });
        return;
      }

      await this.ksefService.submitInvoice(ksefDto, correctionInvoice.tenant_id);
      this.logger.log(`Correction invoice ${correctionInvoice.number} submitted to KSeF`);
    } catch (error) {
      this.logger.error(`Failed to submit correction to KSeF`, error);
      await this.prisma.taskQueue.create({
        data: {
          tenant_id: correctionInvoice.tenant_id,
          type: 'ksef_correction_submission_retry',
          payload: { invoiceId: correctionInvoice.id },
          status: 'pending',
          retryCount: 0,
        },
      });
    }
  }
}
