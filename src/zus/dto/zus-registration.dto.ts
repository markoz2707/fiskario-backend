import { IsString, IsDateString, IsOptional, IsObject, IsEnum, IsNumber, Min } from 'class-validator';

export class CreateZUSRegistrationDto {
  @IsString()
  employeeId: string;

  @IsEnum(['ZUA', 'ZZA', 'ZWUA'])
  formType: 'ZUA' | 'ZZA' | 'ZWUA';

  @IsDateString()
  registrationDate: string;

  @IsObject()
  insuranceTypes: {
    emerytalna: boolean;
    rentowa: boolean;
    chorobowa: boolean;
    wypadkowa: boolean;
    zdrowotna: boolean;
  };

  @IsNumber()
  @Min(0)
  contributionBasis: number;
}

export class UpdateZUSRegistrationDto {
  @IsEnum(['ZUA', 'ZZA', 'ZWUA'])
  @IsOptional()
  formType?: 'ZUA' | 'ZZA' | 'ZWUA';

  @IsDateString()
  @IsOptional()
  registrationDate?: string;

  @IsObject()
  @IsOptional()
  insuranceTypes?: {
    emerytalna: boolean;
    rentowa: boolean;
    chorobowa: boolean;
    wypadkowa: boolean;
    zdrowotna: boolean;
  };

  @IsNumber()
  @Min(0)
  @IsOptional()
  contributionBasis?: number;

  @IsString()
  @IsOptional()
  zusReferenceNumber?: string;

  @IsString()
  @IsOptional()
  upoNumber?: string;

  @IsDateString()
  @IsOptional()
  upoDate?: string;
}

export interface ZUSReportData {
  reportType: string;
  period: string;
  reportDate: Date;
  company: {
    name: string;
    nip: string;
    address: string;
  };
  summary: {
    totalEmployees: number;
    totalContributions: number;
    totalEmerytalnaEmployer: number;
    totalEmerytalnaEmployee: number;
    totalRentowaEmployer: number;
    totalRentowaEmployee: number;
    totalChorobowaEmployee: number;
    totalWypadkowaEmployer: number;
    totalZdrowotnaEmployee: number;
    totalFPEmployee: number;
    totalFGSPEmployee: number;
  };
  employees: Array<{
    employeeId: string;
    firstName: string;
    lastName: string;
    pesel?: string;
    contributions: {
      emerytalnaEmployer: number;
      emerytalnaEmployee: number;
      rentowaEmployer: number;
      rentowaEmployee: number;
      chorobowaEmployee: number;
      wypadkowaEmployer: number;
      zdrowotnaEmployee: number;
      fpEmployee: number;
      fgspEmployee: number;
    };
  }>;
}

export interface ZUSFormData {
  formType: string;
  registrationDate: Date;
  employee: {
    firstName: string;
    lastName: string;
    pesel?: string;
    address: string;
  };
  insuranceTypes: {
    emerytalna: boolean;
    rentowa: boolean;
    chorobowa: boolean;
    wypadkowa: boolean;
    zdrowotna: boolean;
  };
  contributionBasis: number;
  company: {
    name: string;
    nip: string;
    address: string;
  };
}