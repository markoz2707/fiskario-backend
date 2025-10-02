import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createInvoice(@Body() data: any, @Request() req) {
    const tenant_id = req.user.tenant_id;
    return this.invoicingService.createInvoice(tenant_id, data);
  }
}
