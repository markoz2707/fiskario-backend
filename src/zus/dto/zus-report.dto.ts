import { IsString, IsDateString, IsOptional, IsEnum, IsNumber, Min, IsArray } from 'class-validator';

export class CreateZUSReportDto {
  @IsEnum(['RCA', 'RZA', 'RSA', 'DRA', 'RPA'])
  reportType: 'RCA' | 'RZA' | 'RSA' | 'DRA' | 'RPA';

  @IsString()
  period: string; // YYYY-MM for monthly, YYYY for annual

  @IsDateString()
  reportDate: string;

  @IsArray()
  @IsOptional()
  employeeIds?: string[];
}

export class UpdateZUSReportDto {
  @IsEnum(['RCA', 'RZA', 'RSA', 'DRA', 'RPA'])
  @IsOptional()
  reportType?: 'RCA' | 'RZA' | 'RSA' | 'DRA' | 'RPA';

  @IsString()
  @IsOptional()
  period?: string;

  @IsDateString()
  @IsOptional()
  reportDate?: string;

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