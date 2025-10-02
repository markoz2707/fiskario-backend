import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, IsBoolean } from 'class-validator';

export enum DeclarationType {
  VAT_7 = 'VAT-7',
  JPK_V7M = 'JPK_V7M',
  JPK_V7K = 'JPK_V7K',
  PIT_36 = 'PIT-36',
  PIT_37 = 'PIT-37',
  CIT_8 = 'CIT-8'
}

export enum VATRegisterType {
  SPRZEDAZ = 'sprzedaz',
  ZAKUP = 'zakup'
}

export enum TaxForm {
  INDIVIDUAL = 'individual',
  PARTNERSHIP = 'partnership',
  CORPORATION = 'corporation'
}

export class CreateVATRegisterDto {
  @IsEnum(VATRegisterType)
  type: VATRegisterType;

  @IsString()
  period: string; // YYYY-MM format

  @IsString()
  counterpartyName: string;

  @IsString()
  @IsOptional()
  counterpartyNIP?: string;

  @IsString()
  invoiceNumber: string;

  @IsDateString()
  invoiceDate: string;

  @IsNumber()
  netAmount: number;

  @IsNumber()
  vatAmount: number;

  @IsNumber()
  vatRate: number;

  @IsString()
  @IsOptional()
  gtuCode?: string;

  @IsString()
  @IsOptional()
  documentType?: string;
}

export class TaxCalculationDto {
  @IsString()
  period: string; // YYYY-MM format

  @IsEnum(DeclarationType)
  declarationType: DeclarationType;

  @IsNumber()
  @IsOptional()
  totalRevenue?: number;

  @IsNumber()
  @IsOptional()
  vatCollectedSales?: number;

  @IsNumber()
  @IsOptional()
  vatPaidPurchases?: number;

  @IsNumber()
  @IsOptional()
  totalCosts?: number;

  @IsNumber()
  @IsOptional()
  taxDeductibleCosts?: number;

  @IsNumber()
  @IsOptional()
  taxableIncome?: number;

  @IsNumber()
  @IsOptional()
  taxBase?: number;

  @IsNumber()
  @IsOptional()
  taxDue?: number;
}

export class CreateDeclarationDto {
  @IsEnum(DeclarationType)
  type: DeclarationType;

  @IsString()
  period: string;

  @IsString()
  @IsOptional()
  variant?: string; // M or K for JPK_V7

  @IsString()
  @IsOptional()
  signatureType?: string;

  @IsBoolean()
  @IsOptional()
  autoSubmit?: boolean;
}

export class UpdateDeclarationDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  upoNumber?: string;

  @IsDateString()
  @IsOptional()
  upoDate?: string;

  @IsString()
  @IsOptional()
  xmlContent?: string;
}