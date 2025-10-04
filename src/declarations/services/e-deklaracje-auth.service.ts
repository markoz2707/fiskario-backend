import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface CertificateInfo {
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  algorithm: string;
  keySize: number;
  fingerprint: string;
}

export interface AuthenticationCredentials {
  certificatePath: string;
  privateKeyPath: string;
  passphrase?: string;
  profileId?: string;
}

export interface AuthenticationResult {
  success: boolean;
  certificateInfo?: CertificateInfo;
  error?: string;
  isValidForSubmission?: boolean;
}

export interface ProfilZaufanyAuth {
  login: string;
  password: string;
  token?: string;
}

@Injectable()
export class EDeklaracjeAuthService {
  private readonly logger = new Logger(EDeklaracjeAuthService.name);

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  /**
   * Authenticate using digital certificate
   */
  async authenticateWithCertificate(credentials: AuthenticationCredentials): Promise<AuthenticationResult> {
    try {
      this.logger.log('Authenticating with digital certificate');

      // Validate certificate file exists
      if (!fs.existsSync(credentials.certificatePath)) {
        throw new BadRequestException('Certificate file not found');
      }

      if (!fs.existsSync(credentials.privateKeyPath)) {
        throw new BadRequestException('Private key file not found');
      }

      // Read and parse certificate
      const certificateContent = fs.readFileSync(credentials.certificatePath, 'utf8');
      const certificateInfo = this.parseCertificate(certificateContent);

      // Validate certificate is still valid
      const now = new Date();
      if (now < certificateInfo.validFrom || now > certificateInfo.validTo) {
        return {
          success: false,
          error: 'Certificate has expired or is not yet valid',
          isValidForSubmission: false
        };
      }

      // Check if certificate is trusted for e-Deklaracje
      const isTrusted = await this.validateCertificateTrust(certificateInfo);
      if (!isTrusted) {
        this.logger.warn(`Certificate from issuer ${certificateInfo.issuer} may not be trusted`);
      }

      // Test certificate with a simple signature operation
      const testData = 'test-signature';
      const signature = this.signData(testData, credentials);

      if (!signature) {
        return {
          success: false,
          error: 'Failed to create signature with provided certificate',
          isValidForSubmission: false
        };
      }

      this.logger.log(`Certificate authentication successful for ${certificateInfo.subject}`);

      return {
        success: true,
        certificateInfo,
        isValidForSubmission: true
      };
    } catch (error) {
      this.logger.error('Certificate authentication failed:', error);
      return {
        success: false,
        error: error.message || 'Certificate authentication failed',
        isValidForSubmission: false
      };
    }
  }

  /**
   * Authenticate using Profil Zaufany
   */
  async authenticateWithProfilZaufany(auth: ProfilZaufanyAuth): Promise<AuthenticationResult> {
    try {
      this.logger.log('Authenticating with Profil Zaufany');

      // Here you would integrate with Profil Zaufany API
      // For now, simulate authentication

      if (!auth.login || !auth.password) {
        throw new BadRequestException('Profil Zaufany login and password required');
      }

      // Mock authentication - in real implementation this would call Profil Zaufany API
      const mockCertificateInfo: CertificateInfo = {
        serialNumber: 'PZ-' + Date.now(),
        issuer: 'Profil Zaufany',
        subject: `User ${auth.login}`,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        algorithm: 'RSA-SHA256',
        keySize: 2048,
        fingerprint: 'mock-fingerprint'
      };

      // Store authentication token if provided
      if (auth.token) {
        await this.storeProfilZaufanyToken(auth.login, auth.token);
      }

      this.logger.log(`Profil Zaufany authentication successful for ${auth.login}`);

      return {
        success: true,
        certificateInfo: mockCertificateInfo,
        isValidForSubmission: true
      };
    } catch (error) {
      this.logger.error('Profil Zaufany authentication failed:', error);
      return {
        success: false,
        error: error.message || 'Profil Zaufany authentication failed',
        isValidForSubmission: false
      };
    }
  }

