import { IsString, IsBoolean, IsDateString, IsObject, IsOptional } from 'class-validator';

export class CreateTaxFormDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsString()
  description: string;

  @IsString()
  category: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  @IsOptional()
  validTo?: string;

  @IsObject()
  @IsOptional()
  parameters?: any;
}