import { IsString, IsNumber, IsBoolean, IsDateString, IsObject, IsOptional, IsInt, Min } from 'class-validator';

export class CreateTaxRuleDto {
  @IsString()
  taxFormId: string;

  @IsString()
  name: string;

  @IsString()
  ruleType: string;

  @IsObject()
  @IsOptional()
  conditions?: any;

  @IsString()
  calculationMethod: string;

  @IsNumber()
  value: number;

  @IsNumber()
  @IsOptional()
  minBase?: number;

  @IsNumber()
  @IsOptional()
  maxBase?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  @IsOptional()
  validTo?: string;
}