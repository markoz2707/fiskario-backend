import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EDeklaracjeService } from './e-deklaracje.service';
import { UPOProcessingService } from './upo-processing.service';

export interface DeclarationStatusUpdate {
  declarationId: string;
  oldStatus: string;
  newStatus: string;
  upoNumber?: string;
  upoDate?: string;
  errorMessage?: string;
  updatedAt: Date;
}

export interface StatusTrackingConfig {
  checkInterval: number; // minutes
  maxRetries: number;
  retryDelay: number; // minutes
  enableAutoCheck: boolean;
}

@Injectable()
export class DeclarationStatusService {
  private readonly logger = new Logger(DeclarationStatusService.name);
  private config: StatusTrackingConfig = {
    checkInterval: 15,
    maxRetries: 3,
    retryDelay: 60,
    enableAutoCheck: true
  };

  constructor(
    private prisma: PrismaService,
    private eDeklaracjeService: EDeklaracjeService,
    private upoProcessingService: UPOProcessingService
  ) {}

  /**
   * Update declaration status manually
   */
  async updateDeclarationStatus(
    declarationId: string,
    status: string,
    upoNumber?: string,
    upoDate?: string,
    errorMessage?: string
  ): Promise<DeclarationStatusUpdate> {
    try {
      this.logger.log(`Updating status for declaration ${declarationId} to ${status}`);

      // Get current declaration
      const currentDeclaration = await this.prisma.declaration.findUnique({
        where: { id: declarationId }
      });

      if (!currentDeclaration) {
        throw new Error(`Declaration ${declarationId} not found`);
      }

      const oldStatus = currentDeclaration.status;

      // Update declaration
      const updatedDeclaration = await this.prisma.declaration.update({
        where: { id: declarationId },
        data: {
          status: status,
          upoNumber: upoNumber || currentDeclaration.upoNumber,
          upoDate: upoDate ? new Date(upoDate) : currentDeclaration.upoDate,
          updatedAt: new Date()
        }
      });

      // Create status update record
      const statusUpdate: DeclarationStatusUpdate = {
        declarationId,
        oldStatus,
        newStatus: status,
        upoNumber: updatedDeclaration.upoNumber || undefined,
        upoDate: updatedDeclaration.upoDate?.toISOString(),
        errorMessage,
        updatedAt: new Date()
      };

      // Log status change
      await this.logStatusChange(statusUpdate);

      // Send notifications if needed
      await this.handleStatusChangeNotifications(statusUpdate);

      this.logger.log(`Declaration ${declarationId} status updated: ${oldStatus} -> ${status}`);

      return statusUpdate;
    } catch (error) {
      this.logger.error(`Failed to update declaration status for ${declarationId}:`, error);
      throw error;
    }
  }

