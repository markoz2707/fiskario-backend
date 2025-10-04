import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { JPKV7Service } from './services/jpk-v7.service';
import {
  GenerateJPKV7Dto,
  ValidateJPKV7Dto,
  SignJPKV7Dto,
  GTUAssignmentDto,
  ProcedureCodeDto
} from './dto/jpk-v7.dto';

@Controller('jpk-v7')
export class JPKV7Controller {
  constructor(private readonly jpkV7Service: JPKV7Service) {}

  /**
   * Generate JPK_V7M (monthly) XML
   */
  @Post('generate-monthly')
  async generateMonthly(@Body() dto: Omit<GenerateJPKV7Dto, 'variant'>, @Request() req) {
    try {
      const result = await this.jpkV7Service.generateJPKV7M({
        ...dto,
        tenantId: req.user.tenant_id
      });

      if (!result.success) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'JPK_V7 generation failed',
            details: result.errors
          },
          HttpStatus.BAD_REQUEST
        );
      }

      return {
        success: true,
        data: {
          xmlContent: result.xmlContent,
          validationResult: result.validationResult,
          signatureResult: result.signatureResult,
          calculationData: result.calculationData,
          warnings: result.warnings,
          metadata: result.metadata
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal server error during JPK_V7 generation'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Generate JPK_V7K (quarterly) XML
   */
  @Post('generate-quarterly')
  async generateQuarterly(@Body() dto: Omit<GenerateJPKV7Dto, 'variant'>, @Request() req) {
    try {
      const result = await this.jpkV7Service.generateJPKV7K({
        ...dto,
        tenantId: req.user.tenant_id
      });

      if (!result.success) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'JPK_V7 generation failed',
            details: result.errors
          },
          HttpStatus.BAD_REQUEST
        );
      }

      return {
        success: true,
        data: {
          xmlContent: result.xmlContent,
          validationResult: result.validationResult,
          signatureResult: result.signatureResult,
          calculationData: result.calculationData,
          warnings: result.warnings,
          metadata: result.metadata
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal server error during JPK_V7 generation'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Validate JPK_V7 XML
   */
  @Post('validate')
  async validateXML(@Body() dto: ValidateJPKV7Dto) {
    try {
      const result = await this.jpkV7Service.validateJPKV7XML(dto.xmlContent, dto.variant);

      return {
        success: true,
        data: {
          isValid: result.isValid,
          errors: result.errors,
          warnings: result.warnings,
          schemaVersion: result.schemaVersion,
          xmlSize: result.xmlSize,
          encoding: result.encoding
        }
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'XML validation failed'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Sign JPK_V7 XML
   */
  @Post('sign')
  async signXML(@Body() dto: SignJPKV7Dto, @Request() req) {
    try {
      const signatureConfig = {
        signatureType: dto.signatureType,
        certificatePath: dto.certificatePath,
        privateKeyPath: dto.privateKeyPath,
        passphrase: dto.passphrase,
        trustedProfileId: dto.trustedProfileId
      };

      const result = await this.jpkV7Service.signJPKV7XML(
        dto.xmlContent,
        signatureConfig
      );

      return {
        success: true,
        data: {
          signedXml: result.signedXml,
          signatureId: result.signatureId,
          signatureType: result.signatureType,
          signingTime: result.signingTime,
          certificateInfo: result.certificateInfo
        }
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'XML signing failed'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Assign GTU codes to transaction
   */
  @Post('gtu/assign')
  async assignGTUCodes(@Body() dto: GTUAssignmentDto) {
    try {
      const result = this.jpkV7Service.assignGTUCodes(
        dto.description,
        dto.category,
        dto.amount,
        dto.additionalContext
      );

      return {
        success: true,
        data: {
          gtuCodes: result.gtuCodes,
          confidence: result.confidence,
          reasoning: result.reasoning
        }
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'GTU code assignment failed'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Assign procedure codes to transaction
   */
  @Post('procedures/assign')
  async assignProcedureCodes(@Body() dto: ProcedureCodeDto) {
    try {
      const result = this.jpkV7Service.assignProcedureCodes(dto);

      return {
        success: true,
        data: {
          procedureCodes: result.procedureCodes,
          confidence: result.confidence,
          reasoning: result.reasoning,
          requiresAdditionalInfo: result.requiresAdditionalInfo
        }
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Procedure code assignment failed'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get all available GTU codes
   */
  @Get('gtu/codes')
  async getGTUCodes() {
    try {
      const codes = this.jpkV7Service.getAllGTUCodes();

      return {
        success: true,
        data: codes
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to retrieve GTU codes'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get all available procedure codes
   */
  @Get('procedures/codes')
  async getProcedureCodes() {
    try {
      const codes = this.jpkV7Service.getAllProcedureCodes();

      return {
        success: true,
        data: codes
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to retrieve procedure codes'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get available signature methods
   */
  @Get('signature-methods')
  async getSignatureMethods() {
    try {
      const methods = this.jpkV7Service.getAvailableSignatureMethods();

      return {
        success: true,
        data: methods
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to retrieve signature methods'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Check if JPK_V7 is required for period
   */
  @Get('required/:period/:companyId')
  async isJPKV7Required(
    @Param('period') period: string,
    @Param('companyId') companyId: string,
    @Request() req
  ) {
    try {
      // Get company info
      const companyInfo = await this.getCompanyInfo(companyId);

      const isRequired = this.jpkV7Service.isJPKV7Required(period, companyInfo);

      return {
        success: true,
        data: {
          isRequired,
          period,
          companyId
        }
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to check JPK_V7 requirement'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get submission deadline for period
   */
  @Get('deadline/:period/:variant')
  async getSubmissionDeadline(
    @Param('period') period: string,
    @Param('variant') variant: 'M' | 'K'
  ) {
    try {
      const deadline = this.jpkV7Service.getSubmissionDeadline(period, variant);

      return {
        success: true,
        data: {
          period,
          variant,
          deadline: deadline.toISOString(),
          daysUntilDeadline: Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        }
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to calculate submission deadline'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Helper method to get company info (would need to be implemented with proper service)
   */
  private async getCompanyInfo(companyId: string): Promise<any> {
    // This would typically use a company service
    // For now, return a mock structure
    return {
      id: companyId,
      vatPayer: true
    };
  }
}