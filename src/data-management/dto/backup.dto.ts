import { IsString, IsOptional, IsBoolean, IsArray, IsDateString } from 'class-validator';

export class CreateBackupDto {
  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  entities?: string[];

  @IsBoolean()
  @IsOptional()
  includeAuditLogs?: boolean;

  @IsBoolean()
  @IsOptional()
  compression?: boolean;

  @IsBoolean()
  @IsOptional()
  encryption?: boolean;
}

export class RestoreBackupDto {
  @IsString()
  backupId: string;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  entities?: string[];

  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
}

export class ScheduleBackupDto {
  @IsString()
  cronExpression: string;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  entities?: string[];

  @IsBoolean()
  @IsOptional()
  includeAuditLogs?: boolean;

  @IsBoolean()
  @IsOptional()
  compression?: boolean;
}

export class GDPRExportDto {
  @IsString()
  tenantId: string;

  @IsString()
  dataSubjectId: string;
}
