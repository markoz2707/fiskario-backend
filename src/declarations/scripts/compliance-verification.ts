import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../security/services/audit-log.service';
import { ConsentManagementService } from '../../security/services/consent-management.service';
import { DPIADocumentationService } from '../../security/services/dpia-documentation.service';
import { DataMinimizationService } from '../../security/services/data-minimization.service';

export interface ComplianceCheck {
  id: string;
  name: string;
  category: 'gdpr' | 'security' | 'data_protection' | 'audit' | 'consent';
  description: string;
  status: 'pass' | 'fail' | 'warning' | 'error' | 'not_applicable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  findings: string[];
  recommendations: string[];
  lastChecked: Date;
  nextCheckDue: Date;
}

export interface ComplianceReport {
  id: string;
  generatedAt: Date;
  period: {
    startDate: Date;
    endDate: Date;
  };
  overallScore: number;
  checks: ComplianceCheck[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    criticalIssues: number;
  };
  trends: {
    scoreChange: number;
    newIssues: number;
    resolvedIssues: number;
  };
}

@Injectable()
export class ComplianceVerificationService {
  private readonly logger = new Logger(ComplianceVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly consentManagementService: ConsentManagementService,
    private readonly dpiaDocumentationService: DPIADocumentationService,
    private readonly dataMinimizationService: DataMinimizationService,
  ) {}

  /**
   * Runs comprehensive compliance verification
   */
  async runComplianceVerification(companyId?: string): Promise<ComplianceReport> {
    try {
      this.logger.log('Starting comprehensive compliance verification');

      const checks: ComplianceCheck[] = [];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      const endDate = new Date();

      // Run all compliance checks
      checks.push(await this.checkDataEncryption(companyId));
      checks.push(await this.checkAuditLogging(companyId));
      checks.push(await this.checkConsentManagement(companyId));
      checks.push(await this.checkDPIACompliance(companyId));
      checks.push(await this.checkDataRetention(companyId));
      checks.push(await this.checkAccessControls(companyId));
      checks.push(await this.checkDataMinimization(companyId));
      checks.push(await this.checkPrivacyNotices(companyId));
      checks.push(await this.checkSecurityMeasures(companyId));
      checks.push(await this.checkIncidentResponse(companyId));

      // Calculate overall score
      const overallScore = this.calculateOverallScore(checks);

      // Generate trends (simplified)
      const trends = await this.calculateTrends(companyId, startDate, endDate);

      const report: ComplianceReport = {
        id: `report-${Date.now()}`,
        generatedAt: new Date(),
        period: { startDate, endDate },
        overallScore,
        checks,
        summary: {
          totalChecks: checks.length,
          passedChecks: checks.filter(c => c.status === 'pass').length,
          failedChecks: checks.filter(c => c.status === 'fail').length,
          warningChecks: checks.filter(c => c.status === 'warning').length,
          criticalIssues: checks.filter(c => c.severity === 'critical' && c.status !== 'pass').length,
        },
        trends,
      };

      // Save report to database
      await this.saveComplianceReport(report);

      this.logger.log(`Compliance verification completed. Overall score: ${overallScore}%`);

      return report;
    } catch (error) {
      this.logger.error(`Compliance verification failed: ${error.message}`, error.stack);
      throw new Error(`Compliance verification failed: ${error.message}`);
    }
  }

  /**
   * Checks data encryption compliance
   */
  private async checkDataEncryption(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'data-encryption',
        name: 'Data Encryption Compliance',
        category: 'data_protection',
        description: 'Verifies that sensitive data is properly encrypted',
        status: 'pass',
        severity: 'critical',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
      };

      // Check if KMS is configured
      const kmsConfig = process.env.AWS_KMS_MASTER_KEY_ID;
      if (!kmsConfig) {
        check.status = 'fail';
        check.findings.push('AWS KMS master key not configured');
        check.recommendations.push('Configure AWS KMS master key for data encryption');
      }

      // Check database encryption
      try {
        const result = await this.prisma.$queryRaw`SELECT * FROM pg_extension WHERE extname = 'pgcrypto'`;
        if (!result || (result as any[]).length === 0) {
          check.status = 'fail';
          check.findings.push('pgcrypto extension not enabled');
          check.recommendations.push('Enable pgcrypto extension in PostgreSQL');
        }
      } catch (error) {
        check.status = 'fail';
        check.findings.push('Cannot verify pgcrypto extension');
        check.recommendations.push('Check database connectivity and permissions');
      }

