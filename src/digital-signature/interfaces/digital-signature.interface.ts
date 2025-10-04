/**
 * Core digital signature interfaces for Polish tax compliance
 * Compliant with Polish electronic signature law and EU eIDAS regulation
 */

export enum SignatureType {
  PROFIL_ZAUFANY = 'profil_zaufany',
  QES = 'qualified_electronic_signature',
  ADVANCED = 'advanced_electronic_signature'
}

export enum SignatureFormat {
  XADES = 'xades',
  PADES = 'pades',
  CADES = 'cades'
}

export enum CertificateStatus {
  VALID = 'valid',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  SUSPENDED = 'suspended'
}

export interface CertificateInfo {
  id: string;
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  status: CertificateStatus;
  keyUsage: string[];
  certificateType: 'profil_zaufany' | 'qualified' | 'advanced';
  trustedServiceProvider?: string;
}

export interface ProfilZaufanyProfile {
  profileId: string;
  userId: string;
  firstName: string;
  lastName: string;
  pesel: string;
  email: string;
  phoneNumber?: string;
  authenticationLevel: 'basic' | 'significant' | 'high';
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface SignatureMetadata {
  signatureId: string;
  documentId: string;
  documentType: string;
  signatureType: SignatureType;
  signatureFormat: SignatureFormat;
  certificateId: string;
  signedAt: Date;
  signerName: string;
  signerIdentifier: string; // PESEL or company NIP
  signatureAlgorithm: string;
  hashAlgorithm: string;
  timestamp?: Date;
  tspProvider?: string;
}

export interface DigitalSignature {
  metadata: SignatureMetadata;
  certificate: CertificateInfo;
  signatureValue: string;
  originalDocument: Buffer;
  signedDocument: Buffer;
  validationInfo?: SignatureValidationResult;
}

export interface SignatureValidationResult {
  isValid: boolean;
  validationTime: Date;
  certificateStatus: CertificateStatus;
  signatureStatus: 'valid' | 'invalid' | 'unknown';
  errors: string[];
  warnings: string[];
  trustedPath?: CertificateTrustPath[];
}

export interface CertificateTrustPath {
  certificate: CertificateInfo;
  validationResult: boolean;
  error?: string;
}

export interface SignatureRequest {
  documentId: string;
  documentType: string;
  signatureType: SignatureType;
  signatureFormat: SignatureFormat;
  certificateId?: string;
  userIdentifier: string; // PESEL for individuals, NIP for companies
  additionalData?: Record<string, any>;
}

export interface SignatureResponse {
  signatureId: string;
  status: 'pending' | 'completed' | 'failed';
  signature?: DigitalSignature;
  error?: string;
  redirectUrl?: string; // For Profil Zaufany authentication
}

export interface CertificateValidationRequest {
  certificateId: string;
  validationTime?: Date;
  includeTrustPath?: boolean;
}

export interface CertificateValidationResponse {
  isValid: boolean;
  certificate: CertificateInfo;
  trustPath?: CertificateTrustPath[];
  errors: string[];
  warnings: string[];
}

export interface EPUAPIntegrationConfig {
  serviceUrl: string;
  clientId: string;
  clientSecret: string;
  environment: 'test' | 'prod';
  certificate: string;
}

export interface ProfilZaufanyConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  environment: 'test' | 'prod';
}

export interface ProfilZaufanyAuthDto {
  authorizationCode: string;
  state: string;
  redirectUri?: string;
}