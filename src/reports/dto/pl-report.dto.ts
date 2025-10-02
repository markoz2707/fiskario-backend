import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PLReportFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(2020)
  year?: number;
}

export class PLReportDto {
  period: string;
  revenue: {
    total: number;
    sales: number;
    other: number;
  };
  costs: {
    total: number;
    materials: number;
    services: number;
    salaries: number;
    other: number;
  };
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  vat: {
    collected: number;
    paid: number;
    due: number;
  };
}

export class PLReportResponseDto {
  success: boolean;
  data: PLReportDto;
  generatedAt: Date;
  filters: PLReportFiltersDto;
}