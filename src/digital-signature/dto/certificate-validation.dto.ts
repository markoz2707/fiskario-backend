import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class CertificateValidationDto {
  @IsString()
  certificateId: string;

  @IsOptional()
  @IsDateString()
  validationTime?: string;

  @IsOptional()
  @IsBoolean()
  includeTrustPath?: boolean;
}

export class CertificateUploadDto {
  @IsString()
  certificateData: string; // PEM or DER encoded certificate

  @IsString()
  privateKey?: string; // PEM encoded private key

  @IsString()
  certificateType: 'profil_zaufany' | 'qualified' | 'advanced';

  @IsString()
  userIdentifier: string; // PESEL or NIP

  @IsOptional()
  @IsString()
  password?: string; // For encrypted private keys
}

export class ProfilZaufanyAuthDto {
  @IsString()
  authorizationCode: string;

  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}