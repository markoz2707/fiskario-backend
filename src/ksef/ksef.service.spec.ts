import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { KsefService, KSeFToken } from './ksef.service';
import { PrismaService } from '../prisma/prisma.service';
import { KSeFTokenRequestDto, KSeFEnvironment } from './dto/ksef-auth.dto';
import { KSeFInvoiceDto } from './dto/ksef-invoice.dto';
import axios from 'axios';
import * as xml2js from 'xml2js';
import * as libxmljs from 'libxmljs';

describe('KsefService', () => {
  let service: KsefService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  const mockPrismaService = {
    invoice: {
      updateMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockAxiosInstance = {
    post: jest.fn(),
    interceptors: {
      response: {
        use: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KsefService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<KsefService>(KsefService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);

    // Replace axios instance with mock
    (service as any).axiosInstance = mockAxiosInstance;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize axios instance with correct configuration', () => {
      const axiosInstance = (service as any).axiosInstance;
      expect(axiosInstance).toBeDefined();
      expect(axiosInstance.defaults.timeout).toBe(30000);
      expect(axiosInstance.defaults.headers['Content-Type']).toBe('application/xml');
      expect(axiosInstance.defaults.headers['Accept']).toBe('application/xml');
    });

    it('should set up response interceptor for token refresh', () => {
      const axiosInstance = (service as any).axiosInstance;
      expect(axiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('should initialize XML builder with correct options', () => {
      const xmlBuilder = (service as any).xmlBuilder;
      expect(xmlBuilder).toBeDefined();
      expect(xmlBuilder.options).toEqual({
        xmldec: { version: '1.0', encoding: 'UTF-8' },
        renderOpts: { pretty: false }
      });
    });
  });

  describe('authenticate', () => {
    const mockAuthDto: KSeFTokenRequestDto = {
      nip: '1234567890',
      authorizationCode: 'test-auth-code',
      environment: KSeFEnvironment.TEST,
    };

    const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<AuthorizationChallengeResponse>
  <SessionToken>test-session-token</SessionToken>
</AuthorizationChallengeResponse>`;

    const mockParsedResponse = {
      AuthorizationChallengeResponse: {
        SessionToken: ['test-session-token'],
      },
    };

    beforeEach(() => {
      mockAxiosInstance.post.mockResolvedValue({ data: mockXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(mockParsedResponse);
    });

    it('should authenticate successfully with valid credentials', async () => {
      const result = await service.authenticate(mockAuthDto);

      expect(result).toEqual({
        accessToken: 'test-session-token',
        expiresAt: expect.any(Date),
        environment: KSeFEnvironment.TEST,
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://ksef-test.mf.gov.pl/api/online/Session/AuthorizationChallenge',
        expect.stringContaining('AuthorizationChallengeRequest'),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/xml',
          },
        })
      );

      expect(xml2js.parseStringPromise).toHaveBeenCalledWith(mockXmlResponse);
    });

    it('should use production environment when specified', async () => {
      const prodAuthDto = {
        ...mockAuthDto,
        environment: KSeFEnvironment.PRODUCTION,
      };

      await service.authenticate(prodAuthDto);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('https://ksef.mf.gov.pl'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should use test environment by default', async () => {
      const authDtoWithoutEnv = {
        nip: '1234567890',
        authorizationCode: 'test-auth-code',
      };

      await service.authenticate(authDtoWithoutEnv as KSeFTokenRequestDto);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('https://ksef-test.mf.gov.pl'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should throw error when response does not contain session token', async () => {
      const invalidResponse = {
        AuthorizationChallengeResponse: {
          // Missing SessionToken
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(invalidResponse);

      await expect(service.authenticate(mockAuthDto))
        .rejects.toThrow('Invalid response from KSeF authentication');
    });

    it('should throw error when XML parsing fails', async () => {
      jest.spyOn(xml2js, 'parseStringPromise').mockRejectedValue(new Error('XML parsing error'));

      await expect(service.authenticate(mockAuthDto))
        .rejects.toThrow('Authentication failed: XML parsing error');
    });

    it('should throw error when HTTP request fails', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(service.authenticate(mockAuthDto))
        .rejects.toThrow('Authentication failed: Network error');
    });

    it('should handle missing NIP in auth DTO', async () => {
      const invalidAuthDto = {
        authorizationCode: 'test-auth-code',
        environment: KSeFEnvironment.TEST,
      } as KSeFTokenRequestDto;

      await expect(service.authenticate(invalidAuthDto))
        .rejects.toThrow();
    });

    it('should handle missing authorization code in auth DTO', async () => {
      const invalidAuthDto = {
        nip: '1234567890',
        environment: KSeFEnvironment.TEST,
      } as KSeFTokenRequestDto;

      await expect(service.authenticate(invalidAuthDto))
        .rejects.toThrow();
    });

    it('should generate correct XML request body', async () => {
      await service.authenticate(mockAuthDto);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/v1"');
      expect(xmlBody).toContain('IdentifierValue">1234567890<');
      expect(xmlBody).toContain('Challenge>test-auth-code<');
    });

    it('should set token expiration correctly', async () => {
      const beforeAuth = Date.now();
      const result = await service.authenticate(mockAuthDto);
      const afterAuth = Date.now();

      expect(result.expiresAt.getTime()).toBeGreaterThan(beforeAuth + 22 * 60 * 60 * 1000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(afterAuth + 23 * 60 * 60 * 1000);
    });

    it('should store token in service instance', async () => {
      await service.authenticate(mockAuthDto);

      const currentToken = (service as any).currentToken;
      expect(currentToken).toEqual({
        accessToken: 'test-session-token',
        expiresAt: expect.any(Date),
        environment: KSeFEnvironment.TEST,
      });
    });

    it('should handle special characters in NIP', async () => {
      const specialNipDto = {
        ...mockAuthDto,
        nip: '123-456-78-90',
      };

      await service.authenticate(specialNipDto);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('IdentifierValue">123-456-78-90<');
    });

    it('should handle very long authorization code', async () => {
      const longAuthCodeDto = {
        ...mockAuthDto,
        authorizationCode: 'A'.repeat(1000),
      };

      await service.authenticate(longAuthCodeDto);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain(`Challenge>${'A'.repeat(1000)}<`);
    });
  });

  describe('submitInvoice', () => {
    const mockInvoiceDto: KSeFInvoiceDto = {
      invoiceNumber: 'FV/0001',
      issueDate: '2024-01-15',
      dueDate: '2024-02-15',
      sellerName: 'Test Seller',
      sellerNip: '1234567890',
      sellerAddress: 'Seller Address',
      buyerName: 'Test Buyer',
      buyerNip: '9876543210',
      buyerAddress: 'Buyer Address',
      items: [
        {
          name: 'Test Item',
          quantity: 2,
          unitPrice: 100,
          vatRate: 23,
          gtu: 'GTU_01',
          netAmount: 200,
          vatAmount: 46,
          grossAmount: 246,
        },
      ],
      totalNet: 200,
      totalVat: 46,
      totalGross: 246,
      paymentMethod: 'przelew',
    };

    const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<SendInvoiceResponse>
  <ReferenceNumber>REF-123</ReferenceNumber>
  <Timestamp>2024-01-15T10:00:00Z</Timestamp>
</SendInvoiceResponse>`;

    const mockParsedResponse = {
      SendInvoiceResponse: {
        ReferenceNumber: ['REF-123'],
        Timestamp: ['2024-01-15T10:00:00Z'],
      },
    };

    beforeEach(() => {
      // Set up authenticated state
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(mockParsedResponse);
      mockPrismaService.invoice.updateMany.mockResolvedValue({ count: 1 });
    });

    it('should submit invoice successfully when authenticated', async () => {
      const result = await service.submitInvoice(mockInvoiceDto, 'tenant-123');

      expect(result).toEqual({
        referenceNumber: 'REF-123',
        status: 'submitted',
        timestamp: '2024-01-15T10:00:00Z',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://ksef-test.mf.gov.pl/api/online/Invoice/Send',
        expect.stringContaining('SendInvoiceRequest'),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/xml',
          },
        })
      );

      expect(prismaService.invoice.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          number: 'FV/0001',
        },
        data: {
          ksefStatus: 'submitted',
        },
      });
    });

    it('should throw error when not authenticated', async () => {
      (service as any).currentToken = null;

      await expect(service.submitInvoice(mockInvoiceDto, 'tenant-123'))
        .rejects.toThrow('Not authenticated with KSeF');
    });

    it('should throw error when response contains error', async () => {
      const errorResponse = {
        SendInvoiceResponse: {
          Error: ['Validation failed'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(errorResponse);

      await expect(service.submitInvoice(mockInvoiceDto, 'tenant-123'))
        .rejects.toThrow('KSeF submission error: Validation failed');
    });

    it('should update invoice status to failed on error', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(service.submitInvoice(mockInvoiceDto, 'tenant-123'))
        .rejects.toThrow('Invoice submission failed: Network error');

      expect(prismaService.invoice.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-123',
          number: 'FV/0001',
        },
        data: {
          ksefStatus: 'failed',
        },
      });
    });

    it('should handle missing reference number in response', async () => {
      const responseWithoutRef = {
        SendInvoiceResponse: {
          Timestamp: ['2024-01-15T10:00:00Z'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(responseWithoutRef);

      const result = await service.submitInvoice(mockInvoiceDto, 'tenant-123');

      expect(result).toEqual({
        referenceNumber: undefined,
        status: 'submitted',
        timestamp: '2024-01-15T10:00:00Z',
      });
    });

    it('should handle missing timestamp in response', async () => {
      const responseWithoutTimestamp = {
        SendInvoiceResponse: {
          ReferenceNumber: ['REF-123'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(responseWithoutTimestamp);

      const result = await service.submitInvoice(mockInvoiceDto, 'tenant-123');

      expect(result).toEqual({
        referenceNumber: 'REF-123',
        status: 'submitted',
        timestamp: undefined,
      });
    });

    it('should handle XML parsing errors', async () => {
      jest.spyOn(xml2js, 'parseStringPromise').mockRejectedValue(new Error('XML parsing error'));

      await expect(service.submitInvoice(mockInvoiceDto, 'tenant-123'))
        .rejects.toThrow('Invoice submission failed: XML parsing error');
    });

    it('should handle database errors during status update', async () => {
      mockPrismaService.invoice.updateMany.mockRejectedValue(new Error('Database error'));

      await expect(service.submitInvoice(mockInvoiceDto, 'tenant-123'))
        .rejects.toThrow('Invoice submission failed: Database error');
    });

    it('should generate correct FA(3) XML format', async () => {
      await service.submitInvoice(mockInvoiceDto, 'tenant-123');

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('xmlns="http://ksef.mf.gov.pl/schema/fa/3"');
      expect(xmlBody).toContain('KodFormularza">FA (3)<');
      expect(xmlBody).toContain('NumerFa>FV/0001<');
      expect(xmlBody).toContain('NIP>1234567890<');
      expect(xmlBody).toContain('Nazwa>Test Seller<');
    });

    it('should include GTU codes in XML when present', async () => {
      await service.submitInvoice(mockInvoiceDto, 'tenant-123');

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('GTU>GTU_01<');
    });

    it('should handle items without GTU codes', async () => {
      const invoiceWithoutGtu = {
        ...mockInvoiceDto,
        items: [
          {
            name: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
            // gtu is missing
          },
        ],
      };

      await service.submitInvoice(invoiceWithoutGtu, 'tenant-123');

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).not.toContain('GTU>');
    });

    it('should handle multiple items correctly', async () => {
      const invoiceWithMultipleItems = {
        ...mockInvoiceDto,
        items: [
          {
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 100,
            vatAmount: 23,
            grossAmount: 123,
          },
          {
            name: 'Item 2',
            quantity: 2,
            unitPrice: 50,
            vatRate: 8,
            gtu: 'GTU_02',
            netAmount: 100,
            vatAmount: 8,
            grossAmount: 108,
          },
        ],
      };

      await service.submitInvoice(invoiceWithMultipleItems, 'tenant-123');

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('Lp">1<');
      expect(xmlBody).toContain('Lp">2<');
      expect(xmlBody).toContain('Nazwa>Item 1<');
      expect(xmlBody).toContain('Nazwa>Item 2<');
      expect(xmlBody).toContain('GTU>GTU_01<');
      expect(xmlBody).toContain('GTU>GTU_02<');
    });

    it('should handle concurrent submissions', async () => {
      const invoices = Array.from({ length: 5 }, (_, i) => ({
        ...mockInvoiceDto,
        invoiceNumber: `FV/000${i}`,
      }));

      const results = await Promise.all(
        invoices.map(invoice => service.submitInvoice(invoice, 'tenant-123'))
      );

      expect(results).toHaveLength(5);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(5);
      expect(prismaService.invoice.updateMany).toHaveBeenCalledTimes(5);
    });
  });

  describe('checkInvoiceStatus', () => {
    const mockReferenceNumber = 'REF-123';

    const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<StatusInvoiceResponse>
  <ProcessingStatus>200</ProcessingStatus>
  <UPONumber>UPO-456</UPONumber>
</StatusInvoiceResponse>`;

    const mockParsedResponse = {
      StatusInvoiceResponse: {
        ProcessingStatus: ['200'],
        UPONumber: ['UPO-456'],
      },
    };

    beforeEach(() => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(mockParsedResponse);
    });

    it('should check invoice status successfully', async () => {
      const result = await service.checkInvoiceStatus(mockReferenceNumber);

      expect(result).toEqual({
        referenceNumber: 'REF-123',
        status: '200',
        upoNumber: 'UPO-456',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://ksef-test.mf.gov.pl/api/online/Invoice/Status',
        expect.stringContaining('StatusInvoiceRequest'),
        expect.anything()
      );
    });

    it('should throw error when not authenticated', async () => {
      (service as any).currentToken = null;

      await expect(service.checkInvoiceStatus(mockReferenceNumber))
        .rejects.toThrow('Not authenticated with KSeF');
    });

    it('should throw error when response contains error', async () => {
      const errorResponse = {
        StatusInvoiceResponse: {
          Error: ['Invoice not found'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(errorResponse);

      await expect(service.checkInvoiceStatus(mockReferenceNumber))
        .rejects.toThrow('KSeF status check error: Invoice not found');
    });

    it('should handle missing processing status', async () => {
      const responseWithoutStatus = {
        StatusInvoiceResponse: {
          UPONumber: ['UPO-456'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(responseWithoutStatus);

      const result = await service.checkInvoiceStatus(mockReferenceNumber);

      expect(result).toEqual({
        referenceNumber: 'REF-123',
        status: undefined,
        upoNumber: 'UPO-456',
      });
    });

    it('should handle missing UPO number', async () => {
      const responseWithoutUpo = {
        StatusInvoiceResponse: {
          ProcessingStatus: ['200'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(responseWithoutUpo);

      const result = await service.checkInvoiceStatus(mockReferenceNumber);

      expect(result).toEqual({
        referenceNumber: 'REF-123',
        status: '200',
        upoNumber: undefined,
      });
    });

    it('should handle HTTP request errors', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(service.checkInvoiceStatus(mockReferenceNumber))
        .rejects.toThrow('Status check failed: Network error');
    });

    it('should handle XML parsing errors', async () => {
      jest.spyOn(xml2js, 'parseStringPromise').mockRejectedValue(new Error('XML parsing error'));

      await expect(service.checkInvoiceStatus(mockReferenceNumber))
        .rejects.toThrow('Status check failed: XML parsing error');
    });

    it('should generate correct XML request body', async () => {
      await service.checkInvoiceStatus(mockReferenceNumber);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('StatusInvoiceRequest');
      expect(xmlBody).toContain(`ReferenceNumber>${mockReferenceNumber}<`);
      expect(xmlBody).toContain('SessionToken');
    });

    it('should handle special characters in reference number', async () => {
      const specialRefNumber = 'REF-123!@#$%';

      await service.checkInvoiceStatus(specialRefNumber);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain(`ReferenceNumber>${specialRefNumber}<`);
    });

    it('should handle very long reference numbers', async () => {
      const longRefNumber = 'REF-' + 'A'.repeat(1000);

      await service.checkInvoiceStatus(longRefNumber);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain(`ReferenceNumber>${longRefNumber}<`);
    });
  });

  describe('getUPO', () => {
    const mockReferenceNumber = 'REF-123';

    const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<UPOInvoiceResponse>
  <UPOContent>UPO-CONTENT-HERE</UPOContent>
</UPOInvoiceResponse>`;

    const mockParsedResponse = {
      UPOInvoiceResponse: {
        UPOContent: ['UPO-CONTENT-HERE'],
      },
    };

    beforeEach(() => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(mockParsedResponse);
    });

    it('should get UPO successfully', async () => {
      const result = await service.getUPO(mockReferenceNumber);

      expect(result).toBe('UPO-CONTENT-HERE');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://ksef-test.mf.gov.pl/api/online/Invoice/UPO',
        expect.stringContaining('UPOInvoiceRequest'),
        expect.anything()
      );
    });

    it('should throw error when not authenticated', async () => {
      (service as any).currentToken = null;

      await expect(service.getUPO(mockReferenceNumber))
        .rejects.toThrow('Not authenticated with KSeF');
    });

    it('should throw error when response contains error', async () => {
      const errorResponse = {
        UPOInvoiceResponse: {
          Error: ['UPO not found'],
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(errorResponse);

      await expect(service.getUPO(mockReferenceNumber))
        .rejects.toThrow('KSeF UPO retrieval error: UPO not found');
    });

    it('should handle missing UPO content', async () => {
      const responseWithoutContent = {
        UPOInvoiceResponse: {
          // UPOContent is missing
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(responseWithoutContent);

      await expect(service.getUPO(mockReferenceNumber))
        .rejects.toThrow();
    });

    it('should handle HTTP request errors', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(service.getUPO(mockReferenceNumber))
        .rejects.toThrow('UPO retrieval failed: Network error');
    });

    it('should handle XML parsing errors', async () => {
      jest.spyOn(xml2js, 'parseStringPromise').mockRejectedValue(new Error('XML parsing error'));

      await expect(service.getUPO(mockReferenceNumber))
        .rejects.toThrow('UPO retrieval failed: XML parsing error');
    });

    it('should generate correct XML request body', async () => {
      await service.getUPO(mockReferenceNumber);

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('UPOInvoiceRequest');
      expect(xmlBody).toContain(`ReferenceNumber>${mockReferenceNumber}<`);
      expect(xmlBody).toContain('SessionToken');
    });
  });

  describe('convertToFA3XML', () => {
    const mockInvoiceDto: KSeFInvoiceDto = {
      invoiceNumber: 'FV/0001',
      issueDate: '2024-01-15',
      dueDate: '2024-02-15',
      sellerName: 'Test Seller',
      sellerNip: '1234567890',
      sellerAddress: 'Seller Address',
      buyerName: 'Test Buyer',
      buyerNip: '9876543210',
      buyerAddress: 'Buyer Address',
      items: [
        {
          name: 'Test Item',
          quantity: 2,
          unitPrice: 100,
          vatRate: 23,
          gtu: 'GTU_01',
          netAmount: 200,
          vatAmount: 46,
          grossAmount: 246,
        },
      ],
      totalNet: 200,
      totalVat: 46,
      totalGross: 246,
      paymentMethod: 'przelew',
    };

    it('should convert invoice to FA(3) XML format correctly', () => {
      const result = (service as any).convertToFA3XML(mockInvoiceDto);

      expect(result).toEqual({
        FA: {
          $: {
            xmlns: 'http://ksef.mf.gov.pl/schema/fa/3',
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': 'http://ksef.mf.gov.pl/schema/fa/3',
          },
          Naglowek: {
            KodFormularza: 'FA (3)',
            WariantFormularza: '3',
            DataWytworzeniaFa: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            KodSystemowy: 'FISKARIO',
          },
          Podmiot1: {
            DaneIdentyfikacyjne: {
              NIP: '1234567890',
              Nazwa: 'Test Seller',
            },
            Adres: {
              AdresL1: 'Seller Address',
            },
          },
          Podmiot2: {
            DaneIdentyfikacyjne: {
              NIP: '9876543210',
              Nazwa: 'Test Buyer',
            },
            Adres: {
              AdresL1: 'Buyer Address',
            },
          },
          Faktura: {
            NumerFa: 'FV/0001',
            DataWystawienia: '2024-01-15',
            TerminPlatnosci: '2024-02-15',
            SposobPlatnosci: 'przelew',
            P_15: 'NIE',
            P_16: 'NIE',
            Wartosci: {
              WartoscNetto: '200.00',
              WartoscVat: '46.00',
              WartoscBrutto: '246.00',
            },
            Pozycje: {
              Pozycja: [
                {
                  Lp: 1,
                  Nazwa: 'Test Item',
                  Ilosc: '2.00',
                  Jednostka: 'szt',
                  CenaJednostkowa: '100.00',
                  WartoscNetto: '200.00',
                  StawkaVat: '23',
                  WartoscVat: '46.00',
                  WartoscBrutto: '246.00',
                  GTU: 'GTU_01',
                },
              ],
            },
          },
        },
      });
    });

    it('should handle missing due date', () => {
      const invoiceWithoutDueDate = {
        ...mockInvoiceDto,
        dueDate: undefined,
      };

      const result = (service as any).convertToFA3XML(invoiceWithoutDueDate);

      expect(result.FA.Faktura.TerminPlatnosci).toBe('2024-01-15');
    });

    it('should handle missing payment method', () => {
      const invoiceWithoutPaymentMethod = {
        ...mockInvoiceDto,
        paymentMethod: undefined,
      };

      const result = (service as any).convertToFA3XML(invoiceWithoutPaymentMethod);

      expect(result.FA.Faktura.SposobPlatnosci).toBe('przelew');
    });

    it('should handle multiple items', () => {
      const invoiceWithMultipleItems = {
        ...mockInvoiceDto,
        items: [
          {
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 100,
            vatAmount: 23,
            grossAmount: 123,
          },
          {
            name: 'Item 2',
            quantity: 2,
            unitPrice: 50,
            vatRate: 8,
            gtu: 'GTU_02',
            netAmount: 100,
            vatAmount: 8,
            grossAmount: 108,
          },
        ],
      };

      const result = (service as any).convertToFA3XML(invoiceWithMultipleItems);

      expect(result.FA.Faktura.Pozycje.Pozycja).toHaveLength(2);
      expect(result.FA.Faktura.Pozycje.Pozycja[0].Lp).toBe(1);
      expect(result.FA.Faktura.Pozycje.Pozycja[1].Lp).toBe(2);
    });

    it('should handle items without GTU codes', () => {
      const invoiceWithoutGtu = {
        ...mockInvoiceDto,
        items: [
          {
            name: 'Test Item',
            quantity: 2,
            unitPrice: 100,
            vatRate: 23,
            netAmount: 200,
            vatAmount: 46,
            grossAmount: 246,
            // gtu is missing
          },
        ],
      };

      const result = (service as any).convertToFA3XML(invoiceWithoutGtu);

      expect(result.FA.Faktura.Pozycje.Pozycja[0]).not.toHaveProperty('GTU');
    });

    it('should handle fractional amounts correctly', () => {
      const invoiceWithFractions = {
        ...mockInvoiceDto,
        items: [
          {
            name: 'Test Item',
            quantity: 2.5,
            unitPrice: 10.5,
            vatRate: 23,
            gtu: 'GTU_01',
            netAmount: 26.25,
            vatAmount: 6.0375,
            grossAmount: 32.2875,
          },
        ],
        totalNet: 26.25,
        totalVat: 6.04,
        totalGross: 32.29,
      };

      const result = (service as any).convertToFA3XML(invoiceWithFractions);

      expect(result.FA.Faktura.Wartosci.WartoscNetto).toBe('26.25');
      expect(result.FA.Faktura.Wartosci.WartoscVat).toBe('6.04');
      expect(result.FA.Faktura.Wartosci.WartoscBrutto).toBe('32.29');
      expect(result.FA.Faktura.Pozycje.Pozycja[0].Ilosc).toBe('2.50');
      expect(result.FA.Faktura.Pozycje.Pozycja[0].CenaJednostkowa).toBe('10.50');
    });

    it('should handle special characters in text fields', () => {
      const invoiceWithSpecialChars = {
        ...mockInvoiceDto,
        sellerName: 'Test Seller ñáéíóú',
        buyerName: 'Test Buyer 🚀',
        sellerAddress: 'Address with spëcial çhars!@#$%',
      };

      const result = (service as any).convertToFA3XML(invoiceWithSpecialChars);

      expect(result.FA.Podmiot1.DaneIdentyfikacyjne.Nazwa).toBe('Test Seller ñáéíóú');
      expect(result.FA.Podmiot2.DaneIdentyfikacyjne.Nazwa).toBe('Test Buyer 🚀');
      expect(result.FA.Podmiot1.Adres.AdresL1).toBe('Address with spëcial çhars!@#$%');
    });

    it('should handle very long text fields', () => {
      const longText = 'A'.repeat(1000);
      const invoiceWithLongText = {
        ...mockInvoiceDto,
        sellerName: longText,
      };

      const result = (service as any).convertToFA3XML(invoiceWithLongText);

      expect(result.FA.Podmiot1.DaneIdentyfikacyjne.Nazwa).toBe(longText);
    });
  });

  describe('validateFA3Schema', () => {
    it('should pass validation for correct FA(3) XML', async () => {
      const validFa3Xml = {
        FA: {
          $: {
            xmlns: 'http://ksef.mf.gov.pl/schema/fa/3',
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:schemaLocation': 'http://ksef.mf.gov.pl/schema/fa/3',
          },
          Naglowek: {
            KodFormularza: 'FA (3)',
          },
        },
      };

      await expect((service as any).validateFA3Schema(validFa3Xml))
        .resolves.not.toThrow();
    });

    it('should throw error for invalid FA(3) XML', async () => {
      const invalidFa3Xml = {
        FA: {
          $: {
            xmlns: 'http://invalid.namespace',
          },
        },
      };

      await expect((service as any).validateFA3Schema(invalidFa3Xml))
        .rejects.toThrow('Invalid FA(3) XML format');
    });

    it('should handle XML builder errors', async () => {
      const xmlBuilderSpy = jest.spyOn((service as any).xmlBuilder, 'buildObject');
      xmlBuilderSpy.mockImplementation(() => {
        throw new Error('XML builder error');
      });

      const validFa3Xml = {
        FA: {
          $: {
            xmlns: 'http://ksef.mf.gov.pl/schema/fa/3',
          },
        },
      };

      await expect((service as any).validateFA3Schema(validFa3Xml))
        .rejects.toThrow('XML validation failed: XML builder error');

      xmlBuilderSpy.mockRestore();
    });

    it('should handle null XML content', async () => {
      await expect((service as any).validateFA3Schema(null))
        .rejects.toThrow();
    });

    it('should handle undefined XML content', async () => {
      await expect((service as any).validateFA3Schema(undefined))
        .rejects.toThrow();
    });

    it('should handle empty XML content', async () => {
      const emptyXml = {};

      await expect((service as any).validateFA3Schema(emptyXml))
        .rejects.toThrow('Invalid FA(3) XML format');
    });
  });

  describe('getBaseUrl', () => {
    it('should return test URL for test environment', () => {
      const result = (service as any).getBaseUrl(KSeFEnvironment.TEST);
      expect(result).toBe('https://ksef-test.mf.gov.pl');
    });

    it('should return production URL for production environment', () => {
      const result = (service as any).getBaseUrl(KSeFEnvironment.PRODUCTION);
      expect(result).toBe('https://ksef.mf.gov.pl');
    });

    it('should handle invalid environment', () => {
      const result = (service as any).getBaseUrl('INVALID' as any);
      expect(result).toBe('https://ksef.mf.gov.pl');
    });
  });

  describe('refreshToken', () => {
    const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<RefreshTokenResponse>
  <SessionToken>new-session-token</SessionToken>
</RefreshTokenResponse>`;

    const mockParsedResponse = {
      RefreshTokenResponse: {
        SessionToken: ['new-session-token'],
      },
    };

    beforeEach(() => {
      (service as any).currentToken = {
        accessToken: 'old-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(mockParsedResponse);
    });

    it('should refresh token successfully', async () => {
      await (service as any).refreshToken();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://ksef-test.mf.gov.pl/api/online/Session/Refresh',
        expect.stringContaining('RefreshTokenRequest'),
        expect.anything()
      );

      const currentToken = (service as any).currentToken;
      expect(currentToken.accessToken).toBe('new-session-token');
      expect(currentToken.expiresAt.getTime()).toBeGreaterThan(Date.now() + 22 * 60 * 60 * 1000);
    });

    it('should throw error when no token to refresh', async () => {
      (service as any).currentToken = null;

      await expect((service as any).refreshToken())
        .rejects.toThrow('No token to refresh');
    });

    it('should throw error when response does not contain session token', async () => {
      const invalidResponse = {
        RefreshTokenResponse: {
          // Missing SessionToken
        },
      };

      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(invalidResponse);

      await expect((service as any).refreshToken())
        .rejects.toThrow('Token refresh failed');
    });

    it('should clear current token when refresh fails', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect((service as any).refreshToken())
        .rejects.toThrow('Token refresh failed');

      expect((service as any).currentToken).toBeNull();
    });

    it('should handle XML parsing errors during refresh', async () => {
      jest.spyOn(xml2js, 'parseStringPromise').mockRejectedValue(new Error('XML parsing error'));

      await expect((service as any).refreshToken())
        .rejects.toThrow('Token refresh failed');
    });

    it('should generate correct XML request body for refresh', async () => {
      await (service as any).refreshToken();

      const xmlBody = mockAxiosInstance.post.mock.calls[0][1];
      expect(xmlBody).toContain('RefreshTokenRequest');
      expect(xmlBody).toContain('SessionToken>old-token<');
    });
  });

  describe('getAuthStatus', () => {
    it('should return not authenticated when no token', () => {
      (service as any).currentToken = null;

      const result = service.getAuthStatus();

      expect(result).toEqual({
        authenticated: false,
      });
    });

    it('should return authenticated status with token details', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: futureDate,
        environment: KSeFEnvironment.TEST,
      };

      const result = service.getAuthStatus();

      expect(result).toEqual({
        authenticated: true,
        environment: KSeFEnvironment.TEST,
        expiresAt: futureDate,
      });
    });

    it('should handle expired token', () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      (service as any).currentToken = {
        accessToken: 'expired-token',
        expiresAt: pastDate,
        environment: KSeFEnvironment.TEST,
      };

      const result = service.getAuthStatus();

      expect(result).toEqual({
        authenticated: true,
        environment: KSeFEnvironment.TEST,
        expiresAt: pastDate,
      });
    });

    it('should handle token without expiration date', () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        environment: KSeFEnvironment.TEST,
        // expiresAt is missing
      };

      const result = service.getAuthStatus();

      expect(result).toEqual({
        authenticated: true,
        environment: KSeFEnvironment.TEST,
        expiresAt: undefined,
      });
    });

    it('should handle token without environment', () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        // environment is missing
      };

      const result = service.getAuthStatus();

      expect(result).toEqual({
        authenticated: true,
        environment: undefined,
        expiresAt: expect.any(Date),
      });
    });
  });

  describe('Response interceptor', () => {
    it('should handle successful responses', async () => {
      const mockResponse = { data: 'success' };
      const interceptor = (service as any).axiosInstance.interceptors.response.use.mock.calls[0][0];

      const result = await interceptor(mockResponse);

      expect(result).toBe(mockResponse);
    });

    it('should handle 401 errors and attempt token refresh', async () => {
      const mockError = {
        response: {
          status: 401,
        },
        config: { url: 'test-url' },
      };

      // Mock successful token refresh
      const refreshTokenSpy = jest.spyOn(service as any, 'refreshToken');
      refreshTokenSpy.mockResolvedValue(undefined);

      const interceptor = (service as any).axiosInstance.interceptors.response.use.mock.calls[0][1];

      await expect(interceptor(mockError)).resolves.toBeDefined();
      expect((service as any).refreshToken).toHaveBeenCalled();
    });

    it('should handle 401 errors when refresh fails', async () => {
      const mockError = {
        response: {
          status: 401,
        },
        config: { url: 'test-url' },
      };

      // Mock failed token refresh
      jest.spyOn(service as any, 'refreshToken').mockRejectedValue(new Error('Refresh failed'));

      const interceptor = (service as any).axiosInstance.interceptors.response.use.mock.calls[0][1];

      await expect(interceptor(mockError)).rejects.toThrow('Authentication failed');
    });

    it('should pass through non-401 errors', async () => {
      const mockError = {
        response: {
          status: 500,
        },
      };

      const interceptor = (service as any).axiosInstance.interceptors.response.use.mock.calls[0][1];

      await expect(interceptor(mockError)).rejects.toBe(mockError);
    });

    it('should pass through errors without response', async () => {
      const mockError = {
        message: 'Network error',
      };

      const interceptor = (service as any).axiosInstance.interceptors.response.use.mock.calls[0][1];

      await expect(interceptor(mockError)).rejects.toBe(mockError);
    });

    it('should handle 401 errors when no current token', async () => {
      (service as any).currentToken = null;

      const mockError = {
        response: {
          status: 401,
        },
        config: { url: 'test-url' },
      };

      const interceptor = (service as any).axiosInstance.interceptors.response.use.mock.calls[0][1];

      await expect(interceptor(mockError)).rejects.toBe(mockError);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle null invoice DTO in submitInvoice', async () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      await expect(service.submitInvoice(null as any, 'tenant-123'))
        .rejects.toThrow();
    });

    it('should handle undefined invoice DTO in submitInvoice', async () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      await expect(service.submitInvoice(undefined as any, 'tenant-123'))
        .rejects.toThrow();
    });

    it('should handle empty reference number in checkInvoiceStatus', async () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      await expect(service.checkInvoiceStatus(''))
        .rejects.toThrow();
    });

    it('should handle null reference number in checkInvoiceStatus', async () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      await expect(service.checkInvoiceStatus(null as any))
        .rejects.toThrow();
    });

    it('should handle empty reference number in getUPO', async () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      await expect(service.getUPO(''))
        .rejects.toThrow();
    });

    it('should handle null reference number in getUPO', async () => {
      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      await expect(service.getUPO(null as any))
        .rejects.toThrow();
    });

    it('should handle very large XML responses', async () => {
      const largeXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<SendInvoiceResponse>
  <ReferenceNumber>${'A'.repeat(10000)}</ReferenceNumber>
  <Timestamp>2024-01-15T10:00:00Z</Timestamp>
</SendInvoiceResponse>`;

      const largeParsedResponse = {
        SendInvoiceResponse: {
          ReferenceNumber: ['A'.repeat(10000)],
          Timestamp: ['2024-01-15T10:00:00Z'],
        },
      };

      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: largeXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(largeParsedResponse);

      const result = await service.submitInvoice({
        invoiceNumber: 'FV/0001',
        issueDate: '2024-01-15',
        sellerName: 'Test Seller',
        sellerNip: '1234567890',
        sellerAddress: 'Seller Address',
        buyerName: 'Test Buyer',
        buyerNip: '9876543210',
        buyerAddress: 'Buyer Address',
        items: [],
        totalNet: 0,
        totalVat: 0,
        totalGross: 0,
      }, 'tenant-123');

      expect(result.referenceNumber).toBe('A'.repeat(10000));
    });

    it('should handle special characters in XML responses', async () => {
      const specialXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<SendInvoiceResponse>
  <ReferenceNumber>REF-ñáéíóú🚀</ReferenceNumber>
  <Timestamp>2024-01-15T10:00:00Z</Timestamp>
</SendInvoiceResponse>`;

      const specialParsedResponse = {
        SendInvoiceResponse: {
          ReferenceNumber: ['REF-ñáéíóú🚀'],
          Timestamp: ['2024-01-15T10:00:00Z'],
        },
      };

      (service as any).currentToken = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        environment: KSeFEnvironment.TEST,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: specialXmlResponse });
      jest.spyOn(xml2js, 'parseStringPromise').mockResolvedValue(specialParsedResponse);

      const result = await service.submitInvoice({
        invoiceNumber: 'FV/0001',
        issueDate: '2024-01-15',
        sellerName: 'Test Seller',
        sellerNip: '1234567890',
        sellerAddress: 'Seller Address',
        buyerName: 'Test Buyer',
        buyerNip: '9876543210',
        buyerAddress: 'Buyer Address',
        items: [],
        totalNet: 0,
        totalVat: 0,
        totalGross: 0,
      }, 'tenant-123');

      expect(result.referenceNumber).toBe('REF-ñáéíóú🚀');
    });
  });
});