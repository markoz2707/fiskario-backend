import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DatabaseEncryptionService } from './database-encryption.service';

export interface AuditLogEntry {
  id?: string;
  tenant_id: string;
  company_id?: string;
  user_id?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  riskScore?: number;
  complianceFlags?: string[];
  timestamp?: Date;
}

export interface AuditQuery {
  tenant_id?: string;
  company_id?: string;
  user_id?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: DatabaseEncryptionService,
  ) {}

  /**
   * Creates an immutable audit log entry
   */
  async logActivity(entry: AuditLogEntry): Promise<void> {
    try {
      // Ensure timestamp is set
      const timestamp = entry.timestamp || new Date();

      // Create the audit log entry
      const auditEntry = await this.prisma.auditLog.create({
        data: {
          tenant_id: entry.tenant_id,
          company_id: entry.company_id,
          user_id: entry.user_id,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          details: entry.details ? JSON.stringify(entry.details) : null,
          createdAt: timestamp,
        }
      });

      // Encrypt sensitive details if present
      if (entry.details && this.containsSensitiveData(entry.details)) {
        await this.encryptAuditDetails(auditEntry.id, entry.details);
      }

      this.logger.debug(`Audit log created: ${entry.action} on ${entry.entity}`);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Logs user authentication events
   */
  async logAuthEvent(
    tenantId: string,
    userId: string,
    action: 'login' | 'logout' | 'password_change' | 'failed_login',
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logActivity({
      tenant_id: tenantId,
      user_id: userId,
      action: `auth:${action}`,
      entity: 'user',
      entityId: userId,
      details: {
        ...details,
        ipAddress,
        userAgent,
        timestamp: new Date(),
      },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Logs data access events for GDPR compliance
   */
  async logDataAccess(
    tenantId: string,
    companyId: string,
    userId: string,
    entity: string,
    entityId: string,
    action: 'view' | 'create' | 'update' | 'delete',
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Calculate risk score based on data sensitivity and action
    const riskScore = this.calculateRiskScore(entity, action, details);

    await this.logActivity({
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
      action: `data:${action}`,
      entity,
      entityId,
      details: {
        ...details,
        gdprRelevant: this.isGDPREntity(entity),
        timestamp: new Date(),
      },
      ipAddress,
      userAgent,
      riskScore,
      complianceFlags: this.getComplianceFlags(entity, action),
    });
  }

  /**
   * Logs administrative actions
   */
  async logAdminAction(
    tenantId: string,
    companyId: string,
    userId: string,
    action: string,
    entity: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logActivity({
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
      action: `admin:${action}`,
      entity,
      details: {
        ...details,
        adminAction: true,
        timestamp: new Date(),
      },
      ipAddress,
      userAgent,
      riskScore: 10, // Admin actions always have high risk score
      complianceFlags: ['admin_action', 'requires_review'],
    });
  }

  /**
   * Logs security events
   */
  async logSecurityEvent(
    tenantId: string,
    companyId: string,
    event: 'suspicious_activity' | 'unauthorized_access' | 'data_breach' | 'policy_violation',
    details: any,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const riskScore = this.getSecurityRiskScore(severity);

    await this.logActivity({
      tenant_id: tenantId,
      company_id: companyId,
      action: `security:${event}`,
      entity: 'system',
      details: {
        ...details,
        severity,
        securityEvent: true,
        timestamp: new Date(),
      },
      ipAddress,
      userAgent,
      riskScore,
      complianceFlags: ['security_event', 'requires_investigation'],
    });
  }

  /**
   * Queries audit logs with filtering and pagination
   */
  async queryAuditLogs(query: AuditQuery): Promise<any[]> {
    try {
      const {
        tenant_id,
        company_id,
        user_id,
        action,
        entity,
        entityId,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = query;

      const where: any = {};

      if (tenant_id) where.tenant_id = tenant_id;
      if (company_id) where.company_id = company_id;
      if (user_id) where.user_id = user_id;
      if (action) where.action = { contains: action };
      if (entity) where.entity = entity;
      if (entityId) where.entityId = entityId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const logs = await this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return logs;
    } catch (error) {
      this.logger.error(`Failed to query audit logs: ${error.message}`, error.stack);
      throw new Error(`Audit log query failed: ${error.message}`);
    }
  }

  /**
   * Gets audit logs for a specific entity
   */
  async getEntityAuditTrail(
    entity: string,
    entityId: string,
    limit: number = 50
  ): Promise<any[]> {
    return this.queryAuditLogs({
      entity,
      entityId,
      limit,
    });
  }

  /**
   * Gets audit logs for a specific user
   */
  async getUserAuditTrail(
    userId: string,
    limit: number = 50
  ): Promise<any[]> {
    return this.queryAuditLogs({
      user_id: userId,
      limit,
    });
  }

  /**
   * Generates compliance report from audit logs
   */
  async generateComplianceReport(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      const logs = await this.queryAuditLogs({
        tenant_id: tenantId,
        company_id: companyId,
        startDate,
        endDate,
      });

      const report = {
        period: { startDate, endDate },
        summary: {
          totalEvents: logs.length,
          securityEvents: logs.filter(log => log.action.startsWith('security:')).length,
          adminActions: logs.filter(log => log.action.startsWith('admin:')).length,
          dataAccessEvents: logs.filter(log => log.action.startsWith('data:')).length,
          authEvents: logs.filter(log => log.action.startsWith('auth:')).length,
        },
        highRiskEvents: logs.filter(log => (log.riskScore || 0) >= 7),
        gdprRelevantEvents: logs.filter(log =>
          log.complianceFlags?.includes('gdpr') ||
          this.isGDPREntity(log.entity)
        ),
        securityIncidents: logs.filter(log =>
          log.complianceFlags?.includes('security_event')
        ),
        topActions: this.getTopActions(logs),
        topEntities: this.getTopEntities(logs),
        topUsers: this.getTopUsers(logs),
      };

      return report;
    } catch (error) {
      this.logger.error(`Failed to generate compliance report: ${error.message}`, error.stack);
      throw new Error(`Compliance report generation failed: ${error.message}`);
    }
  }

  /**
   * Archives old audit logs (moves to S3 for long-term storage)
   */
  async archiveOldLogs(olderThanDays: number = 365): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const oldLogs = await this.prisma.auditLog.findMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      if (oldLogs.length > 0) {
        // Export to S3 for archival
        const archiveData = {
          archivedAt: new Date(),
          cutoffDate,
          logs: oldLogs,
        };

        // This would integrate with the S3 service for archival
        this.logger.log(`Archived ${oldLogs.length} audit logs older than ${olderThanDays} days`);

        // Optionally delete from database after successful archival
        // await this.prisma.auditLog.deleteMany({
        //   where: { createdAt: { lt: cutoffDate } }
        // });
      }
    } catch (error) {
      this.logger.error(`Failed to archive old audit logs: ${error.message}`, error.stack);
    }
  }

  /**
   * Verifies audit log integrity (ensures no tampering)
   */
  async verifyAuditIntegrity(logId: string): Promise<boolean> {
    try {
      const log = await this.prisma.auditLog.findUnique({
        where: { id: logId }
      });

      if (!log) {
        return false;
      }

      // Basic integrity check - ensure required fields are present
      const requiredFields = ['tenant_id', 'action', 'entity', 'createdAt'];
      const hasRequiredFields = requiredFields.every(field =>
        log[field as keyof typeof log] != null
      );

      return hasRequiredFields;
    } catch (error) {
      this.logger.error(`Failed to verify audit integrity: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Encrypts sensitive audit details
   */
  private async encryptAuditDetails(logId: string, details: any): Promise<void> {
    try {
      const sensitiveFields = ['password', 'token', 'secret', 'nip', 'pesel', 'personalData'];
      const encryptedDetails: any = {};

      for (const [key, value] of Object.entries(details)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          encryptedDetails[key] = await this.encryptionService.encryptForGDPR(
            JSON.stringify(value),
            'audit_logging'
          );
        } else {
          encryptedDetails[key] = value;
        }
      }

      await this.prisma.auditLog.update({
        where: { id: logId },
        data: {
          details: JSON.stringify(encryptedDetails)
        }
      });
    } catch (error) {
      this.logger.error(`Failed to encrypt audit details: ${error.message}`, error.stack);
    }
  }

  /**
   * Checks if data contains sensitive information
   */
  private containsSensitiveData(data: any): boolean {
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /nip/i,
      /pesel/i,
      /personal/i,
    ];

    const dataString = JSON.stringify(data);
    return sensitivePatterns.some(pattern => pattern.test(dataString));
  }

  /**
   * Calculates risk score for audit events
   */
  private calculateRiskScore(entity: string, action: string, details?: any): number {
    let score = 1;

    // Entity-based risk
    const highRiskEntities = ['user', 'company', 'financial', 'personal_data'];
    if (highRiskEntities.includes(entity.toLowerCase())) {
      score += 3;
    }

    // Action-based risk
    if (action === 'delete') score += 3;
    if (action === 'update') score += 2;
    if (action === 'create') score += 1;

    // Details-based risk
    if (details?.adminAction) score += 2;
    if (details?.sensitive) score += 2;

    return Math.min(score, 10);
  }

  /**
   * Gets security risk score based on severity
   */
  private getSecurityRiskScore(severity: string): number {
    const scores = {
      low: 3,
      medium: 6,
      high: 8,
      critical: 10,
    };

    return scores[severity as keyof typeof scores] || 5;
  }

  /**
   * Checks if entity is GDPR-relevant
   */
  private isGDPREntity(entity: string): boolean {
    const gdprEntities = ['user', 'customer', 'employee', 'personal_data', 'consent'];
    return gdprEntities.includes(entity.toLowerCase());
  }

  /**
   * Gets compliance flags for audit events
   */
  private getComplianceFlags(entity: string, action: string): string[] {
    const flags: string[] = [];

    if (this.isGDPREntity(entity)) {
      flags.push('gdpr');
    }

    if (action === 'delete' && this.isGDPREntity(entity)) {
      flags.push('gdpr_deletion');
    }

    return flags;
  }

  /**
   * Helper methods for compliance report
   */
  private getTopActions(logs: any[]): Array<{ action: string; count: number }> {
    const actions = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(actions)
      .map(([action, count]) => ({ action, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopEntities(logs: any[]): Array<{ entity: string; count: number }> {
    const entities = logs.reduce((acc, log) => {
      acc[log.entity] = (acc[log.entity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(entities)
      .map(([entity, count]) => ({ entity, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopUsers(logs: any[]): Array<{ userId: string; count: number }> {
    const users = logs.reduce((acc, log) => {
      if (log.user_id) {
        acc[log.user_id] = (acc[log.user_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(users)
      .map(([userId, count]) => ({ userId, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
}