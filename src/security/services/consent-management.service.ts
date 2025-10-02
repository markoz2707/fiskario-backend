import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DatabaseEncryptionService } from './database-encryption.service';

export interface ConsentTemplate {
  id: string;
  name: string;
  version: string;
  title: string;
  description: string;
  purposes: ConsentPurpose[];
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  required: boolean;
  withdrawalEnabled: boolean;
  retentionDays: number;
  language: string;
  content: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentPurpose {
  id: string;
  name: string;
  description: string;
  required: boolean;
  category: 'marketing' | 'analytics' | 'functional' | 'necessary';
}

export interface ConsentRequest {
  templateId: string;
  dataSubjectId: string;
  purposes: string[];
  consentMethod: 'explicit' | 'implied' | 'opt_out';
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  additionalData?: any;
}

export interface ConsentResponse {
  consentId: string;
  status: 'granted' | 'denied' | 'withdrawn';
  grantedPurposes: string[];
  deniedPurposes: string[];
  timestamp: Date;
  expiresAt?: Date;
}

@Injectable()
export class ConsentManagementService {
  private readonly logger = new Logger(ConsentManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: DatabaseEncryptionService,
  ) {}

  /**
   * Creates a consent template for GDPR compliance
   */
  async createConsentTemplate(template: Omit<ConsentTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const newTemplate = await this.prisma.consentTemplate.create({
        data: {
          name: template.name,
          version: template.version,
          title: template.title,
          description: template.description,
          purposes: JSON.stringify(template.purposes),
          legalBasis: template.legalBasis,
          required: template.required,
          withdrawalEnabled: template.withdrawalEnabled,
          retentionDays: template.retentionDays,
          language: template.language,
          content: template.content,
          isActive: template.isActive,
        }
      });

      this.logger.log(`Consent template created: ${template.name} v${template.version}`);

      return newTemplate.id;
    } catch (error) {
      this.logger.error(`Failed to create consent template: ${error.message}`, error.stack);
      throw new Error(`Consent template creation failed: ${error.message}`);
    }
  }

  /**
   * Requests consent from data subject
   */
  async requestConsent(request: ConsentRequest): Promise<ConsentResponse> {
    try {
      // Validate template exists and is active
      const template = await this.prisma.consentTemplate.findUnique({
        where: { id: request.templateId }
      });

      if (!template || !template.isActive) {
        throw new Error('Invalid or inactive consent template');
      }

      // Parse template purposes
      const templatePurposes = JSON.parse(template.purposes) as ConsentPurpose[];

      // Validate requested purposes exist in template
      const validPurposes = templatePurposes.map(p => p.id);
      const invalidPurposes = request.purposes.filter(p => !validPurposes.includes(p));

      if (invalidPurposes.length > 0) {
        throw new Error(`Invalid purposes: ${invalidPurposes.join(', ')}`);
      }

      // Check for existing consent
      const existingConsent = await this.prisma.consentRecord.findFirst({
        where: {
          dataSubjectId: request.dataSubjectId,
          templateId: request.templateId,
          status: 'active'
        }
      });

      if (existingConsent) {
        // Return existing consent status
        return {
          consentId: existingConsent.id,
          status: 'granted',
          grantedPurposes: existingConsent.purposes,
          deniedPurposes: [],
          timestamp: existingConsent.consentDate,
          expiresAt: new Date(existingConsent.consentDate.getTime() + template.retentionDays * 24 * 60 * 60 * 1000),
        };
      }

      // Create new consent record
      const consentRecord = await this.prisma.consentRecord.create({
        data: {
          dataSubjectId: request.dataSubjectId,
          templateId: request.templateId,
          purposes: request.purposes,
          legalBasis: template.legalBasis,
          consentMethod: request.consentMethod,
          consentText: template.content,
          consentDate: new Date(),
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          location: request.location,
          status: 'active',
          withdrawalDate: null,
          withdrawalReason: null,
          additionalData: request.additionalData ? JSON.stringify(request.additionalData) : null,
        }
      });

      // Calculate expiration date
      const expiresAt = new Date(consentRecord.consentDate.getTime() + template.retentionDays * 24 * 60 * 60 * 1000);

      this.logger.log(`Consent granted for subject ${request.dataSubjectId}, purposes: ${request.purposes.join(', ')}`);

      return {
        consentId: consentRecord.id,
        status: 'granted',
        grantedPurposes: request.purposes,
        deniedPurposes: [],
        timestamp: consentRecord.consentDate,
        expiresAt,
      };
    } catch (error) {
      this.logger.error(`Consent request failed: ${error.message}`, error.stack);
      throw new Error(`Consent request failed: ${error.message}`);
    }
  }

