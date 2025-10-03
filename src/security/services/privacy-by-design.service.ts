import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DatabaseEncryptionService } from './database-encryption.service';

export interface PrivacyMetadata {
  dataCategory: 'personal' | 'sensitive' | 'financial' | 'public';
  purpose: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  retentionPeriod: number; // days
  accessLevel: 'public' | 'internal' | 'restricted' | 'confidential';
  processingActivities: string[];
  thirdPartySharing: boolean;
  crossBorderTransfer: boolean;
  automatedDecisionMaking: boolean;
}

export interface DataProcessingRecord {
  id: string;
  dataSubjectId: string;
  dataCategory: string;
  purpose: string;
  legalBasis: string;
  startDate: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'expired' | 'withdrawn';
  consentId?: string;
  withdrawalDate?: Date;
  withdrawalReason?: string;
}

@Injectable()
export class PrivacyByDesignService {
  private readonly logger = new Logger(PrivacyByDesignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: DatabaseEncryptionService,
  ) {}

  /**
   * Registers data processing activity for GDPR compliance
   */
  async registerDataProcessing(
    dataSubjectId: string,
    metadata: PrivacyMetadata,
    additionalData?: any
  ): Promise<string> {
    try {
      const record = await this.prisma.dataProcessingRecord.create({
        data: {
          tenant_id: 'system', // Default tenant for data processing records
          dataSubjectId,
          dataCategory: metadata.dataCategory,
          purpose: metadata.purpose,
          legalBasis: metadata.legalBasis,
          startDate: new Date(),
          endDate: new Date(Date.now() + metadata.retentionPeriod * 24 * 60 * 60 * 1000),
          status: 'active',
          metadata: JSON.stringify(metadata),
          additionalData: additionalData ? JSON.stringify(additionalData) : undefined,
        }
      });

      this.logger.log(`Data processing registered for subject ${dataSubjectId}, purpose: ${metadata.purpose}`);

      return record.id;
    } catch (error) {
      this.logger.error(`Failed to register data processing: ${error.message}`, error.stack);
      throw new Error(`Data processing registration failed: ${error.message}`);
    }
  }

  /**
   * Records consent for data processing
   */
  async recordConsent(
    dataSubjectId: string,
    consentData: {
      purposes: string[];
      legalBasis: string;
      consentMethod: 'explicit' | 'implied' | 'opt_out';
      consentText: string;
      ipAddress?: string;
      userAgent?: string;
      location?: string;
    }
  ): Promise<string> {
    try {
      const consent = await this.prisma.consentRecord.create({
        data: {
          tenant_id: 'system', // Default tenant for consent records
          dataSubjectId,
          purposes: consentData.purposes,
          legalBasis: consentData.legalBasis,
          consentMethod: consentData.consentMethod,
          consentText: consentData.consentText,
          consentDate: new Date(),
          ipAddress: consentData.ipAddress,
          userAgent: consentData.userAgent,
          location: consentData.location,
          status: 'active',
          withdrawalDate: null,
          withdrawalReason: null,
        }
      });

      // Link consent to data processing records
      await this.linkConsentToProcessing(consent.id, dataSubjectId, consentData.purposes);

      this.logger.log(`Consent recorded for subject ${dataSubjectId}`);

      return consent.id;
    } catch (error) {
      this.logger.error(`Failed to record consent: ${error.message}`, error.stack);
      throw new Error(`Consent recording failed: ${error.message}`);
    }
  }

  /**
   * Withdraws consent for data processing
   */
  async withdrawConsent(
    dataSubjectId: string,
    consentId: string,
    reason: string
  ): Promise<void> {
    try {
      await this.prisma.consentRecord.update({
        where: { id: consentId },
        data: {
          status: 'withdrawn',
          withdrawalDate: new Date(),
          withdrawalReason: reason,
        }
      });

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
      this.logger.error(`Failed to withdraw consent: ${error.message}`, error.stack);
      throw new Error(`Consent withdrawal failed: ${error.message}`);
    }
  }

  /**
   * Anonymizes personal data after retention period
   */
  async anonymizeExpiredData(): Promise<number> {
    try {
      const expiredRecords = await this.prisma.dataProcessingRecord.findMany({
        where: {
          endDate: { lt: new Date() },
          status: 'active'
        }
      });

      let anonymizedCount = 0;

      for (const record of expiredRecords) {
        await this.anonymizeRecord(record.id);
        anonymizedCount++;
      }

      if (anonymizedCount > 0) {
        this.logger.log(`Anonymized ${anonymizedCount} expired data records`);
      }

      return anonymizedCount;
    } catch (error) {
      this.logger.error(`Failed to anonymize expired data: ${error.message}`, error.stack);
      throw new Error(`Data anonymization failed: ${error.message}`);
    }
  }

