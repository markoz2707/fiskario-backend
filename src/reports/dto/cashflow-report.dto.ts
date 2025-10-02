import { IsOptional, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CashflowFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  months?: number; // Number of months to project ahead
}

export interface CashflowEntry {
  id: string;
  type: 'income' | 'expense';
  date: Date;
  dueDate?: Date;
  amount: number;
  description: string;
  counterpartyName: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  daysUntilDue?: number;
  category: 'invoice' | 'zus' | 'tax' | 'other';
}

export interface CashflowProjection {
  date: string; // YYYY-MM-DD
  projectedIncome: number;
  projectedExpenses: number;
  netCashflow: number;
  cumulativeBalance: number;
}

export interface CashflowSummary {
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  pendingIncome: number;
  pendingExpenses: number;
  overdueAmount: number;
  projection: CashflowProjection[];
}

export class CashflowReportDto {
  period: string;
  filters: CashflowFiltersDto;
  entries: CashflowEntry[];
  summary: CashflowSummary;
  generatedAt: Date;
}

export class CashflowResponseDto {
  success: boolean;
  data: CashflowReportDto;
  generatedAt: Date;
}