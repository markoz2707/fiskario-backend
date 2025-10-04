import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService, SignatureResult } from './signature.service';
import { EDeklaracjeService } from './e-deklaracje.service';
import { UPOProcessingService } from './upo-processing.service';
import { DeclarationStatusService } from './declaration-status.service';
import { ErrorHandlingService } from './error-handling.service';

export interface SubmissionResult {
  success: boolean;
  upoNumber?: string;
  upoDate?: string;
  status?: string;
  message?: string;
  error?: string;
}

export interface SubmissionConfig {
  endpoint: string;
  apiKey?: string;
  timeout: number;
  retries: number;
}

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private prisma: PrismaService,
    private signatureService: SignatureService,
    private eDeklaracjeService: EDeklaracjeService,
    private upoProcessingService: UPOProcessingService,
    private declarationStatusService: DeclarationStatusService,
    private errorHandlingService: ErrorHandlingService,
  ) {}

  /**
   * Submit declaration to US via e-Deklaracje API
   */
  async submitToUS(
    tenantId: string,
    declarationId: string,
    xmlContent: string,
    signatureType: string,
    signatureCredentials?: any
  ): Promise<SubmissionResult> {
    try {
      this.logger.log(`Submitting declaration ${declarationId} to US`);

      // Sign the document if required
      let signedXml = xmlContent;
      if (signatureType !== 'none') {
        const signatureResult = await this.signDocument(
          tenantId,
          xmlContent,
          signatureType,
          signatureCredentials
        );

        if (!signatureResult.success) {
          return {
            success: false,
            error: `Signature failed: ${signatureResult.error}`,
          };
        }

        signedXml = this.signatureService.createSignatureEnvelope(
          xmlContent,
          signatureResult.signature || 'NO_SIGNATURE',
          signatureType,
          signatureResult.certificate
        );
      }

      // Submit to US API
      const submissionResult = await this.submitToUSAPI(signedXml);

      if (submissionResult.success) {
        // Update declaration with UPO information
        await this.updateDeclarationWithUPO(
          tenantId,
          declarationId,
          submissionResult.upoNumber || `REF-${Date.now()}`,
          submissionResult.upoDate || new Date().toISOString()
        );

        this.logger.log(`Declaration ${declarationId} submitted successfully. UPO: ${submissionResult.upoNumber}`);
      }

      return submissionResult;
    } catch (error) {
      this.logger.error(`Failed to submit declaration ${declarationId}:`, error);
      return {
        success: false,
        error: error.message || 'Submission failed',
      };
    }
  }

  /**
   * Submit to JPK API (for JPK_V7 declarations)
   */
  async submitJPKToUS(
    tenantId: string,
    declarationId: string,
    xmlContent: string,
    signatureType: string,
    signatureCredentials?: any
  ): Promise<SubmissionResult> {
    try {
      this.logger.log(`Submitting JPK declaration ${declarationId} to US`);

      // Sign the document if required
      let signedXml = xmlContent;
      if (signatureType !== 'none') {
        const signatureResult = await this.signDocument(
          tenantId,
          xmlContent,
          signatureType,
          signatureCredentials
        );

        if (!signatureResult.success) {
          return {
            success: false,
            error: `Signature failed: ${signatureResult.error}`,
          };
        }

        signedXml = this.signatureService.createSignatureEnvelope(
          xmlContent,
          signatureResult.signature || 'NO_SIGNATURE',
          signatureType,
          signatureResult.certificate
        );
      }

      // Submit to JPK API
      const submissionResult = await this.submitToJPKAPI(signedXml);

      if (submissionResult.success) {
        // Update declaration with confirmation
        await this.updateDeclarationStatus(
          tenantId,
          declarationId,
          'submitted',
          submissionResult.upoNumber,
          submissionResult.upoDate
        );

        this.logger.log(`JPK declaration ${declarationId} submitted successfully. Reference: ${submissionResult.upoNumber}`);
      }

      return submissionResult;
    } catch (error) {
      this.logger.error(`Failed to submit JPK declaration ${declarationId}:`, error);
      return {
        success: false,
        error: error.message || 'JPK submission failed',
      };
    }
  }

  /**
   * Check submission status using UPO number
   */
  async checkSubmissionStatus(upoNumber: string): Promise<any> {
    try {
      // Use e-Deklaracje service to check status
      const statusResult = await this.eDeklaracjeService.checkDeclarationStatus(upoNumber);

      return {
        upoNumber: statusResult.upoNumber,
        status: statusResult.status,
        processedDate: statusResult.processingDate,
        description: statusResult.statusDescription,
        details: statusResult.details
      };
    } catch (error) {
      this.logger.error(`Failed to check status for UPO ${upoNumber}:`, error);
      return {
        upoNumber,
        status: 'error',
        error: error.message || 'Failed to check status',
      };
    }
  }

  /**
   * Sign document based on signature type
   */
  private async signDocument(
    tenantId: string,
    xmlContent: string,
    signatureType: string,
    credentials?: any
  ): Promise<SignatureResult> {
    switch (signatureType) {
      case 'profil_zaufany':
        if (!credentials?.login || !credentials?.password) {
          return {
            success: false,
            error: 'Profil Zaufany credentials required',
          };
        }
        return await this.signatureService.signWithProfilZaufany(
          tenantId,
          xmlContent,
          credentials
        );

      case 'qes':
        if (!credentials?.certificate || !credentials?.privateKey) {
          return {
            success: false,
            error: 'QES certificate and private key required',
          };
        }
        return await this.signatureService.signWithQES(
          tenantId,
          xmlContent,
          credentials
        );

      case 'none':
        return {
          success: true,
          signature: 'NO_SIGNATURE',
        };

      default:
        return {
          success: false,
          error: `Unsupported signature type: ${signatureType}`,
        };
    }
  }

  /**
   * Submit to US e-Deklaracje API
   */
  private async submitToUSAPI(xmlContent: string): Promise<SubmissionResult> {
    try {
      // Use e-Deklaracje service for actual submission
      const submissionResult = await this.eDeklaracjeService.submitDeclaration({
        documentType: 'VAT-7', // This should be determined from the XML content
        documentVersion: '1.0',
        xmlContent: xmlContent,
        signatureType: 'profil_zaufany' // This should be determined from the declaration
      });

      return {
        success: submissionResult.success,
        upoNumber: submissionResult.upoNumber,
        upoDate: submissionResult.upoDate,
        status: submissionResult.status || 'submitted',
        message: submissionResult.message || 'Deklaracja została przyjęta do systemu',
        error: submissionResult.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'US API submission failed',
      };
    }
  }

  /**
   * Submit to JPK API
   */
  private async submitToJPKAPI(xmlContent: string): Promise<SubmissionResult> {
    try {
      // Use e-Deklaracje service for JPK submission
      const submissionResult = await this.eDeklaracjeService.submitDeclaration({
        documentType: 'JPK_V7M', // This should be determined from the XML content
        documentVersion: '1.0',
        xmlContent: xmlContent,
        signatureType: 'profil_zaufany' // This should be determined from the declaration
      });

      return {
        success: submissionResult.success,
        upoNumber: submissionResult.upoNumber,
        upoDate: submissionResult.upoDate,
        status: submissionResult.status || 'submitted',
        message: submissionResult.message || 'JPK został przyjęty do systemu',
        error: submissionResult.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'JPK API submission failed',
      };
    }
  }

  /**
   * Update declaration with UPO information
   */
  private async updateDeclarationWithUPO(
    tenantId: string,
    declarationId: string,
    upoNumber: string,
    upoDate: string
  ): Promise<void> {
    await this.prisma.declaration.updateMany({
      where: {
        tenant_id: tenantId,
        id: declarationId,
      },
      data: {
        status: 'submitted',
        upoNumber: upoNumber,
        upoDate: new Date(upoDate),
        submittedAt: new Date(),
      },
    });
  }

  /**
   * Update declaration status
   */
  private async updateDeclarationStatus(
    tenantId: string,
    declarationId: string,
    status: string,
    referenceNumber?: string,
    referenceDate?: string
  ): Promise<void> {
    await this.prisma.declaration.updateMany({
      where: {
        tenant_id: tenantId,
        id: declarationId,
      },
      data: {
        status: status,
        upoNumber: referenceNumber,
        upoDate: referenceDate ? new Date(referenceDate) : undefined,
        submittedAt: new Date(),
      },
    });
  }

  /**
   * Get submission history for a company
   */
  async getSubmissionHistory(tenantId: string, companyId: string): Promise<any[]> {
    const declarations = await this.prisma.declaration.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        status: {
          in: ['submitted', 'accepted', 'rejected'],
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
      take: 50, // Last 50 submissions
    });

    return declarations.map(declaration => ({
      id: declaration.id,
      type: declaration.type,
      period: declaration.period,
      status: declaration.status,
      submittedAt: declaration.submittedAt,
      upoNumber: declaration.upoNumber,
      upoDate: declaration.upoDate,
    }));
  }

  /**
   * Retry failed submission
   */
  async retrySubmission(
    tenantId: string,
    declarationId: string,
    signatureType?: string,
    signatureCredentials?: any
  ): Promise<SubmissionResult> {
    try {
      // Get declaration details
      const declaration = await this.prisma.declaration.findFirst({
        where: {
          tenant_id: tenantId,
          id: declarationId,
        },
      });

      if (!declaration) {
        throw new BadRequestException('Declaration not found');
      }

      if (!declaration.xmlContent) {
        throw new BadRequestException('No XML content found for declaration');
      }

      // Determine submission method based on declaration type
      if (declaration.type.includes('JPK')) {
        return await this.submitJPKToUS(
          tenantId,
          declarationId,
          declaration.xmlContent,
          signatureType || declaration.signatureType || 'none',
          signatureCredentials
        );
      } else {
        return await this.submitToUS(
          tenantId,
          declarationId,
          declaration.xmlContent,
          signatureType || declaration.signatureType || 'none',
          signatureCredentials
        );
      }
    } catch (error) {
      this.logger.error(`Failed to retry submission for declaration ${declarationId}:`, error);
      return {
        success: false,
        error: error.message || 'Retry submission failed',
      };
    }
  }
}