  /**
   * Withdraws consent for specific purposes or all purposes
   */
  async withdrawConsent(
    dataSubjectId: string,
    consentId: string,
    purposes?: string[],
    reason?: string
  ): Promise<void> {
    try {
      const consentRecord = await this.prisma.consentRecord.findUnique({
        where: { id: consentId }
      });

      if (!consentRecord || consentRecord.dataSubjectId !== dataSubjectId) {
        throw new Error('Consent record not found or access denied');
      }

      if (consentRecord.status === 'withdrawn') {
        throw new Error('Consent already withdrawn');
      }

      // Update consent record
      await this.prisma.consentRecord.update({
        where: { id: consentId },
        data: {
          status: 'withdrawn',
          withdrawalDate: new Date(),
          withdrawalReason: reason || 'User requested withdrawal',
        }
      });

      // If specific purposes are being withdrawn, create new consent record for remaining purposes
      if (purposes && purposes.length > 0) {
        const remainingPurposes = consentRecord.purposes.filter(p => !purposes.includes(p));

        if (remainingPurposes.length > 0) {
          await this.prisma.consentRecord.create({
            data: {
              dataSubjectId,
              templateId: consentRecord.templateId,
              purposes: remainingPurposes,
              legalBasis: consentRecord.legalBasis,
              consentMethod: consentRecord.consentMethod,
              consentText: consentRecord.consentText,
              consentDate: new Date(),
              status: 'active',
            }
          });
        }
      }

      // Update related data processing records
      await this.prisma.dataProcessingRecord.updateMany({
        where: {
          dataSubjectId,
          consentId,
          status: 'active'
        },
        data: {
          status: 'withdrawn',
          endDate: new Date(),
        }
      });

      this.logger.log(`Consent withdrawn for subject ${dataSubjectId}`);
    } catch (error) {
      this.logger.error(`Consent withdrawal failed: ${error.message}`, error.stack);
      throw new Error(`Consent withdrawal failed: ${error.message}`);
    }
  }

  /**
   * Gets consent status for data subject
   */
  async getConsentStatus(dataSubjectId: string, templateId?: string): Promise<any[]> {
    try {
      const where: any = { dataSubjectId };
      if (templateId) {
        where.templateId = templateId;
      }

      const consents = await this.prisma.consentRecord.findMany({
        where,
        include: {
          template: true
        },
        orderBy: { consentDate: 'desc' }
      });

      return consents.map(consent => ({
        consentId: consent.id,
        templateId: consent.templateId,
        templateName: consent.template?.name,
        templateVersion: consent.template?.version,
        purposes: consent.purposes,
        legalBasis: consent.legalBasis,
        status: consent.status,
        consentDate: consent.consentDate,
        withdrawalDate: consent.withdrawalDate,
        withdrawalReason: consent.withdrawalReason,
        expiresAt: consent.template ?
          new Date(consent.consentDate.getTime() + consent.template.retentionDays * 24 * 60 * 60 * 1000) :
          null,
      }));
    } catch (error) {
      this.logger.error(`Failed to get consent status: ${error.message}`, error.stack);
      throw new Error(`Consent status retrieval failed: ${error.message}`);
    }
  }