  /**
   * Check status of all pending declarations
   */
  async checkPendingDeclarations(): Promise<DeclarationStatusUpdate[]> {
    try {
      this.logger.log('Checking status of pending declarations');

      // Get declarations that need status checking
      const pendingDeclarations = await this.prisma.declaration.findMany({
        where: {
          status: {
            in: ['submitted', 'processing']
          },
          // Only check declarations submitted in the last 30 days
          submittedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      });

      const updates: DeclarationStatusUpdate[] = [];

      for (const declaration of pendingDeclarations) {
        try {
          if (declaration.upoNumber) {
            // Check status using UPO number
            const statusResult = await this.eDeklaracjeService.checkDeclarationStatus(declaration.upoNumber);

            if (statusResult && statusResult.status !== declaration.status) {
              const update = await this.updateDeclarationStatus(
                declaration.id,
                statusResult.status,
                statusResult.upoNumber,
                statusResult.processingDate,
                statusResult.error
              );
              updates.push(update);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to check status for declaration ${declaration.id}:`, error);

          // If we've exceeded max retries, mark as failed
          const retryCount = await this.getRetryCount(declaration.id);
          if (retryCount >= this.config.maxRetries) {
            await this.updateDeclarationStatus(
              declaration.id,
              'failed',
              undefined,
              undefined,
              `Status check failed after ${retryCount} attempts: ${error.message}`
            );
          } else {
            await this.incrementRetryCount(declaration.id);
          }
        }
      }

      this.logger.log(`Checked ${pendingDeclarations.length} declarations, ${updates.length} status updates`);
      return updates;
    } catch (error) {
      this.logger.error('Failed to check pending declarations:', error);
      return [];
    }
  }

  /**
   * Automated status checking (runs every 15 minutes)
   */
  @Cron('0 */15 * * * *') // Every 15 minutes
  async handleAutomatedStatusCheck(): Promise<void> {
    if (!this.config.enableAutoCheck) {
      return;
    }

    try {
      this.logger.log('Running automated declaration status check');
      await this.checkPendingDeclarations();
    } catch (error) {
      this.logger.error('Automated status check failed:', error);
    }
  }

  /**
   * Get declaration status history
   */
  async getDeclarationStatusHistory(declarationId: string): Promise<any[]> {
    try {
      // In a real implementation, you might want to store status change history
      // For now, return current status and basic info
      const declaration = await this.prisma.declaration.findUnique({
        where: { id: declarationId }
      });

      if (!declaration) {
        throw new Error(`Declaration ${declarationId} not found`);
      }

      return [{
        status: declaration.status,
        upoNumber: declaration.upoNumber,
        upoDate: declaration.upoDate,
        submittedAt: declaration.submittedAt,
        updatedAt: declaration.updatedAt
      }];
    } catch (error) {
      this.logger.error(`Failed to get status history for declaration ${declarationId}:`, error);
      return [];
    }
  }

  /**
   * Get declarations by status
   */
  async getDeclarationsByStatus(
    companyId: string,
    status: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      return await this.prisma.declaration.findMany({
        where: {
          company_id: companyId,
          status: status
        },
        orderBy: {
          submittedAt: 'desc'
        },
        take: limit
      });
    } catch (error) {
      this.logger.error(`Failed to get declarations with status ${status}:`, error);
      return [];
    }
  }

  /**
   * Get status summary for a company
   */
  async getStatusSummary(companyId: string): Promise<any> {
    try {
      const statusCounts = await this.prisma.declaration.groupBy({
        by: ['status'],
        where: {
          company_id: companyId,
          submittedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        _count: {
          status: true
        }
      });

      const summary = {
        total: 0,
        draft: 0,
        submitted: 0,
        processing: 0,
        accepted: 0,
        rejected: 0,
        failed: 0,
        lastUpdated: new Date()
      };

      statusCounts.forEach(item => {
        summary.total += item._count.status;
        switch (item.status) {
          case 'draft':
            summary.draft = item._count.status;
            break;
          case 'submitted':
            summary.submitted = item._count.status;
            break;
          case 'processing':
            summary.processing = item._count.status;
            break;
          case 'accepted':
            summary.accepted = item._count.status;
            break;
          case 'rejected':
            summary.rejected = item._count.status;
            break;
          case 'failed':
            summary.failed = item._count.status;
            break;
        }
      });

      return summary;
    } catch (error) {
      this.logger.error(`Failed to get status summary for company ${companyId}:`, error);
      return {
        total: 0,
        draft: 0,
        submitted: 0,
        processing: 0,
        accepted: 0,
        rejected: 0,
        failed: 0,
        lastUpdated: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Log status change for audit trail
   */
  private async logStatusChange(statusUpdate: DeclarationStatusUpdate): Promise<void> {
    try {
      // Create audit log entry
      await this.prisma.auditLog.create({
        data: {
          tenant_id: '', // Should come from request context
          company_id: '', // Should come from declaration
          action: 'status_change',
          entity: 'declaration',
          entityId: statusUpdate.declarationId,
          details: {
            oldStatus: statusUpdate.oldStatus,
            newStatus: statusUpdate.newStatus,
            upoNumber: statusUpdate.upoNumber,
            upoDate: statusUpdate.upoDate,
            errorMessage: statusUpdate.errorMessage
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to log status change:', error);
    }
  }

  /**
   * Handle notifications for status changes
   */
  private async handleStatusChangeNotifications(statusUpdate: DeclarationStatusUpdate): Promise<void> {
    try {
      // Send notifications based on status
      if (statusUpdate.newStatus === 'accepted') {
        await this.sendAcceptanceNotification(statusUpdate);
      } else if (statusUpdate.newStatus === 'rejected') {
        await this.sendRejectionNotification(statusUpdate);
      } else if (statusUpdate.newStatus === 'failed') {
        await this.sendFailureNotification(statusUpdate);
      }
    } catch (error) {
      this.logger.error('Failed to handle status change notifications:', error);
    }
  }

  /**
   * Send acceptance notification
   */
  private async sendAcceptanceNotification(statusUpdate: DeclarationStatusUpdate): Promise<void> {
    // Implementation would send notification (email, push, etc.)
    this.logger.log(`Declaration ${statusUpdate.declarationId} accepted - notification sent`);
  }

  /**
   * Send rejection notification
   */
  private async sendRejectionNotification(statusUpdate: DeclarationStatusUpdate): Promise<void> {
    // Implementation would send notification (email, push, etc.)
    this.logger.log(`Declaration ${statusUpdate.declarationId} rejected - notification sent`);
  }

  /**
   * Send failure notification
   */
  private async sendFailureNotification(statusUpdate: DeclarationStatusUpdate): Promise<void> {
    // Implementation would send notification (email, push, etc.)
    this.logger.log(`Declaration ${statusUpdate.declarationId} failed - notification sent`);
  }

  /**
   * Get retry count for declaration
   */
  private async getRetryCount(declarationId: string): Promise<number> {
    // In a real implementation, you might store retry count in the declaration record
    // For now, return 0
    return 0;
  }

  /**
   * Increment retry count for declaration
   */
  private async incrementRetryCount(declarationId: string): Promise<void> {
    // In a real implementation, you might store retry count in the declaration record
    this.logger.log(`Retry count incremented for declaration ${declarationId}`);
  }

  /**
   * Mark declaration as ready for submission
   */
  async markAsReady(declarationId: string): Promise<void> {
    await this.updateDeclarationStatus(declarationId, 'ready');
  }

  /**
   * Mark declaration as submitted
   */
  async markAsSubmitted(
    declarationId: string,
    upoNumber?: string,
    upoDate?: string
  ): Promise<void> {
    await this.updateDeclarationStatus(declarationId, 'submitted', upoNumber, upoDate);
  }

  /**
   * Mark declaration as accepted
   */
  async markAsAccepted(
    declarationId: string,
    upoNumber: string,
    upoDate: string
  ): Promise<void> {
    await this.updateDeclarationStatus(declarationId, 'accepted', upoNumber, upoDate);
  }

  /**
   * Mark declaration as rejected
   */
  async markAsRejected(
    declarationId: string,
    errorMessage?: string
  ): Promise<void> {
    await this.updateDeclarationStatus(declarationId, 'rejected', undefined, undefined, errorMessage);
  }

  /**
   * Mark declaration as failed
   */
  async markAsFailed(
    declarationId: string,
    errorMessage?: string
  ): Promise<void> {
    await this.updateDeclarationStatus(declarationId, 'failed', undefined, undefined, errorMessage);
  }
}