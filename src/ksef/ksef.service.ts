import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';
import * as libxmljs from 'libxmljs';
import { PrismaService } from '../prisma/prisma.service';
import { KSeFAuthDto, KSeFEnvironment, KSeFTokenRequestDto } from './dto/ksef-auth.dto';
import { KSeFInvoiceDto, KSeFSubmissionResponseDto } from './dto/ksef-invoice.dto';

export interface KSeFToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  environment: KSeFEnvironment;
}

export interface KSeFError {
  code: string;
  message: string;
  details?: any;
}

@Injectable()
export class KsefService {
  private readonly logger = new Logger(KsefService.name);
  private axiosInstance: AxiosInstance;
  private currentToken: KSeFToken | null = null;
  private xmlBuilder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: false }
  });

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
      },
    });

    // Set up response interceptor for token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.currentToken) {
          this.logger.warn('Token expired, attempting refresh...');
          try {
            await this.refreshToken();
            // Retry the original request
            return this.axiosInstance.request(error.config);
          } catch (refreshError) {
            this.logger.error('Token refresh failed', refreshError);
            throw new BadRequestException('Authentication failed');
          }
        }
        throw error;
      },
    );
  }

  /**
   * Authenticate with KSeF using authorization code
   */
  async authenticate(authDto: KSeFTokenRequestDto): Promise<KSeFToken> {
    try {
      const environment = authDto.environment || KSeFEnvironment.TEST;
      const baseUrl = this.getBaseUrl(environment);
      const tokenEndpoint = `${baseUrl}/api/online/Session/AuthorizationChallenge`;

      const requestBody = {
        AuthorizationChallengeRequest: {
          $: { xmlns: 'http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/v1' },
          Context: {
            Identifier: {
              IdentifierValue: authDto.nip,
              IdentifierType: 'NIP'
            }
          },
          Challenge: authDto.authorizationCode
        }
      };

      const xmlBody = this.xmlBuilder.buildObject(requestBody);

      const response = await this.axiosInstance.post(tokenEndpoint, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      // Parse XML response to extract token
      const parsedResponse = await xml2js.parseStringPromise(response.data);
      const tokenData = parsedResponse.AuthorizationChallengeResponse;

      if (!tokenData?.SessionToken?.[0]) {
        throw new BadRequestException('Invalid response from KSeF authentication');
      }

      const sessionToken = tokenData.SessionToken[0];
      const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 hours from now

      this.currentToken = {
        accessToken: sessionToken,
        expiresAt,
        environment,
      };

      this.logger.log(`Successfully authenticated with KSeF ${environment} environment`);

      return this.currentToken!;
    } catch (error) {
      this.logger.error('KSeF authentication failed', error);
      throw new BadRequestException(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Submit invoice to KSeF
   */
  async submitInvoice(invoiceDto: KSeFInvoiceDto, tenantId: string): Promise<KSeFSubmissionResponseDto> {
    if (!this.currentToken) {
      throw new BadRequestException('Not authenticated with KSeF');
    }

    try {
      // Convert invoice to FA(3) XML format
      const xmlInvoice = this.convertToFA3XML(invoiceDto);

      // Validate XML against FA(3) schema
      await this.validateFA3Schema(xmlInvoice);

      const baseUrl = this.getBaseUrl(this.currentToken.environment);
      const submitEndpoint = `${baseUrl}/api/online/Invoice/Send`;

      const requestBody = {
        SendInvoiceRequest: {
          $: { xmlns: 'http://ksef.mf.gov.pl/schema/gtw/svc/online/invoice/request/v1' },
          Invoice: xmlInvoice,
          SessionToken: this.currentToken.accessToken
        }
      };

      const xmlBody = this.xmlBuilder.buildObject(requestBody);

      const response = await this.axiosInstance.post(submitEndpoint, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      // Parse response
      const parsedResponse = await xml2js.parseStringPromise(response.data);
      const responseData = parsedResponse.SendInvoiceResponse;

      if (responseData?.Error) {
        throw new BadRequestException(`KSeF submission error: ${responseData.Error[0]}`);
      }

      const referenceNumber = responseData?.ReferenceNumber?.[0];
      const timestamp = responseData?.Timestamp?.[0];

      const submissionResponse: KSeFSubmissionResponseDto = {
        referenceNumber,
        status: 'submitted',
        timestamp,
      };

      // Store submission record
      await this.prisma.invoice.updateMany({
        where: {
          tenant_id: tenantId,
          number: invoiceDto.invoiceNumber,
        },
        data: {
          ksefStatus: 'submitted',
        },
      });

      this.logger.log(`Invoice ${invoiceDto.invoiceNumber} submitted to KSeF successfully`);

      return submissionResponse;
    } catch (error) {
      this.logger.error(`Failed to submit invoice ${invoiceDto.invoiceNumber} to KSeF`, error);

      // Update invoice status
      await this.prisma.invoice.updateMany({
        where: {
          tenant_id: tenantId,
          number: invoiceDto.invoiceNumber,
        },
        data: {
          ksefStatus: 'failed',
        },
      });

      throw new InternalServerErrorException(`Invoice submission failed: ${error.message}`);
    }
  }

  /**
   * Check invoice status in KSeF
   */
  async checkInvoiceStatus(referenceNumber: string): Promise<KSeFSubmissionResponseDto> {
    if (!this.currentToken) {
      throw new BadRequestException('Not authenticated with KSeF');
    }

    try {
      const baseUrl = this.getBaseUrl(this.currentToken.environment);
      const statusEndpoint = `${baseUrl}/api/online/Invoice/Status`;

      const requestBody = {
        StatusInvoiceRequest: {
          $: { xmlns: 'http://ksef.mf.gov.pl/schema/gtw/svc/online/invoice/request/v1' },
          ReferenceNumber: referenceNumber,
          SessionToken: this.currentToken.accessToken
        }
      };

      const xmlBody = this.xmlBuilder.buildObject(requestBody);

      const response = await this.axiosInstance.post(statusEndpoint, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      const parsedResponse = await xml2js.parseStringPromise(response.data);
      const responseData = parsedResponse.StatusInvoiceResponse;

      if (responseData?.Error) {
        throw new BadRequestException(`KSeF status check error: ${responseData.Error[0]}`);
      }

      const status = responseData?.ProcessingStatus?.[0];
      const upoNumber = responseData?.UPONumber?.[0];

      return {
        referenceNumber,
        status,
        upoNumber,
      };
    } catch (error) {
      this.logger.error(`Failed to check status for reference ${referenceNumber}`, error);
      throw new InternalServerErrorException(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Get UPO (Official Receipt Confirmation) for invoice
   */
  async getUPO(referenceNumber: string): Promise<string> {
    if (!this.currentToken) {
      throw new BadRequestException('Not authenticated with KSeF');
    }

    try {
      const baseUrl = this.getBaseUrl(this.currentToken.environment);
      const upoEndpoint = `${baseUrl}/api/online/Invoice/UPO`;

      const requestBody = {
        UPOInvoiceRequest: {
          $: { xmlns: 'http://ksef.mf.gov.pl/schema/gtw/svc/online/invoice/request/v1' },
          ReferenceNumber: referenceNumber,
          SessionToken: this.currentToken.accessToken
        }
      };

      const xmlBody = this.xmlBuilder.buildObject(requestBody);

      const response = await this.axiosInstance.post(upoEndpoint, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      const parsedResponse = await xml2js.parseStringPromise(response.data);
      const responseData = parsedResponse.UPOInvoiceResponse;

      if (responseData?.Error) {
        throw new BadRequestException(`KSeF UPO retrieval error: ${responseData.Error[0]}`);
      }

      const upoContent = responseData?.UPOContent?.[0];

      this.logger.log(`UPO retrieved successfully for reference ${referenceNumber}`);

      return upoContent;
    } catch (error) {
      this.logger.error(`Failed to get UPO for reference ${referenceNumber}`, error);
      throw new InternalServerErrorException(`UPO retrieval failed: ${error.message}`);
    }
  }

  /**
   * Convert invoice DTO to FA(3) XML format
   */
  private convertToFA3XML(invoiceDto: KSeFInvoiceDto): any {
    return {
      FA: {
        $: {
          xmlns: 'http://ksef.mf.gov.pl/schema/fa/3',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          'xsi:schemaLocation': 'http://ksef.mf.gov.pl/schema/fa/3'
        },
        Naglowek: {
          KodFormularza: 'FA (3)',
          WariantFormularza: '3',
          DataWytworzeniaFa: new Date().toISOString().split('T')[0],
          KodSystemowy: 'FISKARIO'
        },
        Podmiot1: {
          DaneIdentyfikacyjne: {
            NIP: invoiceDto.sellerNip,
            Nazwa: invoiceDto.sellerName
          },
          Adres: {
            AdresL1: invoiceDto.sellerAddress
          }
        },
        Podmiot2: {
          DaneIdentyfikacyjne: {
            NIP: invoiceDto.buyerNip,
            Nazwa: invoiceDto.buyerName
          },
          Adres: {
            AdresL1: invoiceDto.buyerAddress
          }
        },
        Faktura: {
          NumerFa: invoiceDto.invoiceNumber,
          DataWystawienia: invoiceDto.issueDate,
          TerminPlatnosci: invoiceDto.dueDate || invoiceDto.issueDate,
          SposobPlatnosci: invoiceDto.paymentMethod || 'przelew',
          P_15: 'NIE', // No split payment
          P_16: 'NIE', // No additional obligations
          Wartosci: {
            WartoscNetto: invoiceDto.totalNet.toFixed(2),
            WartoscVat: invoiceDto.totalVat.toFixed(2),
            WartoscBrutto: invoiceDto.totalGross.toFixed(2)
          },
          Pozycje: {
            Pozycja: invoiceDto.items.map((item, index) => ({
              Lp: index + 1,
              Nazwa: item.name,
              Ilosc: item.quantity.toFixed(2),
              Jednostka: 'szt',
              CenaJednostkowa: item.unitPrice.toFixed(2),
              WartoscNetto: item.netAmount.toFixed(2),
              StawkaVat: item.vatRate.toString(),
              WartoscVat: item.vatAmount.toFixed(2),
              WartoscBrutto: item.grossAmount.toFixed(2),
              ...(item.gtu && { GTU: item.gtu })
            }))
          }
        }
      }
    };
  }

  /**
   * Validate XML against FA(3) schema
   */
  private async validateFA3Schema(xmlContent: any): Promise<void> {
    try {
      const xmlString = this.xmlBuilder.buildObject(xmlContent);

      // For now, we'll do basic validation
      // In production, you would load the official FA(3) XSD schema
      // and validate against it using libxmljs

      if (!xmlString.includes('xmlns="http://ksef.mf.gov.pl/schema/fa/3"')) {
        throw new BadRequestException('Invalid FA(3) XML format');
      }

      this.logger.log('FA(3) XML validation passed');
    } catch (error) {
      this.logger.error('FA(3) XML validation failed', error);
      throw new BadRequestException(`XML validation failed: ${error.message}`);
    }
  }

  /**
   * Get base URL for KSeF environment
   */
  private getBaseUrl(environment: KSeFEnvironment): string {
    return environment === KSeFEnvironment.TEST
      ? 'https://ksef-test.mf.gov.pl'
      : 'https://ksef.mf.gov.pl';
  }

  /**
   * Refresh authentication token
   */
  private async refreshToken(): Promise<void> {
    if (!this.currentToken) {
      throw new BadRequestException('No token to refresh');
    }

    try {
      const baseUrl = this.getBaseUrl(this.currentToken.environment);
      const refreshEndpoint = `${baseUrl}/api/online/Session/Refresh`;

      const requestBody = {
        RefreshTokenRequest: {
          $: { xmlns: 'http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/v1' },
          SessionToken: this.currentToken.accessToken
        }
      };

      const xmlBody = this.xmlBuilder.buildObject(requestBody);

      const response = await this.axiosInstance.post(refreshEndpoint, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      const parsedResponse = await xml2js.parseStringPromise(response.data);
      const tokenData = parsedResponse.RefreshTokenResponse;

      if (!tokenData?.SessionToken?.[0]) {
        throw new BadRequestException('Token refresh failed');
      }

      this.currentToken.accessToken = tokenData.SessionToken[0];
      this.currentToken.expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);

      this.logger.log('Token refreshed successfully');
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      this.currentToken = null;
      throw new BadRequestException('Token refresh failed');
    }
  }

  /**
   * Get current authentication status
   */
  getAuthStatus(): { authenticated: boolean; environment?: KSeFEnvironment; expiresAt?: Date } {
    if (!this.currentToken) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      environment: this.currentToken.environment,
      expiresAt: this.currentToken.expiresAt,
    };
  }
}