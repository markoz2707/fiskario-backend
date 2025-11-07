import { Controller, Post, Body, UseGuards, Request, Get, Param, HttpException, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MobileTaxCalculationDto } from '../tax-rules/dto/mobile-tax-calculation.dto';
import { MobileErrorResponseDto, MobileCalculationErrorDto } from '../tax-rules/dto/mobile-error.dto';

@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createInvoice(@Body() data: any, @Request() req) {
    const tenant_id = req.user?.tenant_id || 'default-tenant';
    return this.invoicingService.createInvoice(tenant_id, data);
  }

  // Mobile-specific endpoints
  @Post('mobile/calculate')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async calculateMobileInvoice(@Body() calculationDto: MobileTaxCalculationDto, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.invoicingService.calculateMobileInvoice(tenant_id, calculationDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        new MobileCalculationErrorDto(
          'Mobile invoice calculation failed',
          'invoice_calculation',
          error.message
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('mobile/preview')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async previewMobileInvoice(@Body() calculationDto: MobileTaxCalculationDto, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.invoicingService.previewMobileInvoice(tenant_id, calculationDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'PREVIEW_ERROR',
          message: 'Invoice preview failed',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('mobile/templates/:companyId')
  @UseGuards(JwtAuthGuard)
  async getMobileInvoiceTemplates(@Param('companyId') companyId: string, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.invoicingService.getMobileInvoiceTemplates(tenant_id, companyId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'TEMPLATE_ERROR',
          message: 'Failed to fetch invoice templates',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('mobile/validate')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async validateMobileInvoice(@Body() calculationDto: MobileTaxCalculationDto, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.invoicingService.validateMobileInvoice(tenant_id, calculationDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Invoice validation failed',
          details: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
