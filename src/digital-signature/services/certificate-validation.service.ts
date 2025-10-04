import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as forge from 'node-forge';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CertificateInfo,
  CertificateStatus,
  CertificateValidationRequest,
  CertificateValidationResponse,
  CertificateTrustPath
} from '../interfaces/digital-signature.interface';

@Injectable()
export class CertificateValidationService {
  private readonly logger = new Logger(CertificateValidationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Validate certificate against trusted authorities
   */
  async validateCertificate(request: CertificateValidationRequest, companyId: string): Promise<CertificateValidationResponse> {
    try {
      const certificate = await this.getCertificateById(request.certificateId, companyId);

      // Perform comprehensive validation
      const validationResults = await Promise.all([
        this.validateCertificateFormat(certificate),
        this.validateCertificateChain(certificate),
        this.validateCertificateStatus(certificate),
        this.validateCertificatePolicies(certificate),
      ]);

      const isValid = validationResults.every(result => result.isValid);
      const errors = validationResults.flatMap(result => result.errors);
      const warnings = validationResults.flatMap(result => result.warnings);

      // Update certificate validation status
      await this.updateCertificateValidationStatus(
        request.certificateId,
        isValid ? 'valid' : 'invalid',
        errors
      );

      return {
        isValid,
        certificate,
        trustPath: request.includeTrustPath ? await this.buildTrustPath(certificate) : undefined,
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error('Certificate validation failed', error);
      return {
        isValid: false,
        certificate: {} as CertificateInfo,
        errors: ['Certificate validation failed'],
        warnings: [],
      };
    }
  }

  /**
   * Check for certificates expiring soon
   */
  async checkExpiringCertificates(companyId: string, daysThreshold: number = 30): Promise<CertificateInfo[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    const certificates = await this.prisma.digitalCertificate.findMany({
      where: {
        company_id: companyId,
        validTo: {
          lte: thresholdDate,
          gte: new Date(), // Not already expired
        },
        status: CertificateStatus.VALID,
      },
    });

    return certificates.map(cert => this.mapToCertificateInfo(cert));
  }

  /**
   * Check for expired certificates
   */
  async checkExpiredCertificates(companyId: string): Promise<CertificateInfo[]> {
    const certificates = await this.prisma.digitalCertificate.findMany({
      where: {
        company_id: companyId,
        validTo: {
          lt: new Date(),
        },
        status: CertificateStatus.VALID,
      },
    });

    // Update status to expired
    for (const cert of certificates) {
      await this.prisma.digitalCertificate.update({
        where: { id: cert.id },
        data: { status: CertificateStatus.EXPIRED },
      });
    }

    return certificates.map(cert => this.mapToCertificateInfo(cert));
  }

  /**
   * Scheduled task to check certificate expiry daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCertificateExpiryCheck(): Promise<void> {
    this.logger.log('Running scheduled certificate expiry check');

    try {
      // Get all companies
      const companies = await this.prisma.company.findMany({
        select: { id: true, tenant_id: true },
      });

      for (const company of companies) {
        // Check for expired certificates
        const expiredCerts = await this.checkExpiredCertificates(company.id);

        // Check for certificates expiring soon
        const expiringSoonCerts = await this.checkExpiringCertificates(company.id, 30);

        if (expiredCerts.length > 0 || expiringSoonCerts.length > 0) {
          this.logger.warn(
            `Certificate issues found for company ${company.id}: ` +
            `${expiredCerts.length} expired, ${expiringSoonCerts.length} expiring soon`
          );

          // Here you would typically send notifications to users
          // await this.notificationService.sendCertificateExpiryNotification(company.id, expiredCerts, expiringSoonCerts);
        }
      }
    } catch (error) {
      this.logger.error('Certificate expiry check failed', error);
    }
  }

  /**
   * Validate certificate format and structure
   */
  private async validateCertificateFormat(certificate: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse certificate
      const cert = forge.pki.certificateFromPem(certificate.certificateData);

      // Check if certificate is self-signed (warning for QES)
      if (cert.subject.hash === cert.issuer.hash) {
        warnings.push('Certificate is self-signed');
      }

      // Validate key size
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      if (publicKey.n.bitLength() < 2048) {
        errors.push('Certificate key size is less than 2048 bits');
      }

      return { isValid: errors.length === 0, errors, warnings };
    } catch (error) {
      errors.push('Invalid certificate format');
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Validate certificate chain of trust
   */
  private async validateCertificateChain(certificate: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // In production, this would validate against trusted CAs
      // For now, we'll do basic checks

      const cert = forge.pki.certificateFromPem(certificate.certificateData);

      // Check if issuer is a trusted Polish authority
      const trustedPolishIssuers = [
        'Krajowa Izba Rozliczeniowa S.A.',
        'Ministerstwo Cyfryzacji',
        'Narodowe Centrum Certyfikacji',
      ];

      const issuerCN = cert.issuer.getField('CN')?.value || '';
      const isTrustedIssuer = trustedPolishIssuers.some(issuer =>
        issuerCN.includes(issuer)
      );

      if (!isTrustedIssuer) {
        warnings.push('Certificate issuer not in trusted Polish authorities list');
      }

      return { isValid: true, errors, warnings };
    } catch (error) {
      errors.push('Certificate chain validation failed');
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Validate certificate status (not revoked)
   */
  private async validateCertificateStatus(certificate: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (certificate.status === CertificateStatus.REVOKED) {
      errors.push('Certificate has been revoked');
    }

    if (certificate.status === CertificateStatus.SUSPENDED) {
      errors.push('Certificate has been suspended');
    }

    if (certificate.status === CertificateStatus.EXPIRED) {
      errors.push('Certificate has expired');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate certificate policies for QES compliance
   */
  private async validateCertificatePolicies(certificate: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const cert = forge.pki.certificateFromPem(certificate.certificateData);

      // Check for qualified certificate policy OIDs
      const qualifiedPolicyOIDs = [
        '0.4.0.194112.1.2', // Polish qualified certificate policy
        '0.4.0.194121.1.1', // EU qualified certificate policy
      ];

      const certificatePolicies = cert.getExtension('certificatePolicies');
      if (!certificatePolicies) {
        if (certificate.certificateType === 'qualified') {
          errors.push('Qualified certificate missing certificate policies extension');
        }
        return { isValid: errors.length === 0, errors, warnings };
      }

      const hasQualifiedPolicy = certificatePolicies.value.some((policy: any) =>
        qualifiedPolicyOIDs.includes(policy.policyIdentifier)
      );

      if (certificate.certificateType === 'qualified' && !hasQualifiedPolicy) {
        errors.push('Certificate does not contain required qualified certificate policy');
      }

      return { isValid: errors.length === 0, errors, warnings };
    } catch (error) {
      errors.push('Certificate policy validation failed');
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Build certificate trust path
   */
  private async buildTrustPath(certificate: any): Promise<CertificateTrustPath[]> {
    // In production, this would build the complete trust chain
    // For now, return basic information
    return [{
      certificate: this.mapToCertificateInfo(certificate),
      validationResult: true,
    }];
  }

  /**
   * Update certificate validation status in database
   */
  private async updateCertificateValidationStatus(
    certificateId: string,
    status: string,
    errors: string[]
  ): Promise<void> {
    await this.prisma.digitalCertificate.update({
      where: { id: certificateId },
      data: {
        lastValidationAt: new Date(),
        validationStatus: status,
      },
    });
  }

  /**
   * Get certificate by ID
   */
  private async getCertificateById(certificateId: string, companyId: string): Promise<any> {
    const certificate = await this.prisma.digitalCertificate.findFirst({
      where: {
        id: certificateId,
        company_id: companyId,
      },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    return certificate;
  }

  /**
   * Map database model to CertificateInfo interface
   */
  private mapToCertificateInfo(dbCertificate: any): CertificateInfo {
    return {
      id: dbCertificate.id,
      serialNumber: dbCertificate.serialNumber,
      issuer: dbCertificate.issuer,
      subject: dbCertificate.subject,
      validFrom: dbCertificate.validFrom,
      validTo: dbCertificate.validTo,
      status: dbCertificate.status as CertificateStatus,
      keyUsage: [], // Would be extracted from certificate
      certificateType: dbCertificate.certificateType as 'profil_zaufany' | 'qualified' | 'advanced',
      trustedServiceProvider: dbCertificate.trustedServiceProvider,
    };
  }
}