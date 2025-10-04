import { IsString, IsBoolean, IsObject, IsDateString, IsOptional } from 'class-validator';

export class CreateCompanyTaxSettingsDto {
  @IsString()
  companyId: string;

  @IsString()
  taxFormId: string;

  @IsBoolean()
  @IsOptional()
  isSelected?: boolean;

  @IsObject()
  @IsOptional()
  settings?: any;

  @IsDateString()
  @IsOptional()
  activatedAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}