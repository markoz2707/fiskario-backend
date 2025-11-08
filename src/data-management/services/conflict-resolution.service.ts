import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConflictData {
  entityType: string;
  entityId: string;
  tenantId: string;
  localVersion: any;
  remoteVersion: any;
  conflictFields: string[];
  timestamp: Date;
}

export interface ConflictResolution {
  strategy: 'local' | 'remote' | 'merge' | 'manual';
  resolvedData: any;
  resolutionNotes?: string;
}

@Injectable()
export class ConflictResolutionService {
  private readonly logger = new Logger(ConflictResolutionService.name);
  private readonly conflictQueue: ConflictData[] = [];

  constructor(private prisma: PrismaService) {}

  async detectConflicts(
    entityType: string,
    entityId: string,
    tenantId: string,
    localData: any,
    remoteData: any,
  ): Promise<ConflictData | null> {
    const conflictFields = this.compareEntities(localData, remoteData);

    if (conflictFields.length > 0) {
      const conflict: ConflictData = {
        entityType,
        entityId,
        tenantId,
        localVersion: localData,
        remoteVersion: remoteData,
        conflictFields,
        timestamp: new Date(),
      };

      this.conflictQueue.push(conflict);
      this.logger.warn(`Conflict detected for ${entityType}:${entityId}`, {
        tenantId,
        conflictFields,
      });

      return conflict;
    }

    return null;
  }

  async resolveConflict(
    conflict: ConflictData,
    resolution: ConflictResolution,
  ): Promise<any> {
    try {
      let resolvedData: any;

      switch (resolution.strategy) {
        case 'local':
          resolvedData = conflict.localVersion;
          break;
        case 'remote':
          resolvedData = conflict.remoteVersion;
          break;
        case 'merge':
          resolvedData = this.mergeEntities(conflict.localVersion, conflict.remoteVersion);
          break;
        case 'manual':
          resolvedData = resolution.resolvedData;
          break;
        default:
          throw new Error(`Unknown resolution strategy: ${resolution.strategy}`);
      }

      // Update the entity with resolved data
      await this.updateEntity(conflict, resolvedData);

      // Log the resolution
      await this.logResolution(conflict, resolution);

      // Remove from queue
      this.removeFromQueue(conflict);

      this.logger.log(`Conflict resolved for ${conflict.entityType}:${conflict.entityId}`, {
        strategy: resolution.strategy,
        tenantId: conflict.tenantId,
      });

      return resolvedData;
    } catch (error) {
      this.logger.error(`Error resolving conflict for ${conflict.entityType}:${conflict.entityId}`, error);
      throw error;
    }
  }

  async autoResolveConflicts(): Promise<number> {
    let resolvedCount = 0;

    for (const conflict of this.conflictQueue.slice()) {
      try {
        const resolution = this.determineAutoResolution(conflict);
        if (resolution) {
          await this.resolveConflict(conflict, resolution);
          resolvedCount++;
        }
      } catch (error) {
        this.logger.error(`Auto-resolution failed for conflict ${conflict.entityType}:${conflict.entityId}`, error);
      }
    }

    return resolvedCount;
  }

  private compareEntities(local: any, remote: any): string[] {
    const conflicts: string[] = [];
    const allFields = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const field of allFields) {
      const localValue = local[field];
      const remoteValue = remote[field];

      // Skip certain fields that are expected to differ
      if (['updatedAt', 'version', 'lastModified'].includes(field)) {
        continue;
      }

      if (!this.areValuesEqual(localValue, remoteValue)) {
        conflicts.push(field);
      }
    }

