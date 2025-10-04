import { SignatureType, SignatureFormat, CertificateStatus } from '../interfaces/digital-signature.interface';

export class SignatureResponseDto {
  signatureId: string;
  status: 'pending' | 'completed' | 'failed';
  signatureType: SignatureType;
  signatureFormat: SignatureFormat;
  signedAt?: Date;
  signerName?: string;
  error?: string;
  redirectUrl?: string;
  downloadUrl?: string;
}

export class CertificateInfoDto {
  id: string;
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  status: CertificateStatus;
  certificateType: 'profil_zaufany' | 'qualified' | 'advanced';
  trustedServiceProvider?: string;
  keyUsage: string[];
  daysUntilExpiry: number;
}

export class SignatureValidationDto {
  isValid: boolean;
  validationTime: Date;
  certificateStatus: CertificateStatus;
  signatureStatus: 'valid' | 'invalid' | 'unknown';
  errors: string[];
  warnings: string[];
  trustPath?: CertificateTrustPathDto[];
}

export class CertificateTrustPathDto {
  certificate: CertificateInfoDto;
  validationResult: boolean;
  error?: string;
}

export class ProfilZaufanyProfileDto {
  profileId: string;
  firstName: string;
  lastName: string;
  pesel: string;
  email: string;
  phoneNumber?: string;
  authenticationLevel: 'basic' | 'significant' | 'high';
  createdAt: Date;
  lastLoginAt?: Date;
}

export class EPUAPServiceDto {
  serviceId: string;
  name: string;
  description: string;
  isAvailable: boolean;
  requiredAuthenticationLevel: 'basic' | 'significant' | 'high';
  estimatedProcessingTime?: number;
}