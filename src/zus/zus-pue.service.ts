import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as xml2js from 'xml2js';

export interface PUEZUSCredentials {
  login: string;
  password: string;
  certificate?: string;
  privateKey?: string;
}

export interface ZUSFormSubmission {
  formType: string;
  period: string;
  xmlContent: string;
  signature?: string;
}

export interface ZUSSubmissionResponse {
  success: boolean;
  referenceNumber?: string;
  upoNumber?: string;
  status: string;
  message?: string;
  errors?: string[];
}

@Injectable()
export class ZusPueService {
  private readonly logger = new Logger(ZusPueService.name);
  private httpClient: AxiosInstance;
  private credentials: PUEZUSCredentials;
  private sessionToken?: string;

  constructor(private configService: ConfigService) {
    this.credentials = {
      login: this.configService.get<string>('ZUS_PUE_LOGIN', ''),
      password: this.configService.get<string>('ZUS_PUE_PASSWORD', ''),
      certificate: this.configService.get<string>('ZUS_PUE_CERTIFICATE', ''),
      privateKey: this.configService.get<string>('ZUS_PUE_PRIVATE_KEY', ''),
    };

    this.httpClient = axios.create({
      baseURL: this.configService.get<string>('ZUS_PUE_BASE_URL', 'https://pue.zus.pl'),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/xml',
        'User-Agent': 'Fiskario-ZUS-Client/1.0',
      },
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use((config) => {
      if (this.sessionToken) {
        config.headers.Authorization = `Bearer ${this.sessionToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('PUE ZUS API Error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
        });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Authenticate with PUE ZUS and obtain session token
   */
  async authenticate(): Promise<boolean> {
    try {
      if (!this.credentials.login || !this.credentials.password) {
        this.logger.error('PUE ZUS credentials not configured');
        return false;
      }

      const authData = {
        login: this.credentials.login,
        password: this.credentials.password,
      };

      const response = await this.httpClient.post('/auth/login', authData);

      if (response.data?.token) {
        this.sessionToken = response.data.token;
        this.logger.log('Successfully authenticated with PUE ZUS');
        return true;
      }

      this.logger.error('Authentication failed - no token received');
      return false;
    } catch (error) {
      this.logger.error('PUE ZUS authentication error', error.message);
      return false;
    }
  }

  /**
   * Submit ZUS form to PUE ZUS
   */
  async submitForm(submission: ZUSFormSubmission): Promise<ZUSSubmissionResponse> {
    try {
      // Ensure we're authenticated
      if (!this.sessionToken) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          return {
            success: false,
            status: 'AUTH_FAILED',
            message: 'Failed to authenticate with PUE ZUS',
          };
        }
      }

      // Prepare submission data
      const submissionData = {
        formType: submission.formType,
        period: submission.period,
        xmlContent: submission.xmlContent,
        signature: submission.signature || this.generateSignature(submission.xmlContent),
        timestamp: new Date().toISOString(),
      };

      // Submit to PUE ZUS
      const response = await this.httpClient.post('/api/submit', submissionData);

      if (response.data?.success) {
        this.logger.log(`Successfully submitted ${submission.formType} for period ${submission.period}`);

        return {
          success: true,
          referenceNumber: response.data.referenceNumber,
          upoNumber: response.data.upoNumber,
          status: 'SUBMITTED',
          message: 'Form submitted successfully',
        };
      }

      return {
        success: false,
        status: response.data?.status || 'SUBMISSION_FAILED',
        message: response.data?.message || 'Unknown submission error',
        errors: response.data?.errors || [],
      };
    } catch (error) {
      this.logger.error(`PUE ZUS submission error for ${submission.formType}`, error.message);

      return {
        success: false,
        status: 'ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Check submission status
   */
  async checkSubmissionStatus(referenceNumber: string): Promise<ZUSSubmissionResponse> {
    try {
      if (!this.sessionToken) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          return {
            success: false,
            status: 'AUTH_FAILED',
            message: 'Failed to authenticate with PUE ZUS',
          };
        }
      }

      const response = await this.httpClient.get(`/api/status/${referenceNumber}`);

      return {
        success: true,
        referenceNumber,
        upoNumber: response.data.upoNumber,
        status: response.data.status,
        message: response.data.message,
      };
    } catch (error) {
      this.logger.error(`PUE ZUS status check error for ${referenceNumber}`, error.message);

      return {
        success: false,
        status: 'ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get UPO (Official Confirmation) document
   */
  async getUPO(referenceNumber: string): Promise<{ success: boolean; upoContent?: string; error?: string }> {
    try {
      if (!this.sessionToken) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          return { success: false, error: 'Failed to authenticate with PUE ZUS' };
        }
      }

      const response = await this.httpClient.get(`/api/upo/${referenceNumber}`, {
        responseType: 'text',
      });

      return {
        success: true,
        upoContent: response.data,
      };
    } catch (error) {
      this.logger.error(`PUE ZUS UPO retrieval error for ${referenceNumber}`, error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate digital signature for form submission
   */
  private generateSignature(xmlContent: string): string {
    try {
      if (!this.credentials.privateKey || !this.credentials.certificate) {
        this.logger.warn('Digital signature not available - credentials missing');
        return '';
      }

      // Create signature using private key
      const sign = crypto.createSign('SHA256');
      sign.update(xmlContent);
      sign.end();

      const signature = sign.sign(this.credentials.privateKey, 'base64');

      return signature;
    } catch (error) {
      this.logger.error('Error generating digital signature', error.message);
      return '';
    }
  }

  /**
   * Validate XML against ZUS schema
   */
  async validateXML(xmlContent: string, formType: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // Basic XML validation
      const parser = new xml2js.Parser({
        strict: true,
        async: false,
      });

      await parser.parseStringPromise(xmlContent);

      // Additional ZUS-specific validations would go here
      // For now, just return valid if XML is well-formed

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Get available form types and their schemas
   */
  getAvailableFormTypes(): Array<{ type: string; name: string; description: string }> {
    return [
      { type: 'ZUA', name: 'ZUS ZUA', description: 'Registration for social insurance' },
      { type: 'ZZA', name: 'ZUS ZZA', description: 'Deregistration from social insurance' },
      { type: 'ZWUA', name: 'ZUS ZWUA', description: 'Change of social insurance data' },
      { type: 'RCA', name: 'ZUS RCA', description: 'Monthly report on social insurance contributions' },
      { type: 'RZA', name: 'ZUS RZA', description: 'Report on sickness and maternity benefits' },
      { type: 'RSA', name: 'ZUS RSA', description: 'Annual report on social insurance' },
      { type: 'DRA', name: 'ZUS DRA', description: 'Monthly declaration for payment of contributions' },
      { type: 'RPA', name: 'ZUS RPA', description: 'Quarterly report for contribution payers' },
    ];
  }

  /**
   * Test connection to PUE ZUS
   */
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const authenticated = await this.authenticate();

      if (authenticated) {
        return { connected: true, message: 'Successfully connected to PUE ZUS' };
      } else {
        return { connected: false, message: 'Failed to authenticate with PUE ZUS' };
      }
    } catch (error) {
      return { connected: false, message: `Connection test failed: ${error.message}` };
    }
  }
}