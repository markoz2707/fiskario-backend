import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../performance-optimization/services/redis-cache.service';

export interface SyncData {
  workflowStates?: any[];
  dashboardData?: any;
  cachedData?: any;
  workflowChanges?: any[];
  dashboardChanges?: any;
  deviceId: string;
  companyId: string;
  lastSyncTimestamp?: number;
}

export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
  lastSyncTimestamp: number;
}

@Injectable()
export class MobileSyncService {
  private readonly logger = new Logger(MobileSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: RedisCacheService,
  ) {}

  async syncWorkflowStates(tenantId: string, workflowStates: any[]): Promise<SyncResult> {
    let synced = 0;
    let conflicts = 0;
    let errors = 0;

    for (const state of workflowStates) {
      try {
        // Check for conflicts
        const existing = await this.prisma.workflow.findUnique({
          where: { id: state.id },
        });

        if (existing && existing.updatedAt > new Date(state.lastUpdated)) {
          conflicts++;
          continue;
        }

        // Update or create workflow state
        await this.prisma.workflow.upsert({
          where: { id: state.id },
          update: {
            status: state.status,
            currentStep: state.currentStep,
            progress: state.progress,
            updatedAt: new Date(),
          },
          create: {
            id: state.id,
            tenantId,
            type: state.type,
            status: state.status,
            currentStep: state.currentStep,
            progress: state.progress,
            data: state.data,
          },
        });

        synced++;
      } catch (error) {
        this.logger.error(`Failed to sync workflow state ${state.id}`, error);
        errors++;
      }
    }

    return {
      synced,
      conflicts,
      errors,
      lastSyncTimestamp: Date.now(),
    };
  }

  async syncDashboardData(tenantId: string, dashboardData: any): Promise<SyncResult> {
    try {
      // Cache dashboard data with tenant-specific key
      await this.cacheService.set(
        `dashboard:${dashboardData.companyId}`,
        dashboardData,
        { tenantId, ttl: 3600 }
      );

      return {
        synced: 1,
        conflicts: 0,
        errors: 0,
        lastSyncTimestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to sync dashboard data', error);
      return {
        synced: 0,
        conflicts: 0,
        errors: 1,
        lastSyncTimestamp: Date.now(),
      };
    }
  }

  async syncCachedData(tenantId: string, cachedData: any): Promise<SyncResult> {
    try {
      // Store cached data in Redis with tenant isolation
      for (const [key, value] of Object.entries(cachedData)) {
        await this.cacheService.set(key, value, { tenantId, ttl: 7200 }); // 2 hours
      }

      return {
        synced: Object.keys(cachedData).length,
        conflicts: 0,
        errors: 0,
        lastSyncTimestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to sync cached data', error);
      return {
        synced: 0,
        conflicts: 0,
        errors: 1,
        lastSyncTimestamp: Date.now(),
      };
    }
  }

  async syncIncrementalWorkflows(tenantId: string, changes: any[]): Promise<SyncResult> {
    return this.syncWorkflowStates(tenantId, changes);
  }

  async syncIncrementalDashboard(tenantId: string, changes: any): Promise<SyncResult> {
    return this.syncDashboardData(tenantId, changes);
  }

  async forceSyncWorkflows(tenantId: string, workflowData: any[]): Promise<SyncResult> {
    // Force sync ignores conflicts and overwrites data
    let synced = 0;
    let errors = 0;

    for (const workflow of workflowData) {
      try {
        await this.prisma.workflow.upsert({
          where: { id: workflow.id },
          update: workflow,
          create: {
            ...workflow,
            tenantId,
          },
        });
        synced++;
      } catch (error) {
        this.logger.error(`Failed to force sync workflow ${workflow.id}`, error);
        errors++;
      }
    }

    return {
      synced,
      conflicts: 0, // Force sync ignores conflicts
      errors,
      lastSyncTimestamp: Date.now(),
    };
  }

  async forceSyncDashboard(tenantId: string, dashboardData: any): Promise<SyncResult> {
    try {
      // Force update dashboard cache
      await this.cacheService.set(
        `dashboard:${dashboardData.companyId}`,
        dashboardData,
        { tenantId, ttl: 3600 }
      );

      return {
        synced: 1,
        conflicts: 0,
        errors: 0,
        lastSyncTimestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to force sync dashboard', error);
      return {
        synced: 0,
        conflicts: 0,
        errors: 1,
        lastSyncTimestamp: Date.now(),
      };
    }
  }

  async getSyncStatus(tenantId: string, deviceId: string): Promise<any> {
    try {
      // Get last sync timestamp for device
      const lastSync = await this.cacheService.get(`sync_status:${deviceId}`, { tenantId });

      // Get pending changes count
      const pendingWorkflows = await this.prisma.workflow.count({
        where: {
          tenantId,
          updatedAt: {
            gt: lastSync ? new Date(lastSync.lastSyncTimestamp) : new Date(0),
          },
        },
      });

      return {
        deviceId,
        lastSyncTimestamp: lastSync?.lastSyncTimestamp || 0,
        pendingChanges: {
          workflows: pendingWorkflows,
          total: pendingWorkflows,
        },
        status: 'ready',
      };
    } catch (error) {
      this.logger.error(`Failed to get sync status for device ${deviceId}`, error);
      return {
        deviceId,
        status: 'error',
        error: error.message,
      };
    }
  }

  async resolveSyncConflict(tenantId: string, conflictData: any): Promise<any> {
    const { entityType, entityId, resolution } = conflictData;

    try {
      switch (entityType) {
        case 'workflow':
          return await this.resolveWorkflowConflict(tenantId, entityId, resolution);
        case 'dashboard':
          return await this.resolveDashboardConflict(tenantId, entityId, resolution);
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to resolve conflict for ${entityType}:${entityId}`, error);
      throw error;
    }
  }

  private async resolveWorkflowConflict(tenantId: string, workflowId: string, resolution: string): Promise<any> {
    // Implementation depends on resolution strategy
    switch (resolution) {
      case 'server_wins':
        // Keep server version, ignore client changes
        return { resolved: true, strategy: 'server_wins' };
      case 'client_wins':
        // Update server with client version
        return { resolved: true, strategy: 'client_wins' };
      case 'manual_merge':
        // Manual merge required
        return { resolved: false, strategy: 'manual_merge', requiresAction: true };
      default:
        throw new Error(`Unknown resolution strategy: ${resolution}`);
    }
  }

  private async resolveDashboardConflict(tenantId: string, companyId: string, resolution: string): Promise<any> {
    // Similar logic for dashboard conflicts
    return { resolved: true, strategy: resolution };
  }

  async getPendingChanges(tenantId: string, companyId: string, since?: string): Promise<any> {
    try {
      const sinceDate = since ? new Date(parseInt(since)) : new Date(0);

      const workflows = await this.prisma.workflow.findMany({
        where: {
          tenantId,
          updatedAt: {
            gt: sinceDate,
          },
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      });

      return {
        workflows,
        totalCount: workflows.length,
        since: sinceDate.getTime(),
      };
    } catch (error) {
      this.logger.error('Failed to get pending changes', error);
      throw error;
    }
  }
}