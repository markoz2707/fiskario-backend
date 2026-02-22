import { IsOptional, IsInt, IsString, IsIn, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class KPiRFiltersDto {
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2030)
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn([
    'INVOICE_SALES',
    'INVOICE_PURCHASE',
    'MANUAL',
    'ZUS_CONTRIBUTION',
    'DEPRECIATION',
    'SALARY',
    'OTHER',
  ])
  sourceType?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
