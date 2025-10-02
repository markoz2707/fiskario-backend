import { Controller, Post, Get, Body, Param, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KsefService } from './ksef.service';
import { KSeFAuthDto, KSeFTokenRequestDto } from './dto/ksef-auth.dto';
import { KSeFInvoiceDto } from './dto/ksef-invoice.dto';

@Controller('ksef')
@UseGuards(JwtAuthGuard)
export class KsefController {
  private readonly logger = new Logger(KsefController.name);

  constructor(private readonly ksefService: KsefService) {}

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
  async submitInvoice(@Body() invoiceDto: KSeFInvoiceDto) {
    this.logger.log(`Invoice submission request received for ${invoiceDto.invoiceNumber}`);
    // TODO: Get tenant_id from JWT token
    const tenantId = 'current-tenant-id'; // This should come from the JWT token
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
}