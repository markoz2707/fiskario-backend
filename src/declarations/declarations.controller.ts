import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaxCalculationService } from './services/tax-calculation.service';
import { XMLGenerationService } from './services/xml-generation.service';
import {
  CreateDeclarationDto,
  UpdateDeclarationDto,
  CreateVATRegisterDto,
  DeclarationType
} from './dto/tax-calculation.dto';

@Controller('declarations')
@UseGuards(JwtAuthGuard)
export class DeclarationsController {
  constructor(
    private readonly taxCalculationService: TaxCalculationService,
    private readonly xmlGenerationService: XMLGenerationService,
  ) {}

  /**
   * Calculate VAT-7 declaration for a specific period
   */
  @Post('calculate/vat-7')
  async calculateVAT7(@Request() req, @Body() body: { period: string, companyId: string }) {
    try {
      const { period, companyId } = body;
      const calculation = await this.taxCalculationService.calculateVAT7(
        req.user.tenant_id,
        companyId,
        period
      );

      return {
        success: true,
        data: calculation,
        message: `VAT-7 calculation completed for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate VAT-7',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate JPK_V7 (monthly or quarterly) for a specific period
   */
  @Post('calculate/jpk-v7')
  async calculateJPKV7(
    @Request() req,
    @Body() body: { period: string, companyId: string, variant: 'M' | 'K' }
  ) {
    try {
      const { period, companyId, variant } = body;
      const calculation = await this.taxCalculationService.calculateJPKV7(
        req.user.tenant_id,
        companyId,
        period,
        variant
      );

      return {
        success: true,
        data: calculation,
        message: `JPK_V7${variant} calculation completed for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate JPK_V7',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate PIT advance payment
   */
  @Post('calculate/pit-advance')
  async calculatePITAdvance(@Request() req, @Body() body: { period: string, companyId: string }) {
    try {
      const { period, companyId } = body;
      const calculation = await this.taxCalculationService.calculatePITAdvance(
        req.user.tenant_id,
        companyId,
        period
      );

      return {
        success: true,
        data: calculation,
        message: `PIT advance calculation completed for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate PIT advance',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate CIT (corporate income tax)
   */
  @Post('calculate/cit')
  async calculateCIT(@Request() req, @Body() body: { period: string, companyId: string }) {
    try {
      const { period, companyId } = body;
      const calculation = await this.taxCalculationService.calculateCIT(
        req.user.tenant_id,
        companyId,
        period
      );

      return {
        success: true,
        data: calculation,
        message: `CIT calculation completed for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate CIT',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate PIT-36 (annual tax return)
   */
  @Post('calculate/pit-36')
  async calculatePIT36(@Request() req, @Body() body: { year: number, companyId: string }) {
    try {
      const { year, companyId } = body;
      const calculation = await this.taxCalculationService.calculatePIT36(
        req.user.tenant_id,
        companyId,
        year
      );

      return {
        success: true,
        data: calculation,
        message: `PIT-36 calculation completed for year ${year}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate PIT-36',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate PIT-36L (linear tax annual return)
   */
  @Post('calculate/pit-36l')
  async calculatePIT36L(@Request() req, @Body() body: { year: number, companyId: string }) {
    try {
      const { year, companyId } = body;
      const calculation = await this.taxCalculationService.calculatePIT36L(
        req.user.tenant_id,
        companyId,
        year
      );

      return {
        success: true,
        data: calculation,
        message: `PIT-36L calculation completed for year ${year}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate PIT-36L',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate CIT-8 (corporate income tax return)
   */
  @Post('calculate/cit-8')
  async calculateCIT8(@Request() req, @Body() body: { year: number, companyId: string }) {
    try {
      const { year, companyId } = body;
      const calculation = await this.taxCalculationService.calculateCIT8(
        req.user.tenant_id,
        companyId,
        year
      );

      return {
        success: true,
        data: calculation,
        message: `CIT-8 calculation completed for year ${year}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate CIT-8',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate CIT-8AB (simplified corporate tax return)
   */
  @Post('calculate/cit-8ab')
  async calculateCIT8AB(@Request() req, @Body() body: { year: number, companyId: string }) {
    try {
      const { year, companyId } = body;
      const calculation = await this.taxCalculationService.calculateCIT8AB(
        req.user.tenant_id,
        companyId,
        year
      );

      return {
        success: true,
        data: calculation,
        message: `CIT-8AB calculation completed for year ${year}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate CIT-8AB',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate VAT-UE (EU VAT declaration)
   */
  @Post('calculate/vat-ue')
  async calculateVATUE(@Request() req, @Body() body: { period: string, companyId: string }) {
    try {
      const { period, companyId } = body;
      const calculation = await this.taxCalculationService.calculateVATUE(
        req.user.tenant_id,
        companyId,
        period
      );

      return {
        success: true,
        data: calculation,
        message: `VAT-UE calculation completed for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate VAT-UE',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Calculate PCC-3 (civil law transactions tax)
   */
  @Post('calculate/pcc-3')
  async calculatePCC3(@Request() req, @Body() body: { period: string, companyId: string }) {
    try {
      const { period, companyId } = body;
      const calculation = await this.taxCalculationService.calculatePCC3(
        req.user.tenant_id,
        companyId,
        period
      );

      return {
        success: true,
        data: calculation,
        message: `PCC-3 calculation completed for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to calculate PCC-3',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Generate XML for declaration
   */
  @Post('generate-xml')
  async generateXML(
    @Request() req,
    @Body() body: {
      type: DeclarationType,
      period: string,
      companyId: string,
      variant?: 'M' | 'K',
      calculationData: any
    }
  ) {
    try {
      const { type, period, companyId, variant, calculationData } = body;

      // Get company information
      const company = await this.getCompanyInfo(req.user.tenant_id, companyId);

      let xmlContent = '';

      switch (type) {
        case DeclarationType.VAT_7:
          xmlContent = this.xmlGenerationService.generateVAT7XML(calculationData, company);
          break;
        case DeclarationType.JPK_V7M:
        case DeclarationType.JPK_V7K:
          xmlContent = this.xmlGenerationService.generateJPKV7XML({
            ...calculationData,
            variant: variant || 'M'
          });
          break;
        case DeclarationType.PIT_36:
          xmlContent = this.xmlGenerationService.generatePIT36XML(calculationData, company);
          break;
        case DeclarationType.PIT_36L:
          xmlContent = this.xmlGenerationService.generatePIT36LXML(calculationData, company);
          break;
        case DeclarationType.CIT_8:
          xmlContent = this.xmlGenerationService.generateCIT8XML(calculationData, company);
          break;
        case DeclarationType.CIT_8AB:
          xmlContent = this.xmlGenerationService.generateCIT8ABXML(calculationData, company);
          break;
        case DeclarationType.VAT_UE:
          xmlContent = this.xmlGenerationService.generateVATUEXML(calculationData, company);
          break;
        case DeclarationType.PCC_3:
          xmlContent = this.xmlGenerationService.generatePCC3XML(calculationData, company);
          break;
        default:
          throw new Error(`Unsupported declaration type: ${type}`);
      }

      return {
        success: true,
        data: {
          xmlContent,
          type,
          period,
          fileName: `${type}_${period}_${company.nip}.xml`
        },
        message: `XML generated successfully for ${type} period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to generate XML',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Add VAT register entry
   */
  @Post('vat-register')
  async addVATRegister(@Request() req, @Body() dto: CreateVATRegisterDto & { companyId: string }) {
    try {
      const { companyId, ...registerDto } = dto;
      const vatRegister = await this.taxCalculationService.addVATRegisterEntry(
        req.user.tenant_id,
        companyId,
        registerDto
      );

      return {
        success: true,
        data: vatRegister,
        message: 'VAT register entry added successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to add VAT register entry',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get VAT registers for a period
   */
  @Get('vat-register/:period/:companyId')
  async getVATRegisters(
    @Request() req,
    @Param('period') period: string,
    @Param('companyId') companyId: string,
    @Query('type') type?: string
  ) {
    try {
      const registers = await this.taxCalculationService.getVATRegisters(
        req.user.tenant_id,
        companyId,
        period,
        type as any
      );

      return {
        success: true,
        data: registers,
        message: `VAT registers retrieved for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve VAT registers',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Auto-populate VAT registers from KSeF invoices
   */
  @Post('populate-vat-registers')
  async populateVATRegisters(
    @Request() req,
    @Body() body: { period: string, companyId: string }
  ) {
    try {
      const { period, companyId } = body;
      const vatRegisters = await this.taxCalculationService.populateVATRegistersFromKSeF(
        req.user.tenant_id,
        companyId,
        period
      );

      return {
        success: true,
        data: vatRegisters,
        message: `VAT registers populated from KSeF invoices for period ${period}`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to populate VAT registers',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get upcoming declaration deadlines
   */
  @Get('deadlines/:companyId')
  async getUpcomingDeadlines(@Request() req, @Param('companyId') companyId: string) {
    try {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();

      // Calculate deadlines for current year
      const deadlines: any[] = [];

      // VAT-7 monthly deadlines (25th of following month)
      for (let month = currentDate.getMonth() + 1; month <= 12; month++) {
        const deadline = new Date(currentYear, month, 25);
        if (deadline >= currentDate) {
          deadlines.push({
            type: DeclarationType.VAT_7,
            period: `${currentYear}-${month.toString().padStart(2, '0')}`,
            deadline: deadline.toISOString(),
            description: `VAT-7 for ${month}/${currentYear}`
          });
        }
      }

      // JPK_V7M monthly deadlines (25th of following month)
      for (let month = currentDate.getMonth() + 1; month <= 12; month++) {
        const deadline = new Date(currentYear, month, 25);
        if (deadline >= currentDate) {
          deadlines.push({
            type: DeclarationType.JPK_V7M,
            period: `${currentYear}-${month.toString().padStart(2, '0')}`,
            deadline: deadline.toISOString(),
            description: `JPK_V7M for ${month}/${currentYear}`
          });
        }
      }

      // JPK_V7K quarterly deadlines
      const quarters = [
        { quarter: 1, month: 4, description: 'Q1' },
        { quarter: 2, month: 7, description: 'Q2' },
        { quarter: 3, month: 10, description: 'Q3' },
        { quarter: 4, month: 1, description: 'Q4' }
      ];

      for (const q of quarters) {
        let deadlineYear = currentYear;
        let deadlineMonth = q.month;

        if (q.quarter === 4) {
          deadlineYear = currentYear + 1;
          deadlineMonth = 1;
        }

        const deadline = new Date(deadlineYear, deadlineMonth, 25);
        if (deadline >= currentDate) {
          deadlines.push({
            type: DeclarationType.JPK_V7K,
            period: `${deadlineYear}-K${q.quarter}`,
            deadline: deadline.toISOString(),
            description: `JPK_V7K ${q.description} ${deadlineYear}`
          });
        }
      }

      // Annual declaration deadlines (31st March of following year)
      const annualDeadline = new Date(currentYear + 1, 2, 31); // March 31st
      if (annualDeadline >= currentDate) {
        // PIT-36, PIT-36L, CIT-8, CIT-8AB annual deadlines
        const annualDeclarations = [
          { type: DeclarationType.PIT_36, description: 'PIT-36 Annual Tax Return' },
          { type: DeclarationType.PIT_36L, description: 'PIT-36L Linear Tax Annual Return' },
          { type: DeclarationType.CIT_8, description: 'CIT-8 Corporate Income Tax Return' },
          { type: DeclarationType.CIT_8AB, description: 'CIT-8AB Simplified Corporate Tax Return' }
        ];

        for (const decl of annualDeclarations) {
          deadlines.push({
            type: decl.type,
            period: `${currentYear}`,
            deadline: annualDeadline.toISOString(),
            description: `${decl.description} for ${currentYear}`
          });
        }
      }

      // PCC-3 quarterly deadlines (25th of month following quarter end)
      const pccQuarters = [
        { quarter: 1, month: 4, description: 'Q1' },
        { quarter: 2, month: 7, description: 'Q2' },
        { quarter: 3, month: 10, description: 'Q3' },
        { quarter: 4, month: 1, description: 'Q4' }
      ];

      for (const q of pccQuarters) {
        let deadlineYear = currentYear;
        let deadlineMonth = q.month;

        if (q.quarter === 4) {
          deadlineYear = currentYear + 1;
          deadlineMonth = 1;
        }

        const deadline = new Date(deadlineYear, deadlineMonth, 25);
        if (deadline >= currentDate) {
          deadlines.push({
            type: DeclarationType.PCC_3,
            period: `${deadlineYear}-K${q.quarter}`,
            deadline: deadline.toISOString(),
            description: `PCC-3 ${q.description} ${deadlineYear}`
          });
        }
      }

      // VAT-UE quarterly deadlines (25th of month following quarter end)
      for (const q of quarters) {
        let deadlineYear = currentYear;
        let deadlineMonth = q.month;

        if (q.quarter === 4) {
          deadlineYear = currentYear + 1;
          deadlineMonth = 1;
        }

        const deadline = new Date(deadlineYear, deadlineMonth, 25);
        if (deadline >= currentDate) {
          deadlines.push({
            type: DeclarationType.VAT_UE,
            period: `${deadlineYear}-K${q.quarter}`,
            deadline: deadline.toISOString(),
            description: `VAT-UE ${q.description} ${deadlineYear}`
          });
        }
      }

      // Sort by deadline
      deadlines.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

      return {
        success: true,
        data: deadlines,
        message: 'Upcoming declaration deadlines retrieved'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve deadlines',
          error: error.name
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Helper method to get company information
   */
  private async getCompanyInfo(tenantId: string, companyId: string) {
    // This would typically use a CompanyService
    // For now, return a basic structure
    return {
      nip: '1234567890', // This should come from the actual company data
      name: 'Company Name',
      regon: '',
      countryCode: 'PL'
    };
  }
}