import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

export interface AnomalyDetectionRule {
  id: string;
  name: string;
  description: string;
  type: 'behavioral' | 'threshold' | 'pattern' | 'geographic';
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  conditions: any;
  actions: string[];
  cooldownMinutes: number;
}

export interface AnomalyAlert {
  id: string;
  ruleId: string;
  userId?: string;
  companyId?: string;
  type: string;
  severity: string;
  description: string;
  evidence: any;
  detectedAt: Date;
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

export interface UserBehaviorProfile {
  userId: string;
  companyId: string;
  baselineLoginTimes: number[];
  baselineActions: Record<string, number>;
  baselineDataAccess: Record<string, number>;
  geographicLocations: string[];
  deviceFingerprints: string[];
  riskScore: number;
  lastUpdated: Date;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private behaviorProfiles = new Map<string, UserBehaviorProfile>();
  private ruleCooldowns = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Analyzes audit logs for anomalies
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async detectAnomalies(): Promise<void> {
    try {
      this.logger.log('Starting anomaly detection scan');

      // Get recent audit logs for analysis
      const recentLogs = await this.auditLogService.queryAuditLogs({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        limit: 10000,
      });

      // Load detection rules
      const rules = await this.getActiveDetectionRules();

      for (const rule of rules) {
        await this.applyDetectionRule(rule, recentLogs);
      }

      // Update behavior profiles
      await this.updateBehaviorProfiles(recentLogs);

      this.logger.log('Anomaly detection scan completed');
    } catch (error) {
      this.logger.error(`Anomaly detection failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Detects unusual login patterns
   */
  async detectUnusualLogins(userId: string, loginDetails: {
    ipAddress: string;
    userAgent: string;
    timestamp: Date;
    location?: string;
  }): Promise<boolean> {
    try {
      const profile = await this.getUserBehaviorProfile(userId);

      if (!profile) {
        // No baseline yet, create one
        await this.createUserBehaviorProfile(userId);
        return false;
      }

      let anomalyScore = 0;

      // Check unusual login time
      const hour = loginDetails.timestamp.getHours();
      if (!this.isUsualLoginTime(profile.baselineLoginTimes, hour)) {
        anomalyScore += 3;
      }

      // Check unusual location
      if (loginDetails.location && !profile.geographicLocations.includes(loginDetails.location)) {
        anomalyScore += 5;
      }

      // Check unusual device
      const deviceFingerprint = this.generateDeviceFingerprint(loginDetails.userAgent, loginDetails.ipAddress);
      if (!profile.deviceFingerprints.includes(deviceFingerprint)) {
        anomalyScore += 4;
      }

      if (anomalyScore >= 7) {
        await this.createAnomalyAlert({
          ruleId: 'unusual_login',
          userId,
          type: 'unusual_login',
          severity: anomalyScore >= 10 ? 'critical' : 'high',
          description: `Unusual login pattern detected with score ${anomalyScore}`,
          evidence: {
            loginDetails,
            anomalyScore,
            profile: profile,
          },
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to detect unusual logins: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Detects excessive data access
   */
  async detectExcessiveDataAccess(userId: string, companyId: string, entity: string, action: string): Promise<boolean> {
    try {
      const profile = await this.getUserBehaviorProfile(userId);

      if (!profile) {
        return false;
      }

      const entityKey = `${entity}:${action}`;
      const usualAccessCount = profile.baselineDataAccess[entityKey] || 0;

      // Get recent access count (last hour)
      const recentAccessCount = await this.getRecentAccessCount(userId, entity, action, 1);

      // If recent access is significantly higher than baseline
      if (recentAccessCount > usualAccessCount * 3 + 5) {
        await this.createAnomalyAlert({
          ruleId: 'excessive_data_access',
          userId,
          companyId,
          type: 'excessive_data_access',
          severity: 'high',
          description: `Excessive ${action} access to ${entity}: ${recentAccessCount} vs baseline ${usualAccessCount}`,
          evidence: {
            entity,
            action,
            recentAccessCount,
            usualAccessCount,
            threshold: usualAccessCount * 3 + 5,
          },
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to detect excessive data access: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Detects privilege escalation attempts
   */
  async detectPrivilegeEscalation(userId: string, attemptedAction: string, resource: string): Promise<boolean> {
    try {
      // Check if user has permission for the attempted action
      const userPermissions = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              permissions: true
            }
          }
        }
      });

      if (!userPermissions) {
        return false;
      }

      // Extract permission names
      const userPermissionNames = new Set<string>();
      userPermissions.roles.forEach(role => {
        role.permissions.forEach(permission => {
          userPermissionNames.add(permission.name);
        });
      });

      // Check if attempted action requires permissions user doesn't have
      const requiredPermission = this.mapActionToPermission(attemptedAction, resource);

      if (requiredPermission && !userPermissionNames.has(requiredPermission)) {
        await this.createAnomalyAlert({
          ruleId: 'privilege_escalation',
          userId,
          type: 'privilege_escalation',
          severity: 'critical',
          description: `Privilege escalation attempt: ${attemptedAction} on ${resource}`,
          evidence: {
            attemptedAction,
            resource,
            requiredPermission,
            userPermissions: Array.from(userPermissionNames),
          },
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to detect privilege escalation: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Detects unusual data export patterns
   */
  async detectUnusualDataExport(userId: string, companyId: string, exportDetails: {
    dataType: string;
    recordCount: number;
    destination?: string;
  }): Promise<boolean> {
    try {
      // Check if export volume is unusual
      const recentExports = await this.getRecentExports(userId, companyId, 24); // Last 24 hours

      const totalRecentRecords = recentExports.reduce(function(sum, export) {
        return sum + (export.recordCount || 0);
      }, 0);
      const averageExportSize = recentExports.length > 0 ? totalRecentRecords / recentExports.length : 0;

      // Flag if current export is significantly larger than average
      if (exportDetails.recordCount > averageExportSize * 5) {
        await this.createAnomalyAlert({
          ruleId: 'unusual_data_export',
          userId,
          companyId,
          type: 'unusual_data_export',
          severity: 'high',
          description: `Unusual data export size: ${exportDetails.recordCount} records vs average ${Math.round(averageExportSize)}`,
          evidence: {
            exportDetails,
            averageExportSize: Math.round(averageExportSize),
            recentExports,
          },
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to detect unusual data export: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Creates an anomaly alert
   */
  private async createAnomalyAlert(alert: Partial<AnomalyAlert>): Promise<void> {
    try {
      const anomalyAlert = await this.prisma.anomalyAlert.create({
        data: {
          ruleId: alert.ruleId!,
          userId: alert.userId,
          companyId: alert.companyId,
          type: alert.type!,
          severity: alert.severity!,
          description: alert.description!,
          evidence: JSON.stringify(alert.evidence),
          status: 'new',
          detectedAt: new Date(),
        }
      });

      // Log security event
      await this.auditLogService.logSecurityEvent(
        alert.companyId || 'system',
        alert.companyId || 'system',
        'suspicious_activity',
        {
          alertId: anomalyAlert.id,
          type: alert.type,
          severity: alert.severity,
          description: alert.description,
        },
        alert.severity as any
      );

      this.logger.warn(`Anomaly alert created: ${alert.description}`);
    } catch (error) {
      this.logger.error(`Failed to create anomaly alert: ${error.message}`, error.stack);
    }
  }

  /**
   * Gets user behavior profile
   */
  private async getUserBehaviorProfile(userId: string): Promise<UserBehaviorProfile | null> {
    try {
      // Check cache first
      if (this.behaviorProfiles.has(userId)) {
        return this.behaviorProfiles.get(userId)!;
      }

      // Load from database or create new
      const profile = await this.prisma.userBehaviorProfile.findUnique({
        where: { userId }
      });

      if (profile) {
        const parsedProfile: UserBehaviorProfile = {
          userId: profile.userId,
          companyId: profile.companyId,
          baselineLoginTimes: profile.baselineLoginTimes as number[],
          baselineActions: profile.baselineActions as Record<string, number>,
          baselineDataAccess: profile.baselineDataAccess as Record<string, number>,
          geographicLocations: profile.geographicLocations as string[],
          deviceFingerprints: profile.deviceFingerprints as string[],
          riskScore: profile.riskScore,
          lastUpdated: profile.lastUpdated,
        };

        this.behaviorProfiles.set(userId, parsedProfile);
        return parsedProfile;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get user behavior profile: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Creates initial behavior profile for user
   */
  private async createUserBehaviorProfile(userId: string): Promise<void> {
    try {
      // Get user's company ID
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) return;

      const profile: UserBehaviorProfile = {
        userId,
        companyId: user.tenant_id,
        baselineLoginTimes: [],
        baselineActions: {},
        baselineDataAccess: {},
        geographicLocations: [],
        deviceFingerprints: [],
        riskScore: 1,
        lastUpdated: new Date(),
      };

      this.behaviorProfiles.set(userId, profile);

      // Save to database
      await this.prisma.userBehaviorProfile.create({
        data: {
          userId,
          companyId: user.tenant_id,
          baselineLoginTimes: [],
          baselineActions: {},
          baselineDataAccess: {},
          geographicLocations: [],
          deviceFingerprints: [],
          riskScore: 1,
          lastUpdated: new Date(),
        }
      });
    } catch (error) {
      this.logger.error(`Failed to create behavior profile: ${error.message}`, error.stack);
    }
  }

  /**
   * Updates behavior profiles based on recent activity
   */
  private async updateBehaviorProfiles(logs: any[]): Promise<void> {
    try {
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

      // Update each user's profile
      for (const [userId, userLogs] of userActivity) {
        await this.updateUserProfile(userId, userLogs);
      }
    } catch (error) {
      this.logger.error(`Failed to update behavior profiles: ${error.message}`, error.stack);
    }
  }

  /**
   * Updates individual user profile
   */
  private async updateUserProfile(userId: string, userLogs: any[]): Promise<void> {
    try {
      const profile = await this.getUserBehaviorProfile(userId);
      if (!profile) return;

      // Update login times
      const loginLogs = userLogs.filter(log => log.action.startsWith('auth:login'));
      if (loginLogs.length > 0) {
        const loginHours = loginLogs.map(log =>
          new Date(JSON.parse(log.details).timestamp).getHours()
        );
        profile.baselineLoginTimes = this.updateMovingAverage(
          profile.baselineLoginTimes,
          loginHours,
          0.1
        );
      }

      // Update action frequencies
      const actionCounts = userLogs.reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      profile.baselineActions = this.updateMovingAverageRecord(
        profile.baselineActions,
        actionCounts,
        0.1
      );

      // Update data access patterns
      const dataAccessLogs = userLogs.filter(log => log.action.startsWith('data:'));
      if (dataAccessLogs.length > 0) {
        const dataAccessCounts = dataAccessLogs.reduce((acc, log) => {
          const key = `${log.entity}:${log.action}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        profile.baselineDataAccess = this.updateMovingAverageRecord(
          profile.baselineDataAccess,
          dataAccessCounts,
          0.1
        );
      }

      // Update risk score
      profile.riskScore = this.calculateUserRiskScore(profile, userLogs);
      profile.lastUpdated = new Date();

      // Save updated profile
      await this.prisma.userBehaviorProfile.update({
        where: { userId },
        data: {
          baselineLoginTimes: profile.baselineLoginTimes,
          baselineActions: profile.baselineActions,
          baselineDataAccess: profile.baselineDataAccess,
          riskScore: profile.riskScore,
          lastUpdated: profile.lastUpdated,
        }
      });

      this.behaviorProfiles.set(userId, profile);
    } catch (error) {
      this.logger.error(`Failed to update user profile: ${error.message}`, error.stack);
    }
  }

