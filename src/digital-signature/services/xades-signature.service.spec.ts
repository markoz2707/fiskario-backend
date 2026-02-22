import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { XAdESSignatureService } from './xades-signature.service';
import {
  SignatureType,
  SignatureFormat,
  CertificateStatus,
} from '../interfaces/digital-signature.interface';

// Mock node-forge
jest.mock('node-forge', () => {
  const mockSign = jest.fn(() => 'raw-signature-bytes');
  const mockMd = {
    update: jest.fn(),
  };

  return {
    pki: {
      privateKeyFromPem: jest.fn(() => ({
        sign: mockSign,
      })),
    },
    md: {
      sha256: {
        create: jest.fn(() => mockMd),
      },
    },
    util: {
      encode64: jest.fn(() => 'bW9jay1zaWduYXR1cmUtdmFsdWU='),
    },
  };
});

describe('XAdESSignatureService', () => {
  let service: XAdESSignatureService;

  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://crd.gov.pl/wzor/2023/12/29/13064/">
  <Naglowek>
    <KodFormularza>JPK_V7M</KodFormularza>
  </Naglowek>
  <Podmiot1>
    <NIP>1234567890</NIP>
  </Podmiot1>
</JPK>`;

  const sampleCertificate = {
    id: 'cert-001',
    serialNumber: 'AABBCC112233',
    issuer: 'Test Issuer CA',
    subject: 'Jan Kowalski',
    validFrom: new Date('2024-01-01'),
    validTo: new Date('2027-12-31'),
    status: CertificateStatus.VALID,
    keyUsage: ['digitalSignature'],
    certificateType: 'qualified' as const,
    trustedServiceProvider: 'Polish TSP',
    certificateData: '-----BEGIN CERTIFICATE-----\nMIIBtest\n-----END CERTIFICATE-----',
  };

  const samplePrivateKeyPem = '-----BEGIN RSA PRIVATE KEY-----\nMIIBtest\n-----END RSA PRIVATE KEY-----';

  const sampleSignatureRequest = {
    documentId: 'jpk-v7-2024-01',
    documentType: 'JPK_V7M',
    signatureType: SignatureType.QES,
    signatureFormat: SignatureFormat.XADES,
    userIdentifier: '90010112345',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XAdESSignatureService],
    }).compile();

    service = module.get<XAdESSignatureService>(XAdESSignatureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // generateXAdESSignature
  // =========================================================
  describe('generateXAdESSignature', () => {
    it('should generate a valid XAdES signature object', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.signatureValue).toBe('bW9jay1zaWduYXR1cmUtdmFsdWU=');
      expect(result.originalDocument).toBeInstanceOf(Buffer);
      expect(result.signedDocument).toBeInstanceOf(Buffer);
    });

    it('should populate metadata with correct document info', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      expect(result.metadata.documentId).toBe('jpk-v7-2024-01');
      expect(result.metadata.documentType).toBe('JPK_V7M');
      expect(result.metadata.signatureType).toBe(SignatureType.QES);
      expect(result.metadata.signatureFormat).toBe(SignatureFormat.XADES);
      expect(result.metadata.signerIdentifier).toBe('90010112345');
      expect(result.metadata.signerName).toBe('Jan Kowalski');
    });

    it('should set correct signature and hash algorithm URIs', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      expect(result.metadata.signatureAlgorithm).toBe(
        'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      );
      expect(result.metadata.hashAlgorithm).toBe(
        'http://www.w3.org/2001/04/xmlenc#sha256',
      );
    });

    it('should embed ds:Signature element in the signed document', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      const signedXml = result.signedDocument.toString('utf8');
      expect(signedXml).toContain('ds:Signature');
      expect(signedXml).toContain('ds:SignedInfo');
      expect(signedXml).toContain('ds:SignatureValue');
      expect(signedXml).toContain('ds:DigestValue');
    });

    it('should include XAdES QualifyingProperties in signed document', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      const signedXml = result.signedDocument.toString('utf8');
      expect(signedXml).toContain('xades:QualifyingProperties');
      expect(signedXml).toContain('xades:SignedProperties');
      expect(signedXml).toContain('xades:SigningTime');
      expect(signedXml).toContain('xades:SigningCertificate');
    });

    it('should include X509Certificate data from the certificate', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      const signedXml = result.signedDocument.toString('utf8');
      expect(signedXml).toContain('ds:X509Certificate');
      // Certificate data should have PEM headers stripped
      expect(signedXml).toContain('MIIBtest');
      expect(signedXml).not.toContain('-----BEGIN CERTIFICATE-----');
    });

    it('should map certificate info correctly in the response', async () => {
      const result = await service.generateXAdESSignature(
        sampleXml,
        sampleCertificate,
        samplePrivateKeyPem,
        sampleSignatureRequest,
      );

      expect(result.certificate.id).toBe('cert-001');
      expect(result.certificate.serialNumber).toBe('AABBCC112233');
      expect(result.certificate.issuer).toBe('Test Issuer CA');
      expect(result.certificate.subject).toBe('Jan Kowalski');
      expect(result.certificate.status).toBe(CertificateStatus.VALID);
      expect(result.certificate.certificateType).toBe('qualified');
    });

    it('should throw BadRequestException when private key is invalid', async () => {
      const forge = require('node-forge');
      forge.pki.privateKeyFromPem.mockImplementationOnce(() => {
        throw new Error('Invalid private key');
      });

      await expect(
        service.generateXAdESSignature(
          sampleXml,
          sampleCertificate,
          'invalid-key',
          sampleSignatureRequest,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================
  // validateXAdESSignature
  // =========================================================
  describe('validateXAdESSignature', () => {
    it('should return true for XML containing all required signature elements', async () => {
      const signedXml = `<?xml version="1.0"?>
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:SignedInfo>
    <ds:Reference>
      <ds:DigestValue>abc123</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>sig123</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>certdata</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
</ds:Signature>`;

      const result = await service.validateXAdESSignature(signedXml);
      expect(result).toBe(true);
    });

    it('should return false for XML without ds:Signature element', async () => {
      const plainXml = `<?xml version="1.0"?><root><data>hello</data></root>`;

      const result = await service.validateXAdESSignature(plainXml);
      expect(result).toBe(false);
    });

    it('should return false when ds:SignatureValue is missing', async () => {
      const incompleteXml = `<ds:Signature>
  <ds:SignedInfo>
    <ds:Reference><ds:DigestValue>abc</ds:DigestValue></ds:Reference>
  </ds:SignedInfo>
  <ds:KeyInfo><ds:X509Data><ds:X509Certificate>cert</ds:X509Certificate></ds:X509Data></ds:KeyInfo>
</ds:Signature>`;

      const result = await service.validateXAdESSignature(incompleteXml);
      expect(result).toBe(false);
    });

    it('should return false when ds:X509Certificate is missing', async () => {
      const incompleteXml = `<ds:Signature>
  <ds:SignedInfo>
    <ds:Reference><ds:DigestValue>abc</ds:DigestValue></ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>sig</ds:SignatureValue>
</ds:Signature>`;

      const result = await service.validateXAdESSignature(incompleteXml);
      expect(result).toBe(false);
    });
  });
});
