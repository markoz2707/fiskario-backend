import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CertificateValidationService } from './certificate-validation.service';
import { CertificateStatus } from '../interfaces/digital-signature.interface';

// Mock node-forge with configurable certificate behavior
const mockCertFromPem = jest.fn();

jest.mock('node-forge', () => ({
  pki: {
    certificateFromPem: (...args: any[]) => mockCertFromPem(...args),
  },
}));

describe('CertificateValidationService', () => {
  let service: CertificateValidationService;
  let prisma: PrismaService;

  const mockPrisma = {
    digitalCertificate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => defaultValue),
  };

  /**
   * Helper to create a valid forge certificate mock object.
   */
  function createMockForgeCert(overrides: {
    subjectHash?: string;
    issuerHash?: string;
    issuerCN?: string;
    keyBitLength?: number;
    hasCertPolicies?: boolean;
    qualifiedOID?: boolean;
  } = {}) {
    return {
      subject: {
        hash: overrides.subjectHash ?? 'subject-hash',
        getField: jest.fn((field: string) => {
          if (field === 'CN') return { value: 'Test Subject' };
          return null;
        }),
      },
      issuer: {
        hash: overrides.issuerHash ?? 'issuer-hash',
        getField: jest.fn((field: string) => {
          if (field === 'CN') return { value: overrides.issuerCN ?? 'Krajowa Izba Rozliczeniowa S.A.' };
          return null;
        }),
      },
      publicKey: {
        algorithm: 'RSA',
        n: { bitLength: () => overrides.keyBitLength ?? 2048 },
      },
      getExtension: jest.fn((ext: string) => {
        if (ext === 'certificatePolicies' && overrides.hasCertPolicies) {
          return {
            value: overrides.qualifiedOID
              ? [{ policyIdentifier: '0.4.0.194112.1.2' }]
              : [{ policyIdentifier: '1.2.3.4.5' }],
          };
        }
        return null;
      }),
    };
  }

  /**
   * Helper to create a mock DB certificate record.
   */
  function createDbCertificate(overrides: Partial<{
    id: string;
    status: string;
    validTo: Date;
    certificateType: string;
    certificateData: string;
  }> = {}) {
    return {
      id: overrides.id ?? 'cert-001',
      tenant_id: 'company-1',
      company_id: 'company-1',
      certificateType: overrides.certificateType ?? 'qualified',
      serialNumber: 'AABB001122',
      issuer: 'Test Issuer',
      subject: 'Jan Kowalski',
      validFrom: new Date('2024-01-01'),
      validTo: overrides.validTo ?? new Date('2027-12-31'),
      status: overrides.status ?? CertificateStatus.VALID,
      certificateData: overrides.certificateData ?? '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
      privateKey: 'encrypted',
      keyAlgorithm: 'RSA',
      keySize: 2048,
      trustedServiceProvider: 'Test TSP',
      userIdentifier: '90010112345',
      isDefault: false,
      createdAt: new Date(),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificateValidationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CertificateValidationService>(CertificateValidationService);
    prisma = module.get<PrismaService>(PrismaService);

    // Default forge mock: returns a valid 2048-bit cert from a trusted Polish issuer
    mockCertFromPem.mockReturnValue(createMockForgeCert({
      issuerCN: 'Krajowa Izba Rozliczeniowa S.A.',
      keyBitLength: 2048,
      hasCertPolicies: true,
      qualifiedOID: true,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // validateCertificate - comprehensive validation
  // =========================================================
  describe('validateCertificate', () => {
    it('should return valid for a properly configured certificate', async () => {
      const dbCert = createDbCertificate();
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect revoked certificate status', async () => {
      const revokedCert = createDbCertificate({ status: CertificateStatus.REVOKED });
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(revokedCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(revokedCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate has been revoked');
    });

    it('should detect suspended certificate status', async () => {
      const suspendedCert = createDbCertificate({ status: CertificateStatus.SUSPENDED });
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(suspendedCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(suspendedCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate has been suspended');
    });

    it('should detect expired certificate status', async () => {
      const expiredCert = createDbCertificate({ status: CertificateStatus.EXPIRED });
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(expiredCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(expiredCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate has expired');
    });

    it('should flag certificate with key size below 2048 bits', async () => {
      mockCertFromPem.mockReturnValue(createMockForgeCert({
        keyBitLength: 1024,
        issuerCN: 'Krajowa Izba Rozliczeniowa S.A.',
        hasCertPolicies: true,
        qualifiedOID: true,
      }));
      const dbCert = createDbCertificate();
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate key size is less than 2048 bits');
    });

    it('should warn about self-signed certificates', async () => {
      mockCertFromPem.mockReturnValue(createMockForgeCert({
        subjectHash: 'same-hash',
        issuerHash: 'same-hash',
        issuerCN: 'Krajowa Izba Rozliczeniowa S.A.',
        hasCertPolicies: true,
        qualifiedOID: true,
      }));
      const dbCert = createDbCertificate();
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.warnings).toContain('Certificate is self-signed');
    });

    it('should warn about non-trusted Polish issuer', async () => {
      mockCertFromPem.mockReturnValue(createMockForgeCert({
        issuerCN: 'Unknown Foreign CA',
        hasCertPolicies: true,
        qualifiedOID: true,
      }));
      const dbCert = createDbCertificate();
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.warnings).toContain('Certificate issuer not in trusted Polish authorities list');
    });

    it('should error on qualified cert missing required policy OID', async () => {
      mockCertFromPem.mockReturnValue(createMockForgeCert({
        issuerCN: 'Krajowa Izba Rozliczeniowa S.A.',
        hasCertPolicies: true,
        qualifiedOID: false, // has policy extension but not the right OID
      }));
      const dbCert = createDbCertificate({ certificateType: 'qualified' });
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate does not contain required qualified certificate policy');
    });

    it('should include trust path when includeTrustPath is true', async () => {
      const dbCert = createDbCertificate();
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001', includeTrustPath: true },
        'company-1',
      );

      expect(result.trustPath).toBeDefined();
      expect(result.trustPath).toHaveLength(1);
      expect(result.trustPath![0].validationResult).toBe(true);
    });

    it('should return failure response when certificate is not found', async () => {
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(null);

      const result = await service.validateCertificate(
        { certificateId: 'nonexistent' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate validation failed');
    });

    it('should update validation status in database after validation', async () => {
      const dbCert = createDbCertificate();
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(dbCert);
      mockPrisma.digitalCertificate.update.mockResolvedValue(dbCert);

      await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(mockPrisma.digitalCertificate.update).toHaveBeenCalledWith({
        where: { id: 'cert-001' },
        data: expect.objectContaining({
          validationStatus: 'valid',
          lastValidationAt: expect.any(Date),
        }),
      });
    });
  });

  // =========================================================
  // checkExpiringCertificates
  // =========================================================
  describe('checkExpiringCertificates', () => {
    it('should query for certificates expiring within the threshold and still valid', async () => {
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([]);

      await service.checkExpiringCertificates('company-1', 30);

      expect(mockPrisma.digitalCertificate.findMany).toHaveBeenCalledWith({
        where: {
          company_id: 'company-1',
          validTo: {
            lte: expect.any(Date),
            gte: expect.any(Date),
          },
          status: CertificateStatus.VALID,
        },
      });
    });

    it('should return mapped certificate info for expiring certs', async () => {
      const expiringCert = createDbCertificate({
        validTo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([expiringCert]);

      const result = await service.checkExpiringCertificates('company-1', 30);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cert-001');
      expect(result[0].status).toBe(CertificateStatus.VALID);
    });
  });

  // =========================================================
  // checkExpiredCertificates
  // =========================================================
  describe('checkExpiredCertificates', () => {
    it('should find certificates past their expiry date and update status to EXPIRED', async () => {
      const expiredCert = createDbCertificate({
        id: 'cert-expired',
        validTo: new Date('2023-01-01'),
        status: CertificateStatus.VALID,
      });
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([expiredCert]);
      mockPrisma.digitalCertificate.update.mockResolvedValue({
        ...expiredCert,
        status: CertificateStatus.EXPIRED,
      });

      const result = await service.checkExpiredCertificates('company-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.digitalCertificate.update).toHaveBeenCalledWith({
        where: { id: 'cert-expired' },
        data: { status: CertificateStatus.EXPIRED },
      });
    });

    it('should return empty array when no certificates are expired', async () => {
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([]);

      const result = await service.checkExpiredCertificates('company-1');

      expect(result).toHaveLength(0);
      expect(mockPrisma.digitalCertificate.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================
  // handleCertificateExpiryCheck (scheduled cron)
  // =========================================================
  describe('handleCertificateExpiryCheck', () => {
    it('should iterate over all companies and check for expiring and expired certs', async () => {
      mockPrisma.company.findMany.mockResolvedValue([
        { id: 'comp-1', tenant_id: 'tenant-1' },
        { id: 'comp-2', tenant_id: 'tenant-2' },
      ]);
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([]);

      await service.handleCertificateExpiryCheck();

      expect(mockPrisma.company.findMany).toHaveBeenCalledWith({
        select: { id: true, tenant_id: true },
      });
      // findMany called twice per company: once for expired, once for expiring
      // = 2 companies x 2 calls = 4
      expect(mockPrisma.digitalCertificate.findMany).toHaveBeenCalledTimes(4);
    });

    it('should not throw when no companies exist', async () => {
      mockPrisma.company.findMany.mockResolvedValue([]);

      await expect(service.handleCertificateExpiryCheck()).resolves.not.toThrow();
    });
  });
});