  /**
   * Parse X.509 certificate information
   */
  private parseCertificate(certificateContent: string): CertificateInfo {
    try {
      // Remove PEM headers and newlines
      const cleanCert = certificateContent
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\n/g, '');

      // For this implementation, we'll use a simplified parsing
      // In a real scenario, you might use node-forge or similar library

      // Mock certificate info - in real implementation parse actual certificate
      return {
        serialNumber: 'CERT-' + Date.now(),
        issuer: 'Mock Certificate Authority',
        subject: 'Mock Certificate Subject',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        algorithm: 'RSA-SHA256',
        keySize: 2048,
        fingerprint: crypto.createHash('sha256').update(cleanCert).digest('hex')
      };
    } catch (error) {
      this.logger.error('Failed to parse certificate:', error);
      throw new BadRequestException('Invalid certificate format');
    }
  }

  /**
   * Validate if certificate is trusted for e-Deklaracje submissions
   */
  private async validateCertificateTrust(certificateInfo: CertificateInfo): Promise<boolean> {
    try {
      // Check against trusted certificate authorities for e-Deklaracje
      const trustedIssuers = [
        'Ministerstwo Finansów',
        'Krajowa Izba Rozliczeniowa',
        'Certum',
        'Profil Zaufany'
      ];

      const isTrustedIssuer = trustedIssuers.some(issuer =>
        certificateInfo.issuer.includes(issuer)
      );

      if (!isTrustedIssuer) {
        this.logger.warn(`Certificate issuer ${certificateInfo.issuer} not in trusted list`);
        return false;
      }

      // Check if certificate is revoked (mock implementation)
      const isRevoked = await this.checkCertificateRevocation(certificateInfo.serialNumber);
      if (isRevoked) {
        this.logger.error(`Certificate ${certificateInfo.serialNumber} is revoked`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Certificate trust validation failed:', error);
      return false;
    }
  }

  /**
   * Check if certificate is revoked
   */
  private async checkCertificateRevocation(serialNumber: string): Promise<boolean> {
    // Mock implementation - in real scenario check CRL or OCSP
    return false;
  }

  /**
   * Sign data with certificate
   */
  private signData(data: string, credentials: AuthenticationCredentials): string | null {
    try {
      const privateKey = fs.readFileSync(credentials.privateKeyPath, 'utf8');
      const sign = crypto.createSign('RSA-SHA256');

      sign.update(data);
      return sign.sign({
        key: privateKey,
        passphrase: credentials.passphrase
      }, 'base64');
    } catch (error) {
      this.logger.error('Failed to sign data:', error);
      return null;
    }
  }

  /**
   * Store Profil Zaufany authentication token
   */
  private async storeProfilZaufanyToken(login: string, token: string): Promise<void> {
    try {
      // Find or create Profil Zaufany profile
      const profile = await this.prisma.profilZaufanyProfile.findUnique({
        where: { profileId: login }
      });

      if (profile) {
        await this.prisma.profilZaufanyProfile.update({
          where: { profileId: login },
          data: {
            accessToken: token,
            lastLoginAt: new Date()
          }
        });
      }
    } catch (error) {
      this.logger.error('Failed to store Profil Zaufany token:', error);
    }
  }

  /**
   * Get certificate information for a company
   */
  async getCompanyCertificate(companyId: string): Promise<CertificateInfo | null> {
    try {
      const certificate = await this.prisma.digitalCertificate.findFirst({
        where: {
          company_id: companyId,
          status: 'active',
          isDefault: true,
          validTo: {
            gt: new Date()
          }
        }
      });

      if (!certificate) {
        return null;
      }

      return {
        serialNumber: certificate.serialNumber,
        issuer: certificate.issuer,
        subject: certificate.subject,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        algorithm: certificate.keyAlgorithm,
        keySize: certificate.keySize,
        fingerprint: '' // Would need to calculate from certificate data
      };
    } catch (error) {
      this.logger.error('Failed to get company certificate:', error);
      return null;
    }
  }

  /**
   * Validate authentication for submission
   */
  async validateSubmissionAuth(companyId: string, declarationType: string): Promise<AuthenticationResult> {
    try {
      const certificate = await this.getCompanyCertificate(companyId);

      if (!certificate) {
        return {
          success: false,
          error: 'No valid certificate found for company',
          isValidForSubmission: false
        };
      }

      // Check if certificate is appropriate for declaration type
      const isValidForType = await this.validateCertificateForDeclarationType(
        certificate,
        declarationType
      );

      if (!isValidForType) {
        return {
          success: false,
          error: `Certificate not valid for ${declarationType} submissions`,
          isValidForSubmission: false
        };
      }

      return {
        success: true,
        certificateInfo: certificate,
        isValidForSubmission: true
      };
    } catch (error) {
      this.logger.error('Submission authentication validation failed:', error);
      return {
        success: false,
        error: error.message || 'Authentication validation failed',
        isValidForSubmission: false
      };
    }
  }

  /**
   * Validate certificate is appropriate for specific declaration type
   */
  private async validateCertificateForDeclarationType(
    certificate: CertificateInfo,
    declarationType: string
  ): Promise<boolean> {
    // Different declaration types may require different certificate types
    switch (declarationType) {
      case 'JPK_V7M':
      case 'JPK_V7K':
        // JPK requires qualified electronic signature or Profil Zaufany
        return certificate.issuer.includes('Profil Zaufany') ||
               certificate.issuer.includes('Qualified');

      case 'VAT-7':
      case 'PIT-36':
      case 'CIT-8':
        // Standard declarations can use Profil Zaufany
        return certificate.issuer.includes('Profil Zaufany');

      default:
        return true; // Allow other types
    }
  }

  /**
   * Generate JWT token for authenticated session
   */
  async generateAuthToken(certificateInfo: CertificateInfo, companyId: string): Promise<string> {
    const payload = {
      sub: certificateInfo.serialNumber,
      companyId,
      certificateInfo,
      type: 'e-deklaracje-auth',
      iat: Math.floor(Date.now() / 1000)
    };

    return this.jwtService.sign(payload, {
      expiresIn: '1h' // Token valid for 1 hour
    });
  }

  /**
   * Verify JWT authentication token
   */
  async verifyAuthToken(token: string): Promise<any> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}