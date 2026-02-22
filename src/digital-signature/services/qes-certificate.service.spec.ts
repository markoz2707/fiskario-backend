import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QESCertificateService } from './qes-certificate.service';
import { CertificateStatus } from '../interfaces/digital-signature.interface';

// Mock node-forge module
jest.mock('node-forge', () => {
  const mockCert = {
    serialNumber: 'AABBCC112233',
    issuer: {
      getField: jest.fn((field: string) => {
        if (field === 'CN') return { value: 'Test Issuer CA' };
        return null;
      }),
      hash: 'issuer-hash',
    },
    subject: {
      getField: jest.fn((field: string) => {
        if (field === 'CN') return { value: 'Jan Kowalski' };
        if (field === 'OU') return { value: 'Test TSP Provider' };
        return null;
      }),
      hash: 'subject-hash',
    },
    validity: {
      notBefore: new Date('2024-01-01'),
      notAfter: new Date('2027-12-31'),
    },
    publicKey: {
      algorithm: 'RSA',
      n: { bitLength: () => 2048 },
    },
    getExtension: jest.fn(() => null),
  };

  return {
    pki: {
      certificateFromPem: jest.fn(() => mockCert),
      decryptRsaPrivateKey: jest.fn(() => 'decrypted-key-object'),
      privateKeyToPem: jest.fn(() => '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'),
    },
    md: {
      sha256: { create: jest.fn(() => ({ update: jest.fn(), digest: jest.fn(() => ({ toHex: jest.fn(() => 'abc') })) })) },
    },
    util: {
      encode64: jest.fn(() => 'base64value'),
    },
  };
});

