import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KsefReceiverService } from './ksef-receiver.service';
import { KSeFReceivedInvoiceDto } from './dto/ksef-received-invoice.dto';

interface BatchSubmissionTask {
    id: string;
    tenantId: string;
    companyId: string;
    invoiceIds: string[];
    status: 'pending' | 'processing' | 'completed' | 'failed';
    totalInvoices: number;
    processedInvoices: number;
    failedInvoices: number;
    createdAt: Date;
    completedAt?: Date;
}

interface BatchReceiveTask {
    id: string;
    tenantId: string;
    companyId: string;
    ksefNumbers: string[];
    status: 'pending' | 'processing' | 'completed' | 'failed';
    totalInvoices: number;
    downloadedInvoices: number;
    failedInvoices: number;
    createdAt: Date;
    completedAt?: Date;
}

@Injectable()
export class KsefBatchService {
    private readonly logger = new Logger(KsefBatchService.name);
    private readonly MAX_BATCH_SIZE = 50; // KSeF API limit
    private readonly RATE_LIMIT_DELAY = 1000; // 1 second between requests
    private readonly MAX_CONCURRENT_REQUESTS = 3;

    private submissionTasks: Map<string, BatchSubmissionTask> = new Map();
    private receiveTasks: Map<string, BatchReceiveTask> = new Map();

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private ksefReceiverService: KsefReceiverService,
    ) { }

    /**
     * Download multiple invoices in batch
     */
    async downloadBatchInvoices(
        tenantId: string,
        companyId: string,
        ksefNumbers: string[],
    ): Promise<BatchReceiveTask> {
        const taskId = `batch-receive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        if (ksefNumbers.length > this.MAX_BATCH_SIZE) {
            throw new Error(`Batch size exceeds maximum of ${this.MAX_BATCH_SIZE} invoices`);
        }

        const task: BatchReceiveTask = {
            id: taskId,
            tenantId,
            companyId,
            ksefNumbers,
            status: 'pending',
            totalInvoices: ksefNumbers.length,
            downloadedInvoices: 0,
            failedInvoices: 0,
            createdAt: new Date(),
        };

        this.receiveTasks.set(taskId, task);
        this.logger.log(`Created batch receive task ${taskId} for ${ksefNumbers.length} invoices`);

        // Start processing in background
        this.processBatchReceive(taskId).catch(error => {
            this.logger.error(`Batch receive task ${taskId} failed: ${error.message}`, error.stack);
        });

        return task;
    }

    /**
     * Process batch receive task
     */
    private async processBatchReceive(taskId: string): Promise<void> {
        const task = this.receiveTasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        task.status = 'processing';
        this.logger.log(`Starting batch receive task ${taskId}`);

        try {
            // Process in chunks to respect rate limits
            const chunks = this.chunkArray(task.ksefNumbers, this.MAX_CONCURRENT_REQUESTS);

            for (const chunk of chunks) {
                await Promise.all(
                    chunk.map(async (ksefNumber) => {
                        try {
                            const invoiceData = await this.ksefReceiverService.downloadInvoice(
                                ksefNumber,
                                task.tenantId,
                            );

                            await this.ksefReceiverService.saveReceivedInvoice(
                                invoiceData,
                                task.tenantId,
                                task.companyId,
                            );

                            task.downloadedInvoices++;
                            this.logger.debug(`Downloaded invoice ${ksefNumber} (${task.downloadedInvoices}/${task.totalInvoices})`);
                        } catch (error) {
                            task.failedInvoices++;
                            this.logger.error(`Failed to download invoice ${ksefNumber}: ${error.message}`);
                        }
                    }),
                );

                // Rate limiting delay
                if (chunks.indexOf(chunk) < chunks.length - 1) {
                    await this.delay(this.RATE_LIMIT_DELAY);
                }
            }

            task.status = 'completed';
            task.completedAt = new Date();
            this.logger.log(
                `Batch receive task ${taskId} completed: ${task.downloadedInvoices} downloaded, ${task.failedInvoices} failed`,
            );
        } catch (error) {
            task.status = 'failed';
            task.completedAt = new Date();
            this.logger.error(`Batch receive task ${taskId} failed: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get batch download status
     */
    getBatchReceiveStatus(taskId: string): BatchReceiveTask | null {
        return this.receiveTasks.get(taskId) || null;
    }

    /**
     * Get active batch download tasks for a tenant
     */
    getActiveBatchReceiveTasks(tenantId: string): BatchReceiveTask[] {
        return Array.from(this.receiveTasks.values()).filter(
            task => task.tenantId === tenantId && task.status !== 'completed' && task.status !== 'failed',
        );
    }

    /**
     * Download all new invoices from a date range in batches
     */
    async downloadAllInvoicesInRange(
        tenantId: string,
        companyId: string,
        dateFrom: Date,
        dateTo: Date,
    ): Promise<{ taskIds: string[]; totalInvoices: number }> {
        this.logger.log(`Getting invoice list for range ${dateFrom.toISOString()} to ${dateTo.toISOString()}`);

        // Get list of all invoices in range
        const invoiceList = await this.ksefReceiverService.getIncomingInvoices(tenantId, {
            dateFrom,
            dateTo,
        });

        if (invoiceList.length === 0) {
            this.logger.log('No new invoices found in range');
            return { taskIds: [], totalInvoices: 0 };
        }

        this.logger.log(`Found ${invoiceList.length} invoices, creating batch tasks`);

        // Split into batches
        const batches = this.chunkArray(invoiceList, this.MAX_BATCH_SIZE);
        const taskIds: string[] = [];

        for (const batch of batches) {
            const ksefNumbers = batch.map(inv => inv.ksefNumber);
            const task = await this.downloadBatchInvoices(tenantId, companyId, ksefNumbers);
            taskIds.push(task.id);

            // Small delay between creating batch tasks
            await this.delay(500);
        }

        return {
            taskIds,
            totalInvoices: invoiceList.length,
        };
    }

    /**
     * Get batch processing statistics
     */
    async getBatchStatistics(tenantId: string): Promise<{
        activeTasks: number;
        completedToday: number;
        totalProcessed: number;
        totalFailed: number;
    }> {
        const tasks = Array.from(this.receiveTasks.values()).filter(
            t => t.tenantId === tenantId,
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeTasks = tasks.filter(
            t => t.status === 'processing' || t.status === 'pending',
        ).length;

        const completedToday = tasks.filter(
            t => t.completedAt && t.completedAt >= today,
        ).length;

        const totalProcessed = tasks.reduce((sum, t) => sum + t.downloadedInvoices, 0);
        const totalFailed = tasks.reduce((sum, t) => sum + t.failedInvoices, 0);

        return {
            activeTasks,
            completedToday,
            totalProcessed,
            totalFailed,
        };
    }

    /**
     * Clean up old completed tasks (older than 24 hours)
     */
    cleanupOldTasks(): void {
        const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

        for (const [taskId, task] of this.receiveTasks.entries()) {
            if (
                task.completedAt &&
                task.completedAt.getTime() < cutoffTime
            ) {
                this.receiveTasks.delete(taskId);
                this.logger.debug(`Cleaned up old task ${taskId}`);
            }
        }
    }

    /**
     * Helper: Chunk array into smaller arrays
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Helper: Delay execution
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
