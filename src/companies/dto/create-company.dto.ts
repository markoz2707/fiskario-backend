import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  nip?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsEnum(['individual', 'partnership', 'corporation'])
  @IsOptional()
  taxForm?: 'individual' | 'partnership' | 'corporation';

  @IsBoolean()
  @IsOptional()
  vatPayer?: boolean;
}

export class UpdateCompanyDto extends CreateCompanyDto {
  @IsString()
  @IsOptional()
  nipEncrypted?: string;
}