  /**
   * Helper methods
   */
  private isUsualLoginTime(baselineHours: number[], currentHour: number): boolean {
    if (baselineHours.length === 0) return true;

    const hourDiff = Math.min(
      Math.abs(currentHour - baselineHours[0]),
      24 - Math.abs(currentHour - baselineHours[0])
    );

    return hourDiff <= 4; // Within 4 hours of usual login time
  }

  private generateDeviceFingerprint(userAgent: string, ipAddress: string): string {
    return Buffer.from(`${userAgent}:${ipAddress}`).toString('base64');
  }

  private async getRecentAccessCount(userId: string, entity: string, action: string, hours: number): Promise<number> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await this.auditLogService.queryAuditLogs({
      user_id: userId,
      entity,
      action: `data:${action}`,
      startDate: startTime,
    });

    return logs.length;
  }

  private async getRecentExports(userId: string, companyId: string, hours: number): Promise<any[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await this.auditLogService.queryAuditLogs({
      user_id: userId,
      company_id: companyId,
      action: 'data:export',
      startDate: startTime,
    });

    return logs.map(log => ({
      recordCount: JSON.parse(log.details || '{}').recordCount || 0,
      timestamp: log.createdAt,
    }));
  }

  private mapActionToPermission(action: string, resource: string): string | null {
    const mappings: Record<string, string> = {
      'admin': 'admin:all',
      'delete': `${resource}:delete`,
      'manage': `${resource}:manage`,
      'view_sensitive': `${resource}:view_sensitive`,
    };

    return mappings[action] || null;
  }

