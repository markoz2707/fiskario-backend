import { Injectable, Logger } from '@nestjs/common';
import { MobileErrorResponseDto, MobileValidationErrorDto, MobileCalculationErrorDto, MobileSyncErrorDto, MobileRateLimitErrorDto, FieldErrorDto } from './dto/mobile-error.dto';

@Injectable()
export class MobileErrorHandlerService {
  private readonly logger = new Logger(MobileErrorHandlerService.name);

  /**
   * Handle validation errors for mobile consumption
   */
  handleValidationError(errors: any[]): MobileValidationErrorDto {
    const fieldErrors: FieldErrorDto[] = [];

    if (Array.isArray(errors)) {
      errors.forEach(error => {
        if (error.constraints) {
          Object.entries(error.constraints).forEach(([constraint, message]) => {
            fieldErrors.push({
              field: error.property,
              message: message as string,
              code: constraint,
            });
          });
        }
      });
    }

    const errorResponse = new MobileValidationErrorDto(
      'Validation failed. Please check your input data.',
      fieldErrors,
      `Found ${fieldErrors.length} validation error(s)`
    );

    this.logError('VALIDATION_ERROR', errorResponse.message, { fieldErrors });
    return errorResponse;
  }

  /**
   * Handle calculation errors for mobile consumption
   */
  handleCalculationError(error: any, step?: string): MobileCalculationErrorDto {
    const errorResponse = new MobileCalculationErrorDto(
      'Tax calculation failed. Please try again or contact support if the issue persists.',
      step || 'unknown',
      error.message || 'An unexpected error occurred during calculation'
    );

    this.logError('CALCULATION_ERROR', errorResponse.message, {
      step,
      originalError: error.message,
      stack: error.stack,
    });

    return errorResponse;
  }

  /**
   * Handle sync errors for mobile consumption
   */
  handleSyncError(error: any, resolution?: 'server_wins' | 'client_wins' | 'manual_merge'): MobileSyncErrorDto {
    const errorResponse = new MobileSyncErrorDto(
      'Data synchronization failed. Please check your connection and try again.',
      resolution || 'manual_merge',
      error.message || 'An unexpected error occurred during sync'
    );

    this.logError('SYNC_ERROR', errorResponse.message, {
      resolution,
      originalError: error.message,
      stack: error.stack,
    });

    return errorResponse;
  }

  /**
   * Handle rate limiting errors for mobile consumption
   */
  handleRateLimitError(retryAfter: number, resetTime?: number): MobileRateLimitErrorDto {
    const errorResponse = new MobileRateLimitErrorDto(
      'Too many requests. Please wait before trying again.',
      retryAfter,
      resetTime,
      `Rate limit exceeded. Retry after ${retryAfter} seconds.`
    );

    this.logError('RATE_LIMIT_ERROR', errorResponse.message, {
      retryAfter,
      resetTime,
    });

    return errorResponse;
  }

  /**
   * Handle network/connectivity errors for mobile consumption
   */
  handleNetworkError(error: any): MobileErrorResponseDto {
    const errorResponse = new MobileErrorResponseDto(
      'NETWORK_ERROR',
      'Network connection failed. Please check your internet connection and try again.',
      error.message || 'Unable to connect to server'
    );

    this.logError('NETWORK_ERROR', errorResponse.message, {
      originalError: error.message,
      code: error.code,
    });

    return errorResponse;
  }

  /**
   * Handle authentication errors for mobile consumption
   */
  handleAuthError(error: any): MobileErrorResponseDto {
    const errorResponse = new MobileErrorResponseDto(
      'AUTH_ERROR',
      'Authentication failed. Please log in again.',
      error.message || 'Invalid or expired authentication token'
    );

    this.logError('AUTH_ERROR', errorResponse.message, {
      originalError: error.message,
    });

    return errorResponse;
  }

  /**
   * Handle business logic errors for mobile consumption
   */
  handleBusinessError(error: any, entity?: string): MobileErrorResponseDto {
    let friendlyMessage = 'Operation failed. Please try again.';

    // Provide user-friendly messages based on error type
    if (error.message?.includes('not found')) {
      friendlyMessage = `${entity || 'Resource'} not found. Please refresh and try again.`;
    } else if (error.message?.includes('already exists')) {
      friendlyMessage = `${entity || 'Resource'} already exists. Please use different data.`;
    } else if (error.message?.includes('insufficient permissions')) {
      friendlyMessage = 'You do not have permission to perform this action.';
    } else if (error.message?.includes('invalid format')) {
      friendlyMessage = 'Invalid data format. Please check your input and try again.';
    }

    const errorResponse = new MobileErrorResponseDto(
      'BUSINESS_ERROR',
      friendlyMessage,
      error.message
    );

    this.logError('BUSINESS_ERROR', errorResponse.message, {
      originalError: error.message,
      entity,
    });

    return errorResponse;
  }

  /**
   * Handle generic/unknown errors for mobile consumption
   */
  handleGenericError(error: any): MobileErrorResponseDto {
    const errorResponse = new MobileErrorResponseDto(
      'GENERIC_ERROR',
      'An unexpected error occurred. Please try again or contact support if the issue persists.',
      error.message || 'Unknown error'
    );

    this.logError('GENERIC_ERROR', errorResponse.message, {
      originalError: error.message,
      stack: error.stack,
    });

    return errorResponse;
  }

  /**
   * Create a mobile-friendly error response from any error
   */
  createMobileErrorResponse(error: any, context?: string): MobileErrorResponseDto {
    // Handle known error types
    if (error.name === 'ValidationError' || error.status === 400) {
      return this.handleValidationError(error.details || []);
    }

    if (error.message?.includes('calculation') || error.message?.includes('tax')) {
      return this.handleCalculationError(error, context);
    }

    if (error.message?.includes('sync') || error.message?.includes('conflict')) {
      return this.handleSyncError(error);
    }

    if (error.message?.includes('rate limit') || error.status === 429) {
      return this.handleRateLimitError(60); // Default 60 seconds
    }

    if (error.message?.includes('network') || error.code === 'ECONNREFUSED') {
      return this.handleNetworkError(error);
    }

    if (error.message?.includes('auth') || error.status === 401 || error.status === 403) {
      return this.handleAuthError(error);
    }

    // Default to generic error handling
    return this.handleGenericError(error);
  }

  /**
   * Log error with appropriate level and context
   */
  private logError(errorCode: string, message: string, context: any) {
    const logContext = {
      errorCode,
      message,
      ...context,
      timestamp: new Date().toISOString(),
    };

    switch (errorCode) {
      case 'VALIDATION_ERROR':
        this.logger.warn(message, JSON.stringify(logContext));
        break;
      case 'CALCULATION_ERROR':
      case 'SYNC_ERROR':
        this.logger.error(message, JSON.stringify(logContext));
        break;
      case 'NETWORK_ERROR':
      case 'AUTH_ERROR':
        this.logger.warn(message, JSON.stringify(logContext));
        break;
      default:
        this.logger.error(message, JSON.stringify(logContext));
    }
  }

  /**
   * Generate correlation ID for error tracking
   */
  generateCorrelationId(): string {
    return `mobile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add correlation ID to error response
   */
  addCorrelationId(errorResponse: MobileErrorResponseDto): MobileErrorResponseDto {
    errorResponse.correlationId = this.generateCorrelationId();
    return errorResponse;
  }
}