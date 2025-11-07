import { Controller, Get, Post, Put, Delete, Body, UseGuards, Request, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get()
  async getInvoices(@Request() req, @Query() queryParams) {
    try {
      console.log('📋 [INVOICES] GET request received:', {
        queryParams,
        user: req.user?.email,
        tenantId: req.user?.tenant_id,
      });

      const tenant_id = req.user?.tenant_id || 'default-tenant';

      const filters: any = {};

      // Extract query parameters
      if (queryParams.companyId) {
        filters.companyId = queryParams.companyId;
        console.log('🏢 [INVOICES] Filtering by companyId:', queryParams.companyId);
      }

      if (queryParams.buyerId) {
        filters.buyerId = queryParams.buyerId;
      }

      if (queryParams.status) {
        filters.status = queryParams.status;
      }

      if (queryParams.dateFrom) {
        filters.dateFrom = queryParams.dateFrom;
      }

      if (queryParams.dateTo) {
        filters.dateTo = queryParams.dateTo;
      }

      if (queryParams.limit) {
        filters.limit = parseInt(queryParams.limit);
      }

      if (queryParams.offset) {
        filters.offset = parseInt(queryParams.offset);
      }

      const invoices = await this.invoicingService.getInvoices(tenant_id, filters);
      console.log(`✅ [INVOICES] Found ${invoices.length} invoices`);

      return invoices;
    } catch (error) {
      console.error('❌ [INVOICES] Error fetching invoices:', error);
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'INVOICE_LIST_ERROR',
          message: 'Failed to fetch invoices',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async getInvoiceById(@Param('id') invoiceId: string, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.invoicingService.getInvoiceById(tenant_id, invoiceId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'INVOICE_FETCH_ERROR',
          message: 'Failed to fetch invoice',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  async createInvoice(@Body() data: any, @Request() req) {
    const tenant_id = req.user?.tenant_id || 'default-tenant';
    return this.invoicingService.createInvoice(tenant_id, data);
  }

  @Put(':id')
  async updateInvoice(@Param('id') invoiceId: string, @Body() data: any, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';

      // Get existing invoice
      const existingInvoice = await this.invoicingService.getInvoiceById(tenant_id, invoiceId);

      // Update invoice (simplified - you might want to add more sophisticated update logic)
      const updatedInvoice = await this.invoicingService.updateInvoice(tenant_id, invoiceId, data);

      return updatedInvoice;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'INVOICE_UPDATE_ERROR',
          message: 'Failed to update invoice',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  async deleteInvoice(@Param('id') invoiceId: string, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';

      // Check if invoice exists
      await this.invoicingService.getInvoiceById(tenant_id, invoiceId);

      // Delete invoice (you might want to add soft delete logic)
      await this.invoicingService.deleteInvoice(tenant_id, invoiceId);

      return { success: true, message: 'Invoice deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'INVOICE_DELETE_ERROR',
          message: 'Failed to delete invoice',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}