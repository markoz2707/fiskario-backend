import { IsString, IsNumber, IsArray, IsObject, IsOptional, IsBoolean, ValidateNested, IsUUID, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class MobileTaxCalculationItemDto {
  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  @IsOptional()
  vatRate?: number = 23; // Default VAT rate

  @IsString()
  @IsOptional()
  gtu?: string; // GTU code for Polish tax system

  @IsString()
  @IsOptional()
  category?: string; // Product/service category
}

export class MobileTaxCalculationDto {
  @IsUUID()
  companyId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileTaxCalculationItemDto)
  items: MobileTaxCalculationItemDto[];

  @IsString()
  @IsOptional()
  invoiceType?: 'VAT' | 'proforma' | 'correction' = 'VAT';

  @IsBoolean()
  @IsOptional()
  includeAllTaxes?: boolean = true;

  @IsObject()
  @IsOptional()
  additionalData?: Record<string, any>;
}

export class MobileTaxCalculationResponseDto {
  @IsNumber()
  totalNet: number;

  @IsNumber()
  totalVat: number;

  @IsNumber()
  totalGross: number;

  @IsArray()
  vatBreakdown: VatBreakdownDto[];

  @IsArray()
  appliedRules: AppliedTaxRuleDto[];

  @IsString()
  @IsOptional()
  message?: string;

  @IsBoolean()
  success: boolean;

  @IsString()
  @IsOptional()
  errorCode?: string;
}

export class VatBreakdownDto {
  @IsNumber()
  vatRate: number;

  @IsNumber()
  netAmount: number;

  @IsNumber()
  vatAmount: number;

  @IsNumber()
  grossAmount: number;

  @IsNumber()
  itemCount: number;
}

export class AppliedTaxRuleDto {
  @IsString()
  ruleId: string;

  @IsString()
  ruleName: string;

  @IsString()
  ruleType: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class MobileTaxSyncDto {
  @IsUUID()
  companyId: string;

  @IsString()
  deviceId: string;

  @IsDateString()
  lastSyncTimestamp: string;

  @IsArray()
  @IsOptional()
  pendingCalculations?: MobileTaxCalculationDto[];

  @IsBoolean()
  @IsOptional()
  forceFullSync?: boolean = false;
}

export class MobileTaxSyncResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsOptional()
  message?: string;

  @IsArray()
  @IsOptional()
  updatedTaxRules?: any[];

  @IsArray()
  @IsOptional()
  updatedTaxForms?: any[];

  @IsDateString()
  serverTimestamp: string;

  @IsNumber()
  @IsOptional()
  syncedCalculations?: number;
}