describe('QESCertificateService', () => {
  let service: QESCertificateService;
  let prisma: PrismaService;

  const mockPrisma = {
    digitalCertificate: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'ENCRYPTION_KEY') return 'a]3Fp9m$Kv7Lx!Qw2Zt6Bn8Rj0Yd4He';
      return defaultValue;
    }),
  };

  const mockDbCertificate = {
    id: 'cert-001',
    tenant_id: 'company-1',
    company_id: 'company-1',
    certificateType: 'qualified',
    serialNumber: 'AABBCC112233',
    issuer: 'Test Issuer CA',
    subject: 'Jan Kowalski',
    validFrom: new Date('2024-01-01'),
    validTo: new Date('2027-12-31'),
    status: CertificateStatus.VALID,
    certificateData: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
    privateKey: 'encrypted-key',
    keyAlgorithm: 'RSA',
    keySize: 2048,
    trustedServiceProvider: 'Test TSP Provider',
    userIdentifier: '90010112345',
    isDefault: false,
    createdAt: new Date('2024-06-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QESCertificateService,
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

    service = module.get<QESCertificateService>(QESCertificateService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // uploadCertificate
  // =========================================================
  describe('uploadCertificate', () => {
    it('should parse PEM certificate and store metadata in database', async () => {
      mockPrisma.digitalCertificate.create.mockResolvedValue(mockDbCertificate);

      const result = await service.uploadCertificate(
        '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
        'advanced',
        '90010112345',
        'company-1',
      );

      expect(mockPrisma.digitalCertificate.create).toHaveBeenCalledTimes(1);
      expect(result.serialNumber).toBe('AABBCC112233');
      expect(result.issuer).toBe('Test Issuer CA');
      expect(result.subject).toBe('Jan Kowalski');
    });

    it('should decrypt private key when password is provided', async () => {
      const forge = require('node-forge');
      mockPrisma.digitalCertificate.create.mockResolvedValue(mockDbCertificate);

      await service.uploadCertificate(
        '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        '-----BEGIN ENCRYPTED PRIVATE KEY-----\nencrypted\n-----END ENCRYPTED PRIVATE KEY-----',
        'advanced',
        '90010112345',
        'company-1',
        'my-password',
      );

      expect(forge.pki.decryptRsaPrivateKey).toHaveBeenCalledWith(
        '-----BEGIN ENCRYPTED PRIVATE KEY-----\nencrypted\n-----END ENCRYPTED PRIVATE KEY-----',
        'my-password',
      );
    });

    it('should reject a non-qualified certificate uploaded as qualified type', async () => {
      // getExtension returns null (no certificatePolicies), so isQualifiedCertificate returns false
      await expect(
        service.uploadCertificate(
          '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
          '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
          'qualified',
          '90010112345',
          'company-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================
  // getCertificate
  // =========================================================
  describe('getCertificate', () => {
    it('should retrieve a certificate by ID and company', async () => {
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(mockDbCertificate);

      const result = await service.getCertificate('cert-001', 'company-1');

      expect(result.id).toBe('cert-001');
      expect(result.serialNumber).toBe('AABBCC112233');
      expect(mockPrisma.digitalCertificate.findFirst).toHaveBeenCalledWith({
        where: { id: 'cert-001', company_id: 'company-1' },
      });
    });

    it('should throw NotFoundException when certificate does not exist', async () => {
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(null);

      await expect(
        service.getCertificate('nonexistent-id', 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================
  // listCertificates
  // =========================================================
  describe('listCertificates', () => {
    it('should return all certificates for a company ordered by creation date', async () => {
      const secondCert = { ...mockDbCertificate, id: 'cert-002', serialNumber: 'DDEEFF' };
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([mockDbCertificate, secondCert]);

      const result = await service.listCertificates('company-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('cert-001');
      expect(result[1].id).toBe('cert-002');
      expect(mockPrisma.digitalCertificate.findMany).toHaveBeenCalledWith({
        where: { company_id: 'company-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when company has no certificates', async () => {
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([]);

      const result = await service.listCertificates('company-no-certs');

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================
  // validateCertificate
  // =========================================================
  describe('validateCertificate', () => {
    it('should return valid for a non-expired certificate with VALID status', async () => {
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(mockDbCertificate);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for an expired certificate', async () => {
      const expiredCert = {
        ...mockDbCertificate,
        validTo: new Date('2020-01-01'),
        status: CertificateStatus.EXPIRED,
      };
      mockPrisma.digitalCertificate.findFirst.mockResolvedValue(expiredCert);

      const result = await service.validateCertificate(
        { certificateId: 'cert-001' },
        'company-1',
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate is expired or revoked');
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
  });

  // =========================================================
  // setDefaultCertificate
  // =========================================================
  describe('setDefaultCertificate', () => {
    it('should remove default flag from all certs and set new default', async () => {
      mockPrisma.digitalCertificate.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.digitalCertificate.update.mockResolvedValue({ ...mockDbCertificate, isDefault: true });

      await service.setDefaultCertificate('cert-001', 'company-1');

      expect(mockPrisma.digitalCertificate.updateMany).toHaveBeenCalledWith({
        where: { company_id: 'company-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(mockPrisma.digitalCertificate.update).toHaveBeenCalledWith({
        where: { id: 'cert-001', company_id: 'company-1' },
        data: { isDefault: true },
      });
    });
  });

  // =========================================================
  // checkExpiringCertificates
  // =========================================================
  describe('checkExpiringCertificates', () => {
    it('should return certificates expiring within the threshold days', async () => {
      const expiringCert = {
        ...mockDbCertificate,
        validTo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
      };
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([expiringCert]);

      const result = await service.checkExpiringCertificates('company-1', 30);

      expect(result).toHaveLength(1);
      expect(mockPrisma.digitalCertificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            company_id: 'company-1',
            status: CertificateStatus.VALID,
          }),
        }),
      );
    });

    it('should return empty array when no certificates are expiring soon', async () => {
      mockPrisma.digitalCertificate.findMany.mockResolvedValue([]);

      const result = await service.checkExpiringCertificates('company-1', 30);

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================
  // revokeCertificate
  // =========================================================
  describe('revokeCertificate', () => {
    it('should update certificate status to REVOKED', async () => {
      mockPrisma.digitalCertificate.update.mockResolvedValue({
        ...mockDbCertificate,
        status: CertificateStatus.REVOKED,
      });

      await service.revokeCertificate('cert-001', 'company-1', 'Key compromise');

      expect(mockPrisma.digitalCertificate.update).toHaveBeenCalledWith({
        where: { id: 'cert-001', company_id: 'company-1' },
        data: { status: CertificateStatus.REVOKED },
      });
    });

    it('should revoke certificate even without a reason', async () => {
      mockPrisma.digitalCertificate.update.mockResolvedValue({
        ...mockDbCertificate,
        status: CertificateStatus.REVOKED,
      });

      await service.revokeCertificate('cert-001', 'company-1');

      expect(mockPrisma.digitalCertificate.update).toHaveBeenCalledWith({
        where: { id: 'cert-001', company_id: 'company-1' },
        data: { status: CertificateStatus.REVOKED },
      });
    });
  });
});
