import { Controller, Post, Get, Body, Param, UseGuards, Logger, Query, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KsefService } from './ksef.service';
import { KsefReceiverService } from './ksef-receiver.service';
import { KSeFAuthDto, KSeFTokenRequestDto } from './dto/ksef-auth.dto';
import { KSeFInvoiceDto } from './dto/ksef-invoice.dto';
import { KSeFSyncRequestDto } from './dto/ksef-received-invoice.dto';

@Controller('ksef')
@UseGuards(JwtAuthGuard)
export class KsefController {
  private readonly logger = new Logger(KsefController.name);

  constructor(
    private readonly ksefService: KsefService,
    private readonly ksefReceiverService: KsefReceiverService,
  ) { }

  @Post('authenticate')
  async authenticate(@Body() authDto: KSeFTokenRequestDto) {
    this.logger.log('KSeF authentication request received');
    return this.ksefService.authenticate(authDto);
  }

  @Get('status')
  async getStatus() {
    this.logger.log('KSeF status check request received');
    return this.ksefService.getAuthStatus();
  }

  @Post('invoice/submit')
  async submitInvoice(
    @Body() invoiceDto: KSeFInvoiceDto,
    @Req() req?: any,
  ) {
    this.logger.log(`Invoice submission request received for ${invoiceDto.invoiceNumber}`);
    const tenantId = req.user?.tenant_id;
    return this.ksefService.submitInvoice(invoiceDto, tenantId);
  }

  @Get('invoice/:referenceNumber/status')
  async checkInvoiceStatus(@Param('referenceNumber') referenceNumber: string) {
    this.logger.log(`Invoice status check request received for ${referenceNumber}`);
    return this.ksefService.checkInvoiceStatus(referenceNumber);
  }

  @Get('invoice/:referenceNumber/upo')
  async getUPO(@Param('referenceNumber') referenceNumber: string) {
    this.logger.log(`UPO request received for ${referenceNumber}`);
    return this.ksefService.getUPO(referenceNumber);
  }

  // ========== INVOICE RECEIVING ENDPOINTS ==========

  @Get('invoices/incoming')
  async getIncomingInvoices(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Req() req?: any,
  ) {
    this.logger.log('Incoming invoices list request received');
    const tenantId = req.user?.tenant_id || 'current-tenant-id';

    const params = {
      dateFrom: dateFrom ? new Date(dateFrom) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dateTo: dateTo ? new Date(dateTo) : new Date(),
    };

    return this.ksefReceiverService.getIncomingInvoices(tenantId, params);
  }

  @Get('invoices/:ksefNumber/download')
  async downloadInvoice(
    @Param('ksefNumber') ksefNumber: string,
    @Req() req?: any,
  ) {
    this.logger.log(`Download invoice request received for ${ksefNumber}`);
    const tenantId = req.user?.tenant_id || 'current-tenant-id';
    return this.ksefReceiverService.downloadInvoice(ksefNumber, tenantId);
  }

  @Post('invoices/sync')
  async syncInvoices(
    @Body() syncRequest: KSeFSyncRequestDto,
    @Req() req?: any,
  ) {
    this.logger.log('Invoice sync request received');
    const tenantId = req.user?.tenant_id || 'current-tenant-id';
    const companyId = req.user?.company_id || 'current-company-id';

    return this.ksefReceiverService.processNewInvoices(tenantId, companyId, syncRequest);
  }

  @Post('invoices/:invoiceId/approve')
  async approveInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body('notes') notes?: string,
    @Req() req?: any,
  ) {
    this.logger.log(`Invoice approval request received for ${invoiceId}`);
    const tenantId = req.user?.tenant_id || 'current-tenant-id';
    const userId = req.user?.id || 'current-user-id';

    await this.ksefReceiverService.approveInvoice(invoiceId, tenantId, userId, notes);
    return { success: true, message: 'Invoice approved successfully' };
  }

  @Post('invoices/:invoiceId/reject')
  async rejectInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body('reason') reason: string,
    @Req() req?: any,
  ) {
    this.logger.log(`Invoice rejection request received for ${invoiceId}`);
    const tenantId = req.user?.tenant_id || 'current-tenant-id';
    const userId = req.user?.id || 'current-user-id';

    await this.ksefReceiverService.rejectInvoice(invoiceId, tenantId, userId, reason);
    return { success: true, message: 'Invoice rejected successfully' };
  }
}