  /**
   * Checks if data subject has valid consent for specific purposes
   */
  async hasValidConsent(
    dataSubjectId: string,
    purposes: string[],
    templateId?: string
  ): Promise<boolean> {
    try {
      const where: any = {
        dataSubjectId,
        status: 'active'
      };

      if (templateId) {
        where.templateId = templateId;
      }

      const validConsents = await this.prisma.consentRecord.findMany({
        where: {
          ...where,
          consentDate: {
            gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Within last year
          }
        }
      });

      // Check if all required purposes are covered by valid consents
      for (const purpose of purposes) {
        const hasPurpose = validConsents.some(consent =>
          consent.purposes.includes(purpose)
        );

        if (!hasPurpose) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Consent validation failed: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generates consent audit report for GDPR compliance
   */
  async generateConsentAuditReport(
    startDate: Date,
    endDate: Date,
    templateId?: string
  ): Promise<any> {
    try {
      const where: any = {
        consentDate: {
          gte: startDate,
          lte: endDate
        }
      };

      if (templateId) {
        where.templateId = templateId;
      }

      const consents = await this.prisma.consentRecord.findMany({
        where,
        include: {
          template: true
        }
      });

      // Group by status
      const statusGroups = consents.reduce((acc, consent) => {
        acc[consent.status] = (acc[consent.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Group by purpose
      const purposeGroups = consents.reduce((acc, consent) => {
        consent.purposes.forEach(purpose => {
          acc[purpose] = (acc[purpose] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>);

      // Group by legal basis
      const legalBasisGroups = consents.reduce((acc, consent) => {
        acc[consent.legalBasis] = (acc[consent.legalBasis] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const report = {
        period: { startDate, endDate },
        summary: {
          totalConsents: consents.length,
          activeConsents: statusGroups.active || 0,
          withdrawnConsents: statusGroups.withdrawn || 0,
          expiredConsents: statusGroups.expired || 0,
        },
        byPurpose: Object.entries(purposeGroups).map(([purpose, count]) => ({
          purpose,
          count
        })),
        byLegalBasis: Object.entries(legalBasisGroups).map(([basis, count]) => ({
          legalBasis: basis,
          count
        })),
        withdrawalRate: ((statusGroups.withdrawn || 0) / consents.length * 100).toFixed(2) + '%',
        complianceScore: this.calculateComplianceScore(consents),
      };

      return report;
    } catch (error) {
      this.logger.error(`Consent audit report generation failed: ${error.message}`, error.stack);
      throw new Error(`Consent audit report generation failed: ${error.message}`);
    }
  }

  /**
   * Manages consent lifecycle (expiration, renewal)
   */
  async manageConsentLifecycle(): Promise<void> {
    try {
      // Find expired consents
      const expiredConsents = await this.prisma.consentRecord.findMany({
        where: {
          status: 'active',
          template: {
            retentionDays: {
              not: null
            }
          }
        },
        include: {
          template: true
        }
      });

      for (const consent of expiredConsents) {
        const expirationDate = new Date(
          consent.consentDate.getTime() + consent.template.retentionDays * 24 * 60 * 60 * 1000
        );

        if (expirationDate <= new Date()) {
          await this.prisma.consentRecord.update({
            where: { id: consent.id },
            data: {
              status: 'expired',
            }
          });

          // Update related data processing records
          await this.prisma.dataProcessingRecord.updateMany({
            where: {
              consentId: consent.id,
              status: 'active'
            },
            data: {
              status: 'expired',
              endDate: new Date(),
            }
          });
        }
      }

      this.logger.log(`Processed ${expiredConsents.length} consent records for lifecycle management`);
    } catch (error) {
      this.logger.error(`Consent lifecycle management failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Creates consent dashboard data for administrators
   */
  async getConsentDashboard(companyId: string): Promise<any> {
    try {
      const consents = await this.prisma.consentRecord.findMany({
        where: {
          template: {
            // Assuming templates are linked to companies
            // This would need to be adjusted based on actual schema
          }
        },
        include: {
          template: true
        }
      });

      const dashboard = {
        overview: {
          totalConsents: consents.length,
          activeConsents: consents.filter(c => c.status === 'active').length,
          withdrawnConsents: consents.filter(c => c.status === 'withdrawn').length,
          expiredConsents: consents.filter(c => c.status === 'expired').length,
        },
        trends: {
          daily: await this.getDailyConsentTrends(30),
          byPurpose: await this.getConsentTrendsByPurpose(),
        },
        compliance: {
          withdrawalRate: this.calculateWithdrawalRate(consents),
          averageRetention: this.calculateAverageRetention(consents),
          legalBasisDistribution: this.getLegalBasisDistribution(consents),
        },
        alerts: {
          expiringSoon: await this.getExpiringConsents(30), // Next 30 days
          highWithdrawalRate: await this.checkHighWithdrawalRate(),
        },
      };

      return dashboard;
    } catch (error) {
      this.logger.error(`Consent dashboard generation failed: ${error.message}`, error.stack);
      throw new Error(`Consent dashboard generation failed: ${error.message}`);
    }
  }

  /**
   * Helper methods
   */
  private calculateComplianceScore(consents: any[]): number {
    if (consents.length === 0) return 100;

    const activeConsents = consents.filter(c => c.status === 'active').length;
    const withdrawnConsents = consents.filter(c => c.status === 'withdrawn').length;

    const complianceRate = (activeConsents / consents.length) * 100;
    const withdrawalRate = (withdrawnConsents / consents.length) * 100;

    // Penalize high withdrawal rates
    const penalty = withdrawalRate > 10 ? (withdrawalRate - 10) * 2 : 0;

    return Math.max(0, complianceRate - penalty);
  }

  private calculateWithdrawalRate(consents: any[]): string {
    if (consents.length === 0) return '0%';

    const withdrawn = consents.filter(c => c.status === 'withdrawn').length;
    return ((withdrawn / consents.length) * 100).toFixed(2) + '%';
  }

  private calculateAverageRetention(consents: any[]): number {
    const activeConsents = consents.filter(c => c.status === 'active');

    if (activeConsents.length === 0) return 0;

    const totalDays = activeConsents.reduce((sum, consent) => {
      const days = Math.floor(
        (Date.now() - new Date(consent.consentDate).getTime()) / (24 * 60 * 60 * 1000)
      );
      return sum + days;
    }, 0);

    return Math.round(totalDays / activeConsents.length);
  }

  private getLegalBasisDistribution(consents: any[]): Array<{ basis: string; count: number }> {
    const distribution = consents.reduce((acc, consent) => {
      acc[consent.legalBasis] = (acc[consent.legalBasis] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(distribution).map(([basis, count]) => ({
      basis,
      count: count as number
    }));
  }

  private async getDailyConsentTrends(days: number): Promise<Array<{ date: string; count: number }>> {
    // Implementation would aggregate consents by day
    // This is a simplified version
    return [];
  }

  private async getConsentTrendsByPurpose(): Promise<Array<{ purpose: string; count: number }>> {
    // Implementation would aggregate consents by purpose
    // This is a simplified version
    return [];
  }

  private async getExpiringConsents(days: number): Promise<number> {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const expiringConsents = await this.prisma.consentRecord.findMany({
      where: {
        status: 'active',
        template: {
          retentionDays: {
            not: null
          }
        }
      },
      include: {
        template: true
      }
    });

    return expiringConsents.filter(consent => {
      const expirationDate = new Date(
        consent.consentDate.getTime() + consent.template.retentionDays * 24 * 60 * 60 * 1000
      );
      return expirationDate <= futureDate;
    }).length;
  }

  private async checkHighWithdrawalRate(): Promise<boolean> {
    // Check if withdrawal rate exceeds threshold (e.g., 15%)
    const recentConsents = await this.prisma.consentRecord.findMany({
      where: {
        consentDate: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    });

    if (recentConsents.length === 0) return false;

    const withdrawnCount = recentConsents.filter(c => c.status === 'withdrawn').length;
    const withdrawalRate = (withdrawnCount / recentConsents.length) * 100;

    return withdrawalRate > 15;
  }
}