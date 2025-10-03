import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KmsService } from '../../security/services/kms.service';
import { S3Service } from '../../security/services/s3.service';
import { AuditLogService } from '../../security/services/audit-log.service';
import { ValidationService } from '../../security/services/validation.service';

export interface SecurityAuditResult {
  id: string;
  timestamp: Date;
  type: 'vulnerability' | 'configuration' | 'compliance' | 'penetration_test';
  status: 'pass' | 'fail' | 'warning' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  findings: SecurityFinding[];
  recommendations: string[];
  evidence: any;
}

export interface SecurityFinding {
  id: string;
  category: 'authentication' | 'authorization' | 'encryption' | 'input_validation' | 'configuration' | 'dependencies';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  cwe?: string; // Common Weakness Enumeration
  cvss?: number; // Common Vulnerability Scoring System
  affectedComponents: string[];
  remediation: string;
  references: string[];
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kmsService: KmsService,
    private readonly s3Service: S3Service,
    private readonly auditLogService: AuditLogService,
    private readonly validationService: ValidationService,
  ) {}

  /**
   * Runs comprehensive security audit
   */
  async runSecurityAudit(): Promise<SecurityAuditResult[]> {
    try {
      this.logger.log('Starting comprehensive security audit');

      const results: SecurityAuditResult[] = [];

      // Run all audit checks
      results.push(await this.auditAuthenticationSecurity());
      results.push(await this.auditAuthorizationSecurity());
      results.push(await this.auditEncryptionSecurity());
      results.push(await this.auditInputValidation());
      results.push(await this.auditConfigurationSecurity());
      results.push(await this.auditDependencySecurity());
      results.push(await this.auditNetworkSecurity());
      results.push(await this.auditDataSecurity());

      // Save audit results
      await this.saveAuditResults(results);

      this.logger.log(`Security audit completed with ${results.length} checks`);

      return results;
    } catch (error) {
      this.logger.error(`Security audit failed: ${error.message}`, error.stack);
      throw new Error(`Security audit failed: ${error.message}`);
    }
  }

  /**
   * Audits authentication security
   */
  private async auditAuthenticationSecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `auth-${Date.now()}`,
      timestamp: new Date(),
      type: 'vulnerability',
      status: 'pass',
      severity: 'critical',
      title: 'Authentication Security Audit',
      description: 'Comprehensive audit of authentication mechanisms',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Check JWT configuration
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret || jwtSecret.length < 256) {
        result.status = 'fail';
        result.findings.push({
          id: 'weak-jwt-secret',
          category: 'authentication',
          severity: 'critical',
          title: 'Weak JWT Secret',
          description: 'JWT secret is too short or not configured',
          cwe: 'CWE-326',
          cvss: 9.1,
          affectedComponents: ['auth.service.ts', 'jwt.strategy.ts'],
          remediation: 'Use a 256-bit secret key for JWT signing',
          references: ['https://owasp.org/www-project-top-ten/'],
        });
      }

      // Check password policies
      const users = await this.prisma.user.findMany({
        where: {
          password: { not: null }
        },
        take: 100, // Sample users
      });

      for (const user of users) {
        if (user.password && user.password.length < 8) {
          result.status = 'warning';
          result.findings.push({
            id: 'weak-password',
            category: 'authentication',
            severity: 'medium',
            title: 'Weak Password Policy',
            description: 'Users with passwords shorter than 8 characters detected',
            cwe: 'CWE-521',
            cvss: 6.5,
            affectedComponents: ['auth.service.ts'],
            remediation: 'Enforce minimum 8-character password policy',
            references: ['https://pages.nist.gov/800-63-3/'],
          });
          break;
        }
      }

      // Check for MFA implementation
      // This would check if MFA is properly implemented

      return result;
    } catch (error) {
      this.logger.error(`Authentication audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Authentication audit failed: ${error.message}`,
        remediation: 'Review authentication configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits authorization security
   */
  private async auditAuthorizationSecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `authz-${Date.now()}`,
      timestamp: new Date(),
      type: 'vulnerability',
      status: 'pass',
      severity: 'high',
      title: 'Authorization Security Audit',
      description: 'Audit of authorization and access control mechanisms',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Check for admin privilege escalation
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

      if (adminUsers.length > 10) {
        result.status = 'warning';
        result.findings.push({
          id: 'excessive-admin-users',
          category: 'authorization',
          severity: 'medium',
          title: 'Excessive Administrative Privileges',
          description: `${adminUsers.length} users have administrative privileges`,
          cwe: 'CWE-284',
          cvss: 7.2,
          affectedComponents: ['permissions.service.ts'],
          remediation: 'Implement principle of least privilege for admin access',
          references: ['https://owasp.org/www-project-top-ten/'],
        });
      }

      // Check role permissions consistency
      for (const user of adminUsers) {
        const hasConflictingPermissions = this.checkConflictingPermissions(user.roles);

        if (hasConflictingPermissions) {
          result.status = 'warning';
          result.findings.push({
            id: 'conflicting-permissions',
            category: 'authorization',
            severity: 'medium',
            title: 'Conflicting Role Permissions',
            description: 'User has conflicting permissions across roles',
            cwe: 'CWE-284',
            cvss: 6.5,
            affectedComponents: ['permissions.service.ts'],
            remediation: 'Review and resolve conflicting role permissions',
            references: [],
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Authorization audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Authorization audit failed: ${error.message}`,
        remediation: 'Review authorization configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits encryption security
   */
  private async auditEncryptionSecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `encryption-${Date.now()}`,
      timestamp: new Date(),
      type: 'configuration',
      status: 'pass',
      severity: 'critical',
      title: 'Encryption Security Audit',
      description: 'Audit of encryption implementations and key management',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Test KMS connectivity and encryption
      try {
        const testData = 'security-audit-test-data';
        const encrypted = await this.kmsService.encrypt(testData);
        const decrypted = await this.kmsService.decrypt(encrypted.encryptedData);

        if (decrypted.decryptedData !== testData) {
          result.status = 'fail';
          result.findings.push({
            id: 'kms-encryption-failure',
            category: 'encryption',
            severity: 'critical',
            title: 'KMS Encryption Failure',
            description: 'KMS encryption/decryption test failed',
            cwe: 'CWE-310',
            cvss: 9.8,
            affectedComponents: ['kms.service.ts'],
            remediation: 'Verify KMS configuration and key permissions',
            references: ['https://docs.aws.amazon.com/kms/'],
          });
        }
      } catch (error) {
        result.status = 'fail';
        result.findings.push({
          id: 'kms-connection-failure',
          category: 'encryption',
          severity: 'critical',
          title: 'KMS Connection Failure',
          description: `Cannot connect to KMS: ${error.message}`,
          cwe: 'CWE-310',
          cvss: 9.8,
          affectedComponents: ['kms.service.ts'],
          remediation: 'Check AWS credentials and KMS permissions',
          references: ['https://docs.aws.amazon.com/kms/'],
        });
      }

      // Check database encryption
      try {
        const queryResult = await this.prisma.$queryRaw`SELECT * FROM pg_extension WHERE extname = 'pgcrypto'`;
        if (!queryResult || (queryResult as any[]).length === 0) {
          result.status = 'fail';
          result.findings.push({
            id: 'db-encryption-missing',
            category: 'encryption',
            severity: 'high',
            title: 'Database Encryption Missing',
            description: 'pgcrypto extension not enabled for database encryption',
            cwe: 'CWE-311',
            cvss: 8.1,
            affectedComponents: ['prisma.service.ts'],
            remediation: 'Enable pgcrypto extension in PostgreSQL',
            references: ['https://www.postgresql.org/docs/current/pgcrypto.html'],
          });
        }
      } catch (error) {
        result.status = 'warning';
        result.findings.push({
          id: 'db-encryption-check-failed',
          category: 'encryption',
          severity: 'medium',
          title: 'Database Encryption Check Failed',
          description: `Cannot verify database encryption: ${error.message}`,
          remediation: 'Check database connectivity and permissions',
          references: [],
          affectedComponents: ['prisma.service.ts'],
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Encryption audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Encryption audit failed: ${error.message}`,
        remediation: 'Review encryption configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits input validation
   */
  private async auditInputValidation(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `validation-${Date.now()}`,
      timestamp: new Date(),
      type: 'vulnerability',
      status: 'pass',
      severity: 'high',
      title: 'Input Validation Audit',
      description: 'Audit of input validation and sanitization',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Test NIP validation
      const nipTests = [
        { input: '1234567890', expected: true },
        { input: '123456789', expected: false }, // Too short
        { input: '12345678901', expected: false }, // Too long
        { input: '123456789a', expected: false }, // Contains letter
      ];

      for (const test of nipTests) {
        const validation = this.validationService.validateNIP(test.input);
        if (validation.isValid !== test.expected) {
          result.status = 'warning';
          result.findings.push({
            id: 'nip-validation-inconsistency',
            category: 'input_validation',
            severity: 'medium',
            title: 'NIP Validation Inconsistency',
            description: `NIP validation returned ${validation.isValid} for "${test.input}", expected ${test.expected}`,
            cwe: 'CWE-20',
            cvss: 6.5,
            affectedComponents: ['validation.service.ts'],
            remediation: 'Review and fix NIP validation logic',
            references: ['https://owasp.org/www-project-input-validation-cheating-sheet/'],
          });
        }
      }

      // Test email validation
      const emailTests = [
        { input: 'test@example.com', expected: true },
        { input: 'invalid-email', expected: false },
        { input: 'test@', expected: false },
        { input: '@example.com', expected: false },
      ];

      for (const test of emailTests) {
        const validation = this.validationService.validateEmail(test.input);
        if (validation.isValid !== test.expected) {
          result.status = 'warning';
          result.findings.push({
            id: 'email-validation-inconsistency',
            category: 'input_validation',
            severity: 'medium',
            title: 'Email Validation Inconsistency',
            description: `Email validation returned ${validation.isValid} for "${test.input}", expected ${test.expected}`,
            cwe: 'CWE-20',
            cvss: 6.5,
            affectedComponents: ['validation.service.ts'],
            remediation: 'Review and fix email validation logic',
            references: ['https://owasp.org/www-project-input-validation-cheating-sheet/'],
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Input validation audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Input validation audit failed: ${error.message}`,
        remediation: 'Review validation service configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits configuration security
   */
  private async auditConfigurationSecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `config-${Date.now()}`,
      timestamp: new Date(),
      type: 'configuration',
      status: 'pass',
      severity: 'high',
      title: 'Configuration Security Audit',
      description: 'Audit of security-related configuration',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Check for hardcoded secrets
      const sensitiveFiles = [
        'backend/src/auth/jwt.strategy.ts',
        'backend/src/security/services/kms.service.ts',
      ];

      for (const file of sensitiveFiles) {
        // This would scan files for hardcoded secrets
        // Implementation would use a secrets scanning tool
      }

      // Check environment variable security
      const requiredSecureEnvVars = [
        'JWT_SECRET',
        'ENCRYPTION_MASTER_KEY',
        'AWS_SECRET_ACCESS_KEY',
        'DATABASE_URL'
      ];

      for (const envVar of requiredSecureEnvVars) {
        if (!process.env[envVar]) {
          result.status = 'fail';
          result.findings.push({
            id: 'missing-env-var',
            category: 'configuration',
            severity: 'high',
            title: 'Missing Required Environment Variable',
            description: `Required environment variable ${envVar} is not set`,
            cwe: 'CWE-200',
            cvss: 7.5,
            affectedComponents: ['environment configuration'],
            remediation: `Set ${envVar} environment variable`,
            references: ['https://owasp.org/www-project-top-ten/'],
          });
        }
      }

      // Check file permissions
      // This would check file system permissions for sensitive files

      return result;
    } catch (error) {
      this.logger.error(`Configuration audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Configuration audit failed: ${error.message}`,
        remediation: 'Review application configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits dependency security
   */
  private async auditDependencySecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `deps-${Date.now()}`,
      timestamp: new Date(),
      type: 'vulnerability',
      status: 'pass',
      severity: 'high',
      title: 'Dependency Security Audit',
      description: 'Audit of third-party dependencies for vulnerabilities',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Check for outdated or vulnerable packages
      // This would integrate with tools like npm audit, Snyk, or OWASP Dependency Check

      // Check specific known vulnerable packages
      const packageJson = require('../../../../package.json');
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      const vulnerablePackages = [
        'lodash', // If using old version
        'serialize-javascript', // If using old version
        'minimist', // If using old version
      ];

      for (const vulnPackage of vulnerablePackages) {
        if (dependencies[vulnPackage]) {
          result.status = 'warning';
          result.findings.push({
            id: 'potentially-vulnerable-package',
            category: 'dependencies',
            severity: 'medium',
            title: 'Potentially Vulnerable Package',
            description: `Package ${vulnPackage} may have known vulnerabilities`,
            cwe: 'CWE-1395',
            cvss: 7.5,
            affectedComponents: ['package.json'],
            remediation: `Review and update ${vulnPackage} to latest secure version`,
            references: ['https://owasp.org/www-project-top-ten/'],
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Dependency audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Dependency audit failed: ${error.message}`,
        remediation: 'Review dependency management configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits network security
   */
  private async auditNetworkSecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `network-${Date.now()}`,
      timestamp: new Date(),
      type: 'configuration',
      status: 'pass',
      severity: 'medium',
      title: 'Network Security Audit',
      description: 'Audit of network security configurations',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Check TLS configuration
      const tlsCertPath = process.env.TLS_CERT_PATH;
      const tlsKeyPath = process.env.TLS_KEY_PATH;

      if (!tlsCertPath || !tlsKeyPath) {
        result.status = 'fail';
        result.findings.push({
          id: 'tls-not-configured',
          category: 'configuration',
          severity: 'high',
          title: 'TLS Not Configured',
          description: 'TLS certificate paths not configured',
          cwe: 'CWE-311',
          cvss: 7.5,
          affectedComponents: ['main.ts', 'nginx configuration'],
          remediation: 'Configure TLS_CERT_PATH and TLS_KEY_PATH environment variables',
          references: ['https://owasp.org/www-project-top-ten/'],
        });
      }

      // Check for insecure protocols
      // This would check if the application is configured to use HTTP instead of HTTPS

      return result;
    } catch (error) {
      this.logger.error(`Network audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Network audit failed: ${error.message}`,
        remediation: 'Review network configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Audits data security
   */
  private async auditDataSecurity(): Promise<SecurityAuditResult> {
    const result: SecurityAuditResult = {
      id: `data-${Date.now()}`,
      timestamp: new Date(),
      type: 'compliance',
      status: 'pass',
      severity: 'high',
      title: 'Data Security Audit',
      description: 'Audit of data protection and privacy measures',
      findings: [],
      recommendations: [],
      evidence: {},
    };

    try {
      // Check for unencrypted sensitive data in database
      const usersWithPlainPasswords = await this.prisma.user.count({
        where: {
          password: { not: null },
          passwordEncrypted: null
        }
      });

      if (usersWithPlainPasswords > 0) {
        result.status = 'fail';
        result.findings.push({
          id: 'unencrypted-passwords',
          category: 'encryption',
          severity: 'critical',
          title: 'Unencrypted Passwords in Database',
          description: `${usersWithPlainPasswords} users have unencrypted passwords`,
          cwe: 'CWE-311',
          cvss: 9.8,
          affectedComponents: ['prisma.schema', 'database'],
          remediation: 'Encrypt all plain text passwords using DatabaseEncryptionService',
          references: ['https://owasp.org/www-project-top-ten/'],
        });
      }

      // Check for exposed PII in logs
      const recentLogs = await this.auditLogService.queryAuditLogs({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 1000,
      });

      const logsWithPII = recentLogs.filter(log => {
        const detailsString = JSON.stringify(log.details);
        return /\b\d{11}\b/.test(detailsString) || // PESEL pattern
               /\b\d{10}\b/.test(detailsString) || // NIP pattern
               /password|token|secret/i.test(detailsString);
      });

      if (logsWithPII.length > 0) {
        result.status = 'warning';
        result.findings.push({
          id: 'pii-in-logs',
          category: 'configuration',
          severity: 'medium',
          title: 'PII Detected in Audit Logs',
          description: `${logsWithPII.length} log entries contain potential PII`,
          cwe: 'CWE-532',
          cvss: 6.5,
          affectedComponents: ['audit-log.service.ts'],
          remediation: 'Implement PII masking in audit logs',
          references: ['https://owasp.org/www-project-top-ten/'],
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Data security audit failed: ${error.message}`);
      result.status = 'error';
      result.findings.push({
        id: 'audit-error',
        category: 'configuration',
        severity: 'medium',
        title: 'Audit Check Error',
        description: `Data security audit failed: ${error.message}`,
        remediation: 'Review data protection configuration',
        references: [],
        affectedComponents: ['security-audit.service.ts'],
      });

      return result;
    }
  }

  /**
   * Helper methods
   */
  private checkConflictingPermissions(roles: any[]): boolean {
    // Check for conflicting permissions across roles
    const allPermissions = new Set<string>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        if (allPermissions.has(permission.name)) {
          return true; // Duplicate permission found
        }
        allPermissions.add(permission.name);
      }
    }

    return false;
  }

  private async saveAuditResults(results: SecurityAuditResult[]): Promise<void> {
    try {
      for (const result of results) {
        await this.prisma.securityAudit.create({
          data: {
            tenant_id: 'system', // Default to 'system' for audit results
            type: result.type,
            status: result.status,
            severity: result.severity,
            title: result.title,
            description: result.description,
            findings: JSON.stringify(result.findings),
            recommendations: JSON.stringify(result.recommendations),
            evidence: JSON.stringify(result.evidence),
            timestamp: result.timestamp,
          }
        });
      }
    } catch (error) {
      this.logger.error(`Failed to save audit results: ${error.message}`);
    }
  }
}