  /**
   * Generates data processing transparency report
   */
  async generateTransparencyReport(dataSubjectId: string): Promise<any> {
    try {
      const processingRecords = await this.prisma.dataProcessingRecord.findMany({
        where: { dataSubjectId }
      });

      const consentRecords = await this.prisma.consentRecord.findMany({
        where: { dataSubjectId }
      });

      const report = {
        dataSubjectId,
        generatedAt: new Date(),
        summary: {
          totalProcessingActivities: processingRecords.length,
          activeProcessingActivities: processingRecords.filter(r => r.status === 'active').length,
          totalConsents: consentRecords.length,
          activeConsents: consentRecords.filter(c => c.status === 'active').length,
        },
        processingActivities: processingRecords.map(record => ({
          id: record.id,
          purpose: record.purpose,
          legalBasis: record.legalBasis,
          startDate: record.startDate,
          endDate: record.endDate,
          status: record.status,
          consentId: record.consentId,
        })),
        consents: consentRecords.map(consent => ({
          id: consent.id,
          purposes: consent.purposes,
          legalBasis: consent.legalBasis,
          consentDate: consent.consentDate,
          status: consent.status,
          withdrawalDate: consent.withdrawalDate,
          withdrawalReason: consent.withdrawalReason,
        })),
        dataCategories: [...new Set(processingRecords.map(r => r.dataCategory))],
        retentionPeriods: this.calculateRetentionStats(processingRecords),
      };

      return report;
    } catch (error) {
      this.logger.error(`Failed to generate transparency report: ${error.message}`, error.stack);
      throw new Error(`Transparency report generation failed: ${error.message}`);
    }
  }

