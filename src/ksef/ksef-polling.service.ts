import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KsefReceiverService } from './ksef-receiver.service';
import { KsefService } from './ksef.service';

export interface SyncStatus {
    lastSyncTime: Date;
    nextSyncTime: Date;
    status: 'idle' | 'running' | 'error';
    lastSyncResult?: {
        totalFound: number;
        newInvoices: number;
        errors: number;
    };
}

@Injectable()
export class KsefPollingService {
    private readonly logger = new Logger(KsefPollingService.name);
    private syncInProgress = false;
    private syncStatus: Map<string, SyncStatus> = new Map();

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private ksefReceiverService: KsefReceiverService,
        private ksefService: KsefService,
    ) { }

    /**
     * Scheduled job to sync invoices every 15 minutes
     */
    @Cron('*/15 * * * *', {
        name: 'ksef-invoice-sync',
    })
    async handleScheduledSync() {
        if (this.syncInProgress) {
            this.logger.warn('Sync already in progress, skipping this cycle');
            return;
        }

        this.logger.log('Starting scheduled KSeF invoice sync');
        this.syncInProgress = true;

        try {
            await this.syncAllActiveCompanies();
        } catch (error) {
            this.logger.error(`Scheduled sync failed: ${error.message}`, error.stack);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Sync invoices for all active companies
     */
    async syncAllActiveCompanies(): Promise<void> {
        try {
            // Get all active companies with KSeF enabled
            const companies = await this.prisma.company.findMany({
                where: {
                    isActive: true,
                    // Add a field to track KSeF status if needed
                },
                select: {
                    id: true,
                    tenant_id: true,
                    name: true,
                    nip: true,
                },
            });

            this.logger.log(`Found ${companies.length} active companies for sync`);

            for (const company of companies) {
                try {
                    await this.syncCompanyInvoices(company.tenant_id, company.id);

                    // Small delay between companies to avoid rate limiting
                    await this.delay(1000);
                } catch (error) {
                    this.logger.error(
                        `Failed to sync company ${company.name} (${company.id}): ${error.message}`,
                        error.stack,
                    );
                    // Continue with next company
                }
            }

            this.logger.log('Completed sync for all companies');
        } catch (error) {
            this.logger.error(`Failed to sync companies: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Sync invoices for a specific company
     */
    async syncCompanyInvoices(tenantId: string, companyId: string): Promise<void> {
        const syncKey = `${tenantId}:${companyId}`;

        try {
            // Update sync status
            this.updateSyncStatus(syncKey, 'running');

            // Get last sync time from status or default to 24 hours ago
            const lastSync = this.syncStatus.get(syncKey)?.lastSyncTime || new Date(Date.now() - 24 * 60 * 60 * 1000);

            this.logger.log(`Syncing invoices for company ${companyId} since ${lastSync.toISOString()}`);

            // Perform sync
            const result = await this.ksefReceiverService.processNewInvoices(
                tenantId,
                companyId,
                {
                    dateFrom: lastSync,
                    dateTo: new Date(),
                    forceSync: false,
                },
            );

            this.logger.log(
                `Sync completed for company ${companyId}: ${result.newInvoices} new invoices, ${result.totalFound} total`,
            );

            // Update sync status with results
            this.updateSyncStatus(syncKey, 'idle', {
                totalFound: result.totalFound,
                newInvoices: result.newInvoices,
                errors: 0,
            });

            // Send notifications if new invoices found
            if (result.newInvoices > 0) {
                await this.sendNewInvoiceNotifications(tenantId, companyId, result.newInvoices);
            }
        } catch (error) {
            this.logger.error(
                `Sync failed for company ${companyId}: ${error.message}`,
                error.stack,
            );

            this.updateSyncStatus(syncKey, 'error', {
                totalFound: 0,
                newInvoices: 0,
                errors: 1,
            });

            // Send error notification
            await this.sendSyncErrorNotification(tenantId, companyId, error.message);
        }
    }

    /**
     * Update sync status for a company
     */
    private updateSyncStatus(
        syncKey: string,
        status: 'idle' | 'running' | 'error',
        result?: { totalFound: number; newInvoices: number; errors: number },
    ): void {
        const now = new Date();
        const nextSync = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now

        this.syncStatus.set(syncKey, {
            lastSyncTime: now,
            nextSyncTime: nextSync,
            status,
            lastSyncResult: result,
        });
    }

    /**
     * Get sync status for a company
     */
    getSyncStatus(tenantId: string, companyId: string): SyncStatus | null {
        const syncKey = `${tenantId}:${companyId}`;
        return this.syncStatus.get(syncKey) || null;
    }

    /**
     * Manually trigger sync for a company
     */
    async triggerManualSync(tenantId: string, companyId: string): Promise<void> {
        this.logger.log(`Manual sync triggered for company ${companyId}`);
        await this.syncCompanyInvoices(tenantId, companyId);
    }

    /**
     * Send notifications about new invoices
     */
    private async sendNewInvoiceNotifications(
        tenantId: string,
        companyId: string,
        count: number,
    ): Promise<void> {
        try {
            // Create notification record
            // This will be enhanced when we implement the notification service
            this.logger.log(`Creating notification for ${count} new invoices in company ${companyId}`);

            // For now, just log - will integrate with notifications service later
            // await this.notificationsService.create({
            //   tenant_id: tenantId,
            //   type: 'new_invoice_received',
            //   title: 'Nowe faktury z KSeF',
            //   body: `Otrzymano ${count} nowych faktur`,
            //   data: { companyId, count },
            // });
        } catch (error) {
            this.logger.error(`Failed to send notifications: ${error.message}`);
        }
    }

    /**
     * Send error notification
     */
    private async sendSyncErrorNotification(
        tenantId: string,
        companyId: string,
        errorMessage: string,
    ): Promise<void> {
        try {
            this.logger.log(`Creating error notification for company ${companyId}`);

            // For now, just log - will integrate with notifications service later
            // await this.notificationsService.create({
            //   tenant_id: tenantId,
            //   type: 'ksef_sync_error',
            //   title: 'Błąd synchronizacji KSeF',
            //   body: `Synchronizacja faktur nie powiodła się: ${errorMessage}`,
            //   priority: 'high',
            //   data: { companyId, error: errorMessage },
            // });
        } catch (error) {
            this.logger.error(`Failed to send error notification: ${error.message}`);
        }
    }

    /**
     * Get sync statistics for dashboard
     */
    async getSyncStatistics(tenantId: string): Promise<{
        totalCompanies: number;
        activeSync: number;
        lastSyncTime: Date | null;
        totalInvoicesThisWeek: number;
    }> {
        const companies = await this.prisma.company.findMany({
            where: {
                tenant_id: tenantId,
                isActive: true,
            },
        });

        const activeSync = Array.from(this.syncStatus.values()).filter(
            s => s.status === 'running',
        ).length;

        const invoices = await this.prisma.invoice.count({
            where: {
                tenant_id: tenantId,
                receivedFromKsef: true,
                ksefDownloadDate: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            },
        });

        const lastSyncTimes = Array.from(this.syncStatus.values())
            .map(s => s.lastSyncTime)
            .filter(t => t);

        const lastSyncTime = lastSyncTimes.length > 0
            ? new Date(Math.max(...lastSyncTimes.map(t => t.getTime())))
            : null;

        return {
            totalCompanies: companies.length,
            activeSync,
            lastSyncTime,
            totalInvoicesThisWeek: invoices,
        };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
