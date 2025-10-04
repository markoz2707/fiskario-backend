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
  HttpException,
  Put,
  Logger
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EDeklaracjeService } from './services/e-deklaracje.service';
import { EDeklaracjeAuthService } from './services/e-deklaracje-auth.service';
import { UPOProcessingService } from './services/upo-processing.service';
import { DeclarationStatusService } from './services/declaration-status.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { SignatureService } from './services/signature.service';

interface SubmissionRequest {
  declarationId: string;
  signatureType: 'profil_zaufany' | 'qes' | 'none';
  credentials?: {
    login?: string;
    password?: string;
    certificate?: string;
    privateKey?: string;
    passphrase?: string;
  };
}

interface StatusCheckRequest {
  upoNumber: string;
}

interface UPOValidationRequest {
  upoNumber: string;
}

@Controller('e-deklaracje')
@UseGuards(JwtAuthGuard)
export class EDeklaracjeController {
  private readonly logger = new Logger(EDeklaracjeController.name);

  constructor(
    private readonly eDeklaracjeService: EDeklaracjeService,
    private readonly eDeklaracjeAuthService: EDeklaracjeAuthService,
    private readonly upoProcessingService: UPOProcessingService,
    private readonly declarationStatusService: DeclarationStatusService,
    private readonly errorHandlingService: ErrorHandlingService,
    private readonly signatureService: SignatureService
  ) {}

