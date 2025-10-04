import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EDeklaracjeService } from '../e-deklaracje.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('EDeklaracjeService', () => {
  let service: EDeklaracjeService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EDeklaracjeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'EDEKLARACJE_TEST_ENV': 'true',
                'EDEKLARACJE_TIMEOUT': '30000',
                'EDEKLARACJE_RETRIES': '3'
              };
              return config[key];
            })
          }
        },
        {
          provide: PrismaService,
          useValue: {
            declaration: {
              findFirst: jest.fn(),
              updateMany: jest.fn()
            }
          }
        }
      ],
    }).compile();

    service = module.get<EDeklaracjeService>(EDeklaracjeService);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitDeclaration', () => {
    it('should submit declaration successfully', async () => {
      // Mock SOAP client
      const mockSoapClient = {
        WyslijDeklaracjeAsync: jest.fn().mockResolvedValue([
          {
            potwierdzenie: {
              numerPotwierdzenia: 'UPO12345678901234567890123456789012',
              dataPotwierdzenia: '2024-01-15',
              opis: 'Deklaracja została przyjęta'
            }
          }
        ])
      };

      // Access private property for testing
      (service as any).soapClient = mockSoapClient;

      const submissionRequest = {
        documentType: 'JPK_V7M',
        documentVersion: '1.0',
        xmlContent: '<test>xml content</test>',
        signatureType: 'profil_zaufany' as const,
        certificateInfo: {
          serialNumber: 'CERT123',
          issuer: 'Test Issuer',
          validFrom: new Date(),
          validTo: new Date()
        }
      };

      const result = await service.submitDeclaration(submissionRequest);

      expect(result.success).toBe(true);
      expect(result.upoNumber).toBe('UPO12345678901234567890123456789012');
      expect(result.upoDate).toBe('2024-01-15');
    });

    it('should handle submission failure', async () => {
      // Mock SOAP client to throw error
      const mockSoapClient = {
        WyslijDeklaracjeAsync: jest.fn().mockRejectedValue(new Error('SOAP fault'))
      };

      (service as any).soapClient = mockSoapClient;

      const submissionRequest = {
        documentType: 'JPK_V7M',
        documentVersion: '1.0',
        xmlContent: '<test>xml content</test>',
        signatureType: 'profil_zaufany' as const
      };

      const result = await service.submitDeclaration(submissionRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SOAP fault');
    });
  });

  describe('checkDeclarationStatus', () => {
    it('should check declaration status successfully', async () => {
      const mockSoapClient = {
        SprawdzStatusAsync: jest.fn().mockResolvedValue([
          {
            numerPotwierdzenia: 'UPO12345678901234567890123456789012',
            kodStatusu: '300',
            opisStatusu: 'Zaakceptowana',
            dataPrzetworzenia: '2024-01-15T10:30:00'
          }
        ])
      };

      (service as any).soapClient = mockSoapClient;

      const result = await service.checkDeclarationStatus('UPO12345678901234567890123456789012');

      expect(result.upoNumber).toBe('UPO12345678901234567890123456789012');
      expect(result.status).toBe('accepted');
      expect(result.statusDescription).toBe('Zaakceptowana');
    });
  });

  describe('validateUPO', () => {
    it('should validate UPO successfully', async () => {
      const validUpoNumber = 'UPO12345678901234567890123456789012';

      const mockSoapClient = {
        SprawdzStatusAsync: jest.fn().mockResolvedValue([
          {
            numerPotwierdzenia: validUpoNumber,
            kodStatusu: '300',
            opisStatusu: 'Zaakceptowana',
            dataPrzetworzenia: '2024-01-15T10:30:00'
          }
        ])
      };

      (service as any).soapClient = mockSoapClient;

      const result = await service.validateUPO(validUpoNumber);

      expect(result.isValid).toBe(true);
      expect(result.upoNumber).toBe(validUpoNumber);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid UPO format', async () => {
      const invalidUpoNumber = 'INVALID_UPO';

      const result = await service.validateUPO(invalidUpoNumber);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid UPO format - should be 32 alphanumeric characters');
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      const mockSoapClient = {
        PobierzFormularzeAsync: jest.fn().mockResolvedValue([
          { formularze: ['JPK_V7M', 'JPK_V7K'] }
        ])
      };

      (service as any).soapClient = mockSoapClient;

      const result = await service.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected');
    });

    it('should handle connection failure', async () => {
      const mockSoapClient = {
        PobierzFormularzeAsync: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };

      (service as any).soapClient = mockSoapClient;

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
    });
  });
});