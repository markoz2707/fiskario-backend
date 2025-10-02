import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KsefService } from './ksef.service';
import { KSeFInvoiceDto } from './dto/ksef-invoice.dto';

interface RetryTask {
  id: string;
  tenant_id: string;
  type: string;
  payload: any;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
}

@Injectable()
export class KsefRetryService {
  private readonly logger = new Logger(KsefRetryService.name);
  private readonly maxRetries = 5;
  private readonly baseDelayMs = 5000; // 5 seconds

  constructor(
    private prisma: PrismaService,
    private ksefService: KsefService,
  ) {}

  /**
   * Schedule a KSeF submission for retry
   */
  async scheduleRetry(tenantId: string, invoiceDto: KSeFInvoiceDto, retryCount = 0): Promise<void> {
    const delayMs = this.calculateDelay(retryCount);

    await this.prisma.taskQueue.create({
      data: {
        tenant_id: tenantId,
        type: 'ksef_submission_retry',
        payload: {
          invoiceDto,
          retryCount,
          maxRetries: this.maxRetries,
        },
        status: 'pending',
        priority: 1,
      },
    });

    this.logger.log(
      `Scheduled KSeF retry for invoice ${invoiceDto.invoiceNumber} in ${delayMs}ms (attempt ${retryCount + 1})`
    );
  }

  /**
   * Process pending retry tasks
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processRetryQueue(): Promise<void> {
    this.logger.debug('Processing KSeF retry queue...');

    const pendingTasks = await this.prisma.taskQueue.findMany({
      where: {
        type: 'ksef_submission_retry',
        status: 'pending',
        nextRetryAt: {
          lte: new Date(),
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 10, // Process 10 tasks at a time
    });

    for (const task of pendingTasks) {
      await this.processRetryTask(task);
    }
  }

  /**
   * Process a single retry task
   */
  private async processRetryTask(task: RetryTask): Promise<void> {
    try {
      this.logger.log(`Processing retry task ${task.id} for invoice ${task.payload.invoiceDto.invoiceNumber}`);

      // Mark task as processing
      await this.prisma.taskQueue.update({
        where: { id: task.id },
        data: { status: 'processing' },
      });

      // Attempt to submit invoice
      await this.ksefService.submitInvoice(task.payload.invoiceDto, task.tenant_id);

      // Success - mark as completed
      await this.prisma.taskQueue.update({
        where: { id: task.id },
        data: { status: 'completed' },
      });

      this.logger.log(`Successfully submitted invoice ${task.payload.invoiceDto.invoiceNumber} on retry ${task.retryCount + 1}`);

    } catch (error) {
      this.logger.error(`Retry attempt ${task.retryCount + 1} failed for invoice ${task.payload.invoiceDto.invoiceNumber}`, error);

      if (task.retryCount < task.maxRetries - 1) {
        // Schedule next retry
        await this.scheduleNextRetry(task);
      } else {
        // Max retries reached - mark as failed
        await this.prisma.taskQueue.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            retryCount: task.retryCount + 1,
          },
        });

        // Update invoice status
        await this.prisma.invoice.updateMany({
          where: {
            tenant_id: task.tenant_id,
            number: task.payload.invoiceDto.invoiceNumber,
          },
          data: {
            ksefStatus: 'failed',
          },
        });

        this.logger.error(`Max retries reached for invoice ${task.payload.invoiceDto.invoiceNumber}`);
      }
    }
  }

  /**
   * Schedule the next retry with exponential backoff
   */
  private async scheduleNextRetry(task: RetryTask): Promise<void> {
    const nextRetryCount = task.retryCount + 1;
    const delayMs = this.calculateDelay(nextRetryCount);

    await this.prisma.taskQueue.update({
      where: { id: task.id },
      data: {
        status: 'pending',
        retryCount: nextRetryCount,
        nextRetryAt: new Date(Date.now() + delayMs),
      },
    });

    this.logger.log(
      `Scheduled next retry for invoice ${task.payload.invoiceDto.invoiceNumber} in ${delayMs}ms (attempt ${nextRetryCount + 1})`
    );
  }

  /**
   * Calculate delay for retry attempt using exponential backoff
   */
  private calculateDelay(retryCount: number): number {
    // Exponential backoff: baseDelay * 2^retryCount + jitter
    const exponentialDelay = this.baseDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 300000); // Cap at 5 minutes
  }

  /**
   * Get retry statistics for a tenant
   */
  async getRetryStats(tenantId: string): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
  }> {
    const stats = await this.prisma.taskQueue.groupBy({
      by: ['status'],
      where: {
        tenant_id: tenantId,
        type: 'ksef_submission_retry',
      },
      _count: {
        status: true,
      },
    });

    const result = {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
    };

    stats.forEach((stat) => {
      result[stat.status as keyof typeof result] = stat._count.status;
    });

    return result;
  }

  /**
   * Manually retry a failed submission
   */
  async manualRetry(tenantId: string, invoiceNumber: string): Promise<void> {
    // Find the failed task
    const failedTask = await this.prisma.taskQueue.findFirst({
      where: {
        tenant_id: tenantId,
        type: 'ksef_submission_retry',
        status: 'failed',
        payload: {
          path: ['invoiceDto', 'invoiceNumber'],
          equals: invoiceNumber,
        },
      },
    });

    if (!failedTask) {
      throw new Error(`No failed retry task found for invoice ${invoiceNumber}`);
    }

    // Reset the task for retry
    await this.prisma.taskQueue.update({
      where: { id: failedTask.id },
      data: {
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
      },
    });

    this.logger.log(`Manual retry scheduled for invoice ${invoiceNumber}`);
  }
}