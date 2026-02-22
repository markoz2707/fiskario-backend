import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';

export interface GUSCompanyData {
    nip: string;
    name: string;
    regon: string;
    address: string;
    city: string;
    postalCode: string;
    voivodeship: string;
    status: 'active' | 'inactive';
    vatPayer: boolean;
    vatStatus: 'active' | 'exempt' | 'inactive';
    lastUpdate: Date;
}

export interface NIPValidationResult {
    valid: boolean;
    exists: boolean;
    vatPayer: boolean;
    companyData?: GUSCompanyData;
    error?: string;
}

@Injectable()
export class GusApiService {
    private readonly logger = new Logger(GusApiService.name);
    private axiosInstance: AxiosInstance;
    private sessionId: string | null = null;
    private sessionExpiry: Date | null = null;
    private cache: Map<string, { data: GUSCompanyData; expiry: Date }> = new Map();
    private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

    constructor(private configService: ConfigService) {
        // GUS BIR1 API endpoint
        const gusApiUrl = this.configService.get<string>('GUS_API_URL') || 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';

        this.axiosInstance = axios.create({
            baseURL: gusApiUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/soap+xml',
            },
        });
    }

    /**
     * Validate NIP number
     */
    async validateNIP(nip: string): Promise<NIPValidationResult> {
        try {
            // Clean NIP (remove dashes and spaces)
            const cleanNip = nip.replace(/[-\s]/g, '');

            // Basic format validation
            if (!this.isValidNIPFormat(cleanNip)) {
                return {
                    valid: false,
                    exists: false,
                    vatPayer: false,
                    error: 'Invalid NIP format',
                };
            }

            // Check cache first
            const cached = this.cache.get(cleanNip);
            if (cached && cached.expiry > new Date()) {
                this.logger.debug(`Using cached data for NIP ${cleanNip}`);
                return {
                    valid: true,
                    exists: true,
                    vatPayer: cached.data.vatPayer,
                    companyData: cached.data,
                };
            }

            // Get company data from GUS
            const companyData = await this.getCompanyData(cleanNip);

            if (!companyData) {
                return {
                    valid: true, // Format is valid even if not found
                    exists: false,
                    vatPayer: false,
                    error: 'Company not found in GUS registry',
                };
            }

            // Cache the result
            this.cache.set(cleanNip, {
                data: companyData,
                expiry: new Date(Date.now() + this.CACHE_DURATION),
            });

            return {
                valid: true,
                exists: true,
                vatPayer: companyData.vatPayer,
                companyData,
            };
        } catch (error) {
            this.logger.error(`NIP validation failed for ${nip}: ${error.message}`, error.stack);
            return {
                valid: false,
                exists: false,
                vatPayer: false,
                error: error.message,
            };
        }
    }

    /**
     * Get company data from GUS registry
     */
    async getCompanyData(nip: string): Promise<GUSCompanyData | null> {
        try {
            // For MVP, using mock data if GUS API key not configured
            const apiKey = this.configService.get<string>('GUS_API_KEY');

            if (!apiKey) {
                this.logger.warn('GUS API key not configured, using mock validator');
                return this.getMockCompanyData(nip);
            }

            // Ensure we have valid session
            await this.ensureSession();

            // Build SOAP request
            const soapRequest = this.buildGUSSearchRequest(nip);

            const response = await this.axiosInstance.post('', soapRequest, {
                headers: {
                    'sid': this.sessionId || '',
                },
            });

            // Parse SOAP response
            const parsedResponse = await xml2js.parseStringPromise(response.data);

            // Extract company data from response
            const companyData = this.parseGUSResponse(parsedResponse, nip);

            return companyData;
        } catch (error) {
            this.logger.error(`Failed to get company data for NIP ${nip}: ${error.message}`, error.stack);
            return null;
        }
    }

    /**
     * Check VAT status
     */
    async checkVATStatus(nip: string): Promise<'active' | 'exempt' | 'inactive' | 'unknown'> {
        try {
            const companyData = await this.getCompanyData(nip);

            if (!companyData) {
                return 'unknown';
            }

            return companyData.vatStatus;
        } catch (error) {
            this.logger.error(`Failed to check VAT status for ${nip}: ${error.message}`);
            return 'unknown';
        }
    }

    /**
     * Validate NIP format (checksum)
     */
    private isValidNIPFormat(nip: string): boolean {
        if (!/^\d{10}$/.test(nip)) {
            return false;
        }

        const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
        const digits = nip.split('').map(Number);

        const sum = weights.reduce((acc, weight, index) => acc + weight * digits[index], 0);
        const checksum = sum % 11;

        return checksum === digits[9];
    }

    /**
     * Ensure we have a valid GUS session
     */
    private async ensureSession(): Promise<void> {
        if (this.sessionId && this.sessionExpiry && this.sessionExpiry > new Date()) {
            return; // Session still valid
        }

        // Create new session
        const apiKey = this.configService.get<string>('GUS_API_KEY');
        const soapRequest = this.buildLoginRequest(apiKey || '');

        try {
            const response = await this.axiosInstance.post('', soapRequest);
            const parsedResponse = await xml2js.parseStringPromise(response.data);

            this.sessionId = parsedResponse['s:Envelope']['s:Body'][0]['ZalogujResponse'][0]['ZalogujResult'][0];
            this.sessionExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

            this.logger.log('GUS session established');
        } catch (error) {
            this.logger.error('Failed to establish GUS session', error);
            throw new Error('Failed to connect to GUS API');
        }
    }

    /**
     * Build GUS login SOAP request
     */
    private buildLoginRequest(apiKey: string): string {
        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:Zaloguj>
      <ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika>
    </ns:Zaloguj>
  </soap:Body>
</soap:Envelope>`;
    }

    /**
     * Build GUS search SOAP request
     */
    private buildGUSSearchRequest(nip: string): string {
        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Body>
    <ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <ns:Nip>${nip}</ns:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>
  </soap:Body>
</soap:Envelope>`;
    }

    /**
     * Parse GUS SOAP response
     */
    private parseGUSResponse(parsedXml: any, nip: string): GUSCompanyData | null {
        try {
            const data = parsedXml['s:Envelope']['s:Body'][0]['DaneSzukajPodmiotyResponse'][0]['DaneSzukajPodmiotyResult'][0];

            if (!data) {
                return null;
            }

            // Parse XML data structure (simplified - actual structure may vary)
            return {
                nip,
                name: data['Nazwa'][0] || '',
                regon: data['Regon'][0] || '',
                address: data['Ulica'][0] || '',
                city: data['Miejscowosc'][0] || '',
                postalCode: data['KodPocztowy'][0] || '',
                voivodeship: data['Wojewodztwo'][0] || '',
                status: data['StatusNip'][0] === '1' ? 'active' : 'inactive',
                vatPayer: data['StatusVat'][0] === 'C', // C = czynny VAT
                vatStatus: data['StatusVat'][0] === 'C' ? 'active' : 'inactive',
                lastUpdate: new Date(),
            };
        } catch (error) {
            this.logger.error('Failed to parse GUS response', error);
            return null;
        }
    }

    /**
     * Get mock company data for testing (when GUS API key not available)
     */
    private getMockCompanyData(nip: string): GUSCompanyData {
        // Validate NIP format at least
        if (!this.isValidNIPFormat(nip)) {
            throw new BadRequestException('Invalid NIP format');
        }

        return {
            nip,
            name: `Firma testowa ${nip}`,
            regon: `${nip.substring(0, 9)}`,
            address: 'ul. Testowa 1',
            city: 'Warszawa',
            postalCode: '00-001',
            voivodeship: 'mazowieckie',
            status: 'active',
            vatPayer: true,
            vatStatus: 'active',
            lastUpdate: new Date(),
        };
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
        this.logger.log('GUS cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; entries: number } {
        let totalSize = 0;
        for (const [, value] of this.cache.entries()) {
            totalSize += JSON.stringify(value).length;
        }

        return {
            size: totalSize,
            entries: this.cache.size,
        };
    }
}
