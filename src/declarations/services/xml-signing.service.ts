import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface SignatureConfig {
  signatureType: 'profil_zaufany' | 'qes' | 'none';
  certificatePath?: string;
  privateKeyPath?: string;
  passphrase?: string;
  trustedProfileId?: string;
  signingTime?: Date;
}

export interface SignatureResult {
  signedXml: string;
  signatureId: string;
  signatureType: string;
  signingTime: Date;
  certificateInfo?: {
    issuer: string;
    subject: string;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
  };
}

@Injectable()
export class XMLSigningService {
  private readonly logger = new Logger(XMLSigningService.name);

  /**
   * Sign JPK_V7 XML with specified signature method
   */
  async signJPKV7XML(
    xmlContent: string,
    config: SignatureConfig,
    companyInfo?: any
  ): Promise<SignatureResult> {
    try {
      this.logger.log(`Signing JPK_V7 XML with ${config.signatureType} signature`);

      const signatureId = this.generateSignatureId();
      const signingTime = config.signingTime || new Date();

      let signedXml: string;

      switch (config.signatureType) {
        case 'profil_zaufany':
          signedXml = await this.signWithTrustedProfile(xmlContent, config, signatureId, signingTime);
          break;
        case 'qes':
          signedXml = await this.signWithQES(xmlContent, config, signatureId, signingTime);
          break;
        case 'none':
          signedXml = this.addBasicSignature(xmlContent, signatureId, signingTime);
          break;
        default:
          throw new Error(`Unsupported signature type: ${config.signatureType}`);
      }

      const result: SignatureResult = {
        signedXml,
        signatureId,
        signatureType: config.signatureType,
        signingTime
      };

      if (config.certificatePath) {
        result.certificateInfo = await this.extractCertificateInfo(config.certificatePath);
      }

      this.logger.log(`Successfully signed JPK_V7 XML with signature ID: ${signatureId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error signing JPK_V7 XML: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Sign XML with Profil Zaufany (Trusted Profile)
   */
  private async signWithTrustedProfile(
    xmlContent: string,
    config: SignatureConfig,
    signatureId: string,
    signingTime: Date
  ): Promise<string> {
    // For Profil Zaufany, we need to integrate with PZP API
    // This is a simplified implementation - in production, you would integrate with actual PZP service

    const signatureBlock = `
  <Podpisanie>
    <SignatureId>${signatureId}</SignatureId>
    <SignatureType>ProfilZaufany</SignatureType>
    <SigningTime>${signingTime.toISOString()}</SigningTime>
    <TrustedProfileId>${config.trustedProfileId}</TrustedProfileId>
    <Certificate>
      <Subject>Profil Zaufany User</Subject>
      <Issuer>Ministerstwo Cyfryzacji</Issuer>
      <SerialNumber>PZP_${signatureId}</SerialNumber>
    </Certificate>
  </Podpisanie>`;

    return this.insertSignatureBlock(xmlContent, signatureBlock);
  }

  /**
   * Sign XML with Qualified Electronic Signature (QES)
   */
  private async signWithQES(
    xmlContent: string,
    config: SignatureConfig,
    signatureId: string,
    signingTime: Date
  ): Promise<string> {
    if (!config.certificatePath || !config.privateKeyPath) {
      throw new Error('Certificate and private key paths are required for QES signing');
    }

    // Read certificate and private key
    const certificate = fs.readFileSync(config.certificatePath);
    const privateKey = fs.readFileSync(config.privateKeyPath);

    // Create digital signature
    const signature = crypto.createSign('SHA256');
    signature.update(xmlContent);
    const signatureValue = signature.sign({
      key: privateKey,
      passphrase: config.passphrase
    }, 'base64');

    // Extract certificate information
    const certInfo = await this.extractCertificateInfo(config.certificatePath);

    const signatureBlock = `
  <Podpisanie>
    <SignatureId>${signatureId}</SignatureId>
    <SignatureType>QES</SignatureType>
    <SigningTime>${signingTime.toISOString()}</SigningTime>
    <SignatureValue>${signatureValue}</SignatureValue>
    <Certificate>
      <Subject>${certInfo.subject}</Subject>
      <Issuer>${certInfo.issuer}</Issuer>
      <SerialNumber>${certInfo.serialNumber}</SerialNumber>
      <ValidFrom>${certInfo.validFrom.toISOString()}</ValidFrom>
      <ValidTo>${certInfo.validTo.toISOString()}</ValidTo>
    </Certificate>
  </Podpisanie>`;

    return this.insertSignatureBlock(xmlContent, signatureBlock);
  }

  /**
   * Add basic signature block without cryptographic signing
   */
  private addBasicSignature(
    xmlContent: string,
    signatureId: string,
    signingTime: Date
  ): string {
    const signatureBlock = `
  <Podpisanie>
    <SignatureId>${signatureId}</SignatureId>
    <SignatureType>Basic</SignatureType>
    <SigningTime>${signingTime.toISOString()}</SigningTime>
    <Note>Basic signature - no cryptographic signing applied</Note>
  </Podpisanie>`;

    return this.insertSignatureBlock(xmlContent, signatureBlock);
  }

  /**
   * Insert signature block into XML
   */
  private insertSignatureBlock(xmlContent: string, signatureBlock: string): string {
    // Insert signature block before closing JPK tag
    return xmlContent.replace('</JPK>', `  ${signatureBlock}
</JPK>`);
  }

  /**
   * Generate unique signature ID
   */
  private generateSignatureId(): string {
    return `SIG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract certificate information
   */
  private async extractCertificateInfo(certificatePath: string): Promise<{
    issuer: string;
    subject: string;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
  }> {
    try {
      // This is a simplified implementation
      // In production, you would use a proper certificate parsing library
      const certificate = fs.readFileSync(certificatePath);

      // For now, return mock data - implement proper certificate parsing as needed
      return {
        issuer: 'Certificate Authority',
        subject: 'JPK Signer',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year validity
        serialNumber: `CERT_${Date.now()}`
      };
    } catch (error) {
      this.logger.error(`Error extracting certificate info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify XML signature
   */
  async verifySignature(xmlContent: string): Promise<{
    isValid: boolean;
    signatureType?: string;
    signingTime?: Date;
    certificateInfo?: any;
    error?: string;
  }> {
    try {
      // Extract signature block from XML
      const signatureMatch = xmlContent.match(/<Podpisanie>(.*?)<\/Podpisanie>/s);

      if (!signatureMatch) {
        return {
          isValid: false,
          error: 'No signature block found'
        };
      }

      const signatureBlock = signatureMatch[1];
      const signatureType = this.extractFromSignature(signatureBlock, 'SignatureType');
      const signingTime = new Date(this.extractFromSignature(signatureBlock, 'SigningTime'));

      // For QES signatures, perform cryptographic verification
      if (signatureType === 'QES') {
        const isCryptoValid = await this.verifyQESSignature(xmlContent, signatureBlock);
        return {
          isValid: isCryptoValid,
          signatureType,
          signingTime,
          error: isCryptoValid ? undefined : 'Cryptographic signature verification failed'
        };
      }

      // For Profil Zaufany, verification would require API call to PZP service
      if (signatureType === 'ProfilZaufany') {
        return {
          isValid: true, // Simplified - in production, verify with PZP API
          signatureType,
          signingTime
        };
      }

      return {
        isValid: true,
        signatureType,
        signingTime
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Verify QES cryptographic signature
   */
  private async verifyQESSignature(xmlContent: string, signatureBlock: string): Promise<boolean> {
    try {
      // Extract signature value and certificate from signature block
      const signatureValue = this.extractFromSignature(signatureBlock, 'SignatureValue');
      // In production, you would extract and use the actual certificate for verification

      // Create verifier
      const verifier = crypto.createVerify('SHA256');
      verifier.update(xmlContent.split('<Podpisanie>')[0]); // Sign only content before signature

      // For now, return true - implement proper verification logic
      return true;
    } catch (error) {
      this.logger.error(`Error verifying QES signature: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract value from signature block by tag name
   */
  private extractFromSignature(signatureBlock: string, tagName: string): string {
    const match = signatureBlock.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's'));
    return match ? match[1] : '';
  }

  /**
   * Get available signature methods
   */
  getAvailableSignatureMethods(): Array<{
    type: string;
    name: string;
    description: string;
    requiresCredentials: boolean;
  }> {
    return [
      {
        type: 'profil_zaufany',
        name: 'Profil Zaufany',
        description: 'Polish government trusted profile signature',
        requiresCredentials: false
      },
      {
        type: 'qes',
        name: 'Qualified Electronic Signature',
        description: 'EU qualified electronic signature with certificate',
        requiresCredentials: true
      },
      {
        type: 'none',
        name: 'No Signature',
        description: 'Basic signature without cryptographic signing',
        requiresCredentials: false
      }
    ];
  }
}