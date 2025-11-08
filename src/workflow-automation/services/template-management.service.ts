import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowTemplateDto, WorkflowType } from '../dto/workflow.dto';

@Injectable()
export class TemplateManagementService {
  private readonly logger = new Logger(TemplateManagementService.name);

  constructor(private prisma: PrismaService) {}

  async createTemplate(tenantId: string, templateDto: WorkflowTemplateDto): Promise<any> {
    // Validate template data
    this.validateTemplate(templateDto);

    const template = await this.prisma.workflowTemplate.create({
      data: {
        tenant_id: tenantId,
        name: templateDto.name,
        description: templateDto.description,
        type: templateDto.type,
        steps: templateDto.steps as any,
        defaultSettings: templateDto.defaultSettings || {},
        version: templateDto.version || '1.0',
      },
    });

    this.logger.log(`Created workflow template ${template.id} for tenant ${tenantId}`);

    return template;
  }

  async getTemplates(tenantId: string, filters?: {
    type?: WorkflowType;
    isActive?: boolean;
  }): Promise<any[]> {
    const whereClause: any = {
      tenant_id: tenantId,
    };

    if (filters?.type) {
      whereClause.type = filters.type;
    }

    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    const templates = await this.prisma.workflowTemplate.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return templates;
  }

  async getTemplateById(tenantId: string, templateId: string): Promise<any> {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: {
        id: templateId,
        tenant_id: tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return template;
  }

  async updateTemplate(tenantId: string, templateId: string, updateData: Partial<WorkflowTemplateDto>): Promise<any> {
    const existingTemplate = await this.getTemplateById(tenantId, templateId);

    if (updateData.steps) {
      this.validateTemplate({ ...existingTemplate, ...updateData } as WorkflowTemplateDto);
    }

    const updatedTemplate = await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        name: updateData.name,
        description: updateData.description,
        steps: updateData.steps as any,
        defaultSettings: updateData.defaultSettings,
        version: updateData.version,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Updated workflow template ${templateId} for tenant ${tenantId}`);

    return updatedTemplate;
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const template = await this.getTemplateById(tenantId, templateId);

    // Check if template is being used by active workflows
    const activeWorkflows = await this.prisma.workflow.count({
      where: {
        template_id: templateId,
        state: { notIn: ['completed', 'cancelled', 'failed'] },
      },
    });

    if (activeWorkflows > 0) {
      throw new BadRequestException(`Cannot delete template: ${activeWorkflows} active workflows are using it`);
    }

    await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });

    this.logger.log(`Deactivated workflow template ${templateId} for tenant ${tenantId}`);
  }

  async cloneTemplate(tenantId: string, templateId: string, newName: string): Promise<any> {
    const originalTemplate = await this.getTemplateById(tenantId, templateId);

    const clonedTemplate = await this.prisma.workflowTemplate.create({
      data: {
        tenant_id: tenantId,
        name: newName,
        description: originalTemplate.description,
        type: originalTemplate.type,
        steps: originalTemplate.steps,
        defaultSettings: originalTemplate.defaultSettings,
        version: '1.0',
      },
    });

    this.logger.log(`Cloned workflow template ${templateId} to ${clonedTemplate.id} for tenant ${tenantId}`);

    return clonedTemplate;
  }

  async getDefaultTemplates(): Promise<any[]> {
    // Return system-provided default templates
    return [
      {
        id: 'default_invoice_creation',
        name: 'Default Invoice Creation',
        description: 'Standard workflow for creating and submitting invoices',
        type: WorkflowType.INVOICE_CREATION,
        steps: [
          {
            id: 'draft_invoice',
            name: 'Draft Invoice',
            description: 'Create initial invoice draft',
            state: 'draft',
          },
          {
            id: 'validate_invoice',
            name: 'Validate Invoice',
            description: 'Validate invoice data and tax compliance',
            state: 'pending_validation',
          },
          {
            id: 'approve_invoice',
            name: 'Approve Invoice',
            description: 'Get approval for invoice creation',
            state: 'pending_approval',
          },
          {
            id: 'generate_invoice',
            name: 'Generate Invoice',
            description: 'Generate final invoice document',
            state: 'approved',
          },
          {
            id: 'submit_ksef',
            name: 'Submit to KSeF',
            description: 'Submit invoice to KSeF system',
            state: 'processing',
          },
          {
            id: 'complete_workflow',
            name: 'Complete Workflow',
            description: 'Mark workflow as completed',
            state: 'completed',
          },
        ],
        defaultSettings: {
          requireApproval: true,
          autoSubmitKSeF: true,
          validationRules: ['nip_format', 'tax_rates', 'gtu_codes'],
        },
        version: '1.0',
      },
      {
        id: 'default_tax_calculation',
        name: 'Default Tax Calculation',
        description: 'Standard workflow for tax calculations',
        type: WorkflowType.TAX_CALCULATION,
        steps: [
          {
            id: 'prepare_calculation',
            name: 'Prepare Calculation',
            description: 'Prepare tax calculation data',
            state: 'draft',
          },
          {
            id: 'validate_data',
            name: 'Validate Data',
            description: 'Validate input data for tax calculation',
            state: 'pending_validation',
          },
          {
            id: 'calculate_tax',
            name: 'Calculate Tax',
            description: 'Perform tax calculations',
            state: 'processing',
          },
          {
            id: 'finalize_calculation',
            name: 'Finalize Calculation',
            description: 'Finalize and store tax calculation results',
            state: 'completed',
          },
        ],
        defaultSettings: {
          includeHistoricalData: true,
          applyOptimizations: true,
          generateReport: true,
        },
        version: '1.0',
      },
      {
        id: 'default_ksef_submission',
        name: 'Default KSeF Submission',
        description: 'Standard workflow for KSeF invoice submissions',
        type: WorkflowType.KSEF_SUBMISSION,
        steps: [
          {
            id: 'validate_invoice',
            name: 'Validate Invoice',
            description: 'Validate invoice for KSeF compliance',
            state: 'pending_validation',
          },
          {
            id: 'prepare_submission',
            name: 'Prepare Submission',
            description: 'Prepare invoice data for KSeF submission',
            state: 'processing',
          },
          {
            id: 'submit_to_ksef',
            name: 'Submit to KSeF',
            description: 'Submit invoice to KSeF system',
            state: 'processing',
          },
          {
            id: 'confirm_submission',
            name: 'Confirm Submission',
            description: 'Confirm successful KSeF submission',
            state: 'completed',
          },
        ],
        defaultSettings: {
          environment: 'test',
          retryOnFailure: true,
          maxRetries: 3,
          notifyOnFailure: true,
        },
        version: '1.0',
      },
      {
        id: 'default_customer_onboarding',
        name: 'Default Customer Onboarding',
        description: 'Standard workflow for customer onboarding',
        type: WorkflowType.CUSTOMER_ONBOARDING,
        steps: [
          {
            id: 'collect_customer_data',
            name: 'Collect Customer Data',
            description: 'Collect initial customer information',
            state: 'draft',
          },
          {
            id: 'validate_customer_data',
            name: 'Validate Customer Data',
            description: 'Validate customer data for compliance',
            state: 'pending_validation',
          },
          {
            id: 'approve_customer',
            name: 'Approve Customer',
            description: 'Get approval for customer onboarding',
            state: 'pending_approval',
          },
          {
            id: 'setup_customer_profile',
            name: 'Setup Customer Profile',
            description: 'Create customer profile and settings',
            state: 'approved',
          },
          {
            id: 'configure_tax_settings',
            name: 'Configure Tax Settings',
            description: 'Configure tax-related settings for customer',
            state: 'processing',
          },
          {
            id: 'finalize_onboarding',
            name: 'Finalize Onboarding',
            description: 'Complete customer onboarding process',
            state: 'completed',
          },
        ],
        defaultSettings: {
          requireApproval: true,
          autoConfigureTaxSettings: true,
          sendWelcomeEmail: true,
          complianceChecks: ['nip_validation', 'gdpr_consent'],
        },
        version: '1.0',
      },
    ];
  }

  async getTemplateUsageStats(tenantId: string, templateId: string): Promise<any> {
    const template = await this.getTemplateById(tenantId, templateId);

    const stats = await this.prisma.workflow.groupBy({
      by: ['state'],
      where: {
        tenant_id: tenantId,
        template_id: templateId,
      },
      _count: {
        id: true,
      },
    });

    const totalWorkflows = stats.reduce((sum, stat) => sum + stat._count.id, 0);

    return {
      templateId,
      templateName: template.name,
      totalWorkflows,
      workflowsByState: stats.reduce((acc, stat) => {
        acc[stat.state] = stat._count.id;
        return acc;
      }, {}),
      lastUsed: await this.getLastUsedDate(tenantId, templateId),
    };
  }

  private async getLastUsedDate(tenantId: string, templateId: string): Promise<Date | null> {
    const lastWorkflow = await this.prisma.workflow.findFirst({
      where: {
        tenant_id: tenantId,
        template_id: templateId,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return lastWorkflow?.createdAt || null;
  }

  private validateTemplate(template: WorkflowTemplateDto): void {
    if (!template.name?.trim()) {
      throw new BadRequestException('Template name is required');
    }

    if (!template.type) {
      throw new BadRequestException('Template type is required');
    }

    if (!template.steps || template.steps.length === 0) {
      throw new BadRequestException('Template must have at least one step');
    }

    // Validate step structure
    template.steps.forEach((step, index) => {
      if (!step.id?.trim()) {
        throw new BadRequestException(`Step ${index + 1}: id is required`);
      }
      if (!step.name?.trim()) {
        throw new BadRequestException(`Step ${index + 1}: name is required`);
      }
      if (!step.state) {
        throw new BadRequestException(`Step ${index + 1}: state is required`);
      }
    });

    // Check for duplicate step IDs
    const stepIds = template.steps.map(step => step.id);
    const uniqueStepIds = new Set(stepIds);
    if (stepIds.length !== uniqueStepIds.size) {
      throw new BadRequestException('Template steps must have unique IDs');
    }
  }
}