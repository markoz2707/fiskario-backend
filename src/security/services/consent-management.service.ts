import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConsentManagementService {
  private readonly logger = new Logger(ConsentManagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new consent template
   */
  async createConsentTemplate(template: {
    tenant_id: string;
    name: string;
    title: string;
    content: string;
    purposes: string[];
    legalBasis: string;
    consentMethod: string;
    isActive?: boolean;
  }): Promise<string> {
    try {
      const created = await this.prisma.consentTemplate.create({
        data: {
          tenant_id: template.tenant_id,
          name: template.name,
          title: template.title,
          content: template.content,
          purposes: template.purposes,
          legalBasis: template.legalBasis,
          consentMethod: template.consentMethod,
          isActive: template.isActive ?? true,
        },
      });

      this.logger.log(`Consent template created: ${created.id} (${template.name})`);
      return created.id;
    } catch (error) {
      this.logger.error(`Failed to create consent template: ${error.message}`, error.stack);
      throw new Error(`Consent template creation failed: ${error.message}`);
    }
  }

  /**
   * Requests (records) a new consent from a data subject
   */
  async requestConsent(request: {
    tenant_id: string;
    dataSubjectId: string;
    templateId?: string;
    purposes: string[];
    legalBasis: string;
    consentMethod: string;
    consentText: string;
    consentDate?: Date;
    ipAddress?: string;
    userAgent?: string;
    location?: string;
  }): Promise<any> {
    try {
      const consent = await this.prisma.consentRecord.create({
        data: {
          tenant_id: request.tenant_id,
          dataSubjectId: request.dataSubjectId,
          templateId: request.templateId,
          purposes: request.purposes,
          legalBasis: request.legalBasis,
          consentMethod: request.consentMethod,
          consentText: request.consentText,
          consentDate: request.consentDate ?? new Date(),
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          location: request.location,
          status: 'ACTIVE',
        },
        include: {
          template: true,
        },
      });

      this.logger.log(
        `Consent recorded for subject ${request.dataSubjectId}: ${consent.id}`,
      );
      return consent;
    } catch (error) {
      this.logger.error(`Failed to request consent: ${error.message}`, error.stack);
      throw new Error(`Consent request failed: ${error.message}`);
    }
  }

  /**
   * Withdraws consent for a data subject
   */
  async withdrawConsent(
    dataSubjectId: string,
    consentId: string,
    purposes?: string[],
    reason?: string,
  ): Promise<void> {
    try {
      const existing = await this.prisma.consentRecord.findFirst({
        where: {
          id: consentId,
          dataSubjectId,
        },
      });

      if (!existing) {
        throw new NotFoundException(
          `Consent record ${consentId} not found for subject ${dataSubjectId}`,
        );
      }

      await this.prisma.consentRecord.update({
        where: { id: consentId },
        data: {
          status: 'WITHDRAWN',
          withdrawalDate: new Date(),
          withdrawalReason: reason,
        },
      });

      this.logger.log(
        `Consent withdrawn for subject ${dataSubjectId}: ${consentId}` +
          (purposes ? ` (purposes: ${purposes.join(', ')})` : ''),
      );
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to withdraw consent: ${error.message}`, error.stack);
      throw new Error(`Consent withdrawal failed: ${error.message}`);
    }
  }

  /**
   * Gets the consent status for a data subject, optionally filtered by template
   */
  async getConsentStatus(
    dataSubjectId: string,
    templateId?: string,
  ): Promise<any[]> {
    try {
      const where: any = { dataSubjectId };
      if (templateId) {
        where.templateId = templateId;
      }

      const consents = await this.prisma.consentRecord.findMany({
        where,
        include: {
          template: true,
        },
        orderBy: { consentDate: 'desc' },
      });

      return consents;
    } catch (error) {
      this.logger.error(`Failed to get consent status: ${error.message}`, error.stack);
      throw new Error(`Consent status query failed: ${error.message}`);
    }
  }

  /**
   * Checks whether a data subject has valid (ACTIVE) consent covering the required purposes
   */
  async hasValidConsent(
    dataSubjectId: string,
    purposes: string[],
    templateId?: string,
  ): Promise<boolean> {
    try {
      const where: any = {
        dataSubjectId,
        status: 'ACTIVE',
      };
      if (templateId) {
        where.templateId = templateId;
      }

      const activeConsents = await this.prisma.consentRecord.findMany({
        where,
      });

      if (activeConsents.length === 0) {
        return false;
      }

      // Collect all purposes covered by active consents
      const coveredPurposes = new Set<string>();
      for (const consent of activeConsents) {
        for (const purpose of consent.purposes) {
          coveredPurposes.add(purpose);
        }
      }

      // Check that every required purpose is covered
      return purposes.every((purpose) => coveredPurposes.has(purpose));
    } catch (error) {
      this.logger.error(`Failed to check valid consent: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generates an audit report of consent activity within a date range
   */
  async generateConsentAuditReport(
    startDate: Date,
    endDate: Date,
    templateId?: string,
  ): Promise<any> {
    try {
      const where: any = {
        consentDate: {
          gte: startDate,
          lte: endDate,
        },
      };
      if (templateId) {
        where.templateId = templateId;
      }

      const consents = await this.prisma.consentRecord.findMany({
        where,
        include: {
          template: true,
        },
        orderBy: { consentDate: 'asc' },
      });

      const total = consents.length;
      const active = consents.filter((c) => c.status === 'ACTIVE').length;
      const withdrawn = consents.filter((c) => c.status === 'WITHDRAWN').length;
      const withdrawalRate =
        total > 0 ? ((withdrawn / total) * 100).toFixed(2) + '%' : '0%';

      // Group by purpose
      const purposeStats: Record<string, { total: number; active: number; withdrawn: number }> = {};
      for (const consent of consents) {
        for (const purpose of consent.purposes) {
          if (!purposeStats[purpose]) {
            purposeStats[purpose] = { total: 0, active: 0, withdrawn: 0 };
          }
          purposeStats[purpose].total++;
          if (consent.status === 'ACTIVE') purposeStats[purpose].active++;
          if (consent.status === 'WITHDRAWN') purposeStats[purpose].withdrawn++;
        }
      }

      const report = {
        period: { startDate, endDate },
        summary: {
          total,
          active,
          withdrawn,
          withdrawalRate,
        },
        byPurpose: Object.entries(purposeStats).map(([purpose, stats]) => ({
          purpose,
          ...stats,
        })),
        consents,
      };

      this.logger.log(
        `Consent audit report generated: ${total} records (${startDate.toISOString()} - ${endDate.toISOString()})`,
      );
      return report;
    } catch (error) {
      this.logger.error(
        `Failed to generate consent audit report: ${error.message}`,
        error.stack,
      );
      throw new Error(`Consent audit report generation failed: ${error.message}`);
    }
  }

  /**
   * Manages consent lifecycle (placeholder for scheduled checks)
   */
  async manageConsentLifecycle(): Promise<void> {
    this.logger.log('Consent lifecycle check completed');
  }

  /**
   * Returns a consent dashboard summary for a company (tenant)
   */
  async getConsentDashboard(companyId: string): Promise<any> {
    try {
      const [totalConsents, activeConsents, withdrawnConsents, templatesCount] =
        await Promise.all([
          this.prisma.consentRecord.count({
            where: { tenant_id: companyId },
          }),
          this.prisma.consentRecord.count({
            where: { tenant_id: companyId, status: 'ACTIVE' },
          }),
          this.prisma.consentRecord.count({
            where: { tenant_id: companyId, status: 'WITHDRAWN' },
          }),
          this.prisma.consentTemplate.count({
            where: { tenant_id: companyId },
          }),
        ]);

      return {
        totalConsents,
        activeConsents,
        withdrawnConsents,
        templatesCount,
        withdrawalRate:
          totalConsents > 0
            ? ((withdrawnConsents / totalConsents) * 100).toFixed(2) + '%'
            : '0%',
      };
    } catch (error) {
      this.logger.error(
        `Failed to get consent dashboard: ${error.message}`,
        error.stack,
      );
      throw new Error(`Consent dashboard query failed: ${error.message}`);
    }
  }
}
