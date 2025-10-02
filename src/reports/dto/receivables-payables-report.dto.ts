import { IsOptional, IsDateString } from 'class-validator';

export class ReceivablesPayablesFiltersDto {
  @IsOptional()
  @IsDateString()
  asOfDate?: string; // Date to calculate aging as of
}

export interface ReceivablesEntry {
  id: string;
  type: 'receivable';
  invoiceId: string;
  invoiceNumber: string;
  counterpartyName: string;
  counterpartyNIP?: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  agingCategory: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  status: 'pending' | 'overdue' | 'paid' | 'cancelled';
}

export interface PayablesEntry {
  id: string;
  type: 'payable';
  invoiceId: string;
  invoiceNumber: string;
  counterpartyName: string;
  counterpartyNIP?: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  agingCategory: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  status: 'pending' | 'overdue' | 'paid' | 'cancelled';
}

export interface AgingSummary {
  current: { count: number; amount: number };
  '1-30': { count: number; amount: number };
  '31-60': { count: number; amount: number };
  '61-90': { count: number; amount: number };
  '90+': { count: number; amount: number };
  total: { count: number; amount: number };
}

export interface ReceivablesPayablesSummary {
  receivables: {
    total: number;
    pending: number;
    overdue: number;
    aging: AgingSummary;
  };
  payables: {
    total: number;
    pending: number;
    overdue: number;
    aging: AgingSummary;
  };
  netPosition: number; // receivables - payables
}

export class ReceivablesPayablesReportDto {
  asOfDate: Date;
  filters: ReceivablesPayablesFiltersDto;
  receivables: ReceivablesEntry[];
  payables: PayablesEntry[];
  summary: ReceivablesPayablesSummary;
  generatedAt: Date;
}

export class ReceivablesPayablesResponseDto {
  success: boolean;
  data: ReceivablesPayablesReportDto;
  generatedAt: Date;
}