import { IsString, IsOptional, IsObject, IsArray, IsBoolean, IsDateString, IsNumber } from 'class-validator';

export class FullSyncDto {
  @IsArray()
  @IsOptional()
  workflowStates?: any[];

  @IsObject()
  @IsOptional()
  dashboardData?: Record<string, any>;

  @IsObject()
  @IsOptional()
  cachedData?: Record<string, any>;
}

export class IncrementalSyncDto {
  @IsArray()
  @IsOptional()
  workflowChanges?: any[];

  @IsObject()
  @IsOptional()
  dashboardChanges?: Record<string, any>;
}

export class ConflictResolutionDto {
  @IsString()
  entityType: string;

  @IsString()
  entityId: string;

  @IsString()
  resolution: 'local' | 'remote' | 'merge';

  @IsObject()
  @IsOptional()
  mergedData?: Record<string, any>;
}

export class ForceSyncDto {
  @IsArray()
  @IsOptional()
  workflowData?: any[];

  @IsObject()
  @IsOptional()
  dashboardData?: Record<string, any>;
}