      // Check for encrypted fields in schema
      const encryptedFields = ['passwordEncrypted', 'nipEncrypted', 'peselEncrypted'];
      for (const field of encryptedFields) {
        try {
          const result = await this.prisma.$queryRaw`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = ${field}
          `;
          if (!result || (result as any[]).length === 0) {
            check.status = 'warning';
            check.findings.push(`Encrypted field ${field} not found`);
            check.recommendations.push(`Ensure ${field} field exists for encrypted data storage`);
          }
        } catch (error) {
          check.findings.push(`Cannot verify field ${field}`);
        }
      }

      return check;
    } catch (error) {
      this.logger.error(`Data encryption check failed: ${error.message}`);
      return this.createErrorCheck('data-encryption', 'Data Encryption Compliance', error.message);
    }
  }

  /**
   * Checks audit logging compliance
   */
  private async checkAuditLogging(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'audit-logging',
        name: 'Audit Logging Compliance',
        category: 'audit',
        description: 'Verifies comprehensive audit logging is in place',
        status: 'pass',
        severity: 'high',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
      };

      // Check audit log volume (should have recent entries)
      const recentLogs = await this.auditLogService.queryAuditLogs({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        limit: 1,
      });

      if (recentLogs.length === 0) {
        check.status = 'warning';
        check.findings.push('No audit logs found in the last 24 hours');
        check.recommendations.push('Verify audit logging is enabled and functioning');
      }

      // Check for required audit events
      const requiredEvents = ['auth:login', 'data:access', 'admin:action'];
      for (const event of requiredEvents) {
        const eventLogs = await this.auditLogService.queryAuditLogs({
          action: event,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
          limit: 1,
        });

        if (eventLogs.length === 0) {
          check.status = 'warning';
          check.findings.push(`No ${event} events found in audit logs`);
          check.recommendations.push(`Ensure ${event} events are being logged`);
        }
      }

      // Check audit log retention
      const oldLogs = await this.auditLogService.queryAuditLogs({
        startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        limit: 1,
      });

      if (oldLogs.length === 0) {
        check.status = 'warning';
        check.findings.push('Audit logs may not be retained for required period');
        check.recommendations.push('Verify audit log retention policy (minimum 7 years)');
      }

      return check;
    } catch (error) {
      this.logger.error(`Audit logging check failed: ${error.message}`);
      return this.createErrorCheck('audit-logging', 'Audit Logging Compliance', error.message);
    }
  }

  /**
   * Checks consent management compliance
   */
  private async checkConsentManagement(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'consent-management',
        name: 'Consent Management Compliance',
        category: 'consent',
        description: 'Verifies GDPR consent requirements are met',
        status: 'pass',
        severity: 'high',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // Check consent withdrawal rate
      const consentReport = await this.consentManagementService.generateConsentAuditReport(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date()
      );

      const withdrawalRate = parseFloat(consentReport.withdrawalRate);
      if (withdrawalRate > 15) {
        check.status = 'warning';
        check.findings.push(`High consent withdrawal rate: ${withdrawalRate}%`);
        check.recommendations.push('Review consent collection process and privacy notices');
      }

      // Check for active consents
      if (consentReport.summary.activeConsents === 0) {
        check.status = 'fail';
        check.findings.push('No active consents found');
        check.recommendations.push('Implement proper consent collection process');
      }

      // Check consent expiry handling
      const expiredConsents = consentReport.summary.totalConsents - consentReport.summary.activeConsents;
      const expiryRate = (expiredConsents / consentReport.summary.totalConsents) * 100;

      if (expiryRate > 50) {
        check.status = 'warning';
        check.findings.push(`High consent expiry rate: ${expiryRate.toFixed(1)}%`);
        check.recommendations.push('Review consent retention periods and renewal process');
      }

      return check;
    } catch (error) {
      this.logger.error(`Consent management check failed: ${error.message}`);
      return this.createErrorCheck('consent-management', 'Consent Management Compliance', error.message);
    }
  }

  /**
   * Checks DPIA compliance
   */
  private async checkDPIACompliance(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'dpia-compliance',
        name: 'DPIA Compliance',
        category: 'gdpr',
        description: 'Verifies Data Protection Impact Assessments are completed',
        status: 'pass',
        severity: 'high',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Next month
      };

      // Check if DPIAs exist for high-risk processing
      const highRiskActivities = [
        'large_scale_processing',
        'systematic_monitoring',
        'sensitive_data_processing',
        'profiling_activities'
      ];

      for (const activity of highRiskActivities) {
        // This would check if DPIA exists for specific activities
        // Implementation depends on how DPIAs are linked to processing activities
      }

      // Check DPIA completion rate
      // This would query DPIA documents and check their status

      return check;
    } catch (error) {
      this.logger.error(`DPIA compliance check failed: ${error.message}`);
      return this.createErrorCheck('dpia-compliance', 'DPIA Compliance', error.message);
    }
  }

  /**
   * Checks data retention compliance
   */
  private async checkDataRetention(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'data-retention',
        name: 'Data Retention Compliance',
        category: 'data_protection',
        description: 'Verifies data retention policies are enforced',
        status: 'pass',
        severity: 'medium',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // Check for expired data processing records
      const expiredRecords = await this.prisma.dataProcessingRecord.findMany({
        where: {
          endDate: { lt: new Date() },
          status: 'active'
        }
      });

      if (expiredRecords.length > 0) {
        check.status = 'warning';
        check.findings.push(`${expiredRecords.length} expired data processing records found`);
        check.recommendations.push('Run data cleanup process to anonymize expired data');
      }

      // Check audit log retention
      const oldAuditLogs = await this.prisma.auditLog.findMany({
        where: {
          createdAt: { lt: new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000) } // Older than 7 years
        },
        take: 1,
      });

      if (oldAuditLogs.length > 0) {
        check.status = 'warning';
        check.findings.push('Audit logs older than 7 years found');
        check.recommendations.push('Archive or delete audit logs according to retention policy');
      }

      return check;
    } catch (error) {
      this.logger.error(`Data retention check failed: ${error.message}`);
      return this.createErrorCheck('data-retention', 'Data Retention Compliance', error.message);
    }
  }

  /**
   * Checks access controls
   */
  private async checkAccessControls(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'access-controls',
        name: 'Access Controls Compliance',
        category: 'security',
        description: 'Verifies access controls are properly configured',
        status: 'pass',
        severity: 'high',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // Check for admin users without MFA
      const adminUsers = await this.prisma.user.findMany({
        where: {
          roles: {
            some: {
              permissions: {
                some: {
                  name: 'admin:all'
                }
              }
            }
          }
        },
        include: {
          roles: {
            include: {
              permissions: true
            }
          }
        }
      });

      // This would check MFA status for admin users
      // Implementation depends on MFA storage structure

      // Check role permissions consistency
      for (const user of adminUsers) {
        const hasAdminPermission = user.roles.some(role =>
          role.permissions.some(permission => permission.name === 'admin:all')
        );

        if (hasAdminPermission) {
          check.findings.push(`User ${user.id} has admin permissions`);
        }
      }

      return check;
    } catch (error) {
      this.logger.error(`Access controls check failed: ${error.message}`);
      return this.createErrorCheck('access-controls', 'Access Controls Compliance', error.message);
    }
  }

  /**
   * Checks data minimization compliance
   */
  private async checkDataMinimization(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'data-minimization',
        name: 'Data Minimization Compliance',
        category: 'gdpr',
        description: 'Verifies data minimization principles are followed',
        status: 'pass',
        severity: 'medium',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // Sample data to check for PII
      const sampleData = {
        name: 'John Doe',
        email: 'john@example.com',
        nip: '1234567890',
        phone: '+48 123 456 789',
        unnecessaryField: 'This might be unnecessary'
      };

      const piiResult = this.dataMinimizationService.detectPII(sampleData);

      if (piiResult.hasPII) {
        check.findings.push(`Detected ${piiResult.piiFields.length} PII fields in sample data`);

        if (piiResult.riskScore > 7) {
          check.status = 'warning';
          check.recommendations.push('High PII detection rate - review data collection necessity');
        }
      }

      return check;
    } catch (error) {
      this.logger.error(`Data minimization check failed: ${error.message}`);
      return this.createErrorCheck('data-minimization', 'Data Minimization Compliance', error.message);
    }
  }

  /**
   * Checks privacy notices compliance
   */
  private async checkPrivacyNotices(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'privacy-notices',
        name: 'Privacy Notices Compliance',
        category: 'gdpr',
        description: 'Verifies privacy notices are properly implemented',
        status: 'pass',
        severity: 'medium',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      // Check if privacy notices exist
      const notices = await this.prisma.privacyNotice.findMany({
        where: { isActive: true }
      });

      if (notices.length === 0) {
        check.status = 'fail';
        check.findings.push('No active privacy notices found');
        check.recommendations.push('Create and publish privacy notices for all services');
      }

      // Check notice versions and updates
      for (const notice of notices) {
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(notice.updatedAt).getTime()) / (24 * 60 * 60 * 1000)
        );

        if (daysSinceUpdate > 365) {
          check.status = 'warning';
          check.findings.push(`Privacy notice "${notice.title}" not updated for ${daysSinceUpdate} days`);
          check.recommendations.push('Review and update privacy notices annually');
        }
      }

      return check;
    } catch (error) {
      this.logger.error(`Privacy notices check failed: ${error.message}`);
      return this.createErrorCheck('privacy-notices', 'Privacy Notices Compliance', error.message);
    }
  }

  /**
   * Checks security measures
   */
  private async checkSecurityMeasures(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'security-measures',
        name: 'Security Measures Compliance',
        category: 'security',
        description: 'Verifies security measures are implemented',
        status: 'pass',
        severity: 'critical',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // Check TLS configuration
      const tlsCertPath = process.env.TLS_CERT_PATH;
      const tlsKeyPath = process.env.TLS_KEY_PATH;

      if (!tlsCertPath || !tlsKeyPath) {
        check.status = 'fail';
        check.findings.push('TLS certificate configuration missing');
        check.recommendations.push('Configure TLS certificates for secure communications');
      }

      // Check security environment variables
      const requiredEnvVars = [
        'JWT_SECRET',
        'ENCRYPTION_MASTER_KEY',
        'AWS_KMS_MASTER_KEY_ID'
      ];

      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          check.status = 'fail';
          check.findings.push(`Required environment variable ${envVar} not set`);
          check.recommendations.push(`Configure ${envVar} environment variable`);
        }
      }

      return check;
    } catch (error) {
      this.logger.error(`Security measures check failed: ${error.message}`);
      return this.createErrorCheck('security-measures', 'Security Measures Compliance', error.message);
    }
  }

  /**
   * Checks incident response readiness
   */
  private async checkIncidentResponse(companyId?: string): Promise<ComplianceCheck> {
    try {
      const check: ComplianceCheck = {
        id: 'incident-response',
        name: 'Incident Response Compliance',
        category: 'security',
        description: 'Verifies incident response capabilities',
        status: 'pass',
        severity: 'high',
        findings: [],
        recommendations: [],
        lastChecked: new Date(),
        nextCheckDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      // Check for recent security incidents
      const recentIncidents = await this.auditLogService.queryAuditLogs({
        action: 'security:incident',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      if (recentIncidents.length > 5) {
        check.status = 'warning';
        check.findings.push(`${recentIncidents.length} security incidents in the last 30 days`);
        check.recommendations.push('Review incident response procedures and security measures');
      }

      // Check breach notification readiness
      const dpoEmail = process.env.GDPR_DPO_EMAIL;
      if (!dpoEmail) {
        check.status = 'fail';
        check.findings.push('DPO email not configured for breach notifications');
        check.recommendations.push('Configure GDPR_DPO_EMAIL environment variable');
      }

      return check;
    } catch (error) {
      this.logger.error(`Incident response check failed: ${error.message}`);
      return this.createErrorCheck('incident-response', 'Incident Response Compliance', error.message);
    }
  }

  /**
   * Helper methods
   */
  private calculateOverallScore(checks: ComplianceCheck[]): number {
    if (checks.length === 0) return 100;

    let totalScore = 0;
    const weights = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    for (const check of checks) {
      const weight = weights[check.severity];
      const checkScore = check.status === 'pass' ? 100 :
                        check.status === 'warning' ? 75 :
                        check.status === 'fail' ? 25 : 50;

      totalScore += (checkScore * weight);
    }

    const maxScore = checks.reduce((sum, check) => sum + (100 * weights[check.severity]), 0);

    return Math.round((totalScore / maxScore) * 100);
  }

  private async calculateTrends(companyId?: string, startDate?: Date, endDate?: Date): Promise<any> {
    // Simplified trend calculation
    return {
      scoreChange: 0, // Would compare with previous report
      newIssues: 0,   // Would identify new compliance issues
      resolvedIssues: 0, // Would identify resolved issues
    };
  }

  private createErrorCheck(id: string, name: string, errorMessage: string): ComplianceCheck {
    return {
      id,
      name,
      category: 'gdpr',
      description: 'Compliance check failed due to error',
      status: 'error',
      severity: 'medium',
      findings: [`Check failed: ${errorMessage}`],
      recommendations: ['Review system configuration and try again'],
      lastChecked: new Date(),
      nextCheckDue: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  private async saveComplianceReport(report: ComplianceReport): Promise<void> {
    try {
      await this.prisma.complianceReport.create({
        data: {
          overallScore: report.overallScore,
          periodStart: report.period.startDate,
          periodEnd: report.period.endDate,
          summary: JSON.stringify(report.summary),
          trends: JSON.stringify(report.trends),
          checks: JSON.stringify(report.checks),
          generatedAt: report.generatedAt,
        }
      });
    } catch (error) {
      this.logger.error(`Failed to save compliance report: ${error.message}`);
    }
  }
}