    return conflicts;
  }

  private areValuesEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a == null || b == null) return a === b;

    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((val, idx) => this.areValuesEqual(val, b[idx]));
      }

      if (!Array.isArray(a) && !Array.isArray(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) return false;

        return keysA.every(key => this.areValuesEqual(a[key], b[key]));
      }
    }

    return false;
  }

  private mergeEntities(local: any, remote: any): any {
    const merged = { ...remote }; // Start with remote as base

    for (const [key, localValue] of Object.entries(local)) {
      const remoteValue = remote[key];

      if (remoteValue === undefined) {
        // Local has a field remote doesn't - keep it
        merged[key] = localValue;
      } else if (this.areValuesEqual(localValue, remoteValue)) {
        // Values are the same - keep either
        merged[key] = localValue;
      } else {
        // Conflict - prefer local for certain fields, remote for others
        if (this.shouldPreferLocal(key)) {
          merged[key] = localValue;
        } else {
          merged[key] = remoteValue;
        }
      }
    }

    return merged;
  }

  private shouldPreferLocal(field: string): boolean {
    // Prefer local version for user-specific or recently modified fields
    const localPreferredFields = [
      'notes', 'description', 'internalComments',
      'lastModifiedBy', 'localStatus'
    ];

    return localPreferredFields.includes(field);
  }

  private async updateEntity(conflict: ConflictData, resolvedData: any): Promise<void> {
    const model = this.getModelForEntityType(conflict.entityType);

    await model.update({
      where: {
        id: conflict.entityId,
        tenant_id: conflict.tenantId,
      },
      data: resolvedData,
    });
  }

  private async logResolution(conflict: ConflictData, resolution: ConflictResolution): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenant_id: conflict.tenantId,
        action: 'CONFLICT_RESOLVED',
        entity: conflict.entityType,
        entityId: conflict.entityId,
        details: {
          conflictFields: conflict.conflictFields,
          resolutionStrategy: resolution.strategy,
          resolutionNotes: resolution.resolutionNotes,
          timestamp: conflict.timestamp,
        },
      },
    });
  }

  private determineAutoResolution(conflict: ConflictData): ConflictResolution | null {
    // Auto-resolve if only certain fields conflict
    const autoResolvableFields = ['updatedAt', 'lastSync', 'syncVersion'];

    if (conflict.conflictFields.every(field => autoResolvableFields.includes(field))) {
      return {
        strategy: 'remote',
        resolvedData: conflict.remoteVersion,
        resolutionNotes: 'Auto-resolved: only timestamp fields conflicted',
      };
    }

    // Auto-resolve if local and remote are identical except for expected differences
    if (this.canAutoMerge(conflict)) {
      return {
        strategy: 'merge',
        resolvedData: this.mergeEntities(conflict.localVersion, conflict.remoteVersion),
        resolutionNotes: 'Auto-merged: compatible differences',
      };
    }

    return null; // Requires manual resolution
  }

  private canAutoMerge(conflict: ConflictData): boolean {
    // Check if the conflicting fields can be safely merged
    return conflict.conflictFields.every(field =>
      !['id', 'tenant_id', 'createdAt'].includes(field)
    );
  }

  private removeFromQueue(conflict: ConflictData): void {
    const index = this.conflictQueue.findIndex(c =>
      c.entityType === conflict.entityType &&
      c.entityId === conflict.entityId &&
      c.tenantId === conflict.tenantId
    );

    if (index > -1) {
      this.conflictQueue.splice(index, 1);
    }
  }

  private getModelForEntityType(entityType: string): any {
    const modelMap = {
      company: this.prisma.company,
      invoice: this.prisma.invoice,
      buyer: this.prisma.buyer,
      declaration: this.prisma.declaration,
      zusEmployee: this.prisma.zUSEmployee,
      taxCalculation: this.prisma.taxCalculation,
    };

    const model = modelMap[entityType];
    if (!model) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    return model;
  }

  // Polish tax compliance: Handle conflicts in tax-related data
  async resolveTaxDataConflict(
    entityType: 'taxCalculation' | 'vatRegister' | 'declaration',
    entityId: string,
    tenantId: string,
    localData: any,
    remoteData: any,
  ): Promise<any> {
    const conflict = await this.detectConflicts(entityType, entityId, tenantId, localData, remoteData);

    if (!conflict) {
      return localData; // No conflict
    }

    // For tax data, prefer the version with more complete information
    const localCompleteness = this.calculateDataCompleteness(localData);
    const remoteCompleteness = this.calculateDataCompleteness(remoteData);

    const strategy = localCompleteness >= remoteCompleteness ? 'local' : 'remote';

    return this.resolveConflict(conflict, {
      strategy: strategy as 'local' | 'remote',
      resolvedData: strategy === 'local' ? localData : remoteData,
      resolutionNotes: `Tax data conflict resolved by preferring ${strategy} version (completeness: local=${localCompleteness}, remote=${remoteCompleteness})`,
    });
  }

  private calculateDataCompleteness(data: any): number {
    let completeness = 0;
    const fields = Object.keys(data);

    for (const field of fields) {
      if (data[field] !== null && data[field] !== undefined && data[field] !== '') {
        completeness++;
      }
    }

    return completeness / fields.length;
  }

  getPendingConflicts(): ConflictData[] {
    return [...this.conflictQueue];
  }

  getConflictStats(): { total: number; byEntityType: Record<string, number> } {
    const byEntityType: Record<string, number> = {};

    for (const conflict of this.conflictQueue) {
      byEntityType[conflict.entityType] = (byEntityType[conflict.entityType] || 0) + 1;
    }

    return {
      total: this.conflictQueue.length,
      byEntityType,
    };
  }
}