  private calculateUserRiskScore(profile: UserBehaviorProfile, recentLogs: any[]): number {
    let riskScore = 1;

    // High frequency of admin actions
    const adminActions = recentLogs.filter(log => log.action.startsWith('admin:')).length;
    if (adminActions > 10) riskScore += 2;

    // Unusual number of security events
    const securityEvents = recentLogs.filter(log => log.action.startsWith('security:')).length;
    riskScore += securityEvents * 2;

    // Failed login attempts
    const failedLogins = recentLogs.filter(log => log.action === 'auth:failed_login').length;
    riskScore += failedLogins;

    return Math.min(riskScore, 10);
  }

  private updateMovingAverage(current: number[], newValues: number[], alpha: number): number[] {
    if (newValues.length === 0) return current;

    const newAverage = newValues.reduce((sum, val) => sum + val, 0) / newValues.length;
    if (current.length === 0) return [newAverage];

    const updated = current[0] * (1 - alpha) + newAverage * alpha;
    return [updated];
  }

  private updateMovingAverageRecord(
    current: Record<string, number>,
    newValues: Record<string, number>,
    alpha: number
  ): Record<string, number> {
    const updated = { ...current };

    for (const [key, newValue] of Object.entries(newValues)) {
      const currentValue = updated[key] || 0;
      updated[key] = currentValue * (1 - alpha) + newValue * alpha;
    }

    return updated;
  }

