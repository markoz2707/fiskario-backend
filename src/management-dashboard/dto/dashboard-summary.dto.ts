import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, IsArray, IsObject } from 'class-validator';

export class DashboardSummaryDto {
  @ApiProperty({ description: 'Total number of invoices' })
  @IsNumber()
  totalInvoices: number;

  @ApiProperty({ description: 'Total revenue amount' })
  @IsNumber()
  totalRevenue: number;

  @ApiProperty({ description: 'Total VAT amount' })
  @IsNumber()
  totalVat: number;

  @ApiProperty({ description: 'Number of active customers' })
  @IsNumber()
  activeCustomers: number;

  @ApiProperty({ description: 'Number of pending declarations' })
  @IsNumber()
  pendingDeclarations: number;

  @ApiProperty({ description: 'Number of overdue payments' })
  @IsNumber()
  overduePayments: number;

  @ApiProperty({ description: 'KSeF submission status' })
  @IsObject()
  ksefStatus: {
    submitted: number;
    pending: number;
    failed: number;
  };

  @ApiProperty({ description: 'Recent activities' })
  @IsArray()
  recentActivities: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: Date;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;

  @ApiProperty({ description: 'Upcoming deadlines' })
  @IsArray()
  upcomingDeadlines: Array<{
    id: string;
    type: string;
    description: string;
    dueDate: Date;
    daysRemaining: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export class DashboardFiltersDto {
  @ApiProperty({ required: false, description: 'Filter by company ID' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({ required: false, description: 'Filter by date range - start date' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiProperty({ required: false, description: 'Filter by date range - end date' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiProperty({ required: false, description: 'Filter by priority level' })
  @IsOptional()
  @IsString()
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({ required: false, description: 'Limit number of results' })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiProperty({ required: false, description: 'Offset for pagination' })
  @IsOptional()
  @IsNumber()
  offset?: number;
}

export class RealTimeStatusDto {
  @ApiProperty({ description: 'Current system status' })
  @IsString()
  systemStatus: 'operational' | 'degraded' | 'maintenance';

  @ApiProperty({ description: 'Active background processes' })
  @IsArray()
  activeProcesses: Array<{
    id: string;
    type: string;
    progress: number;
    estimatedCompletion: Date;
  }>;

  @ApiProperty({ description: 'System alerts' })
  @IsArray()
  alerts: Array<{
    id: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
  }>;

  @ApiProperty({ description: 'Last updated timestamp' })
  @IsString()
  lastUpdated: string;
}