import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface SubmissionError {
  declarationId: string;
  errorType: string;
  errorMessage: string;
  errorCode?: string;
  timestamp: Date;
  retryCount: number;
  nextRetryAt?: Date;
  context?: any;
}

export interface RetryResult {
  shouldRetry: boolean;
  nextRetryAt: Date;
  retryCount: number;
  error?: string;
}

@Injectable()
export class ErrorHandlingService {
  private readonly logger = new Logger(ErrorHandlingService.name);
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 5000, // 5 seconds
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'SOAP_FAULT',
      'NETWORK_ERROR',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE',
      'TEMPORARY_ERROR'
    ]
  };

  constructor(private prisma: PrismaService) {}

  /**
   * Handle submission error and determine retry strategy
   */
  async handleSubmissionError(
    declarationId: string,
    error: any,
    context?: any
  ): Promise<RetryResult> {
    try {
      this.logger.error(`Handling submission error for declaration ${declarationId}:`, error);

      // Analyze error type
      const errorType = this.categorizeError(error);
      const errorMessage = error.message || error.toString();

      // Get current retry count
      const currentRetryCount = await this.getRetryCount(declarationId);

      // Check if error is retryable
      const isRetryable = this.isRetryableError(errorType);

      if (!isRetryable || currentRetryCount >= this.retryConfig.maxRetries) {
        // Mark as failed, no more retries
        await this.markDeclarationAsFailed(declarationId, errorType, errorMessage, currentRetryCount);

        return {
          shouldRetry: false,
          nextRetryAt: new Date(),
          retryCount: currentRetryCount,
          error: 'Maximum retry attempts exceeded or error is not retryable'
        };
      }

      // Calculate next retry time with exponential backoff
      const nextRetryAt = this.calculateNextRetryTime(currentRetryCount);

      // Update declaration with retry information
      await this.updateDeclarationForRetry(declarationId, errorType, errorMessage, currentRetryCount + 1, nextRetryAt);

      // Log error for analysis
      await this.logSubmissionError({
        declarationId,
        errorType,
        errorMessage,
        errorCode: error.code,
        timestamp: new Date(),
        retryCount: currentRetryCount + 1,
        nextRetryAt,
        context
      });

      this.logger.log(`Declaration ${declarationId} scheduled for retry ${currentRetryCount + 1}/${this.retryConfig.maxRetries} at ${nextRetryAt}`);

      return {
        shouldRetry: true,
        nextRetryAt,
        retryCount: currentRetryCount + 1
      };
    } catch (handlingError) {
      this.logger.error(`Failed to handle submission error for declaration ${declarationId}:`, handlingError);

      return {
        shouldRetry: false,
        nextRetryAt: new Date(),
        retryCount: 0,
        error: 'Error handling failed'
      };
    }
  }

  /**
   * Categorize error type for better handling
   */
  private categorizeError(error: any): string {
    const message = (error.message || error.toString()).toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }

    if (message.includes('connection') || message.includes('network') || message.includes('econn')) {
      return 'NETWORK_ERROR';
    }

    if (message.includes('soap') || message.includes('xml') || message.includes('parsing')) {
      return 'SOAP_FAULT';
    }

    if (message.includes('unauthorized') || message.includes('authentication') || message.includes('credentials')) {
      return 'AUTHENTICATION_ERROR';
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('format')) {
      return 'VALIDATION_ERROR';
    }

    if (message.includes('service unavailable') || message.includes('server error') || message.includes('500')) {
      return 'SERVICE_UNAVAILABLE';
    }

    if (message.includes('temporary') || message.includes('try again')) {
      return 'TEMPORARY_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Check if error type is retryable
   */
  private isRetryableError(errorType: string): boolean {
    return this.retryConfig.retryableErrors.includes(errorType);
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetryTime(retryCount: number): Date {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount),
      this.retryConfig.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    const totalDelay = delay + jitter;

    return new Date(Date.now() + totalDelay);
  }

  /**
   * Get current retry count for declaration
   */
  private async getRetryCount(declarationId: string): Promise<number> {
    try {
      // In a real implementation, you might store retry count in the declaration record
      // For now, we'll use a simple approach
      const declaration = await this.prisma.declaration.findUnique({
        where: { id: declarationId }
      });

      return declaration?.status === 'retry' ? 1 : 0; // Simplified
    } catch (error) {
      this.logger.error(`Failed to get retry count for declaration ${declarationId}:`, error);
      return 0;
    }
  }

  /**
   * Mark declaration as failed
   */
  private async markDeclarationAsFailed(
    declarationId: string,
    errorType: string,
    errorMessage: string,
    retryCount: number
  ): Promise<void> {
    try {
      await this.prisma.declaration.update({
        where: { id: declarationId },
        data: {
          status: 'failed',
          updatedAt: new Date()
        }
      });

      this.logger.log(`Declaration ${declarationId} marked as failed after ${retryCount} retries`);
    } catch (error) {
      this.logger.error(`Failed to mark declaration ${declarationId} as failed:`, error);
    }
  }

  /**
   * Update declaration for retry
   */
  private async updateDeclarationForRetry(
    declarationId: string,
    errorType: string,
    errorMessage: string,
    retryCount: number,
    nextRetryAt: Date
  ): Promise<void> {
    try {
      await this.prisma.declaration.update({
        where: { id: declarationId },
        data: {
          status: 'retry',
          updatedAt: new Date()
        }
      });

      // In a real implementation, you might store retry information in a separate table
      this.logger.log(`Declaration ${declarationId} updated for retry ${retryCount} at ${nextRetryAt}`);
    } catch (error) {
      this.logger.error(`Failed to update declaration ${declarationId} for retry:`, error);
    }
  }

  /**
   * Log submission error for analysis
   */
  private async logSubmissionError(error: SubmissionError): Promise<void> {
    try {
      // Create audit log entry for the error
      await this.prisma.auditLog.create({
        data: {
          tenant_id: '', // Should come from request context
          company_id: '', // Should come from declaration
          action: 'submission_error',
          entity: 'declaration',
          entityId: error.declarationId,
          details: {
            errorType: error.errorType,
            errorMessage: error.errorMessage,
            errorCode: error.errorCode,
            retryCount: error.retryCount,
            nextRetryAt: error.nextRetryAt,
            context: error.context
          }
        }
      });
    } catch (logError) {
      this.logger.error('Failed to log submission error:', logError);
    }
  }

  /**
   * Get failed declarations for manual review
   */
  async getFailedDeclarations(companyId: string, limit: number = 50): Promise<any[]> {
    try {
      return await this.prisma.declaration.findMany({
        where: {
          company_id: companyId,
          status: 'failed',
          submittedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        orderBy: {
          submittedAt: 'desc'
        },
        take: limit
      });
    } catch (error) {
      this.logger.error(`Failed to get failed declarations for company ${companyId}:`, error);
      return [];
    }
  }

  /**
   * Get retryable declarations
   */
  async getRetryableDeclarations(): Promise<any[]> {
    try {
      return await this.prisma.declaration.findMany({
        where: {
          status: 'retry',
          // Only retry declarations where next retry time has passed
          // This would need a nextRetryAt field in the schema
        },
        orderBy: {
          updatedAt: 'asc' // Retry oldest first
        },
        take: 10 // Process in small batches
      });
    } catch (error) {
      this.logger.error('Failed to get retryable declarations:', error);
      return [];
    }
  }

  /**
   * Reset declaration for manual retry
   */
  async resetForRetry(declarationId: string): Promise<void> {
    try {
      await this.prisma.declaration.update({
        where: { id: declarationId },
        data: {
          status: 'ready',
          updatedAt: new Date()
        }
      });

      this.logger.log(`Declaration ${declarationId} reset for manual retry`);
    } catch (error) {
      this.logger.error(`Failed to reset declaration ${declarationId} for retry:`, error);
      throw error;
    }
  }

  /**
   * Get error statistics for a company
   */
  async getErrorStatistics(companyId: string): Promise<any> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const errorStats = await this.prisma.auditLog.groupBy({
        by: ['details'],
        where: {
          company_id: companyId,
          action: 'submission_error',
          createdAt: {
            gte: thirtyDaysAgo
          }
        },
        _count: {
          action: true
        }
      });

      const stats = {
        totalErrors: 0,
        errorsByType: {} as { [key: string]: number },
        lastErrorDate: null as Date | null,
        period: '30 days'
      };

      errorStats.forEach(item => {
        const details = item.details as any;
        if (details?.errorType) {
          stats.totalErrors += item._count.action;
          stats.errorsByType[details.errorType] = (stats.errorsByType[details.errorType] || 0) + item._count.action;

          // For lastErrorDate, we'll use current date since groupBy doesn't include createdAt
          if (!stats.lastErrorDate) {
            stats.lastErrorDate = new Date();
          }
        }
      });

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get error statistics for company ${companyId}:`, error);
      return {
        totalErrors: 0,
        errorsByType: {},
        lastErrorDate: null,
        period: '30 days',
        error: error.message
      };
    }
  }

  /**
   * Clean up old error logs
   */
  async cleanupOldErrorLogs(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

      const result = await this.prisma.auditLog.deleteMany({
        where: {
          action: 'submission_error',
          createdAt: {
            lt: cutoffDate
          }
        }
      });

      this.logger.log(`Cleaned up ${result.count} old error logs`);
      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup old error logs:', error);
      return 0;
    }
  }

  /**
   * Validate error before processing
   */
  isValidError(error: any): boolean {
    return error && (error.message || error.code || error.toString());
  }

  /**
   * Get human-readable error description
   */
  getErrorDescription(errorType: string): string {
    const descriptions: { [key: string]: string } = {
      'TIMEOUT': 'Request timed out - will retry automatically',
      'NETWORK_ERROR': 'Network connection error - will retry automatically',
      'SOAP_FAULT': 'SOAP service error - will retry automatically',
      'AUTHENTICATION_ERROR': 'Authentication failed - manual intervention required',
      'VALIDATION_ERROR': 'Data validation error - manual intervention required',
      'SERVICE_UNAVAILABLE': 'Service temporarily unavailable - will retry automatically',
      'TEMPORARY_ERROR': 'Temporary error - will retry automatically',
      'UNKNOWN_ERROR': 'Unknown error - manual review required'
    };

    return descriptions[errorType] || 'Unknown error type';
  }
}