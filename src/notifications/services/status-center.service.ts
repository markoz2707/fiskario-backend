import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface OfficialCommunication {
  id: string;
  type: 'submission' | 'confirmation' | 'rejection' | 'correction' | 'inquiry';
  entityType: 'invoice' | 'declaration' | 'zus' | 'tax';
  entityId: string;
  status: 'sent' | 'delivered' | 'acknowledged' | 'rejected' | 'pending_response';
  direction: 'outbound' | 'inbound';
  officialBody: 'urzad_skarbowy' | 'zus' | 'ksef' | 'other';
  referenceNumber?: string;
  upoNumber?: string; // Official confirmation number
  description: string;
  content: Record<string, any>;
  responseRequired: boolean;
  responseDeadline?: Date;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunicationStatus {
  totalCommunications: number;
  pendingResponses: number;
  acknowledged: number;
  rejected: number;
  byEntityType: Record<string, number>;
  byOfficialBody: Record<string, number>;
  recentActivity: OfficialCommunication[];
}

@Injectable()
export class StatusCenterService {
  private readonly logger = new Logger(StatusCenterService.name);

  constructor(private prisma: PrismaService) {}

  async recordCommunication(
    tenantId: string,
    companyId: string,
    communication: Omit<OfficialCommunication, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<OfficialCommunication> {
    try {
      const newCommunication = await this.prisma.officialCommunication.create({
        data: {
          tenant_id: tenantId,
          company_id: companyId,
          type: communication.type,
          entityType: communication.entityType,
          entityId: communication.entityId,
          status: communication.status,
          direction: communication.direction,
          officialBody: communication.officialBody,
          referenceNumber: communication.referenceNumber,
          upoNumber: communication.upoNumber,
          description: communication.description,
          content: communication.content,
          responseRequired: communication.responseRequired,
          responseDeadline: communication.responseDeadline,
          respondedAt: communication.respondedAt,
        },
      });

      // Create audit log entry
      await this.createAuditLog(tenantId, companyId, 'communication_recorded', {
        communicationId: newCommunication.id,
        type: communication.type,
        entityType: communication.entityType,
        officialBody: communication.officialBody,
      });

      this.logger.log(`Recorded official communication: ${newCommunication.id}`);
      return newCommunication;
    } catch (error) {
      this.logger.error(`Error recording communication: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateCommunicationStatus(
    communicationId: string,
    status: OfficialCommunication['status'],
    additionalData?: Record<string, any>,
  ): Promise<OfficialCommunication> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (additionalData) {
        updateData.content = additionalData;
      }

      if (status === 'acknowledged' || status === 'rejected') {
        updateData.respondedAt = new Date();
      }

      const updatedCommunication = await this.prisma.officialCommunication.update({
        where: { id: communicationId },
        data: updateData,
      });

      // Create audit log entry
      await this.createAuditLog(updatedCommunication.tenant_id, updatedCommunication.company_id, 'communication_updated', {
        communicationId,
        oldStatus: 'unknown', // You'd want to fetch the old status first
        newStatus: status,
      });

      this.logger.log(`Updated communication ${communicationId} status to ${status}`);
      return updatedCommunication;
    } catch (error) {
      this.logger.error(`Error updating communication status: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCommunications(
    tenantId: string,
    companyId: string,
    filters?: {
      entityType?: string;
      officialBody?: string;
      status?: string;
      direction?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    communications: OfficialCommunication[];
    total: number;
    summary: CommunicationStatus;
  }> {
    try {
      const whereClause: any = {
        tenant_id: tenantId,
        company_id: companyId,
      };

      if (filters?.entityType) {
        whereClause.entityType = filters.entityType;
      }

      if (filters?.officialBody) {
        whereClause.officialBody = filters.officialBody;
      }

      if (filters?.status) {
        whereClause.status = filters.status;
      }

      if (filters?.direction) {
        whereClause.direction = filters.direction;
      }

      const [communications, total] = await Promise.all([
        this.prisma.officialCommunication.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: filters?.limit || 50,
          skip: filters?.offset || 0,
        }),
        this.prisma.officialCommunication.count({
          where: whereClause,
        }),
      ]);

      const summary = await this.generateCommunicationSummary(tenantId, companyId);

      return {
        communications,
        total,
        summary,
      };
    } catch (error) {
      this.logger.error(`Error fetching communications: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCommunicationById(communicationId: string): Promise<OfficialCommunication | null> {
    try {
      const communication = await this.prisma.officialCommunication.findUnique({
        where: { id: communicationId },
      });

      return communication;
    } catch (error) {
      this.logger.error(`Error fetching communication ${communicationId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPendingResponses(tenantId: string, companyId: string): Promise<OfficialCommunication[]> {
    try {
      const pendingResponses = await this.prisma.officialCommunication.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          responseRequired: true,
          respondedAt: null,
          responseDeadline: {
            gt: new Date(),
          },
        },
        orderBy: { responseDeadline: 'asc' },
      });

      return pendingResponses;
    } catch (error) {
      this.logger.error(`Error fetching pending responses: ${error.message}`, error.stack);
      throw error;
    }
  }

  async recordSubmissionStatus(
    tenantId: string,
    companyId: string,
    entityType: OfficialCommunication['entityType'],
    entityId: string,
    status: 'submitted' | 'accepted' | 'rejected',
    referenceNumber?: string,
    upoNumber?: string,
    details?: Record<string, any>,
  ): Promise<OfficialCommunication> {
    try {
      const communicationType = status === 'submitted' ? 'submission' : 'confirmation';
      const communicationStatus = status === 'submitted' ? 'sent' : status === 'accepted' ? 'acknowledged' : 'rejected';

      const communication = await this.recordCommunication(tenantId, companyId, {
        type: communicationType,
        entityType,
        entityId,
        status: communicationStatus,
        direction: 'outbound',
        officialBody: this.getOfficialBodyForEntityType(entityType),
        referenceNumber,
        upoNumber,
        description: `${entityType} ${status} - ${referenceNumber || entityId}`,
        content: {
          submissionStatus: status,
          details: details || {},
          timestamp: new Date(),
        },
        responseRequired: false,
      });

      return communication;
    } catch (error) {
      this.logger.error(`Error recording submission status: ${error.message}`, error.stack);
      throw error;
    }
  }

  async recordIncomingCommunication(
    tenantId: string,
    companyId: string,
    entityType: OfficialCommunication['entityType'],
    entityId: string,
    communicationData: {
      type: OfficialCommunication['type'];
      officialBody: OfficialCommunication['officialBody'];
      referenceNumber?: string;
      description: string;
      content: Record<string, any>;
      responseRequired?: boolean;
      responseDeadline?: Date;
    },
  ): Promise<OfficialCommunication> {
    try {
      const communication = await this.recordCommunication(tenantId, companyId, {
        type: communicationData.type,
        entityType,
        entityId,
        status: 'delivered',
        direction: 'inbound',
        officialBody: communicationData.officialBody,
        referenceNumber: communicationData.referenceNumber,
        description: communicationData.description,
        content: communicationData.content,
        responseRequired: communicationData.responseRequired || false,
        responseDeadline: communicationData.responseDeadline,
      });

      return communication;
    } catch (error) {
      this.logger.error(`Error recording incoming communication: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async generateCommunicationSummary(tenantId: string, companyId: string): Promise<CommunicationStatus> {
    try {
      const totalCommunications = await this.prisma.officialCommunication.count({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
        },
      });

      const pendingResponses = await this.prisma.officialCommunication.count({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          responseRequired: true,
          respondedAt: null,
        },
      });

      const acknowledged = await this.prisma.officialCommunication.count({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          status: 'acknowledged',
        },
      });

      const rejected = await this.prisma.officialCommunication.count({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          status: 'rejected',
        },
      });

      // Get counts by entity type
      const entityTypeCounts = await this.prisma.officialCommunication.groupBy({
        by: ['entityType'],
        where: {
          tenant_id: tenantId,
          company_id: companyId,
        },
        _count: {
          entityType: true,
        },
      });

      // Get counts by official body
      const officialBodyCounts = await this.prisma.officialCommunication.groupBy({
        by: ['officialBody'],
        where: {
          tenant_id: tenantId,
          company_id: companyId,
        },
        _count: {
          officialBody: true,
        },
      });

      // Get recent activity (last 10 communications)
      const recentActivity = await this.prisma.officialCommunication.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const byEntityType: Record<string, number> = {};
      entityTypeCounts.forEach(item => {
        byEntityType[item.entityType] = item._count.entityType;
      });

      const byOfficialBody: Record<string, number> = {};
      officialBodyCounts.forEach(item => {
        byOfficialBody[item.officialBody] = item._count.officialBody;
      });

      return {
        totalCommunications,
        pendingResponses,
        acknowledged,
        rejected,
        byEntityType,
        byOfficialBody,
        recentActivity,
      };
    } catch (error) {
      this.logger.error(`Error generating communication summary: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getOfficialBodyForEntityType(entityType: string): OfficialCommunication['officialBody'] {
    switch (entityType) {
      case 'invoice':
        return 'ksef';
      case 'declaration':
        return 'urzad_skarbowy';
      case 'zus':
        return 'zus';
      case 'tax':
        return 'urzad_skarbowy';
      default:
        return 'other';
    }
  }

  private async createAuditLog(
    tenantId: string,
    companyId: string,
    action: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenant_id: tenantId,
          company_id: companyId,
          action,
          entity: 'official_communication',
          details,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating audit log: ${error.message}`, error.stack);
      // Don't throw here as audit log failures shouldn't break the main flow
    }
  }

  async getCommunicationTimeline(
    tenantId: string,
    companyId: string,
    entityType?: string,
    entityId?: string,
  ): Promise<OfficialCommunication[]> {
    try {
      const whereClause: any = {
        tenant_id: tenantId,
        company_id: companyId,
      };

      if (entityType) {
        whereClause.entityType = entityType;
      }

      if (entityId) {
        whereClause.entityId = entityId;
      }

      const communications = await this.prisma.officialCommunication.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
      });

      return communications;
    } catch (error) {
      this.logger.error(`Error fetching communication timeline: ${error.message}`, error.stack);
      throw error;
    }
  }

  async generateComplianceReport(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    summary: CommunicationStatus;
    submissions: OfficialCommunication[];
    responses: OfficialCommunication[];
    complianceScore: number;
  }> {
    try {
      const whereClause = {
        tenant_id: tenantId,
        company_id: companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      const [summary, submissions, responses] = await Promise.all([
        this.generateCommunicationSummary(tenantId, companyId),
        this.prisma.officialCommunication.findMany({
          where: {
            ...whereClause,
            direction: 'outbound',
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.officialCommunication.findMany({
          where: {
            ...whereClause,
            direction: 'inbound',
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Calculate compliance score based on response times and completion rates
      const totalRequiredResponses = responses.filter(r => r.responseRequired).length;
      const completedResponses = responses.filter(r => r.respondedAt).length;
      const responseRate = totalRequiredResponses > 0 ? completedResponses / totalRequiredResponses : 1;

      const totalSubmissions = submissions.length;
      const acknowledgedSubmissions = submissions.filter(s => s.status === 'acknowledged').length;
      const submissionSuccessRate = totalSubmissions > 0 ? acknowledgedSubmissions / totalSubmissions : 1;

      const complianceScore = (responseRate + submissionSuccessRate) / 2;

      return {
        summary,
        submissions,
        responses,
        complianceScore: Math.round(complianceScore * 100),
      };
    } catch (error) {
      this.logger.error(`Error generating compliance report: ${error.message}`, error.stack);
      throw error;
    }
  }
}