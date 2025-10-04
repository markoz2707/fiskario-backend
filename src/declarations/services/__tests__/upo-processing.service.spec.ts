import { Test, TestingModule } from '@nestjs/testing';
import { UPOProcessingService } from '../upo-processing.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('UPOProcessingService', () => {
  let service: UPOProcessingService;
  let prismaService: PrismaService;

  const validUpoXml = `<?xml version="1.0" encoding="UTF-8"?>
<DeklaracjaPotwierdzenie>
  <Naglowek>
    <KodFormularza>JPK_V7M</KodFormularza>
    <KodUrzedu>1234</KodUrzedu>
    <Okres>2024-01</Okres>
    <Podmiot>
      <NIP>1234567890</NIP>
    </Podmiot>
  </Naglowek>
  <Potwierdzenie>
    <NumerPotwierdzenia>UPO12345678901234567890123456789012</NumerPotwierdzenia>
    <DataPotwierdzenia>2024-01-15</DataPotwierdzenia>
    <Status>100</Status>
  </Potwierdzenie>
</DeklaracjaPotwierdzenie>`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UPOProcessingService,
        {
          provide: PrismaService,
          useValue: {
            declaration: {
              findFirst: jest.fn(),
              updateMany: jest.fn()
            },
            officialCommunication: {
              create: jest.fn()
            }
          }
        }
      ],
    }).compile();

    service = module.get<UPOProcessingService>(UPOProcessingService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processUPO', () => {

    it('should process valid UPO successfully', async () => {
      const result = await service.processUPO(validUpoXml, 'declaration-id');

      expect(result.isValid).toBe(true);
      expect(result.upoNumber).toBe('UPO12345678901234567890123456789012');
      expect(result.confirmationDate).toBe('2024-01-15');
      expect(result.errors).toHaveLength(0);
    });

    it('should reject UPO with invalid XML structure', async () => {
      const invalidUpoXml = '<invalid>xml</invalid>';

      const result = await service.processUPO(invalidUpoXml, 'declaration-id');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate UPO against declaration data', async () => {
      // Mock declaration lookup
      jest.spyOn(prismaService.declaration, 'findUnique').mockResolvedValue({
        id: 'declaration-id',
        type: 'JPK_V7M',
        company_id: 'company-id',
        company: {
          nip: '1234567890'
        }
      } as any);

      const result = await service.processUPO(validUpoXml, 'declaration-id');

      expect(result.isValid).toBe(true);
      expect(result.details?.taxpayerNIP).toBe('1234567890');
      expect(result.details?.formCode).toBe('JPK_V7M');
    });
  });

  describe('validateUPOStructure', () => {
    it('should validate correct UPO structure', () => {
      const upoData = {
        upoNumber: 'UPO12345678901234567890123456789012',
        confirmationDate: '2024-01-15',
        taxpayerNIP: '1234567890',
        taxOfficeCode: '1234',
        formCode: 'JPK_V7M',
        period: '2024-01',
        status: '100',
        xmlContent: validUpoXml
      };

      const result = (service as any).validateUPOStructure(upoData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid UPO number format', () => {
      const upoData = {
        upoNumber: 'INVALID_UPO',
        confirmationDate: '2024-01-15',
        taxpayerNIP: '1234567890',
        taxOfficeCode: '1234',
        formCode: 'JPK_V7M',
        period: '2024-01',
        status: '100',
        xmlContent: validUpoXml
      };

      const result = (service as any).validateUPOStructure(upoData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid UPO number format');
    });

    it('should reject invalid taxpayer NIP', () => {
      const upoData = {
        upoNumber: 'UPO12345678901234567890123456789012',
        confirmationDate: '2024-01-15',
        taxpayerNIP: 'INVALID_NIP',
        taxOfficeCode: '1234',
        formCode: 'JPK_V7M',
        period: '2024-01',
        status: '100',
        xmlContent: validUpoXml
      };

      const result = (service as any).validateUPOStructure(upoData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid taxpayer NIP format');
    });
  });

  describe('storeUPO', () => {
    it('should store UPO successfully', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ id: 'upo-record-id' });
      jest.spyOn(prismaService.officialCommunication, 'create').mockImplementation(mockCreate);

      const upoData = {
        upoNumber: 'UPO12345678901234567890123456789012',
        confirmationDate: '2024-01-15',
        declarationId: 'declaration-id',
        taxpayerNIP: '1234567890',
        taxOfficeCode: '1234',
        formCode: 'JPK_V7M',
        period: '2024-01',
        status: '100',
        xmlContent: validUpoXml
      };

      const result = await service.storeUPO(upoData, 'declaration-id');

      expect(result.success).toBe(true);
      expect(result.upoId).toBe('upo-record-id');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle storage failure', async () => {
      jest.spyOn(prismaService.officialCommunication, 'create').mockRejectedValue(new Error('Storage failed'));

      const upoData = {
        upoNumber: 'UPO12345678901234567890123456789012',
        confirmationDate: '2024-01-15',
        declarationId: 'declaration-id',
        taxpayerNIP: '1234567890',
        taxOfficeCode: '1234',
        formCode: 'JPK_V7M',
        period: '2024-01',
        status: '100',
        xmlContent: validUpoXml
      };

      const result = await service.storeUPO(upoData, 'declaration-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage failed');
    });
  });

  describe('getUPOByNumber', () => {
    it('should retrieve UPO by number', async () => {
      const mockCommunication = {
        upoNumber: 'UPO12345678901234567890123456789012',
        entityId: 'declaration-id',
        content: {
          confirmationDate: '2024-01-15',
          taxpayerNIP: '1234567890',
          taxOfficeCode: '1234',
          formCode: 'JPK_V7M',
          period: '2024-01',
          xmlContent: validUpoXml
        }
      };

      jest.spyOn(prismaService.officialCommunication, 'findFirst').mockResolvedValue(mockCommunication as any);

      const result = await service.getUPOByNumber('UPO12345678901234567890123456789012');

      expect(result).not.toBeNull();
      expect(result?.upoNumber).toBe('UPO12345678901234567890123456789012');
      expect(result?.taxpayerNIP).toBe('1234567890');
    });

    it('should return null for non-existent UPO', async () => {
      jest.spyOn(prismaService.officialCommunication, 'findFirst').mockResolvedValue(null);

      const result = await service.getUPOByNumber('NON_EXISTENT_UPO');

      expect(result).toBeNull();
    });
  });
});