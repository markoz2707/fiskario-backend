import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DPIASection {
  id: string;
  title: string;
  content: string;
  order: number;
  required: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'approved';
  assignedTo?: string;
  completedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface DPIADocument {
  id: string;
  title: string;
  description: string;
  processingActivity: string;
  dataController: string;
  dataProcessor?: string;
  status: 'draft' | 'review' | 'approved' | 'rejected' | 'expired';
  version: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
  expiryDate?: Date;
  sections: DPIASection[];
  riskAssessment: RiskAssessment;
  mitigationMeasures: MitigationMeasure[];
  complianceChecklist: ComplianceCheck[];
}

export interface RiskAssessment {
  id: string;
  category: 'data_protection' | 'security' | 'compliance' | 'operational';
  description: string;
  likelihood: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  impact: 'negligible' | 'minor' | 'moderate' | 'major' | 'severe';
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  existingControls: string[];
  additionalMeasures: string[];
}

export interface MitigationMeasure {
  id: string;
  title: string;
  description: string;
  implementationStatus: 'planned' | 'in_progress' | 'implemented' | 'verified';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  dueDate?: Date;
  completedAt?: Date;
  effectiveness: 'unknown' | 'low' | 'medium' | 'high';
}

export interface ComplianceCheck {
  id: string;
  gdprArticle: string;
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'partially_compliant' | 'not_applicable';
  evidence: string;
  notes?: string;
  lastReviewed: Date;
  reviewedBy: string;
}

@Injectable()
export class DPIADocumentationService {
  private readonly logger = new Logger(DPIADocumentationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new DPIA document
   */
  async createDPIADocument(
    document: Omit<DPIADocument, 'id' | 'createdAt' | 'updatedAt' | 'sections' | 'riskAssessment' | 'mitigationMeasures' | 'complianceChecklist'>,
    sections?: Partial<DPIASection>[]
  ): Promise<string> {
    try {
      const dpia = await this.prisma.dPIADocument.create({
        data: {
          title: document.title,
          description: document.description,
          processingActivity: document.processingActivity,
          dataController: document.dataController,
          dataProcessor: document.dataProcessor,
          status: 'draft',
          version: document.version,
          createdBy: document.createdBy,
          expiryDate: document.expiryDate,
        }
      });

      // Create default sections if not provided
      if (!sections || sections.length === 0) {
        await this.createDefaultDPIASections(dpia.id);
      } else {
        await this.createCustomDPIASections(dpia.id, sections);
      }

      // Create default risk assessment
      await this.createDefaultRiskAssessment(dpia.id);

      // Create default mitigation measures
      await this.createDefaultMitigationMeasures(dpia.id);

      // Create compliance checklist
      await this.createComplianceChecklist(dpia.id);

      this.logger.log(`DPIA document created: ${document.title}`);

      return dpia.id;
    } catch (error) {
      this.logger.error(`Failed to create DPIA document: ${error.message}`, error.stack);
      throw new Error(`DPIA document creation failed: ${error.message}`);
    }
  }

  /**
   * Updates DPIA section content
   */
  async updateDPIASection(
    dpiaId: string,
    sectionId: string,
    updates: Partial<DPIASection>
  ): Promise<void> {
    try {
      await this.prisma.dPIASection.update({
        where: { id: sectionId },
        data: {
          ...updates,
          ...(updates.status === 'completed' && { completedAt: new Date() }),
        }
      });

      // Update DPIA document timestamp
      await this.prisma.dPIADocument.update({
        where: { id: dpiaId },
        data: { updatedAt: new Date() }
      });

      this.logger.log(`DPIA section updated: ${sectionId}`);
    } catch (error) {
      this.logger.error(`Failed to update DPIA section: ${error.message}`, error.stack);
      throw new Error(`DPIA section update failed: ${error.message}`);
    }
  }

  /**
   * Submits DPIA for review
   */
  async submitDPIAForReview(dpiaId: string, reviewerId: string): Promise<void> {
    try {
      await this.prisma.dPIADocument.update({
        where: { id: dpiaId },
        data: {
          status: 'review',
          updatedAt: new Date(),
        }
      });

      // Log review request
      await this.prisma.dPIAActivity.create({
        data: {
          dpiaId,
          activityType: 'submitted_for_review',
          performedBy: reviewerId,
          timestamp: new Date(),
          details: 'DPIA submitted for review',
        }
      });

      this.logger.log(`DPIA submitted for review: ${dpiaId}`);
    } catch (error) {
      this.logger.error(`Failed to submit DPIA for review: ${error.message}`, error.stack);
      throw new Error(`DPIA review submission failed: ${error.message}`);
    }
  }

  /**
   * Approves DPIA document
   */
  async approveDPIA(dpiaId: string, approverId: string, notes?: string): Promise<void> {
    try {
      await this.prisma.dPIADocument.update({
        where: { id: dpiaId },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: approverId,
          updatedAt: new Date(),
        }
      });

      // Log approval
      await this.prisma.dPIAActivity.create({
        data: {
          dpiaId,
          activityType: 'approved',
          performedBy: approverId,
          timestamp: new Date(),
          details: notes || 'DPIA approved',
        }
      });

      this.logger.log(`DPIA approved: ${dpiaId}`);
    } catch (error) {
      this.logger.error(`Failed to approve DPIA: ${error.message}`, error.stack);
      throw new Error(`DPIA approval failed: ${error.message}`);
    }
  }

  /**
   * Generates comprehensive DPIA report
   */
  async generateDPIAReport(dpiaId: string): Promise<any> {
    try {
      const dpia = await this.prisma.dPIADocument.findUnique({
        where: { id: dpiaId },
        include: {
          sections: true,
          riskAssessments: true,
          mitigationMeasures: true,
          complianceChecks: true,
          activities: {
            orderBy: { timestamp: 'desc' }
          }
        }
      });

      if (!dpia) {
        throw new Error('DPIA document not found');
      }

      const report = {
        document: {
          id: dpia.id,
          title: dpia.title,
          description: dpia.description,
          processingActivity: dpia.processingActivity,
          dataController: dpia.dataController,
          dataProcessor: dpia.dataProcessor,
          status: dpia.status,
          version: dpia.version,
          createdAt: dpia.createdAt,
          updatedAt: dpia.updatedAt,
          approvedAt: dpia.approvedAt,
          approvedBy: dpia.approvedBy,
          expiryDate: dpia.expiryDate,
        },
        sections: dpia.sections.map(section => ({
          id: section.id,
          title: section.title,
          content: section.content,
          order: section.order,
          status: section.status,
          assignedTo: section.assignedTo,
          completedAt: section.completedAt,
          approvedAt: section.approvedAt,
          approvedBy: section.approvedBy,
        })),
        riskAssessment: {
          summary: this.calculateRiskSummary(dpia.riskAssessments),
          details: dpia.riskAssessments.map(risk => ({
            category: risk.category,
            description: risk.description,
            likelihood: risk.likelihood,
            impact: risk.impact,
            riskLevel: risk.riskLevel,
            existingControls: risk.existingControls,
            additionalMeasures: risk.additionalMeasures,
          })),
        },
        mitigationMeasures: dpia.mitigationMeasures.map(measure => ({
          title: measure.title,
          description: measure.description,
          implementationStatus: measure.implementationStatus,
          priority: measure.priority,
          assignedTo: measure.assignedTo,
          dueDate: measure.dueDate,
          completedAt: measure.completedAt,
          effectiveness: measure.effectiveness,
        })),
        complianceChecklist: dpia.complianceChecks.map(check => ({
          gdprArticle: check.gdprArticle,
          requirement: check.requirement,
          status: check.status,
          evidence: check.evidence,
          notes: check.notes,
          lastReviewed: check.lastReviewed,
          reviewedBy: check.reviewedBy,
        })),
        activities: dpia.activities.map(activity => ({
          activityType: activity.activityType,
          performedBy: activity.performedBy,
          timestamp: activity.timestamp,
          details: activity.details,
        })),
        recommendations: this.generateDPIARecommendations(dpia),
      };

      return report;
    } catch (error) {
      this.logger.error(`DPIA report generation failed: ${error.message}`, error.stack);
      throw new Error(`DPIA report generation failed: ${error.message}`);
    }
  }

  /**
   * Creates default DPIA sections based on GDPR requirements
   */
  private async createDefaultDPIASections(dpiaId: string): Promise<void> {
    const defaultSections = [
      {
        title: 'Description of Processing',
        content: 'Describe the nature, scope, context and purposes of the processing.',
        order: 1,
        required: true,
      },
      {
        title: 'Assessment of Necessity and Proportionality',
        content: 'Assess whether the processing is necessary and proportionate.',
        order: 2,
        required: true,
      },
      {
        title: 'Risk Assessment',
        content: 'Identify and assess risks to the rights and freedoms of data subjects.',
        order: 3,
        required: true,
      },
      {
        title: 'Mitigation Measures',
        content: 'Describe measures to address identified risks.',
        order: 4,
        required: true,
      },
      {
        title: 'Compliance with GDPR Articles',
        content: 'Verify compliance with relevant GDPR articles.',
        order: 5,
        required: true,
      },
      {
        title: 'Data Protection Officer Consultation',
        content: 'Record consultation with DPO if required.',
        order: 6,
        required: false,
      },
      {
        title: 'Conclusion and Recommendations',
        content: 'Summarize findings and provide recommendations.',
        order: 7,
        required: true,
      },
    ];

    for (const section of defaultSections) {
      await this.prisma.dPIASection.create({
        data: {
          dpiaId,
          title: section.title,
          content: section.content,
          order: section.order,
          required: section.required,
          status: 'pending',
        }
      });
    }
  }

  /**
   * Creates custom DPIA sections
   */
  private async createCustomDPIASections(dpiaId: string, sections: Partial<DPIASection>[]): Promise<void> {
    for (const [index, section] of sections.entries()) {
      await this.prisma.dPIASection.create({
        data: {
          dpiaId,
          title: section.title || `Section ${index + 1}`,
          content: section.content || '',
          order: section.order || index + 1,
          required: section.required || false,
          status: section.status || 'pending',
          assignedTo: section.assignedTo,
        }
      });
    }
  }

  /**
   * Creates default risk assessment
   */
  private async createDefaultRiskAssessment(dpiaId: string): Promise<void> {
    const defaultRisks = [
      {
        category: 'data_protection',
        description: 'Unauthorized access to personal data',
        likelihood: 'medium',
        impact: 'major',
        riskLevel: 'high',
        existingControls: ['Access controls', 'Encryption'],
        additionalMeasures: ['Multi-factor authentication', 'Regular access reviews'],
      },
      {
        category: 'security',
        description: 'Data breach or loss',
        likelihood: 'low',
        impact: 'severe',
        riskLevel: 'medium',
        existingControls: ['Backups', 'Security monitoring'],
        additionalMeasures: ['Enhanced encryption', 'Intrusion detection'],
      },
      {
        category: 'compliance',
        description: 'Non-compliance with GDPR requirements',
        likelihood: 'medium',
        impact: 'major',
        riskLevel: 'high',
        existingControls: ['Privacy policies', 'Staff training'],
        additionalMeasures: ['Regular compliance audits', 'DPO oversight'],
      },
    ];

    for (const risk of defaultRisks) {
      await this.prisma.riskAssessment.create({
        data: {
          dpiaId,
          ...risk,
        }
      });
    }
  }

  /**
   * Creates default mitigation measures
   */
  private async createDefaultMitigationMeasures(dpiaId: string): Promise<void> {
    const defaultMeasures = [
      {
        title: 'Implement Data Encryption',
        description: 'Encrypt all personal data at rest and in transit',
        implementationStatus: 'planned',
        priority: 'high',
        effectiveness: 'high',
      },
      {
        title: 'Access Control Review',
        description: 'Regular review of user access permissions',
        implementationStatus: 'planned',
        priority: 'medium',
        effectiveness: 'medium',
      },
      {
        title: 'Staff Privacy Training',
        description: 'Provide privacy training to all staff members',
        implementationStatus: 'planned',
        priority: 'medium',
        effectiveness: 'medium',
      },
    ];

    for (const measure of defaultMeasures) {
      await this.prisma.mitigationMeasure.create({
        data: {
          dpiaId,
          ...measure,
        }
      });
    }
  }

  /**
   * Creates compliance checklist
   */
  private async createComplianceChecklist(dpiaId: string): Promise<void> {
    const complianceChecks = [
      {
        gdprArticle: 'Article 6',
        requirement: 'Lawful basis for processing',
        status: 'pending',
        evidence: '',
      },
      {
        gdprArticle: 'Article 25',
        requirement: 'Data protection by design and by default',
        status: 'pending',
        evidence: '',
      },
      {
        gdprArticle: 'Article 32',
        requirement: 'Security of processing',
        status: 'pending',
        evidence: '',
      },
      {
        gdprArticle: 'Article 33',
        requirement: 'Notification of personal data breach',
        status: 'pending',
        evidence: '',
      },
      {
        gdprArticle: 'Article 35',
        requirement: 'Data protection impact assessment',
        status: 'pending',
        evidence: '',
      },
    ];

    for (const check of complianceChecks) {
      await this.prisma.complianceCheck.create({
        data: {
          dpiaId,
          ...check,
          lastReviewed: new Date(),
          reviewedBy: 'system',
        }
      });
    }
  }

  /**
   * Helper methods
   */
  private calculateRiskSummary(riskAssessments: any[]): any {
    const riskLevels = riskAssessments.map(r => r.riskLevel);
    const riskLevelCounts = riskLevels.reduce((acc, level) => {
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const highestRisk = riskLevels.includes('very_high') ? 'very_high' :
                       riskLevels.includes('high') ? 'high' : 'medium';

    return {
      totalRisks: riskAssessments.length,
      riskLevelDistribution: riskLevelCounts,
      overallRiskLevel: highestRisk,
      requiresConsultation: highestRisk === 'very_high' || riskLevelCounts.high > 3,
    };
  }

  private generateDPIARecommendations(dpia: any): string[] {
    const recommendations: string[] = [];

    // Check completion status
    const incompleteSections = dpia.sections.filter((s: any) => s.status !== 'completed');
    if (incompleteSections.length > 0) {
      recommendations.push(`${incompleteSections.length} sections require completion`);
    }

    // Check risk levels
    const highRisks = dpia.riskAssessments.filter((r: any) => r.riskLevel === 'high' || r.riskLevel === 'very_high');
    if (highRisks.length > 0) {
      recommendations.push(`${highRisks.length} high-risk items require attention`);
    }

    // Check compliance status
    const nonCompliantChecks = dpia.complianceChecks.filter((c: any) => c.status === 'non_compliant');
    if (nonCompliantChecks.length > 0) {
      recommendations.push(`${nonCompliantChecks.length} compliance issues need resolution`);
    }

    // Check mitigation measures
    const unimplementedMeasures = dpia.mitigationMeasures.filter((m: any) => m.implementationStatus === 'planned');
    if (unimplementedMeasures.length > 0) {
      recommendations.push(`${unimplementedMeasures.length} mitigation measures pending implementation`);
    }

    if (recommendations.length === 0) {
      recommendations.push('DPIA appears complete and compliant');
    }

    return recommendations;
  }

  private calculateComplianceScore(dpia: any): number {
    let score = 100;

    // Penalize incomplete sections
    const incompleteSections = dpia.sections.filter((s: any) => s.status !== 'completed').length;
    score -= incompleteSections * 10;

    // Penalize high risks
    const highRisks = dpia.riskAssessments.filter((r: any) => r.riskLevel === 'high' || r.riskLevel === 'very_high').length;
    score -= highRisks * 15;

    // Penalize non-compliance
    const nonCompliantChecks = dpia.complianceChecks.filter((c: any) => c.status === 'non_compliant').length;
    score -= nonCompliantChecks * 20;

    return Math.max(0, score);
  }
}