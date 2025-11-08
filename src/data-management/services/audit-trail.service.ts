import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEvent {
  tenantId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface AuditTrailSummary {
  entity: string;
  entityId: string;
  totalEvents: number;
  lastModified: Date;
  lastModifiedBy?: string;
  changeFrequency: number; // Changes per day
}

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);
  private readonly batchSize = 100;

  constructor(private prisma: PrismaService) {}

  async logEvent(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenant_id: event.tenantId,
          company_id: this.extractCompanyId(event),
          user_id: event.userId,
          action: event.action,
          entity: event.entity,
          entityId: event.entityId,
          details: {
            oldValues: event.oldValues,
            newValues: event.newValues,
            metadata: event.metadata,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
          },
          createdAt: event.timestamp,
        },
      });

      // Log significant events
      if (this.isSignificantEvent(event)) {
        this.logger.log(`Significant audit event: ${event.action} on ${event.entity}`, {
          tenantId: event.tenantId,
          entityId: event.entityId,
          userId: event.userId,
        });
      }
    } catch (error) {
      this.logger.error('Failed to log audit event', error);
      // Don't throw - audit logging should not break business logic
    }
  }

  async getAuditTrail(
    entity: string,
    entityId: string,
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      actions?: string[];
    } = {},
  ): Promise<any[]> {
    const where: any = {
      tenant_id: tenantId,
      entity,
      entityId,
    };

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    if (options.userId) {
      where.user_id = options.userId;
    }

    if (options.actions && options.actions.length > 0) {
      where.action = { in: options.actions };
    }

    try {
      return await this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
        include: {
          company: {
            select: { id: true, name: true },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to retrieve audit trail for ${entity}:${entityId}`, error);
      return [];
    }
  }

  async getAuditSummary(
    entity: string,
    entityId: string,
    tenantId: string,
  ): Promise<AuditTrailSummary | null> {
    try {
      const logs = await this.prisma.auditLog.findMany({
        where: {
          tenant_id: tenantId,
          entity,
          entityId,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // For summary calculation
        select: {
          createdAt: true,
          user_id: true,
        },
      });

      if (logs.length === 0) {
        return null;
      }

      const totalEvents = logs.length;
      const lastModified = logs[0].createdAt;
      const lastModifiedBy = logs[0].user_id || undefined;

      // Calculate change frequency (changes per day)
      const oldestLog = logs[logs.length - 1].createdAt;
      const daysDiff = Math.max(1, (lastModified.getTime() - oldestLog.getTime()) / (1000 * 60 * 60 * 24));
      const changeFrequency = totalEvents / daysDiff;

      return {
        entity,
        entityId,
        totalEvents,
        lastModified,
        lastModifiedBy,
        changeFrequency,
      };
    } catch (error) {
      this.logger.error(`Failed to get audit summary for ${entity}:${entityId}`, error);
      return null;
    }
  }

  async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          // Keep logs for critical entities longer
          OR: [
            {
              entity: {
                notIn: ['invoice', 'declaration', 'auditLog'],
              },
            },
            {
              createdAt: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days for critical entities
              },
            },
          ],
        },
      });

      this.logger.log(`Cleaned up ${result.count} old audit logs`);
      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup old audit logs', error);
      return 0;
    }
  }

  async exportAuditTrail(
    tenantId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      entities?: string[];
      format?: 'json' | 'csv';
    } = {},
  ): Promise<any> {
    const where: any = {
      tenant_id: tenantId,
    };

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    if (options.entities && options.entities.length > 0) {
      where.entity = { in: options.entities };
    }

    try {
      const logs = await this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          company: {
            select: { id: true, name: true },
          },
        },
      });

      if (options.format === 'csv') {
        return this.convertToCSV(logs);
      }

      return logs;
    } catch (error) {
      this.logger.error('Failed to export audit trail', error);
      throw error;
    }
  }

  async detectAnomalies(tenantId: string, days: number = 30): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get audit logs for analysis
      const logs = await this.prisma.auditLog.findMany({
        where: {
          tenant_id: tenantId,
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          action: true,
          entity: true,
          user_id: true,
          createdAt: true,
          details: true,
        },
      });

      const anomalies: any[] = [];

      // Detect unusual patterns
      anomalies.push(...this.detectUnusualActivity(logs));
      anomalies.push(...this.detectFrequentChanges(logs));
      anomalies.push(...this.detectSuspiciousActions(logs));

      return anomalies;
    } catch (error) {
      this.logger.error('Failed to detect audit anomalies', error);
      return [];
    }
  }

  private detectUnusualActivity(logs: any[]): any[] {
    const anomalies: any[] = [];
    const userActivity = new Map<string, any[]>();

    // Group logs by user
    logs.forEach(log => {
      if (log.user_id) {
        if (!userActivity.has(log.user_id)) {
          userActivity.set(log.user_id, []);
        }
        userActivity.get(log.user_id)!.push(log);
      }
    });

    // Detect users with unusually high activity
    const avgActivityPerUser = logs.length / userActivity.size;
    const threshold = avgActivityPerUser * 3; // 3x average

    for (const [userId, userLogs] of userActivity) {
      if (userLogs.length > threshold) {
        anomalies.push({
          type: 'unusual_activity',
          userId,
          activityCount: userLogs.length,
          averageActivity: avgActivityPerUser,
          period: '30 days',
          severity: 'medium',
        });
      }
    }

    return anomalies;
  }

  private detectFrequentChanges(logs: any[]): any[] {
    const anomalies: any[] = [];
    const entityChanges = new Map<string, any[]>();

    // Group logs by entity
    logs.forEach(log => {
      const key = `${log.entity}:${log.entityId || 'unknown'}`;
      if (!entityChanges.has(key)) {
        entityChanges.set(key, []);
      }
      entityChanges.get(key)!.push(log);
    });

    // Detect entities with frequent changes
    for (const [entityKey, entityLogs] of entityChanges) {
      if (entityLogs.length > 20) { // More than 20 changes in 30 days
        const uniqueUsers = new Set(entityLogs.map(log => log.user_id).filter(Boolean));
        const timeSpan = this.getTimeSpan(entityLogs);

        anomalies.push({
          type: 'frequent_changes',
          entity: entityKey,
          changeCount: entityLogs.length,
          uniqueUsers: uniqueUsers.size,
          timeSpanHours: timeSpan,
          severity: 'low',
        });
      }
    }

    return anomalies;
  }

  private detectSuspiciousActions(logs: any[]): any[] {
    const anomalies: any[] = [];
    const suspiciousActions = ['DELETE', 'BULK_DELETE', 'PERMISSION_CHANGE'];

    logs.forEach(log => {
      if (suspiciousActions.includes(log.action)) {
        // Check for bulk operations
        if (log.details?.count > 10) {
          anomalies.push({
            type: 'bulk_operation',
            action: log.action,
            userId: log.user_id,
            count: log.details.count,
            severity: 'high',
          });
        }

        // Check for operations outside business hours (if timestamp available)
        if (this.isOutsideBusinessHours(log.createdAt)) {
          anomalies.push({
            type: 'outside_business_hours',
            action: log.action,
            userId: log.user_id,
            timestamp: log.createdAt,
            severity: 'medium',
          });
        }
      }
    });

    return anomalies;
  }

  private isSignificantEvent(event: AuditEvent): boolean {
    const significantActions = [
      'CREATE', 'DELETE', 'BULK_DELETE',
      'PERMISSION_CHANGE', 'ROLE_CHANGE',
      'COMPANY_SETTINGS_UPDATE', 'TAX_SETTINGS_UPDATE'
    ];

    return significantActions.includes(event.action);
  }

  private extractCompanyId(event: AuditEvent): string | undefined {
    // Extract company ID from entity if it's company-related
    if (event.entity === 'company') {
      return event.entityId;
    }

    // Extract from metadata or context
    if (event.metadata?.companyId) {
      return event.metadata.companyId;
    }

    return undefined;
  }

  private getTimeSpan(logs: any[]): number {
    if (logs.length === 0) return 0;

    const timestamps = logs.map(log => log.createdAt.getTime()).sort();
    const oldest = timestamps[0];
    const newest = timestamps[timestamps.length - 1];

    return (newest - oldest) / (1000 * 60 * 60); // Hours
  }

  private isOutsideBusinessHours(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    // Business hours: 8 AM to 6 PM
    return hour < 8 || hour > 18;
  }

  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'timestamp', 'tenant_id', 'user_id', 'action', 'entity',
      'entityId', 'company_name', 'details'
    ];

    const rows = logs.map(log => [
      log.createdAt.toISOString(),
      log.tenant_id,
      log.user_id || '',
      log.action,
      log.entity,
      log.entityId,
      log.company?.name || '',
      JSON.stringify(log.details || {}),
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
  }

  // Polish tax compliance: Enhanced audit trail for tax-related operations
  async logTaxEvent(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entity: 'taxCalculation' | 'vatRegister' | 'declaration' | 'company',
    entityId: string,
    oldValues?: any,
    newValues?: any,
    metadata?: any,
  ): Promise<void> {
    await this.logEvent({
      tenantId,
      userId,
      action,
      entity,
      entityId,
      oldValues,
      newValues,
      metadata: {
        ...metadata,
        taxCompliance: true,
        requiresRetention: true, // Tax records must be retained longer
      },
      timestamp: new Date(),
    });
  }

  async getTaxAuditTrail(
    tenantId: string,
    period?: string,
    entityType?: string,
  ): Promise<any[]> {
    const where: any = {
      tenant_id: tenantId,
      details: {
        path: ['taxCompliance'],
        equals: true,
      },
    };

    if (period) {
      // Filter by period in metadata or created date
      where.OR = [
        {
          details: {
            path: ['period'],
            equals: period,
          },
        },
        {
          createdAt: {
            gte: new Date(`${period}-01`),
            lt: new Date(`${period}-01`).setMonth(new Date(`${period}-01`).getMonth() + 1),
          },
        },
      ];
    }

    if (entityType) {
      where.entity = entityType;
    }

    return await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { id: true, name: true, nip: true },
        },
      },
    });
  }
}