import { IsString, IsNumber, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class FieldErrorDto {
  @IsString()
  field: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  code?: string;
}

export class MobileErrorResponseDto {
  @IsBoolean()
  success: boolean = false;

  @IsString()
  errorCode: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  details?: string;

  @IsNumber()
  @IsOptional()
  retryAfter?: number; // Seconds to wait before retry

  @IsArray()
  @IsOptional()
  fieldErrors?: FieldErrorDto[];

  @IsString()
  @IsOptional()
  correlationId?: string; // For tracking errors

  constructor(errorCode: string, message: string, details?: string) {
    this.errorCode = errorCode;
    this.message = message;
    this.details = details;
  }
}

export class MobileValidationErrorDto extends MobileErrorResponseDto {
  constructor(message: string, fieldErrors: FieldErrorDto[], details?: string) {
    super('VALIDATION_ERROR', message, details);
    this.fieldErrors = fieldErrors;
  }
}

export class MobileCalculationErrorDto extends MobileErrorResponseDto {
  @IsString()
  @IsOptional()
  calculationStep?: string;

  constructor(message: string, calculationStep?: string, details?: string) {
    super('CALCULATION_ERROR', message, details);
    this.calculationStep = calculationStep;
  }
}

export class MobileSyncErrorDto extends MobileErrorResponseDto {
  @IsString()
  @IsOptional()
  conflictResolution?: 'server_wins' | 'client_wins' | 'manual_merge';

  constructor(message: string, conflictResolution?: 'server_wins' | 'client_wins' | 'manual_merge', details?: string) {
    super('SYNC_ERROR', message, details);
    this.conflictResolution = conflictResolution;
  }
}

export class MobileRateLimitErrorDto extends MobileErrorResponseDto {
  @IsNumber()
  resetTime?: number;

  constructor(message: string, retryAfter: number, resetTime?: number, details?: string) {
    super('RATE_LIMIT_EXCEEDED', message, details);
    this.retryAfter = retryAfter;
    this.resetTime = resetTime;
  }
}