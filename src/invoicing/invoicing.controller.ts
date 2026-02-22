import { Controller, Post, Body, UseGuards, Request, Get, Param, HttpException, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoiceCorrectionService } from './services/invoice-correction.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MobileTaxCalculationDto } from '../tax-rules/dto/mobile-tax-calculation.dto';
import { MobileErrorResponseDto, MobileCalculationErrorDto } from '../tax-rules/dto/mobile-error.dto';
import { CreateCorrectionInvoiceDto } from './dto/correction-invoice.dto';

@Controller('invoicing')
export class InvoicingController {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly correctionService: InvoiceCorrectionService,
  ) {}

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

  // Correction invoices (Faktury korygujące) — KSeF submission included
  @Post('corrections')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createCorrectionInvoice(
    @Body() dto: CreateCorrectionInvoiceDto,
    @Request() req,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      return await this.correctionService.createCorrection(tenantId, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          errorCode: 'CORRECTION_ERROR',
          message: 'Failed to create correction invoice',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('corrections/:originalInvoiceId')
  @UseGuards(JwtAuthGuard)
  async getCorrections(
    @Param('originalInvoiceId') originalInvoiceId: string,
    @Request() req,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const corrections = await this.correctionService.getCorrections(tenantId, originalInvoiceId);
      return { success: true, data: corrections };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get corrections',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
