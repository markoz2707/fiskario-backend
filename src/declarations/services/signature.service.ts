import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface SignatureConfig {
  type: 'profil_zaufany' | 'qes' | 'none';
  certificateId?: string;
  credentials?: {
    login?: string;
    password?: string;
    certificate?: string;
    privateKey?: string;
    passphrase?: string;
  };
}

export interface SignatureResult {
  success: boolean;
  signature?: string;
  certificate?: string;
  certificateInfo?: any;
  timestamp?: string;
  signatureId?: string;
  error?: string;
}

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Sign XML document using Profil Zaufany
   */
  async signWithProfilZaufany(
    tenantId: string,
    xmlContent: string,
    credentials: { login: string; password: string }
  ): Promise<SignatureResult> {
    try {
      this.logger.log(`Signing document with Profil Zaufany for tenant ${tenantId}`);

      // Get Profil Zaufany profile
      const profile = await this.prisma.profilZaufanyProfile.findFirst({
        where: {
          tenant_id: tenantId,
          profileId: credentials.login,
          isActive: true
        }
      });

      if (!profile) {
        throw new BadRequestException('Profil Zaufany profile not found or inactive');
      }

      // In a real implementation, this would:
      // 1. Authenticate with Profil Zaufany API using credentials
      // 2. Submit document for signing
      // 3. Retrieve signed document

      // For now, create a mock signature that follows Profil Zaufany format
      const signature = await this.createProfilZaufanySignature(xmlContent, profile);

      // Store signature record
      const signatureRecord = await this.prisma.signatureRecord.create({
        data: {
          tenant_id: tenantId,
          company_id: profile.company_id,
          certificate_id: '', // Would link to a Profil Zaufany certificate if available
          documentId: `profil_zaufany_${Date.now()}`,
          documentType: 'declaration',
          signatureType: 'profil_zaufany',
          signatureFormat: 'xades',
          signatureValue: signature,
          signedContent: crypto.createHash('sha256').update(xmlContent).digest('hex'),
          signerName: `${profile.firstName} ${profile.lastName}`,
          signerIdentifier: profile.pesel,
          signatureAlgorithm: 'RSA-SHA256',
          hashAlgorithm: 'SHA-256',
          validationStatus: 'pending'
        }
      });

      this.logger.log(`Document signed successfully with Profil Zaufany, signature ID: ${signatureRecord.id}`);

      return {
        success: true,
        signature: signature,
        certificate: profile.pesel,
        certificateInfo: {
          type: 'profil_zaufany',
          userId: profile.userId,
          authenticationLevel: profile.authenticationLevel
        },
        timestamp: new Date().toISOString(),
        signatureId: signatureRecord.id
      };
    } catch (error) {
      this.logger.error('Profil Zaufany signing failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to sign with Profil Zaufany',
      };
    }
  }


  /**
   * Verify signature of a document
   */
  async verifySignature(
    tenantId: string,
    xmlContent: string,
    signature: string,
    signatureType: string
  ): Promise<boolean> {
    try {
      // Here you would implement signature verification
      // For now, return true for mock signatures

      if (signature.startsWith('MOCK_SIGNATURE_')) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available signature methods for a company
   */
  async getAvailableSignatureMethods(tenantId: string, companyId: string): Promise<any[]> {
    // Check what signature methods are configured for the company
    const methods: any[] = [];

    // Profil Zaufany
    methods.push({
      type: 'profil_zaufany',
      name: 'Profil Zaufany',
      description: 'Podpis kwalifikowany za pośrednictwem Profil Zaufany',
      configured: false, // This would check actual configuration
      requiresCredentials: true,
    });

    // QES
    methods.push({
      type: 'qes',
      name: 'Podpis kwalifikowany',
      description: 'Komercyjny podpis kwalifikowany (QES)',
      configured: false, // This would check actual configuration
      requiresCredentials: true,
    });

    // No signature (for testing)
    methods.push({
      type: 'none',
      name: 'Brak podpisu',
      description: 'Brak podpisu elektronicznego',
      configured: true,
      requiresCredentials: false,
    });

    return methods;
  }

  /**
   * Configure signature method for a company
   */
  async configureSignatureMethod(
    tenantId: string,
    companyId: string,
    signatureType: string,
    config: any
  ): Promise<boolean> {
    try {
      // Here you would store the signature configuration securely
      // For now, just return success

      return true;
    } catch (error) {
      throw new BadRequestException('Failed to configure signature method');
    }
  }

  /**
   * Create Profil Zaufany signature
   */
  private async createProfilZaufanySignature(xmlContent: string, profile: any): Promise<string> {
    try {
      // In a real implementation, this would:
      // 1. Call Profil Zaufany API to authenticate
      // 2. Submit document for signing
      // 3. Return the actual signature

      // For now, create a mock signature that includes profile information
      const contentHash = crypto.createHash('sha256').update(xmlContent).digest('hex');
      const signatureData = {
        profileId: profile.profileId,
        userId: profile.userId,
        timestamp: new Date().toISOString(),
        contentHash: contentHash,
        authenticationLevel: profile.authenticationLevel
      };

      // Create a mock signature (in reality this would be a proper cryptographic signature)
      const signatureString = Buffer.from(JSON.stringify(signatureData)).toString('base64');

      return `PZ_SIGNATURE_${signatureString}_${Date.now()}`;
    } catch (error) {
      this.logger.error('Failed to create Profil Zaufany signature:', error);
      throw error;
    }
  }

  /**
   * Sign XML document using Qualified Electronic Signature (QES)
   */
  async signWithQES(
    tenantId: string,
    xmlContent: string,
    credentials: { certificate: string; privateKey: string; passphrase?: string }
  ): Promise<SignatureResult> {
    try {
      this.logger.log(`Signing document with QES for tenant ${tenantId}`);

      // Get certificate from database or use provided credentials
      let certificateRecord;
      if (credentials.certificate && credentials.privateKey) {
        // Use provided certificate
        certificateRecord = {
          certificateData: credentials.certificate,
          privateKey: credentials.privateKey,
          keyAlgorithm: 'RSA',
          keySize: 2048
        };
      } else {
        // Get default certificate for company
        certificateRecord = await this.prisma.digitalCertificate.findFirst({
          where: {
            tenant_id: tenantId,
            status: 'active',
            isDefault: true,
            certificateType: 'qualified'
          }
        });

        if (!certificateRecord) {
          throw new BadRequestException('No active QES certificate found');
        }
      }

      // Create digital signature
      const signature = await this.createQESSignature(xmlContent, certificateRecord, credentials.passphrase);

      // Store signature record
      const signatureRecord = await this.prisma.signatureRecord.create({
        data: {
          tenant_id: tenantId,
          company_id: certificateRecord.company_id,
          certificate_id: certificateRecord.id,
          documentId: `qes_${Date.now()}`,
          documentType: 'declaration',
          signatureType: 'qes',
          signatureFormat: 'xades',
          signatureValue: signature,
          signedContent: crypto.createHash('sha256').update(xmlContent).digest('hex'),
          signerName: certificateRecord.subject,
          signerIdentifier: certificateRecord.userIdentifier,
          signatureAlgorithm: `${certificateRecord.keyAlgorithm}-SHA256`,
          hashAlgorithm: 'SHA-256',
          validationStatus: 'pending'
        }
      });

      this.logger.log(`Document signed successfully with QES, signature ID: ${signatureRecord.id}`);

      return {
        success: true,
        signature: signature,
        certificate: certificateRecord.certificateData,
        certificateInfo: {
          serialNumber: certificateRecord.serialNumber,
          issuer: certificateRecord.issuer,
          subject: certificateRecord.subject,
          validFrom: certificateRecord.validFrom,
          validTo: certificateRecord.validTo
        },
        timestamp: new Date().toISOString(),
        signatureId: signatureRecord.id
      };
    } catch (error) {
      this.logger.error('QES signing failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to sign with QES',
      };
    }
  }

  /**
   * Create QES signature
   */
  private async createQESSignature(
    xmlContent: string,
    certificateRecord: any,
    passphrase?: string
  ): Promise<string> {
    try {
      // In a real implementation, this would:
      // 1. Load the certificate and private key
      // 2. Create proper XML digital signature (XAdES)
      // 3. Include timestamp from TSA

      const contentHash = crypto.createHash('sha256').update(xmlContent).digest('hex');

      // Create signature data
      const signatureData = {
        certificateSerial: certificateRecord.serialNumber,
        timestamp: new Date().toISOString(),
        contentHash: contentHash,
        algorithm: certificateRecord.keyAlgorithm
      };

      // Mock signature creation (replace with proper XAdES implementation)
      const signatureString = Buffer.from(JSON.stringify(signatureData)).toString('base64');

      return `QES_SIGNATURE_${signatureString}_${Date.now()}`;
    } catch (error) {
      this.logger.error('Failed to create QES signature:', error);
      throw error;
    }
  }

  /**
   * Generate mock signature for testing purposes
   */
  private generateMockSignature(content: string): string {
    const hash = Buffer.from(content).toString('base64');
    return `MOCK_SIGNATURE_${hash.substring(0, 16)}_${Date.now()}`;
  }

  /**
   * Create signature envelope for XML document
   */
  createSignatureEnvelope(
    xmlContent: string,
    signature: string,
    signatureType: string,
    certificate?: string
  ): string {
    const timestamp = new Date().toISOString();

    let signatureBlock = `
  <Podpis>
    <TypPodpisu>${signatureType}</TypPodpisu>
    <DataPodpisu>${timestamp}</DataPodpisu>
    <WartoscPodpisu>${signature}</WartoscPodpisu>`;

    if (certificate) {
      signatureBlock += `
    <Certifikat>${certificate}</Certyfikat>`;
    }

    signatureBlock += `
  </Podpis>`;

    // Insert signature block before closing tag
    return xmlContent.replace('</Deklaracja>', `${signatureBlock}\n</Deklaracja>`);
  }

  /**
   * Validate signature configuration
   */
  async validateSignatureConfig(
    tenantId: string,
    companyId: string,
    signatureType: string
  ): Promise<{ valid: boolean; message?: string }> {
    try {
      switch (signatureType) {
        case 'profil_zaufany':
          // Check if Profil Zaufany credentials are configured
          return {
            valid: false,
            message: 'Profil Zaufany credentials not configured'
          };

        case 'qes':
          // Check if QES certificate is configured
          return {
            valid: false,
            message: 'QES certificate not configured'
          };

        case 'none':
          return {
            valid: true,
            message: 'No signature required'
          };

        default:
          return {
            valid: false,
            message: 'Unknown signature type'
          };
      }
    } catch (error) {
      return {
        valid: false,
        message: error.message || 'Signature validation failed'
      };
    }
  }
}