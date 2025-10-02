import { IsOptional, IsString, IsDateString, IsNumber, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class VATRegisterFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  period?: string; // YYYY-MM format

  @IsOptional()
  @IsIn(['sprzedaz', 'zakup'])
  type?: 'sprzedaz' | 'zakup';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  gtuCode?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;
}

export interface VATRegisterEntry {
  id: string;
  type: 'sprzedaz' | 'zakup';
  period: string;
  counterpartyName: string;
  counterpartyNIP?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  gtuCode?: string;
  documentType?: string;
}

export interface VATRegisterSummary {
  totalNet: number;
  totalVat: number;
  totalGross: number;
  entryCount: number;
  byVatRate: Record<number, { net: number; vat: number; count: number }>;
  byGTU: Record<string, { net: number; vat: number; count: number }>;
}

export class VATRegisterReportDto {
  period: string;
  filters: VATRegisterFiltersDto;
  entries: VATRegisterEntry[];
  summary: VATRegisterSummary;
  generatedAt: Date;
}

export class VATRegisterResponseDto {
  success: boolean;
  data: VATRegisterReportDto;
  generatedAt: Date;
}