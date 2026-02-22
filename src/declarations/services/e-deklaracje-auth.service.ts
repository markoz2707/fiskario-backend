import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as forge from 'node-forge';

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

      // Store authentication token if provided
      if (auth.token) {
        await this.storeProfilZaufanyToken(auth.login, auth.token);
      }

      // Look up the Profil Zaufany profile
      const profile = await this.prisma.profilZaufanyProfile.findUnique({
        where: { profileId: auth.login }
      });

      let certificateInfo: CertificateInfo;

      // Check if there is a linked digital certificate for this user's company
      if (profile?.company_id) {
        const digitalCert = await this.prisma.digitalCertificate.findFirst({
          where: {
            company_id: profile.company_id,
            userIdentifier: auth.login,
            status: 'active',
            validTo: { gt: new Date() }
          }
        });

        if (digitalCert?.certificateData) {
          try {
            certificateInfo = this.parseCertificate(digitalCert.certificateData);
          } catch {
            this.logger.warn(`Failed to parse stored certificate for ${auth.login}, using profile data`);
            certificateInfo = this.buildProfilZaufanyCertificateInfo(auth.login, profile);
          }
        } else {
          certificateInfo = this.buildProfilZaufanyCertificateInfo(auth.login, profile);
        }
      } else {
        // Profil Zaufany OAuth2 flow: certificate info is derived from the authentication,
        // not from a traditional X.509 certificate
        certificateInfo = this.buildProfilZaufanyCertificateInfo(auth.login, profile);
      }

      this.logger.log(`Profil Zaufany authentication successful for ${auth.login}`);

      return {
        success: true,
        certificateInfo,
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
      // Parse the PEM certificate using node-forge
      const cert = forge.pki.certificateFromPem(certificateContent);

      // Extract subject and issuer CN (Common Name)
      const subject = cert.subject.getField('CN')?.value || 'Unknown';
      const issuer = cert.issuer.getField('CN')?.value || 'Unknown';
      const serialNumber = cert.serialNumber;

      // Calculate SHA-256 fingerprint from the DER-encoded certificate
      const asn1 = forge.pki.certificateToAsn1(cert);
      const derBytes = forge.asn1.toDer(asn1).getBytes();
      const fingerprint = forge.md.sha256.create().update(derBytes).digest().toHex();

      // Determine key algorithm and size
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      const keySize = publicKey.n ? publicKey.n.bitLength() : 0;
      const algorithm = cert.siginfo?.algorithmOid
        ? forge.pki.oids[cert.siginfo.algorithmOid] || 'RSA-SHA256'
        : 'RSA-SHA256';

      return {
        serialNumber,
        issuer,
        subject,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        algorithm,
        keySize,
        fingerprint
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
   * Build certificate info for Profil Zaufany authentication
   * Profil Zaufany uses OAuth2, not X.509 certificates,
   * so we construct equivalent metadata from the profile data.
   */
  private buildProfilZaufanyCertificateInfo(login: string, profile?: any): CertificateInfo {
    const now = new Date();
    const validTo = profile?.tokenExpiresAt
      ? new Date(profile.tokenExpiresAt)
      : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const identityString = `PZ:${login}:${now.toISOString()}`;
    const fingerprint = crypto.createHash('sha256').update(identityString).digest('hex');

    return {
      serialNumber: `PZ-${login}-${now.getTime()}`,
      issuer: 'Ministerstwo Cyfryzacji - Profil Zaufany',
      subject: profile?.firstName && profile?.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : login,
      validFrom: now,
      validTo,
      algorithm: 'RSA-SHA256',
      keySize: 2048,
      fingerprint
    };
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

      // Calculate fingerprint from stored certificate data if available
      let fingerprint = '';
      if (certificate.certificateData) {
        try {
          const cert = forge.pki.certificateFromPem(certificate.certificateData);
          const asn1 = forge.pki.certificateToAsn1(cert);
          const derBytes = forge.asn1.toDer(asn1).getBytes();
          fingerprint = forge.md.sha256.create().update(derBytes).digest().toHex();
        } catch {
          // If certificate data cannot be parsed, compute fingerprint from serial + issuer
          fingerprint = crypto.createHash('sha256')
            .update(`${certificate.serialNumber}:${certificate.issuer}`)
            .digest('hex');
        }
      }

      return {
        serialNumber: certificate.serialNumber,
        issuer: certificate.issuer,
        subject: certificate.subject,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        algorithm: certificate.keyAlgorithm,
        keySize: certificate.keySize,
        fingerprint
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