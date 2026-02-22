import { IsString, IsOptional, IsArray, IsNumber, IsDateString, IsEnum, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CorrectionItemDto {
  @IsString()
  @IsOptional()
  originalItemId?: string;

  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  vatRate: number;

  @IsString()
  @IsOptional()
  gtu?: string;
}

export class CreateCorrectionInvoiceDto {
  @IsString()
  originalInvoiceId: string;

  @IsString()
  company_id: string;

  @IsDateString()
  correctionDate: string;

  @IsEnum(['full', 'partial', 'to_zero'])
  correctionType: 'full' | 'partial' | 'to_zero';

  @IsString()
  correctionReason: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectionItemDto)
  @IsOptional()
  correctedItems?: CorrectionItemDto[];

  @IsString()
  @IsOptional()
  series?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  buyerNip?: string;

  @IsString()
  @IsOptional()
  buyerName?: string;
}