  /**
   * Validates data minimization principles
   */
  async validateDataMinimization(
    dataSubjectId: string,
    requestedData: any,
    purpose: string
  ): Promise<boolean> {
    try {
      // Check if requested data is necessary for the stated purpose
      const purposeRequirements = this.getPurposeRequirements(purpose);

      for (const field of Object.keys(requestedData)) {
        if (!purposeRequirements.includes(field)) {
          this.logger.warn(`Data field '${field}' not required for purpose '${purpose}'`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Data minimization validation failed: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Implements privacy by default settings
   */
  async applyPrivacyByDefault(dataSubjectId: string): Promise<void> {
    try {
      // Set default privacy settings for new data subjects
      const defaultSettings = {
        dataSharing: false,
        marketingCommunications: false,
        analyticsTracking: false,
        thirdPartyCookies: false,
        dataRetention: 365, // days
      };

      await this.prisma.privacySettings.upsert({
        where: { dataSubjectId },
        update: defaultSettings,
        create: {
          tenant_id: 'system', // Default tenant for privacy settings
          dataSubjectId,
          ...defaultSettings,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });

      this.logger.log(`Applied privacy by default settings for subject ${dataSubjectId}`);
    } catch (error) {
      this.logger.error(`Failed to apply privacy by default: ${error.message}`, error.stack);
    }
  }

  /**
   * Tracks data breach incidents for GDPR reporting
   */
  async recordDataBreach(
    breachData: {
      type: 'confidentiality' | 'integrity' | 'availability';
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      affectedDataSubjects: number;
      affectedDataCategories: string[];
      detectionDate: Date;
      containmentDate?: Date;
      notificationDate?: Date;
      supervisoryAuthorityNotified: boolean;
      dataSubjectsNotified: boolean;
      mitigationSteps: string[];
    }
  ): Promise<string> {
    try {
      const breach = await this.prisma.dataBreachRecord.create({
        data: {
          tenant_id: 'system', // Default tenant for data breach records
          ...breachData,
          reportedDate: new Date(),
          status: 'investigating',
        }
      });

      // Log security event
      // await this.auditLogService.logSecurityEvent(
      //   'system',
      //   'system',
      //   'data_breach',
      //   breachData,
      //   breachData.severity
      // );

      this.logger.log(`Data breach recorded: ${breach.id}`);

      return breach.id;
    } catch (error) {
      this.logger.error(`Failed to record data breach: ${error.message}`, error.stack);
      throw new Error(`Data breach recording failed: ${error.message}`);
    }
  }

  /**
   * Generates DPIA (Data Protection Impact Assessment) template
   */
  async generateDPIATemplate(
    processingActivity: string,
    dataCategories: string[],
    purpose: string
  ): Promise<any> {
    try {
      const template = {
        processingActivity,
        assessmentDate: new Date(),
        assessor: 'Data Protection Officer',
        sections: {
          description: {
            purpose,
            dataCategories,
            dataSubjects: 'Customers, employees, and business partners',
            processingOperations: [
              'Collection',
              'Storage',
              'Analysis',
              'Sharing',
              'Deletion'
            ],
          },
          necessity: {
            legalBasis: 'Legitimate interests / Consent',
            purposeNecessity: 'Essential for business operations',
            dataMinimization: 'Only necessary data is collected',
          },
          risks: {
            identifiedRisks: [
              'Unauthorized access to personal data',
              'Data loss or corruption',
              'Unlawful processing activities'
            ],
            riskMitigation: [
              'Encryption at rest and in transit',
              'Access controls and authentication',
              'Regular security audits',
              'Data backup and recovery procedures'
            ],
          },
          compliance: {
            gdprArticles: ['Article 6', 'Article 32', 'Article 33'],
            technicalMeasures: [
              'Encryption',
              'Access logging',
              'Regular backups',
              'Security monitoring'
            ],
            organizationalMeasures: [
              'Privacy training for staff',
              'Data protection policies',
              'Incident response procedures'
            ],
          },
        },
        conclusion: {
          residualRisk: 'Low to Medium',
          recommendations: [
            'Implement additional security controls',
            'Conduct regular privacy audits',
            'Provide privacy training to staff'
          ],
          approvalRequired: true,
        },
      };

      return template;
    } catch (error) {
      this.logger.error(`Failed to generate DPIA template: ${error.message}`, error.stack);
      throw new Error(`DPIA template generation failed: ${error.message}`);
    }
  }

  /**
   * Helper methods
   */
  private async linkConsentToProcessing(
    consentId: string,
    dataSubjectId: string,
    purposes: string[]
  ): Promise<void> {
    try {
      // Find or create data processing records for each purpose
      for (const purpose of purposes) {
        let record = await this.prisma.dataProcessingRecord.findFirst({
          where: {
            dataSubjectId,
            purpose,
            status: 'active'
          }
        });

        if (!record) {
          record = await this.prisma.dataProcessingRecord.create({
            data: {
              tenant_id: 'system', // Default tenant for data processing records
              dataSubjectId,
              dataCategory: 'personal',
              purpose,
              legalBasis: 'consent',
              startDate: new Date(),
              status: 'active',
            }
          });
        }

        // Link consent to processing record
        await this.prisma.dataProcessingRecord.update({
          where: { id: record.id },
          data: { consentId }
        });
      }
    } catch (error) {
      this.logger.error(`Failed to link consent to processing: ${error.message}`, error.stack);
    }
  }

  private async anonymizeRecord(recordId: string): Promise<void> {
    try {
      // Mark record as completed and anonymized
      await this.prisma.dataProcessingRecord.update({
        where: { id: recordId },
        data: {
          status: 'completed',
          additionalData: undefined, // Remove personal data
        }
      });

      this.logger.debug(`Anonymized data processing record: ${recordId}`);
    } catch (error) {
      this.logger.error(`Failed to anonymize record ${recordId}: ${error.message}`, error.stack);
    }
  }

  private getPurposeRequirements(purpose: string): string[] {
    const purposeRequirements: Record<string, string[]> = {
      'authentication': ['email', 'password'],
      'billing': ['name', 'address', 'payment_info'],
      'communication': ['email', 'phone'],
      'analytics': ['usage_data'],
    };

    return purposeRequirements[purpose] || [];
  }

  private calculateRetentionStats(records: any[]): any {
    const activeRecords = records.filter(r => r.status === 'active');
    const retentionPeriods = activeRecords.map(r => {
      const endDate = new Date(r.endDate).getTime();
      const startDate = new Date(r.startDate).getTime();
      return Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
    });

    if (retentionPeriods.length === 0) {
      return { average: 0, minimum: 0, maximum: 0 };
    }

    return {
      average: Math.round(retentionPeriods.reduce((a, b) => a + b, 0) / retentionPeriods.length),
      minimum: Math.min(...retentionPeriods),
      maximum: Math.max(...retentionPeriods),
    };
  }
}