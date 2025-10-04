import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as soap from 'soap';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface EdeklaracjeConfig {
  testEnvironment: boolean;
  certificatePath: string;
  privateKeyPath: string;
  passphrase?: string;
  timeout: number;
  retries: number;
}

export interface AuthenticationHeader {
  Timestamp: {
    Created: string;
    Expires: string;
  };
  Signature: {
    SignedInfo: {
      CanonicalizationMethod: { Algorithm: string };
      SignatureMethod: { Algorithm: string };
      Reference: {
        Transforms: string[];
        DigestMethod: { Algorithm: string };
        DigestValue: string;
      };
    };
    SignatureValue: string;
    KeyInfo: {
      X509Data: {
        X509Certificate: string;
      };
    };
  };
}

export interface SubmissionRequest {
  documentType: string;
  documentVersion: string;
  xmlContent: string;
  signatureType: 'profil_zaufany' | 'qes' | 'none';
  certificateInfo?: {
    serialNumber: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
  };
}

export interface SubmissionResponse {
  success: boolean;
  upoNumber?: string;
  upoDate?: string;
  status?: string;
  message?: string;
  error?: string;
  rawResponse?: any;
}

export interface UPOValidationResult {
  isValid: boolean;
  upoNumber?: string;
  confirmationDate?: string;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class EDeklaracjeService {
  private readonly logger = new Logger(EDeklaracjeService.name);
  private config: EdeklaracjeConfig;
  private soapClient: any;
  private wsdlUrls = {
    test: 'https://test-e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl',
    production: 'https://e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl'
  };

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {
    this.config = {
      testEnvironment: this.configService.get<boolean>('EDEKLARACJE_TEST_ENV', true),
      certificatePath: this.configService.get<string>('EDEKLARACJE_CERT_PATH', ''),
      privateKeyPath: this.configService.get<string>('EDEKLARACJE_KEY_PATH', ''),
      passphrase: this.configService.get<string>('EDEKLARACJE_PASSPHRASE', ''),
      timeout: this.configService.get<number>('EDEKLARACJE_TIMEOUT', 30000),
      retries: this.configService.get<number>('EDEKLARACJE_RETRIES', 3)
    };
  }

  /**
   * Initialize SOAP client connection
   */
  async initializeClient(): Promise<void> {
    try {
      const wsdlUrl = this.config.testEnvironment
        ? this.wsdlUrls.test
        : this.wsdlUrls.production;

      this.logger.log(`Initializing e-Deklaracje SOAP client for ${this.config.testEnvironment ? 'TEST' : 'PRODUCTION'} environment`);

      const options: any = {
        timeout: this.config.timeout,
        rejectUnauthorized: !this.config.testEnvironment,
        strictSSL: !this.config.testEnvironment
      };

      this.soapClient = await soap.createClientAsync(wsdlUrl, options);

      // Set up security headers if certificate is provided
      if (this.config.certificatePath && this.config.privateKeyPath) {
        await this.setupSecurityHeaders();
      }

      this.logger.log('e-Deklaracje SOAP client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize e-Deklaracje SOAP client:', error);
      throw error;
    }
  }

  /**
   * Set up WS-Security headers for authentication
   */
  private async setupSecurityHeaders(): Promise<void> {
    if (!this.soapClient) {
      throw new Error('SOAP client not initialized');
    }

    try {
      // Read certificate and private key
      const certificate = fs.readFileSync(this.config.certificatePath, 'utf8');
      const privateKey = fs.readFileSync(this.config.privateKeyPath, 'utf8');

      // Create timestamp
      const now = new Date();
      const created = now.toISOString();
      const expires = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes

      // Create signature
      const signature = await this.createSignature(certificate, privateKey);

      const securityHeader = {
        'wsse:Security': {
          'wsse:UsernameToken': {
            'wsse:Username': 'certificate_user',
            'wsse:Password': 'certificate_password'
          },
          'wsu:Timestamp': {
            'wsu:Created': created,
            'wsu:Expires': expires
          },
          'wsse:BinarySecurityToken': {
            'ValueType': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3',
            'EncodingType': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary',
            '#text': certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, '')
          },
          'ds:Signature': signature
        }
      };

      this.soapClient.addSoapHeader(securityHeader);
      this.logger.log('WS-Security headers configured');
    } catch (error) {
      this.logger.error('Failed to setup security headers:', error);
      throw error;
    }
  }

