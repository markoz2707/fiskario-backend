import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  postalCode: string;

  @IsString()
  country: string;
}

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  nip?: string;

  @IsString()
  @IsOptional()
  regon?: string;

  @IsObject()
  @IsOptional()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsString()
  @IsOptional()
  vatStatus?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCompanyDto extends CreateCompanyDto {
  @IsString()
  @IsOptional()
  nipEncrypted?: string;
}