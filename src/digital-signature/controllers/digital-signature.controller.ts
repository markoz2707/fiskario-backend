import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { ProfilZaufanyService } from '../services/profil-zaufany.service';
import { QESCertificateService } from '../services/qes-certificate.service';
import { XAdESSignatureService } from '../services/xades-signature.service';
import { CertificateValidationService } from '../services/certificate-validation.service';
import { CreateSignatureDto } from '../dto/create-signature.dto';
import {
  CertificateValidationDto,
  CertificateUploadDto,
  ProfilZaufanyAuthDto,
} from '../dto/certificate-validation.dto';
import {
  SignatureResponseDto,
  CertificateInfoDto,
  SignatureValidationDto,
} from '../dto/signature-response.dto';

@Controller('digital-signature')
export class DigitalSignatureController {
  constructor(
    private readonly profilZaufanyService: ProfilZaufanyService,
    private readonly qesCertificateService: QESCertificateService,
    private readonly xadesSignatureService: XAdESSignatureService,
    private readonly certificateValidationService: CertificateValidationService,
  ) {}

  /**
   * Generate authorization URL for Profil Zaufany
   */
  @Get('profil-zaufany/auth-url')
  async getProfilZaufanyAuthUrl(
    @Request() req: any,
    @Query('documentId') documentId?: string,
  ): Promise<{ authUrl: string; state: string }> {
    const state = this.profilZaufanyService.generateState();

    // Store state for verification (in production, use Redis or database)
    // For now, we'll use a simple in-memory store

    const authUrl = await this.profilZaufanyService.generateAuthUrl(state, documentId);

    return { authUrl, state };
  }

  /**
   * Handle Profil Zaufany OAuth callback
   */
  @Post('profil-zaufany/callback')
  async handleProfilZaufanyCallback(
    @Body() authDto: ProfilZaufanyAuthDto,
    @Request() req: any,
  ): Promise<{ profile: any; tokens: any }> {
    // Verify state parameter
    const storedState = req.session?.profilZaufanyState;
    if (!this.profilZaufanyService.verifyState(authDto.state, storedState)) {
      throw new BadRequestException('Invalid state parameter');
    }

    const result = await this.profilZaufanyService.exchangeCodeForToken(authDto);

    // Store tokens securely (in production, use encrypted session/database)
    req.session.profilZaufanyTokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };

