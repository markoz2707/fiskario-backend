import { Controller, Get, Post, Body, Param, Patch, UseGuards, HttpException, HttpStatus, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { CreateTaxFormDto } from './dto/create-tax-form.dto';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { CreateCompanyTaxSettingsDto } from './dto/create-company-tax-settings.dto';
import { MobileTaxCalculationDto, MobileTaxSyncDto } from './dto/mobile-tax-calculation.dto';
import { MobileErrorResponseDto, MobileValidationErrorDto, MobileCalculationErrorDto } from './dto/mobile-error.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tax-rules')
@UseGuards(JwtAuthGuard)
export class TaxRulesController {
  constructor(private readonly taxRulesService: TaxRulesService) {}

  // Tax Forms endpoints
  @Post('tax-forms')
  createTaxForm(@Body() createTaxFormDto: CreateTaxFormDto) {
    return this.taxRulesService.createTaxForm(createTaxFormDto);
  }

  @Get('tax-forms')
  getTaxForms() {
    return this.taxRulesService.getTaxForms();
  }

  @Get('tax-forms/:id')
  getTaxFormById(@Param('id') id: string) {
    return this.taxRulesService.getTaxFormById(id);
  }

  // Tax Rules endpoints
  @Post('tax-rules')
  createTaxRule(@Body() createTaxRuleDto: CreateTaxRuleDto) {
    return this.taxRulesService.createTaxRule(createTaxRuleDto);
  }

  @Get('tax-forms/:taxFormId/rules')
  getTaxRulesByForm(@Param('taxFormId') taxFormId: string) {
    return this.taxRulesService.getTaxRulesByForm(taxFormId);
  }

  // Company Tax Settings endpoints
  @Post('company-settings')
  createCompanyTaxSettings(@Body() createCompanyTaxSettingsDto: CreateCompanyTaxSettingsDto) {
    return this.taxRulesService.createCompanyTaxSettings(createCompanyTaxSettingsDto);
  }

  @Get('companies/:companyId/settings')
  getCompanyTaxSettings(@Param('companyId') companyId: string) {
    return this.taxRulesService.getCompanyTaxSettings(companyId);
  }

  @Patch('companies/:companyId/tax-forms/:taxFormId')
  updateCompanyTaxSettings(
    @Param('companyId') companyId: string,
    @Param('taxFormId') taxFormId: string,
    @Body() body: { isSelected: boolean },
  ) {
    return this.taxRulesService.updateCompanyTaxSettings(
      companyId,
      taxFormId,
      body.isSelected,
    );
  }

  // Mobile-specific tax calculation endpoints
  @Post('mobile/calculate')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async calculateTaxForMobile(
    @Body() calculationDto: MobileTaxCalculationDto,
    @Request() req,
  ) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.calculateTaxForMobile(tenant_id, calculationDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error.name === 'ValidationError') {
        throw new HttpException(
          new MobileValidationErrorDto(
            'Invalid calculation data provided',
            error.details || []
          ),
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(
        new MobileCalculationErrorDto(
          'Tax calculation failed',
          error.step || 'unknown',
          error.message
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('mobile/sync')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async syncMobileTaxData(
    @Body() syncDto: MobileTaxSyncDto,
    @Request() req,
  ) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.syncMobileTaxData(tenant_id, syncDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'SYNC_ERROR',
          message: 'Mobile sync failed',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('mobile/tax-forms/:companyId')
  @UseGuards(JwtAuthGuard)
  async getMobileTaxForms(@Param('companyId') companyId: string, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.getMobileTaxForms(tenant_id, companyId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'FETCH_ERROR',
          message: 'Failed to fetch tax forms for mobile',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('mobile/tax-rules/:companyId')
  @UseGuards(JwtAuthGuard)
  async getMobileTaxRules(@Param('companyId') companyId: string, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.getMobileTaxRules(tenant_id, companyId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'FETCH_ERROR',
          message: 'Failed to fetch tax rules for mobile',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('mobile/validate-calculation')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async validateMobileCalculation(@Body() calculationDto: MobileTaxCalculationDto) {
    try {
      return await this.taxRulesService.validateMobileCalculation(calculationDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        new MobileValidationErrorDto(
          'Calculation validation failed',
          error.details || []
        ),
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}