  /**
   * Create digital signature for SOAP message
   */
  private async createSignature(certificate: string, privateKey: string): Promise<any> {
    try {
      const canonicalForm = this.createCanonicalForm();
      const digest = crypto.createHash('sha256').update(canonicalForm).digest('base64');

      const signatureValue = crypto.createSign('RSA-SHA256')
        .update(canonicalForm)
        .sign({
          key: privateKey,
          passphrase: this.config.passphrase
        }, 'base64');

      return {
        'ds:SignedInfo': {
          'ds:CanonicalizationMethod': {
            'Algorithm': 'http://www.w3.org/2001/10/xml-exc-c14n#'
          },
          'ds:SignatureMethod': {
            'Algorithm': 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
          },
          'ds:Reference': {
            'URI': '#Body',
            'ds:Transforms': {
              'ds:Transform': {
                'Algorithm': 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
              }
            },
            'ds:DigestMethod': {
              'Algorithm': 'http://www.w3.org/2001/04/xmlenc#sha256'
            },
            'ds:DigestValue': digest
          }
        },
        'ds:SignatureValue': signatureValue,
        'ds:KeyInfo': {
          'ds:X509Data': {
            'ds:X509Certificate': certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, '')
          }
        }
      };
    } catch (error) {
      this.logger.error('Failed to create signature:', error);
      throw error;
    }
  }

  /**
   * Create canonical form of the SOAP message for signing
   */
  private createCanonicalForm(): string {
    // This would create the canonical XML form for signing
    // Implementation depends on the specific SOAP message structure
    return '<soap:Envelope>...</soap:Envelope>';
  }

  /**
   * Submit declaration to e-Deklaracje system
   */
  async submitDeclaration(request: SubmissionRequest): Promise<SubmissionResponse> {
    const startTime = Date.now();

    try {
      if (!this.soapClient) {
        await this.initializeClient();
      }

      this.logger.log(`Submitting ${request.documentType} declaration to e-Deklaracje`);

      // Prepare submission data
      const submissionData = {
        dokument: {
          kodFormularza: this.getDeclarationCode(request.documentType),
          wersja: request.documentVersion,
          zawartosc: request.xmlContent,
          dataUtworzenia: new Date().toISOString().split('T')[0],
          opis: `${request.documentType} declaration`
        },
        certyfikat: request.certificateInfo ? {
          numerSeryjny: request.certificateInfo.serialNumber,
          wystawca: request.certificateInfo.issuer,
          dataOd: request.certificateInfo.validFrom.toISOString().split('T')[0],
          dataDo: request.certificateInfo.validTo.toISOString().split('T')[0]
        } : undefined
      };

      // Call e-Deklaracje web service
      const response = await this.soapClient.WyslijDeklaracjeAsync({
        param: submissionData
      });

      const processingTime = Date.now() - startTime;

      if (response && response[0] && response[0].potwierdzenie) {
        const confirmation = response[0].potwierdzenie;

        this.logger.log(`Declaration submitted successfully. UPO: ${confirmation.numerPotwierdzenia}, Processing time: ${processingTime}ms`);

        return {
          success: true,
          upoNumber: confirmation.numerPotwierdzenia,
          upoDate: confirmation.dataPotwierdzenia,
          status: 'submitted',
          message: confirmation.opis || 'Deklaracja została przyjęta',
          rawResponse: response
        };
      } else {
        throw new Error('Invalid response from e-Deklaracje service');
      }
    } catch (error) {
      this.logger.error('Failed to submit declaration to e-Deklaracje:', error);

      return {
        success: false,
        error: error.message || 'Submission failed',
        status: 'error'
      };
    }
  }

  /**
   * Check declaration status using UPO number
   */
  async checkDeclarationStatus(upoNumber: string): Promise<any> {
    try {
      if (!this.soapClient) {
        await this.initializeClient();
      }

      this.logger.log(`Checking status for UPO: ${upoNumber}`);

      const response = await this.soapClient.SprawdzStatusAsync({
        param: {
          numerPotwierdzenia: upoNumber
        }
      });

      if (response && response[0]) {
        const status = response[0];

        return {
          upoNumber: status.numerPotwierdzenia,
          status: this.mapStatusCode(status.kodStatusu),
          statusDescription: status.opisStatusu,
          processingDate: status.dataPrzetworzenia,
          details: status.szczegoly
        };
      }

      throw new Error('Invalid status response');
    } catch (error) {
      this.logger.error(`Failed to check status for UPO ${upoNumber}:`, error);
      throw error;
    }
  }

  /**
   * Validate UPO (Official Receipt Confirmation)
   */
  async validateUPO(upoNumber: string): Promise<UPOValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.log(`Validating UPO: ${upoNumber}`);

      // Check UPO format (should be 32 characters, alphanumeric)
      if (!/^[A-Z0-9]{32}$/.test(upoNumber)) {
        errors.push('Invalid UPO format - should be 32 alphanumeric characters');
      }

      // Check if UPO exists in our database
      const declaration = await this.prisma.declaration.findFirst({
        where: { upoNumber: upoNumber }
      });

      if (!declaration) {
        warnings.push('UPO not found in local database');
      }

      // Verify UPO with e-Deklaracje service
      if (errors.length === 0) {
        try {
          const status = await this.checkDeclarationStatus(upoNumber);

          if (status.status === 'accepted') {
            this.logger.log(`UPO ${upoNumber} validated successfully`);
            return {
              isValid: true,
              upoNumber: upoNumber,
              confirmationDate: status.processingDate,
              errors: [],
              warnings: []
            };
          } else {
            errors.push(`UPO status: ${status.status} - ${status.statusDescription}`);
          }
        } catch (statusError) {
          errors.push(`Failed to verify UPO with e-Deklaracje service: ${statusError.message}`);
        }
      }

      return {
        isValid: errors.length === 0,
        upoNumber: upoNumber,
        errors,
        warnings
      };
    } catch (error) {
      this.logger.error(`UPO validation failed for ${upoNumber}:`, error);
      errors.push(error.message);

      return {
        isValid: false,
        upoNumber: upoNumber,
        errors,
        warnings
      };
    }
  }

  /**
   * Get declaration code for e-Deklaracje system
   */
  private getDeclarationCode(documentType: string): string {
    const codeMap: { [key: string]: string } = {
      'JPK_V7M': 'JPK_V7M',
      'JPK_V7K': 'JPK_V7K',
      'VAT-7': 'VAT-7',
      'PIT-36': 'PIT-36',
      'PIT-37': 'PIT-37',
      'CIT-8': 'CIT-8',
      'VAT-UE': 'VAT-UE'
    };

    return codeMap[documentType] || documentType;
  }

  /**
   * Map e-Deklaracje status codes to human readable status
   */
  private mapStatusCode(statusCode: string): string {
    const statusMap: { [key: string]: string } = {
      '100': 'submitted',
      '200': 'processing',
      '300': 'accepted',
      '400': 'rejected',
      '500': 'error'
    };

    return statusMap[statusCode] || 'unknown';
  }

  /**
   * Get available declaration forms
   */
  async getAvailableForms(): Promise<any[]> {
    try {
      if (!this.soapClient) {
        await this.initializeClient();
      }

      const response = await this.soapClient.PobierzFormularzeAsync({
        param: {
          data: new Date().toISOString().split('T')[0]
        }
      });

      return response[0]?.formularze || [];
    } catch (error) {
      this.logger.error('Failed to get available forms:', error);
      throw error;
    }
  }

  /**
   * Test connection to e-Deklaracje service
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAvailableForms();
      return {
        success: true,
        message: `Successfully connected to ${this.config.testEnvironment ? 'TEST' : 'PRODUCTION'} environment`
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }
}