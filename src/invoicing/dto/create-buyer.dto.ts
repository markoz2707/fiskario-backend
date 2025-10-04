import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateBuyerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{10}$/, {
    message: 'NIP must be exactly 10 digits',
  })
  nip?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{2}-\d{3}$/, {
    message: 'Postal code must be in format XX-XXX',
  })
  postalCode?: string;

  @IsEnum(['PL', 'DE', 'CZ', 'SK', 'LT', 'LV', 'EE', 'UA'])
  @IsOptional()
  country?: string = 'PL';

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[\d\s\-\(\)]+$/, {
    message: 'Phone number format is invalid',
  })
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  website?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateBuyerDto extends CreateBuyerDto {
  @IsString()
  @IsOptional()
  nipEncrypted?: string;
}