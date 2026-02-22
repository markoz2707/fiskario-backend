import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const KPIR_SOURCE_TYPES = [
  'INVOICE_SALES',
  'INVOICE_PURCHASE',
  'MANUAL',
  'ZUS_CONTRIBUTION',
  'DEPRECIATION',
  'SALARY',
  'OTHER',
] as const;

export type KPiRSourceType = typeof KPIR_SOURCE_TYPES[number];

export class CreateKPiREntryDto {
  @IsDateString()
  entryDate: string;

  @IsString()
  documentNumber: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  counterpartyAddress?: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salesRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  otherRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchaseCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sideExpenses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salaries?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  otherExpenses?: number;

  @IsOptional()
  @IsString()
  otherColumn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  researchCosts?: number;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsIn(KPIR_SOURCE_TYPES)
  sourceType: KPiRSourceType;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsBoolean()
  isCorrection?: boolean;

  @IsOptional()
  @IsString()
  correctedEntryId?: string;
}

export class UpdateKPiREntryDto {
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  counterpartyAddress?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salesRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  otherRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchaseCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sideExpenses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salaries?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  otherExpenses?: number;

  @IsOptional()
  @IsString()
  otherColumn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  researchCosts?: number;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class CreateRemanentDto {
  @IsDateString()
  date: string;

  @IsIn(['OPENING', 'CLOSING', 'INTERIM'])
  type: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalValue: number;

  items: RemanentItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RemanentItemDto {
  @IsString()
  name: string;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalValue: number;
}
