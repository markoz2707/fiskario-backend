import { IsString, IsDateString, IsOptional, IsBoolean, IsNumber, Min, IsEnum, IsPhoneNumber, IsEmail } from 'class-validator';

export class CreateZUSEmployeeDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  @IsOptional()
  pesel?: string;

  @IsDateString()
  birthDate: string;

  @IsString()
  address: string;

  @IsPhoneNumber('PL')
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDateString()
  employmentDate: string;

  @IsDateString()
  @IsOptional()
  terminationDate?: string;

  @IsDateString()
  insuranceStartDate: string;

  @IsBoolean()
  @IsOptional()
  isOwner?: boolean = false;

  @IsEnum(['employment', 'mandate', 'specific_task'])
  contractType: 'employment' | 'mandate' | 'specific_task';

  @IsNumber()
  @Min(0)
  salaryBasis: number;
}

export class UpdateZUSEmployeeDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  pesel?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsPhoneNumber('PL')
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDateString()
  @IsOptional()
  employmentDate?: string;

  @IsDateString()
  @IsOptional()
  terminationDate?: string;

  @IsDateString()
  @IsOptional()
  insuranceStartDate?: string;

  @IsBoolean()
  @IsOptional()
  isOwner?: boolean;

  @IsEnum(['employment', 'mandate', 'specific_task'])
  @IsOptional()
  contractType?: 'employment' | 'mandate' | 'specific_task';

  @IsNumber()
  @Min(0)
  @IsOptional()
  salaryBasis?: number;
}