    return {
      profile: result.profile,
      tokens: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    };
  }

  /**
   * Create digital signature
   */
  @Post('sign')
  async createSignature(
    @Body() createSignatureDto: CreateSignatureDto,
    @Request() req: any,
  ): Promise<SignatureResponseDto> {
    const companyId = req.user.companyId;

    try {
      let signatureResult;

      if (createSignatureDto.signatureType === 'profil_zaufany') {
        // Handle Profil Zaufany signature
        const tokens = req.session?.profilZaufanyTokens;
        if (!tokens?.accessToken) {
          throw new BadRequestException('Profil Zaufany authentication required');
        }

        signatureResult = await this.profilZaufanyService.initiateSignature(
          createSignatureDto,
          tokens.accessToken,
        );
      } else {
        // Handle QES signature
        const certificate = await this.qesCertificateService.getCertificate(
          createSignatureDto.certificateId || '',
          companyId,
        );

        // Get document content (this would come from your document service)
        const documentContent = await this.getDocumentContent(
          createSignatureDto.documentId,
          createSignatureDto.documentType,
        );

        signatureResult = await this.xadesSignatureService.generateXAdESSignature(
          documentContent,
          certificate,
          'decrypted-private-key-placeholder', // This would be decrypted from database
          createSignatureDto,
        );
      }

      return {
        signatureId: signatureResult.metadata?.signatureId || crypto.randomUUID(),
        status: 'completed',
        signatureType: createSignatureDto.signatureType,
        signatureFormat: createSignatureDto.signatureFormat,
        signedAt: signatureResult.metadata?.signedAt,
        signerName: signatureResult.metadata?.signerName,
      };
    } catch (error) {
      throw new BadRequestException(`Signature creation failed: ${error.message}`);
    }
  }

  /**
   * Upload QES certificate
   */
  @Post('certificates')
  async uploadCertificate(
    @Body() uploadDto: CertificateUploadDto,
    @Request() req: any,
  ): Promise<CertificateInfoDto> {
    const companyId = req.user.companyId;

    const certificate = await this.qesCertificateService.uploadCertificate(
      uploadDto.certificateData,
      uploadDto.privateKey || '',
      uploadDto.certificateType,
      uploadDto.userIdentifier,
      companyId,
      uploadDto.password,
    );

    return this.mapCertificateToDto(certificate);
  }

  /**
   * Get user certificates
   */
  @Get('certificates')
  async getCertificates(@Request() req: any): Promise<CertificateInfoDto[]> {
    const companyId = req.user.companyId;

    const certificates = await this.qesCertificateService.listCertificates(companyId);
    return certificates.map(cert => this.mapCertificateToDto(cert));
  }

  /**
   * Get specific certificate
   */
  @Get('certificates/:id')
  async getCertificate(
    @Param('id') certificateId: string,
    @Request() req: any,
  ): Promise<CertificateInfoDto> {
    const companyId = req.user.companyId;

    const certificate = await this.qesCertificateService.getCertificate(certificateId, companyId);
    return this.mapCertificateToDto(certificate);
  }

  /**
   * Validate certificate
   */
  @Post('certificates/:id/validate')
  async validateCertificate(
    @Param('id') certificateId: string,
    @Body() validationDto: CertificateValidationDto,
    @Request() req: any,
  ): Promise<SignatureValidationDto> {
    const companyId = req.user.companyId;

    const result = await this.certificateValidationService.validateCertificate(
      {
        certificateId,
        validationTime: validationDto.validationTime ? new Date(validationDto.validationTime) : undefined,
        includeTrustPath: validationDto.includeTrustPath,
      },
      companyId,
    );

    return {
      isValid: result.isValid,
      validationTime: new Date(),
      certificateStatus: result.certificate.status,
      signatureStatus: result.isValid ? 'valid' : 'invalid',
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  /**
   * Set default certificate
   */
  @Put('certificates/:id/default')
  async setDefaultCertificate(
    @Param('id') certificateId: string,
    @Request() req: any,
  ): Promise<void> {
    const companyId = req.user.companyId;

    await this.qesCertificateService.setDefaultCertificate(certificateId, companyId);
  }

  /**
   * Revoke certificate
   */
  @Delete('certificates/:id')
  async revokeCertificate(
    @Param('id') certificateId: string,
    @Request() req: any,
    @Query('reason') reason?: string,
  ): Promise<void> {
    const companyId = req.user.companyId;

    await this.qesCertificateService.revokeCertificate(certificateId, companyId, reason);
  }

  /**
   * Check for expiring certificates
   */
  @Get('certificates/expiring')
  async getExpiringCertificates(
    @Request() req: any,
    @Query('days') days: number = 30,
  ): Promise<CertificateInfoDto[]> {
    const companyId = req.user.companyId;

    const certificates = await this.certificateValidationService.checkExpiringCertificates(
      companyId,
      days,
    );

    return certificates.map(cert => this.mapCertificateToDto(cert));
  }

  /**
   * Validate signature
   */
  @Post('validate')
  async validateSignature(
    @Body() validationData: { signatureId: string; documentContent?: string },
  ): Promise<SignatureValidationDto> {
    // Implementation would validate the signature
    // For now, return a placeholder response
    return {
      isValid: true,
      validationTime: new Date(),
      certificateStatus: 'valid' as any,
      signatureStatus: 'valid',
      errors: [],
      warnings: [],
    };
  }

  /**
   * Get document content for signing
   */
  private async getDocumentContent(documentId: string, documentType: string): Promise<string> {
    // This would integrate with your existing document services
    // For now, return a placeholder
    switch (documentType) {
      case 'jpk_v7':
        return `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wersja/20220101">
  <Naglowek>
    <KodFormularza>JPK_V7M</KodFormularza>
    <WariantFormularza>1</WariantFormularza>
    <DataWytworzeniaJPK>${new Date().toISOString()}</DataWytworzeniaJPK>
    <NazwaSystemu> Fiskario</NazwaSystemu>
  </Naglowek>
  <Podmiot1>
    <NIP>1234567890</NIP>
    <PelnaNazwa>Test Company</PelnaNazwa>
  </Podmiot1>
</JPK>`;
      default:
        throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }
  }

  /**
   * Map CertificateInfo to DTO
   */
  private mapCertificateToDto(certificate: any): CertificateInfoDto {
    const daysUntilExpiry = Math.ceil(
      (certificate.validTo.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      id: certificate.id,
      serialNumber: certificate.serialNumber,
      issuer: certificate.issuer,
      subject: certificate.subject,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      status: certificate.status,
      certificateType: certificate.certificateType,
      trustedServiceProvider: certificate.trustedServiceProvider,
      keyUsage: certificate.keyUsage,
      daysUntilExpiry,
    };
  }
}