  /**
   * Submit declaration to e-Deklaracje system
   */
  @Post('submit')
  async submitDeclaration(@Request() req, @Body() submissionRequest: SubmissionRequest) {
    try {
      const { declarationId, signatureType, credentials } = submissionRequest;

      this.logger.log(`Submitting declaration ${declarationId} to e-Deklaracje`);

      // Get declaration from database
      const declaration = await this.getDeclaration(declarationId, req.user.tenant_id);
      if (!declaration) {
        throw new HttpException('Declaration not found', HttpStatus.NOT_FOUND);
      }

      // Validate authentication for submission
      const authValidation = await this.eDeklaracjeAuthService.validateSubmissionAuth(
        req.user.tenant_id,
        declaration.type
      );

      if (!authValidation.isValidForSubmission) {
        throw new HttpException(
          authValidation.error || 'Authentication validation failed',
          HttpStatus.UNAUTHORIZED
        );
      }

      // Sign the document if required
      let signedXml = declaration.xmlContent;
      let signatureResult;

      if (signatureType !== 'none') {
        signatureResult = await this.signDocument(
          req.user.tenant_id,
          declaration.xmlContent,
          signatureType,
          credentials
        );

        if (!signatureResult.success) {
          throw new HttpException(
            `Signature failed: ${signatureResult.error}`,
            HttpStatus.BAD_REQUEST
          );
        }

        signedXml = this.signatureService.createSignatureEnvelope(
          declaration.xmlContent,
          signatureResult.signature || 'NO_SIGNATURE',
          signatureType,
          signatureResult.certificate
        );
      }

      // Submit to e-Deklaracje
      const submissionResult = await this.eDeklaracjeService.submitDeclaration({
        documentType: declaration.type,
        documentVersion: '1.0',
        xmlContent: signedXml,
        signatureType: signatureType,
        certificateInfo: signatureResult?.certificateInfo
      });

      if (submissionResult.success) {
        // Update declaration status
        await this.declarationStatusService.markAsSubmitted(
          declarationId,
          submissionResult.upoNumber,
          submissionResult.upoDate
        );

        // Process UPO if received
        if (submissionResult.upoNumber) {
          await this.processUPO(submissionResult.upoNumber, declarationId);
        }

        return {
          success: true,
          data: {
            upoNumber: submissionResult.upoNumber,
            upoDate: submissionResult.upoDate,
            status: submissionResult.status,
            message: submissionResult.message,
            signatureInfo: signatureResult
          },
          message: 'Declaration submitted successfully'
        };
      } else {
        // Handle submission error
        await this.errorHandlingService.handleSubmissionError(
          declarationId,
          new Error(submissionResult.error || 'Submission failed'),
          { signatureType, submissionRequest }
        );

        throw new HttpException(
          submissionResult.error || 'Submission failed',
          HttpStatus.BAD_REQUEST
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Declaration submission failed:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Internal server error during submission',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Check declaration status using UPO number
   */
  @Post('status')
  async checkDeclarationStatus(@Body() statusRequest: StatusCheckRequest) {
    try {
      const { upoNumber } = statusRequest;

      const statusResult = await this.eDeklaracjeService.checkDeclarationStatus(upoNumber);

      return {
        success: true,
        data: statusResult,
        message: 'Status retrieved successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check declaration status',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Validate UPO (Official Receipt Confirmation)
   */
  @Post('validate-upo')
  async validateUPO(@Body() validationRequest: UPOValidationRequest) {
    try {
      const { upoNumber } = validationRequest;

      // For UPO validation, we need the UPO XML content
      // This would typically come from the e-Deklaracje response
      const mockUpoXml = `<UPO><Numer>${upoNumber}</Numer></UPO>`;
      const validationResult = await this.upoProcessingService.processUPO(mockUpoXml, 'temp-declaration-id');

      return {
        success: true,
        data: {
          isValid: validationResult.isValid,
          upoNumber: validationResult.upoNumber,
          confirmationDate: validationResult.confirmationDate,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          details: validationResult.details
        },
        message: validationResult.isValid ? 'UPO is valid' : 'UPO validation failed'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'UPO validation failed',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get UPO details
   */
  @Get('upo/:upoNumber')
  async getUPO(@Param('upoNumber') upoNumber: string) {
    try {
      const upoData = await this.upoProcessingService.getUPOByNumber(upoNumber);

      if (!upoData) {
        throw new HttpException('UPO not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        data: upoData,
        message: 'UPO retrieved successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve UPO',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get UPOs for a company
   */
  @Get('upos/:companyId')
  async getUPOsForCompany(
    @Param('companyId') companyId: string,
    @Query('limit') limit?: string
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 50;
      const upos = await this.upoProcessingService.getUPOsForCompany(companyId, limitNum);

      return {
        success: true,
        data: upos,
        message: `Retrieved ${upos.length} UPOs`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve UPOs',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get declaration status summary for a company
   */
  @Get('status-summary/:companyId')
  async getStatusSummary(@Param('companyId') companyId: string) {
    try {
      const summary = await this.declarationStatusService.getStatusSummary(companyId);

      return {
        success: true,
        data: summary,
        message: 'Status summary retrieved successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve status summary',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get failed declarations for manual review
   */
  @Get('failed/:companyId')
  async getFailedDeclarations(
    @Param('companyId') companyId: string,
    @Query('limit') limit?: string
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 50;
      const failedDeclarations = await this.errorHandlingService.getFailedDeclarations(companyId, limitNum);

      return {
        success: true,
        data: failedDeclarations,
        message: `Retrieved ${failedDeclarations.length} failed declarations`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve failed declarations',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Reset declaration for retry
   */
  @Put('reset/:declarationId')
  async resetForRetry(@Param('declarationId') declarationId: string, @Request() req) {
    try {
      // Verify declaration belongs to user's tenant
      const declaration = await this.getDeclaration(declarationId, req.user.tenant_id);
      if (!declaration) {
        throw new HttpException('Declaration not found', HttpStatus.NOT_FOUND);
      }

      await this.errorHandlingService.resetForRetry(declarationId);

      return {
        success: true,
        message: 'Declaration reset for retry successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to reset declaration',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Test e-Deklaracje connection
   */
  @Get('test-connection')
  async testConnection() {
    try {
      const testResult = await this.eDeklaracjeService.testConnection();

      return {
        success: true,
        data: testResult,
        message: 'Connection test completed'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Connection test failed',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get available signature methods for a company
   */
  @Get('signature-methods/:companyId')
  async getSignatureMethods(@Param('companyId') companyId: string, @Request() req) {
    try {
      const methods = await this.signatureService.getAvailableSignatureMethods(
        req.user.tenant_id,
        companyId
      );

      return {
        success: true,
        data: methods,
        message: 'Signature methods retrieved successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve signature methods',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get error statistics for a company
   */
  @Get('error-statistics/:companyId')
  async getErrorStatistics(@Param('companyId') companyId: string) {
    try {
      const statistics = await this.errorHandlingService.getErrorStatistics(companyId);

      return {
        success: true,
        data: statistics,
        message: 'Error statistics retrieved successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve error statistics',
          error: error.name
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Helper method to get declaration
   */
  private async getDeclaration(declarationId: string, tenantId: string) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    return await prisma.declaration.findFirst({
      where: {
        id: declarationId,
        tenant_id: tenantId
      }
    });
  }

  /**
   * Helper method to sign document
   */
  private async signDocument(
    tenantId: string,
    xmlContent: string,
    signatureType: string,
    credentials?: any
  ) {
    switch (signatureType) {
      case 'profil_zaufany':
        return await this.signatureService.signWithProfilZaufany(
          tenantId,
          xmlContent,
          credentials
        );

      case 'qes':
        return await this.signatureService.signWithQES(
          tenantId,
          xmlContent,
          credentials
        );

      case 'none':
        return {
          success: true,
          signature: 'NO_SIGNATURE'
        };

      default:
        throw new Error(`Unsupported signature type: ${signatureType}`);
    }
  }

  /**
   * Helper method to process UPO
   */
  private async processUPO(upoNumber: string, declarationId: string) {
    try {
      // In a real implementation, you would:
      // 1. Retrieve UPO XML from e-Deklaracje
      // 2. Process and validate it
      // 3. Store it in the database

      this.logger.log(`Processing UPO ${upoNumber} for declaration ${declarationId}`);
    } catch (error) {
      this.logger.error(`Failed to process UPO ${upoNumber}:`, error);
    }
  }
}