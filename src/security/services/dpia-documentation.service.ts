import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DPIADocumentationService {
  private readonly logger = new Logger(DPIADocumentationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new DPIA document with optional sections
   */
  async createDPIADocument(
    document: {
      tenant_id: string;
      company_id: string;
      processingActivity: string;
      assessor: string;
      assessmentDate?: Date;
      createdBy: string;
    },
    sections?: Array<{
      sectionName: string;
      content: any;
      order: number;
    }>,
  ): Promise<string> {
    try {
      const created = await this.prisma.dPIADocument.create({
        data: {
          tenant_id: document.tenant_id,
          company_id: document.company_id,
          processingActivity: document.processingActivity,
          assessor: document.assessor,
          assessmentDate: document.assessmentDate ?? new Date(),
          status: 'DRAFT',
          createdBy: document.createdBy,
          ...(sections && sections.length > 0
            ? {
                sections: {
                  create: sections.map((section) => ({
                    sectionName: section.sectionName,
                    content: section.content,
                    order: section.order,
                  })),
                },
              }
            : {}),
        },
        include: {
          sections: true,
        },
      });

      this.logger.log(
        `DPIA document created: ${created.id} (${document.processingActivity})`,
      );
      return created.id;
    } catch (error) {
      this.logger.error(`Failed to create DPIA document: ${error.message}`, error.stack);
      throw new Error(`DPIA document creation failed: ${error.message}`);
    }
  }

  /**
   * Updates a specific DPIA section
   */
  async updateDPIASection(
    dpiaId: string,
    sectionId: string,
    updates: {
      sectionName?: string;
      content?: any;
      order?: number;
    },
  ): Promise<void> {
    try {
      // Verify section belongs to the given DPIA document
      const section = await this.prisma.dPIASection.findFirst({
        where: {
          id: sectionId,
          documentId: dpiaId,
        },
      });

      if (!section) {
        throw new NotFoundException(
          `Section ${sectionId} not found in DPIA document ${dpiaId}`,
        );
      }

      const data: any = {};
      if (updates.sectionName !== undefined) data.sectionName = updates.sectionName;
      if (updates.content !== undefined) data.content = updates.content;
      if (updates.order !== undefined) data.order = updates.order;

      await this.prisma.dPIASection.update({
        where: { id: sectionId },
        data,
      });

      this.logger.log(`DPIA section updated: ${sectionId} in document ${dpiaId}`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update DPIA section: ${error.message}`, error.stack);
      throw new Error(`DPIA section update failed: ${error.message}`);
    }
  }

  /**
   * Submits a DPIA document for review
   */
  async submitDPIAForReview(dpiaId: string, reviewerId: string): Promise<void> {
    try {
      const document = await this.prisma.dPIADocument.findUnique({
        where: { id: dpiaId },
      });

      if (!document) {
        throw new NotFoundException(`DPIA document ${dpiaId} not found`);
      }

      await this.prisma.dPIADocument.update({
        where: { id: dpiaId },
        data: {
          status: 'IN_REVIEW',
          reviewerId,
          submittedForReviewAt: new Date(),
        },
      });

      this.logger.log(
        `DPIA document ${dpiaId} submitted for review by reviewer ${reviewerId}`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to submit DPIA for review: ${error.message}`,
        error.stack,
      );
      throw new Error(`DPIA review submission failed: ${error.message}`);
    }
  }

  /**
   * Approves a DPIA document
   */
  async approveDPIA(
    dpiaId: string,
    approverId: string,
    notes?: string,
  ): Promise<void> {
    try {
      const document = await this.prisma.dPIADocument.findUnique({
        where: { id: dpiaId },
      });

      if (!document) {
        throw new NotFoundException(`DPIA document ${dpiaId} not found`);
      }

      await this.prisma.dPIADocument.update({
        where: { id: dpiaId },
        data: {
          status: 'APPROVED',
          approverId,
          approvedAt: new Date(),
          approvalNotes: notes,
        },
      });

      this.logger.log(`DPIA document ${dpiaId} approved by ${approverId}`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to approve DPIA: ${error.message}`, error.stack);
      throw new Error(`DPIA approval failed: ${error.message}`);
    }
  }

  /**
   * Generates a full DPIA report including all sections and activities
   */
  async generateDPIAReport(dpiaId: string): Promise<any> {
    try {
      const document = await this.prisma.dPIADocument.findUnique({
        where: { id: dpiaId },
        include: {
          sections: {
            orderBy: { order: 'asc' },
          },
          activities: true,
          company: true,
        },
      });

      if (!document) {
        throw new NotFoundException(`DPIA document ${dpiaId} not found`);
      }

      this.logger.log(`DPIA report generated for document ${dpiaId}`);
      return document;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to generate DPIA report: ${error.message}`, error.stack);
      throw new Error(`DPIA report generation failed: ${error.message}`);
    }
  }
}