  private async getActiveDetectionRules(): Promise<AnomalyDetectionRule[]> {
    // In a real implementation, these would be stored in the database
    return [
      {
        id: 'unusual_login',
        name: 'Unusual Login Pattern',
        description: 'Detects logins from unusual times, locations, or devices',
        type: 'behavioral',
        enabled: true,
        severity: 'high',
        conditions: {},
        actions: ['alert', 'require_mfa'],
        cooldownMinutes: 60,
      },
      {
        id: 'excessive_data_access',
        name: 'Excessive Data Access',
        description: 'Detects when users access significantly more data than usual',
        type: 'threshold',
        enabled: true,
        severity: 'medium',
        conditions: { thresholdMultiplier: 3 },
        actions: ['alert', 'log_for_review'],
        cooldownMinutes: 30,
      },
      {
        id: 'privilege_escalation',
        name: 'Privilege Escalation Attempt',
        description: 'Detects attempts to access resources without proper permissions',
        type: 'pattern',
        enabled: true,
        severity: 'critical',
        conditions: {},
        actions: ['alert', 'block_access', 'require_investigation'],
        cooldownMinutes: 0,
      },
      {
        id: 'unusual_data_export',
        name: 'Unusual Data Export',
        description: 'Detects unusually large data exports',
        type: 'threshold',
        enabled: true,
        severity: 'high',
        conditions: { sizeMultiplier: 5 },
        actions: ['alert', 'require_approval'],
        cooldownMinutes: 120,
      },
    ];
  }

  private async applyDetectionRule(rule: AnomalyDetectionRule, logs: any[]): Promise<void> {
    // Implementation would apply the specific rule logic
    // This is a simplified version
    this.logger.debug(`Applying rule: ${rule.name}`);
  }
}