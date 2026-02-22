import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';
import { PrismaService } from '../prisma/prisma.service';
import { KSeFEnvironment } from './dto/ksef-auth.dto';
import {
    KSeFReceivedInvoiceDto,
    KSeFInvoiceListDto,
    KSeFSyncRequestDto,
    KSeFSyncResponseDto
} from './dto/ksef-received-invoice.dto';
import { KsefService } from './ksef.service';

export interface KSeFInvoiceQueryParams {
    dateFrom: Date;
    dateTo: Date;
    invoiceType?: 'incoming' | 'outgoing';
    pageSize?: number;
    pageOffset?: number;
}

@Injectable()
export class KsefReceiverService {
    private readonly logger = new Logger(KsefReceiverService.name);
    private axiosInstance: AxiosInstance;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private ksefService: KsefService,
    ) {
        this.axiosInstance = axios.create({
            timeout: 60000, // 60 seconds for potentially large downloads
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
            },
        });
    }

    /**
     * Get list of incoming invoices from KSeF
     */
    async getIncomingInvoices(
        tenantId: string,
        params: KSeFInvoiceQueryParams,
    ): Promise<KSeFInvoiceListDto[]> {
        const authStatus = this.ksefService.getAuthStatus();
        if (!authStatus.authenticated) {
            throw new BadRequestException('Not authenticated with KSeF');
        }

        try {
            const baseUrl = this.getBaseUrl(authStatus.environment!);
            const queryEndpoint = `${baseUrl}/api/online/Query/Invoice/Async/Init`;

            const requestBody = {
                QueryInvoiceAsyncInitRequest: {
                    $: { xmlns: 'http://ksef.mf.gov.pl/schema/gtw/svc/online/query/request/v1' },
                    QueryCriteria: {
                        SubjectType: 'subject2', // subject2 = buyer (incoming invoices)
                        InvoicingDateFrom: params.dateFrom.toISOString().split('T')[0],
                        InvoicingDateTo: params.dateTo.toISOString().split('T')[0],
                    },
                    PageSize: params.pageSize || 100,
                    PageOffset: params.pageOffset || 0,
                },
            };

            const xmlBuilder = new xml2js.Builder({
                xmldec: { version: '1.0', encoding: 'UTF-8' },
                renderOpts: { pretty: false }
            });

            const xmlBody = xmlBuilder.buildObject(requestBody);

            this.logger.log(`Querying KSeF for incoming invoices from ${params.dateFrom} to ${params.dateTo}`);

            const response = await this.axiosInstance.post(queryEndpoint, xmlBody);

            const parsedResponse = await xml2js.parseStringPromise(response.data);
            const responseData = parsedResponse.QueryInvoiceAsyncInitResponse;

            if (responseData?.Error) {
                throw new BadRequestException(`KSeF query error: ${responseData.Error[0]}`);
            }

            const referenceNumber = responseData?.ReferenceNumber?.[0];

            // Wait for query to complete and get results
            const invoices = await this.pollQueryResults(referenceNumber, authStatus.environment!);

            this.logger.log(`Found ${invoices.length} incoming invoices`);

            return invoices;
        } catch (error) {
            this.logger.error(`Failed to get incoming invoices: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Failed to retrieve invoices: ${error.message}`);
        }
    }

    /**
     * Poll for async query results
     */
    private async pollQueryResults(
        referenceNumber: string,
        environment: KSeFEnvironment,
        maxAttempts: number = 30,
    ): Promise<KSeFInvoiceListDto[]> {
        const baseUrl = this.getBaseUrl(environment);
        const statusEndpoint = `${baseUrl}/api/online/Query/Invoice/Async/Status/${referenceNumber}`;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.delay(2000); // Wait 2 seconds between polls

            try {
                const response = await this.axiosInstance.get(statusEndpoint);
                const parsedResponse = await xml2js.parseStringPromise(response.data);
                const status = parsedResponse.QueryInvoiceAsyncStatusResponse?.ProcessingStatus?.[0];

                if (status === 'Done') {
                    return this.fetchQueryResults(referenceNumber, environment);
                } else if (status === 'Error') {
                    throw new Error('Query processing failed');
                }

                this.logger.debug(`Query status: ${status}, attempt ${attempt + 1}/${maxAttempts}`);
            } catch (error) {
                this.logger.error(`Error polling query status: ${error.message}`);
            }
        }

        throw new Error('Query timeout - max attempts reached');
    }

    /**
     * Fetch completed query results
     */
    private async fetchQueryResults(
        referenceNumber: string,
        environment: KSeFEnvironment,
    ): Promise<KSeFInvoiceListDto[]> {
        const baseUrl = this.getBaseUrl(environment);
        const fetchEndpoint = `${baseUrl}/api/online/Query/Invoice/Async/Fetch/${referenceNumber}`;

        const response = await this.axiosInstance.get(fetchEndpoint);
        const parsedResponse = await xml2js.parseStringPromise(response.data);

        const invoiceHeaders = parsedResponse.QueryInvoiceAsyncFetchResponse?.InvoiceHeaderList?.[0]?.InvoiceHeader || [];

        return invoiceHeaders.map((header: any) => ({
            ksefNumber: header.InvoiceReferenceNumber?.[0],
            invoiceNumber: header.InvoiceNumber?.[0],
            issueDate: new Date(header.InvoiceDate?.[0]),
            sellerNip: header.SubjectBy?.IdentifierNIP?.[0],
            sellerName: header.SubjectBy?.FullName?.[0],
            totalGross: parseFloat(header.InvoiceGrossValue?.[0]),
            status: 'new',
        }));
    }

    /**
     * Download specific invoice XML from KSeF
     */
    async downloadInvoice(
        ksefInvoiceNumber: string,
        tenantId: string,
    ): Promise<KSeFReceivedInvoiceDto> {
        const authStatus = this.ksefService.getAuthStatus();
        if (!authStatus.authenticated) {
            throw new BadRequestException('Not authenticated with KSeF');
        }

        try {
            const baseUrl = this.getBaseUrl(authStatus.environment!);
            const downloadEndpoint = `${baseUrl}/api/online/Invoice/Get/${ksefInvoiceNumber}`;

            this.logger.log(`Downloading invoice ${ksefInvoiceNumber} from KSeF`);

            const response = await this.axiosInstance.get(downloadEndpoint);

            // Parse FA(3) XML
            const invoiceData = await this.parseFA3Invoice(response.data, ksefInvoiceNumber);

            this.logger.log(`Successfully downloaded and parsed invoice ${ksefInvoiceNumber}`);

            return invoiceData;
        } catch (error) {
            this.logger.error(`Failed to download invoice ${ksefInvoiceNumber}: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Invoice download failed: ${error.message}`);
        }
    }

    /**
     * Parse FA(3) XML invoice to DTO
     */
    async parseFA3Invoice(xmlContent: string, ksefNumber: string): Promise<KSeFReceivedInvoiceDto> {
        try {
            const parsedXml = await xml2js.parseStringPromise(xmlContent);
            const fa = parsedXml.FA || parsedXml['ns2:FA'] || parsedXml;

            const faktura = fa.Faktura?.[0];
            const podmiot1 = fa.Podmiot1?.[0]; // Seller
            const podmiot2 = fa.Podmiot2?.[0]; // Buyer

            if (!faktura || !podmiot1 || !podmiot2) {
                throw new Error('Invalid FA(3) XML structure');
            }

            const items = faktura.Pozycje?.[0]?.Pozycja || [];

            const invoiceDto: KSeFReceivedInvoiceDto = {
                ksefNumber,
                ksefReferenceNumber: ksefNumber,
                invoiceNumber: faktura.NumerFa?.[0] || '',
                issueDate: faktura.DataWystawienia?.[0] || '',
                dueDate: faktura.TerminPlatnosci?.[0],
                saleDate: faktura.DataSprzedazy?.[0],

                sellerNip: podmiot1.DaneIdentyfikacyjne?.[0]?.NIP?.[0] || '',
                sellerName: podmiot1.DaneIdentyfikacyjne?.[0]?.Nazwa?.[0] || '',
                sellerAddress: podmiot1.Adres?.[0]?.AdresL1?.[0] || '',
                sellerCity: podmiot1.Adres?.[0]?.Miejscowosc?.[0],
                sellerPostalCode: podmiot1.Adres?.[0]?.KodPocztowy?.[0],
                sellerCountry: podmiot1.Adres?.[0]?.KodKraju?.[0] || 'PL',

                buyerNip: podmiot2.DaneIdentyfikacyjne?.[0]?.NIP?.[0] || '',
                buyerName: podmiot2.DaneIdentyfikacyjne?.[0]?.Nazwa?.[0] || '',
                buyerAddress: podmiot2.Adres?.[0]?.AdresL1?.[0] || '',
                buyerCity: podmiot2.Adres?.[0]?.Miejscowosc?.[0],
                buyerPostalCode: podmiot2.Adres?.[0]?.KodPocztowy?.[0],
                buyerCountry: podmiot2.Adres?.[0]?.KodKraju?.[0] || 'PL',

                totalNet: parseFloat(faktura.Wartosci?.[0]?.WartoscNetto?.[0] || '0'),
                totalVat: parseFloat(faktura.Wartosci?.[0]?.WartoscVat?.[0] || '0'),
                totalGross: parseFloat(faktura.Wartosci?.[0]?.WartoscBrutto?.[0] || '0'),

                currency: faktura.KodWaluty?.[0] || 'PLN',
                paymentMethod: faktura.SposobPlatnosci?.[0],

                items: items.map((item: any, index: number) => ({
                    lineNumber: parseInt(item.Lp?.[0] || index + 1),
                    name: item.Nazwa?.[0] || '',
                    description: item.Opis?.[0],
                    quantity: parseFloat(item.Ilosc?.[0] || '1'),
                    unit: item.Jednostka?.[0] || 'szt',
                    unitPrice: parseFloat(item.CenaJednostkowa?.[0] || '0'),
                    netAmount: parseFloat(item.WartoscNetto?.[0] || '0'),
                    vatRate: parseFloat(item.StawkaVat?.[0] || '0'),
                    vatAmount: parseFloat(item.WartoscVat?.[0] || '0'),
                    grossAmount: parseFloat(item.WartoscBrutto?.[0] || '0'),
                    gtu: item.GTU?.[0],
                })),

                xmlContent,
                downloadedAt: new Date(),
            };

            return invoiceDto;
        } catch (error) {
            this.logger.error(`Failed to parse FA(3) XML: ${error.message}`, error.stack);
            throw new BadRequestException(`XML parsing failed: ${error.message}`);
        }
    }

    /**
     * Save received invoice to database
     */
    async saveReceivedInvoice(
        invoiceDto: KSeFReceivedInvoiceDto,
        tenantId: string,
        companyId: string,
    ): Promise<string> {
        try {
            // Check if invoice already exists
            const existingInvoice = await this.prisma.invoice.findFirst({
                where: {
                    tenant_id: tenantId,
                    ksefInvoiceNumber: invoiceDto.ksefNumber,
                },
            });

            if (existingInvoice) {
                this.logger.warn(`Invoice ${invoiceDto.ksefNumber} already exists, skipping`);
                return existingInvoice.id;
            }

            // Find or create buyer
            let buyer = await this.prisma.buyer.findFirst({
                where: {
                    tenant_id: tenantId,
                    nip: invoiceDto.sellerNip,
                },
            });

            if (!buyer) {
                buyer = await this.prisma.buyer.create({
                    data: {
                        tenant_id: tenantId,
                        name: invoiceDto.sellerName,
                        nip: invoiceDto.sellerNip,
                        address: invoiceDto.sellerAddress,
                        city: invoiceDto.sellerCity,
                        postalCode: invoiceDto.sellerPostalCode,
                        country: invoiceDto.sellerCountry || 'PL',
                        isActive: true,
                    },
                });
            }

            // Create invoice with items
            const invoice = await this.prisma.invoice.create({
                data: {
                    tenant_id: tenantId,
                    company_id: companyId,
                    buyer_id: buyer.id,
                    number: invoiceDto.invoiceNumber,
                    series: invoiceDto.invoiceNumber.split('/')[0] || 'KSEF',
                    date: new Date(invoiceDto.issueDate),
                    dueDate: invoiceDto.dueDate ? new Date(invoiceDto.dueDate) : null,
                    totalNet: invoiceDto.totalNet,
                    totalVat: invoiceDto.totalVat,
                    totalGross: invoiceDto.totalGross,
                    status: 'issued',

                    // KSeF receiving fields
                    receivedFromKsef: true,
                    isIncoming: true,
                    ksefInvoiceNumber: invoiceDto.ksefNumber,
                    ksefDownloadDate: new Date(),
                    ksefXmlContent: invoiceDto.xmlContent,
                    ksefSellerNip: invoiceDto.sellerNip,

                    // Approval workflow
                    approvalStatus: 'pending',

                    currency: invoiceDto.currency,
                    paymentMethod: invoiceDto.paymentMethod,

                    items: {
                        create: invoiceDto.items.map(item => ({
                            description: item.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            vatRate: item.vatRate,
                            netAmount: item.netAmount,
                            vatAmount: item.vatAmount,
                            grossAmount: item.grossAmount,
                            gtu: item.gtu,
                        })),
                    },
                },
            });

            this.logger.log(`Saved received invoice ${invoiceDto.ksefNumber} as ${invoice.id}`);

            return invoice.id;
        } catch (error) {
            this.logger.error(`Failed to save invoice ${invoiceDto.ksefNumber}: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Failed to save invoice: ${error.message}`);
        }
    }

    /**
     * Process new invoices - main sync function
     */
    async processNewInvoices(
        tenantId: string,
        companyId: string,
        syncRequest: KSeFSyncRequestDto,
    ): Promise<KSeFSyncResponseDto> {
        try {
            const dateFrom = syncRequest.dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
            const dateTo = syncRequest.dateTo || new Date();

            this.logger.log(`Starting invoice sync for tenant ${tenantId}, company ${companyId}`);

            // Get list of incoming invoices
            const invoiceList = await this.getIncomingInvoices(tenantId, {
                dateFrom,
                dateTo,
                invoiceType: 'incoming',
            });

            let newInvoices = 0;
            let updatedInvoices = 0;
            const invoiceNumbers: string[] = [];

            // Download and save each invoice
            for (const invoiceHeader of invoiceList) {
                try {
                    const invoiceData = await this.downloadInvoice(invoiceHeader.ksefNumber, tenantId);
                    const invoiceId = await this.saveReceivedInvoice(invoiceData, tenantId, companyId);

                    if (invoiceId) {
                        newInvoices++;
                        invoiceNumbers.push(invoiceHeader.invoiceNumber);
                    }

                    // Small delay to avoid rate limiting
                    await this.delay(500);
                } catch (error) {
                    this.logger.error(`Failed to process invoice ${invoiceHeader.ksefNumber}: ${error.message}`);
                    // Continue with next invoice
                }
            }

            const response: KSeFSyncResponseDto = {
                totalFound: invoiceList.length,
                newInvoices,
                updatedInvoices,
                invoiceNumbers,
                syncTimestamp: new Date(),
            };

            this.logger.log(`Sync completed: ${newInvoices} new invoices, ${updatedInvoices} updated`);

            return response;
        } catch (error) {
            this.logger.error(`Invoice sync failed: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Sync failed: ${error.message}`);
        }
    }

    /**
     * Approve received invoice
     */
    async approveInvoice(
        invoiceId: string,
        tenantId: string,
        userId: string,
        notes?: string,
    ): Promise<void> {
        try {
            await this.prisma.invoice.update({
                where: {
                    id: invoiceId,
                    tenant_id: tenantId,
                    receivedFromKsef: true,
                },
                data: {
                    approvalStatus: 'approved',
                    approvedBy: userId,
                    approvedAt: new Date(),
                    approvalNotes: notes,
                },
            });

            this.logger.log(`Invoice ${invoiceId} approved by user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to approve invoice ${invoiceId}: ${error.message}`);
            throw new InternalServerErrorException(`Approval failed: ${error.message}`);
        }
    }

    /**
     * Reject received invoice
     */
    async rejectInvoice(
        invoiceId: string,
        tenantId: string,
        userId: string,
        reason: string,
    ): Promise<void> {
        try {
            await this.prisma.invoice.update({
                where: {
                    id: invoiceId,
                    tenant_id: tenantId,
                    receivedFromKsef: true,
                },
                data: {
                    approvalStatus: 'rejected',
                    approvedBy: userId,
                    approvedAt: new Date(),
                    rejectionReason: reason,
                },
            });

            this.logger.log(`Invoice ${invoiceId} rejected by user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to reject invoice ${invoiceId}: ${error.message}`);
            throw new InternalServerErrorException(`Rejection failed: ${error.message}`);
        }
    }

    private getBaseUrl(environment: KSeFEnvironment): string {
        return environment === KSeFEnvironment.TEST
            ? 'https://ksef-test.mf.gov.pl'
            : 'https://ksef.mf.gov.pl';
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
