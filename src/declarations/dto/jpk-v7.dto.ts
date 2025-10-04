import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export enum JPKV7Variant {
  MONTHLY = 'M',
  QUARTERLY = 'K'
}

export class GenerateJPKV7Dto {
  @IsString()
  period: string; // YYYY-MM for monthly, YYYY-QX for quarterly

  @IsEnum(JPKV7Variant)
  variant: JPKV7Variant;

  @IsString()
  companyId: string;

  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  signatureType?: 'profil_zaufany' | 'qes' | 'none';

  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;
}

export class ValidateJPKV7Dto {
  @IsString()
  xmlContent: string;

  @IsEnum(JPKV7Variant)
  variant: JPKV7Variant;
}

export class SignJPKV7Dto {
  @IsString()
  xmlContent: string;

  @IsEnum(['profil_zaufany', 'qes', 'none'])
  signatureType: 'profil_zaufany' | 'qes' | 'none';

  @IsOptional()
  @IsString()
  certificatePath?: string;

  @IsOptional()
  @IsString()
  privateKeyPath?: string;

  @IsOptional()
  @IsString()
  passphrase?: string;

  @IsOptional()
  @IsString()
  trustedProfileId?: string;
}

export class GTUAssignmentDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsString()
  additionalContext?: string;
}

export class ProcedureCodeDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  counterpartyCountry?: string;

  @IsOptional()
  @IsBoolean()
  isEU?: boolean;

  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsBoolean()
  isExport?: boolean;

  @IsOptional()
  @IsBoolean()
  isImport?: boolean;

  @IsOptional()
  @IsBoolean()
  isTriangular?: boolean;

  @IsOptional()
  vatRate?: number;

  @IsOptional()
  @IsBoolean()
  isSensitiveGoods?: boolean;

  @IsOptional()
  @IsBoolean()
  isUsedGoods?: boolean;

  @IsOptional()
  @IsBoolean()
  isTourism?: boolean;

  @IsOptional()
  @IsBoolean()
  isInvestmentMetal?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSplitPayment?: boolean;
}