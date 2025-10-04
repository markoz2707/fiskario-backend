import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as forge from 'node-forge';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CertificateInfo,
  CertificateStatus,
  SignatureRequest,
  DigitalSignature,
  CertificateValidationRequest,
  CertificateValidationResponse
} from '../interfaces/digital-signature.interface';

@Injectable()
export class QESCertificateService {
  private readonly logger = new Logger(QESCertificateService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Upload and store QES certificate
   */
  async uploadCertificate(
    certificateData: string,
    privateKey: string,
    certificateType: 'profil_zaufany' | 'qualified' | 'advanced',
    userIdentifier: string,
    companyId: string,
    password?: string
  ): Promise<CertificateInfo> {
    try {
      // Parse certificate
      const cert = forge.pki.certificateFromPem(certificateData);
      const certInfo = this.extractCertificateInfo(cert);

      // Validate certificate type
      if (certificateType === 'qualified' && !this.isQualifiedCertificate(cert)) {
        throw new BadRequestException('Certificate does not meet QES requirements');
      }

      // Decrypt private key if password is provided
      let privateKeyPem = privateKey;
      if (password) {
        privateKeyPem = await this.decryptPrivateKey(privateKey, password);
      }

      // Store certificate in database
      const certificate = await this.prisma.digitalCertificate.create({
        data: {
          tenant_id: companyId,
          company_id: companyId,
          certificateType,
          serialNumber: certInfo.serialNumber,
          issuer: certInfo.issuer,
          subject: certInfo.subject,
          validFrom: certInfo.validFrom,
          validTo: certInfo.validTo,
          status: this.determineCertificateStatus(certInfo.validTo),
          certificateData: certificateData,
          privateKey: await this.encryptPrivateKey(privateKeyPem),
          keyAlgorithm: this.getKeyAlgorithm(cert),
          keySize: this.getKeySize(cert),
          trustedServiceProvider: this.extractTSP(cert),
          userIdentifier,
          isDefault: false,
        },
      });

      this.logger.log(`QES certificate uploaded for user ${userIdentifier}`);
      return this.mapToCertificateInfo(certificate);
    } catch (error) {
      this.logger.error('Failed to upload QES certificate', error);
      throw new BadRequestException('Invalid certificate data');
    }
  }

  /**
   * Get certificate by ID
   */
  async getCertificate(certificateId: string, companyId: string): Promise<CertificateInfo> {
    const certificate = await this.prisma.digitalCertificate.findFirst({
      where: {
        id: certificateId,
        company_id: companyId,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return this.mapToCertificateInfo(certificate);
  }

  /**
   * List certificates for company
   */
  async listCertificates(companyId: string): Promise<CertificateInfo[]> {
    const certificates = await this.prisma.digitalCertificate.findMany({
      where: {
        company_id: companyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return certificates.map(cert => this.mapToCertificateInfo(cert));
  }

  /**
   * Validate certificate
   */
  async validateCertificate(request: CertificateValidationRequest, companyId: string): Promise<CertificateValidationResponse> {
    try {
      const certificate = await this.getCertificate(request.certificateId, companyId);

      // Check if certificate is expired
      const now = request.validationTime || new Date();
      const isValid = certificate.validTo > now && certificate.status === CertificateStatus.VALID;

      // Build trust path if requested
      const trustPath = request.includeTrustPath
        ? await this.buildTrustPath(certificate)
        : undefined;

      return {
        isValid,
        certificate,
        trustPath,
        errors: isValid ? [] : ['Certificate is expired or revoked'],
        warnings: this.generateValidationWarnings(certificate),
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
   * Set default certificate
   */
  async setDefaultCertificate(certificateId: string, companyId: string): Promise<void> {
    // Remove default flag from all certificates
    await this.prisma.digitalCertificate.updateMany({
      where: {
        company_id: companyId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set new default certificate
    await this.prisma.digitalCertificate.update({
      where: {
        id: certificateId,
        company_id: companyId,
      },
      data: {
        isDefault: true,
      },
    });

    this.logger.log(`Default certificate set to ${certificateId}`);
  }

  /**
   * Check for expiring certificates
   */
  async checkExpiringCertificates(companyId: string, daysThreshold: number = 30): Promise<CertificateInfo[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    const certificates = await this.prisma.digitalCertificate.findMany({
      where: {
        company_id: companyId,
        validTo: {
          lte: thresholdDate,
        },
        status: CertificateStatus.VALID,
      },
    });

    return certificates.map(cert => this.mapToCertificateInfo(cert));
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(certificateId: string, companyId: string, reason?: string): Promise<void> {
    await this.prisma.digitalCertificate.update({
      where: {
        id: certificateId,
        company_id: companyId,
      },
      data: {
        status: CertificateStatus.REVOKED,
      },
    });

    this.logger.log(`Certificate ${certificateId} revoked. Reason: ${reason || 'Not specified'}`);
  }

  /**
   * Extract certificate information from forge certificate object
   */
  private extractCertificateInfo(cert: forge.pki.Certificate): any {
    return {
      serialNumber: cert.serialNumber,
      issuer: cert.issuer.getField('CN')?.value || 'Unknown',
      subject: cert.subject.getField('CN')?.value || 'Unknown',
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
    };
  }

  /**
   * Check if certificate meets QES requirements
   */
  private isQualifiedCertificate(cert: forge.pki.Certificate): boolean {
    // Check for qualified certificate policy OIDs
    const qualifiedPolicyOIDs = [
      '0.4.0.194112.1.2', // Polish qualified certificate policy
      '0.4.0.194121.1.1', // EU qualified certificate policy
    ];

    const certificatePolicies = cert.getExtension('certificatePolicies');
    if (!certificatePolicies) return false;

    return certificatePolicies.value.some((policy: any) =>
      qualifiedPolicyOIDs.includes(policy.policyIdentifier)
    );
  }

  /**
   * Determine certificate status based on validity date
   */
  private determineCertificateStatus(validTo: Date): CertificateStatus {
    const now = new Date();
    const daysUntilExpiry = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return CertificateStatus.EXPIRED;
    } else if (daysUntilExpiry < 30) {
      return CertificateStatus.EXPIRED; // Will expire soon
    } else {
      return CertificateStatus.VALID;
    }
  }

  /**
   * Get key algorithm from certificate
   */
  private getKeyAlgorithm(cert: forge.pki.Certificate): string {
    const publicKey = cert.publicKey;
    if (publicKey.algorithm === 'RSA') return 'RSA';
    if (publicKey.algorithm === 'ECDSA') return 'ECDSA';
    return 'Unknown';
  }

  /**
   * Get key size from certificate
   */
  private getKeySize(cert: forge.pki.Certificate): number {
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    return publicKey.n.bitLength() || 2048;
  }

  /**
   * Extract Trusted Service Provider from certificate
   */
  private extractTSP(cert: forge.pki.Certificate): string | undefined {
    const organizationalUnit = cert.subject.getField('OU')?.value;
    return organizationalUnit || undefined;
  }

  /**
   * Decrypt private key
   */
  private async decryptPrivateKey(privateKeyPem: string, password: string): Promise<string> {
    try {
      const privateKey = forge.pki.decryptRsaPrivateKey(privateKeyPem, password);
      return forge.pki.privateKeyToPem(privateKey);
    } catch (error) {
      throw new BadRequestException('Invalid password for private key');
    }
  }

  /**
   * Encrypt private key for storage
   */
  private async encryptPrivateKey(privateKeyPem: string): Promise<string> {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY', '');
    if (!encryptionKey) {
      throw new BadRequestException('Encryption key not configured');
    }

    // Generate a random IV for GCM mode
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey.slice(0, 32)), iv);
    let encrypted = cipher.update(privateKeyPem, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Build certificate trust path
   */
  private async buildTrustPath(certificate: CertificateInfo): Promise<any[]> {
    // Implementation would build the trust chain
    // For now, return empty array
    return [];
  }

  /**
   * Generate validation warnings
   */
  private generateValidationWarnings(certificate: CertificateInfo): string[] {
    const warnings: string[] = [];
    const daysUntilExpiry = Math.ceil((certificate.validTo.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 90) {
      warnings.push(`Certificate expires in ${daysUntilExpiry} days`);
    }

    return warnings;
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