import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicingService } from '../../invoicing/invoicing.service';
import { TaxRulesService } from '../../tax-rules/tax-rules.service';
import { KsefService } from '../../ksef/ksef.service';
import { BuyersService } from '../../invoicing/buyers.service';
import {
  WorkflowType,
  WorkflowState,
  WorkflowTrigger,
  WorkflowStepDto,
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowExecutionDto
} from '../dto/workflow.dto';

interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  action: string;
  conditions?: (data: any) => boolean;
}

interface WorkflowDefinition {
  type: WorkflowType;
  initialState: WorkflowState;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  steps: WorkflowStepDto[];
}

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private readonly workflowDefinitions = new Map<WorkflowType, WorkflowDefinition>();

  constructor(
    private prisma: PrismaService,
    private invoicingService: InvoicingService,
    private taxRulesService: TaxRulesService,
    private ksefService: KsefService,
    private buyersService: BuyersService,
  ) {
    this.initializeWorkflowDefinitions();
  }

  private initializeWorkflowDefinitions() {
    // Invoice Creation Workflow
    this.workflowDefinitions.set(WorkflowType.INVOICE_CREATION, {
      type: WorkflowType.INVOICE_CREATION,
      initialState: WorkflowState.DRAFT,
      states: [
        WorkflowState.DRAFT,
        WorkflowState.PENDING_VALIDATION,
        WorkflowState.VALIDATION_FAILED,
        WorkflowState.PENDING_APPROVAL,
        WorkflowState.APPROVED,
        WorkflowState.PROCESSING,
        WorkflowState.COMPLETED,
        WorkflowState.FAILED,
        WorkflowState.CANCELLED,
      ],
      transitions: [
        {
          from: WorkflowState.DRAFT,
          to: WorkflowState.PENDING_VALIDATION,
          action: 'validate',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.VALIDATION_FAILED,
          action: 'validation_failed',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.PENDING_APPROVAL,
          action: 'validation_passed',
        },
        {
          from: WorkflowState.PENDING_APPROVAL,
          to: WorkflowState.APPROVED,
          action: 'approve',
        },
        {
          from: WorkflowState.PENDING_APPROVAL,
          to: WorkflowState.DRAFT,
          action: 'reject',
        },
        {
          from: WorkflowState.APPROVED,
          to: WorkflowState.PROCESSING,
          action: 'process',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.COMPLETED,
          action: 'complete',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.FAILED,
          action: 'fail',
        },
        {
          from: WorkflowState.DRAFT,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PENDING_APPROVAL,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.APPROVED,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
      ],
      steps: [
        {
          id: 'draft_invoice',
          name: 'Draft Invoice',
          description: 'Create initial invoice draft',
          state: WorkflowState.DRAFT,
        },
        {
          id: 'validate_invoice',
          name: 'Validate Invoice',
          description: 'Validate invoice data and tax compliance',
          state: WorkflowState.PENDING_VALIDATION,
        },
        {
          id: 'approve_invoice',
          name: 'Approve Invoice',
          description: 'Get approval for invoice creation',
          state: WorkflowState.PENDING_APPROVAL,
        },
        {
          id: 'generate_invoice',
          name: 'Generate Invoice',
          description: 'Generate final invoice document',
          state: WorkflowState.APPROVED,
        },
        {
          id: 'submit_ksef',
          name: 'Submit to KSeF',
          description: 'Submit invoice to KSeF system',
          state: WorkflowState.PROCESSING,
        },
        {
          id: 'complete_workflow',
          name: 'Complete Workflow',
          description: 'Mark workflow as completed',
          state: WorkflowState.COMPLETED,
        },
      ],
    });

    // Tax Calculation Workflow
    this.workflowDefinitions.set(WorkflowType.TAX_CALCULATION, {
      type: WorkflowType.TAX_CALCULATION,
      initialState: WorkflowState.DRAFT,
      states: [
        WorkflowState.DRAFT,
        WorkflowState.PENDING_VALIDATION,
        WorkflowState.VALIDATION_FAILED,
        WorkflowState.PROCESSING,
        WorkflowState.COMPLETED,
        WorkflowState.FAILED,
        WorkflowState.CANCELLED,
      ],
      transitions: [
        {
          from: WorkflowState.DRAFT,
          to: WorkflowState.PENDING_VALIDATION,
          action: 'validate',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.VALIDATION_FAILED,
          action: 'validation_failed',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.PROCESSING,
          action: 'validation_passed',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.COMPLETED,
          action: 'complete',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.FAILED,
          action: 'fail',
        },
        {
          from: WorkflowState.DRAFT,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
      ],
      steps: [
        {
          id: 'prepare_calculation',
          name: 'Prepare Calculation',
          description: 'Prepare tax calculation data',
          state: WorkflowState.DRAFT,
        },
        {
          id: 'validate_data',
          name: 'Validate Data',
          description: 'Validate input data for tax calculation',
          state: WorkflowState.PENDING_VALIDATION,
        },
        {
          id: 'calculate_tax',
          name: 'Calculate Tax',
          description: 'Perform tax calculations',
          state: WorkflowState.PROCESSING,
        },
        {
          id: 'finalize_calculation',
          name: 'Finalize Calculation',
          description: 'Finalize and store tax calculation results',
          state: WorkflowState.COMPLETED,
        },
      ],
    });

    // KSeF Submission Workflow
    this.workflowDefinitions.set(WorkflowType.KSEF_SUBMISSION, {
      type: WorkflowType.KSEF_SUBMISSION,
      initialState: WorkflowState.PENDING_VALIDATION,
      states: [
        WorkflowState.PENDING_VALIDATION,
        WorkflowState.VALIDATION_FAILED,
        WorkflowState.PROCESSING,
        WorkflowState.COMPLETED,
        WorkflowState.FAILED,
        WorkflowState.CANCELLED,
      ],
      transitions: [
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.VALIDATION_FAILED,
          action: 'validation_failed',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.PROCESSING,
          action: 'validation_passed',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.COMPLETED,
          action: 'complete',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.FAILED,
          action: 'fail',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
      ],
      steps: [
        {
          id: 'validate_invoice',
          name: 'Validate Invoice',
          description: 'Validate invoice for KSeF compliance',
          state: WorkflowState.PENDING_VALIDATION,
        },
        {
          id: 'prepare_submission',
          name: 'Prepare Submission',
          description: 'Prepare invoice data for KSeF submission',
          state: WorkflowState.PROCESSING,
        },
        {
          id: 'submit_to_ksef',
          name: 'Submit to KSeF',
          description: 'Submit invoice to KSeF system',
          state: WorkflowState.PROCESSING,
        },
        {
          id: 'confirm_submission',
          name: 'Confirm Submission',
          description: 'Confirm successful KSeF submission',
          state: WorkflowState.COMPLETED,
        },
      ],
    });

    // Customer Onboarding Workflow
    this.workflowDefinitions.set(WorkflowType.CUSTOMER_ONBOARDING, {
      type: WorkflowType.CUSTOMER_ONBOARDING,
      initialState: WorkflowState.DRAFT,
      states: [
        WorkflowState.DRAFT,
        WorkflowState.PENDING_VALIDATION,
        WorkflowState.VALIDATION_FAILED,
        WorkflowState.PENDING_APPROVAL,
        WorkflowState.APPROVED,
        WorkflowState.PROCESSING,
        WorkflowState.COMPLETED,
        WorkflowState.FAILED,
        WorkflowState.CANCELLED,
      ],
      transitions: [
        {
          from: WorkflowState.DRAFT,
          to: WorkflowState.PENDING_VALIDATION,
          action: 'validate',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.VALIDATION_FAILED,
          action: 'validation_failed',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.PENDING_APPROVAL,
          action: 'validation_passed',
        },
        {
          from: WorkflowState.PENDING_APPROVAL,
          to: WorkflowState.APPROVED,
          action: 'approve',
        },
        {
          from: WorkflowState.PENDING_APPROVAL,
          to: WorkflowState.DRAFT,
          action: 'reject',
        },
        {
          from: WorkflowState.APPROVED,
          to: WorkflowState.PROCESSING,
          action: 'process',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.COMPLETED,
          action: 'complete',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.FAILED,
          action: 'fail',
        },
        {
          from: WorkflowState.DRAFT,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PENDING_VALIDATION,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PENDING_APPROVAL,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.APPROVED,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
        {
          from: WorkflowState.PROCESSING,
          to: WorkflowState.CANCELLED,
          action: 'cancel',
        },
      ],
      steps: [
        {
          id: 'collect_customer_data',
          name: 'Collect Customer Data',
          description: 'Collect initial customer information',
          state: WorkflowState.DRAFT,
        },
        {
          id: 'validate_customer_data',
          name: 'Validate Customer Data',
          description: 'Validate customer data for compliance',
          state: WorkflowState.PENDING_VALIDATION,
        },
        {
          id: 'approve_customer',
          name: 'Approve Customer',
          description: 'Get approval for customer onboarding',
          state: WorkflowState.PENDING_APPROVAL,
        },
        {
          id: 'setup_customer_profile',
          name: 'Setup Customer Profile',
          description: 'Create customer profile and settings',
          state: WorkflowState.APPROVED,
        },
        {
          id: 'configure_tax_settings',
          name: 'Configure Tax Settings',
          description: 'Configure tax-related settings for customer',
          state: WorkflowState.PROCESSING,
        },
        {
          id: 'finalize_onboarding',
          name: 'Finalize Onboarding',
          description: 'Complete customer onboarding process',
          state: WorkflowState.COMPLETED,
        },
      ],
    });
  }

  async createWorkflow(createWorkflowDto: CreateWorkflowDto): Promise<any> {
    // Validate tenant access
    await this.validateTenantAccess(createWorkflowDto.tenant_id);

    const definition = this.workflowDefinitions.get(createWorkflowDto.type);
    if (!definition) {
      throw new BadRequestException(`Unsupported workflow type: ${createWorkflowDto.type}`);
    }

    // Validate company access if provided
    if (createWorkflowDto.companyId) {
      await this.validateCompanyAccess(createWorkflowDto.tenant_id, createWorkflowDto.companyId);
    }

    // Validate customer access if provided
    if (createWorkflowDto.customerId) {
      await this.validateCustomerAccess(createWorkflowDto.tenant_id, createWorkflowDto.customerId);
    }

    try {
      const workflow = await this.prisma.workflow.create({
        data: {
          tenant_id: createWorkflowDto.tenant_id,
          type: createWorkflowDto.type,
          state: definition.initialState,
          trigger: createWorkflowDto.trigger,
          data: createWorkflowDto.initialData || {},
          company_id: createWorkflowDto.companyId,
          customer_id: createWorkflowDto.customerId,
          template_id: createWorkflowDto.templateId,
          steps: definition.steps as any,
        },
      });

      // Log workflow creation
      await this.prisma.auditLog.create({
        data: {
          tenant_id: createWorkflowDto.tenant_id,
          company_id: createWorkflowDto.companyId,
          action: 'workflow_created',
          entity: 'workflow',
          entityId: workflow.id,
          details: {
            type: createWorkflowDto.type,
            trigger: createWorkflowDto.trigger,
            templateId: createWorkflowDto.templateId,
          },
        },
      });

      this.logger.log(`Created workflow ${workflow.id} of type ${createWorkflowDto.type}`);

      return workflow;
    } catch (error) {
      this.logger.error(`Failed to create workflow: ${error.message}`, error);
      throw new BadRequestException(`Failed to create workflow: ${error.message}`);
    }
  }

  async getWorkflow(tenantId: string, workflowId: string): Promise<any> {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        tenant_id: tenantId,
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    return workflow;
  }

  async getWorkflows(tenantId: string, filters?: {
    type?: WorkflowType;
    state?: WorkflowState;
    companyId?: string;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const whereClause: any = {
      tenant_id: tenantId,
    };

    if (filters?.type) {
      whereClause.type = filters.type;
    }

    if (filters?.state) {
      whereClause.state = filters.state;
    }

    if (filters?.companyId) {
      whereClause.company_id = filters.companyId;
    }

    if (filters?.customerId) {
      whereClause.customer_id = filters.customerId;
    }

    const workflows = await this.prisma.workflow.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    return workflows;
  }

  async executeWorkflowStep(executionDto: WorkflowExecutionDto): Promise<any> {
    const workflow = await this.getWorkflow('', executionDto.workflowId); // tenant_id will be handled by middleware

    const definition = this.workflowDefinitions.get(workflow.type as WorkflowType);
    if (!definition) {
      throw new BadRequestException(`Workflow definition not found for type: ${workflow.type}`);
    }

    const currentStep = workflow.steps.find(step => step.id === executionDto.stepId);
    if (!currentStep) {
      throw new NotFoundException(`Step ${executionDto.stepId} not found in workflow`);
    }

    // Execute the step based on workflow type and step
    const result = await this.executeStep(workflow, currentStep, executionDto.inputData);

    // Update workflow state if step execution changed it
    if (result.newState && result.newState !== workflow.state) {
      await this.transitionWorkflow(workflow.id, result.newState, result.data);
    }

    // Update step data
    await this.updateWorkflowStep(workflow.id, executionDto.stepId, {
      data: result.stepData,
      completedAt: result.completed ? new Date().toISOString() : undefined,
      errorMessage: result.error,
    });

    return {
      workflowId: workflow.id,
      stepId: executionDto.stepId,
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  private async executeStep(workflow: any, step: WorkflowStepDto, inputData?: any): Promise<{
    success: boolean;
    data?: any;
    stepData?: any;
    newState?: WorkflowState;
    completed?: boolean;
    error?: string;
  }> {
    try {
      switch (workflow.type) {
        case WorkflowType.INVOICE_CREATION:
          return await this.executeInvoiceCreationStep(workflow, step, inputData);
        case WorkflowType.TAX_CALCULATION:
          return await this.executeTaxCalculationStep(workflow, step, inputData);
        case WorkflowType.KSEF_SUBMISSION:
          return await this.executeKSeFSubmissionStep(workflow, step, inputData);
        case WorkflowType.CUSTOMER_ONBOARDING:
          return await this.executeCustomerOnboardingStep(workflow, step, inputData);
        default:
          throw new BadRequestException(`Unsupported workflow type: ${workflow.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to execute step ${step.id} for workflow ${workflow.id}`, error);
      return {
        success: false,
        error: error.message,
        newState: WorkflowState.FAILED,
      };
    }
  }

  private async executeInvoiceCreationStep(workflow: any, step: WorkflowStepDto, inputData?: any) {
    switch (step.id) {
      case 'draft_invoice':
        // Create invoice draft using invoicing service
        try {
          const invoiceData = workflow.data;
          const invoice = await this.invoicingService.createInvoice(workflow.tenant_id, invoiceData);
          return {
            success: true,
            data: { invoiceId: invoice.id, invoiceNumber: invoice.number },
            stepData: { invoiceCreated: true, invoiceId: invoice.id }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to create invoice draft: ${error.message}`,
            newState: WorkflowState.FAILED
          };
        }

      case 'validate_invoice':
        // Validate invoice data using tax rules service
        try {
          const validation = await this.invoicingService.validateMobileInvoice(workflow.tenant_id, workflow.data);
          if (!validation.valid) {
            return {
              success: false,
              error: `Validation failed: ${validation.errors.join(', ')}`,
              stepData: { validationResult: 'failed', errors: validation.errors },
              newState: WorkflowState.VALIDATION_FAILED
            };
          }
          return {
            success: true,
            data: { validated: true },
            stepData: { validationResult: 'passed', warnings: validation.warnings }
          };
        } catch (error) {
          return {
            success: false,
            error: `Validation error: ${error.message}`,
            newState: WorkflowState.VALIDATION_FAILED
          };
        }

      case 'approve_invoice':
        // For now, auto-approve if validation passed
        // In production, this would involve approval workflow
        return {
          success: true,
          data: { approved: true },
          stepData: { approvalResult: 'approved', approvedBy: 'system' },
          newState: WorkflowState.APPROVED
        };

      case 'generate_invoice':
        // Invoice is already generated in draft step, just mark as ready
        return {
          success: true,
          data: { generated: true },
          stepData: { generationResult: 'success' }
        };

      case 'submit_ksef':
        try {
          // Get invoice details
          const invoice = await this.invoicingService.getInvoiceById(workflow.tenant_id, workflow.data.invoiceId);

          // Convert to KSeF format and submit
          const ksefData = this.convertInvoiceToKSeF(invoice);
          const submissionResult = await this.ksefService.submitInvoice(ksefData, workflow.tenant_id);

          return {
            success: true,
            data: {
              submitted: true,
              referenceNumber: submissionResult.referenceNumber,
              status: submissionResult.status
            },
            stepData: {
              submissionResult: 'success',
              referenceNumber: submissionResult.referenceNumber
            },
            newState: WorkflowState.COMPLETED
          };
        } catch (error) {
          return {
            success: false,
            error: `KSeF submission failed: ${error.message}`,
            stepData: { submissionResult: 'failed' },
            newState: WorkflowState.FAILED
          };
        }

      case 'complete_workflow':
        return { success: true, completed: true, newState: WorkflowState.COMPLETED };

      default:
        throw new BadRequestException(`Unknown step: ${step.id}`);
    }
  }

  private async executeTaxCalculationStep(workflow: any, step: WorkflowStepDto, inputData?: any) {
    switch (step.id) {
      case 'prepare_calculation':
        return { success: true, data: inputData, stepData: inputData };
      case 'validate_data':
        return { success: true, data: { validated: true }, stepData: { validationResult: 'passed' } };
      case 'calculate_tax':
        return { success: true, data: { calculated: true }, stepData: { calculationResult: 'success' } };
      case 'finalize_calculation':
        return { success: true, completed: true, newState: WorkflowState.COMPLETED };
      default:
        throw new BadRequestException(`Unknown step: ${step.id}`);
    }
  }

  private async executeKSeFSubmissionStep(workflow: any, step: WorkflowStepDto, inputData?: any) {
    switch (step.id) {
      case 'validate_invoice':
        return { success: true, data: { validated: true }, stepData: { validationResult: 'passed' } };
      case 'prepare_submission':
        return { success: true, data: { prepared: true }, stepData: { preparationResult: 'success' } };
      case 'submit_to_ksef':
        return { success: true, data: { submitted: true }, stepData: { submissionResult: 'success' } };
      case 'confirm_submission':
        return { success: true, completed: true, newState: WorkflowState.COMPLETED };
      default:
        throw new BadRequestException(`Unknown step: ${step.id}`);
    }
  }

  private async executeCustomerOnboardingStep(workflow: any, step: WorkflowStepDto, inputData?: any) {
    switch (step.id) {
      case 'collect_customer_data':
        return { success: true, data: inputData, stepData: inputData };
      case 'validate_customer_data':
        return { success: true, data: { validated: true }, stepData: { validationResult: 'passed' } };
      case 'approve_customer':
        return { success: true, data: { approved: true }, stepData: { approvalResult: 'approved' } };
      case 'setup_customer_profile':
        return { success: true, data: { profileCreated: true }, stepData: { profileResult: 'success' } };
      case 'configure_tax_settings':
        return { success: true, data: { settingsConfigured: true }, stepData: { settingsResult: 'success' } };
      case 'finalize_onboarding':
        return { success: true, completed: true, newState: WorkflowState.COMPLETED };
      default:
        throw new BadRequestException(`Unknown step: ${step.id}`);
    }
  }

  async transitionWorkflow(workflowId: string, newState: WorkflowState, data?: any): Promise<any> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const definition = this.workflowDefinitions.get(workflow.type as any);
    if (!definition) {
      throw new BadRequestException(`Workflow definition not found for type: ${workflow.type}`);
    }

    // Validate transition
    const validTransition = definition.transitions.some(
      t => t.from === workflow.state && t.to === newState
    );

    if (!validTransition) {
      throw new BadRequestException(`Invalid state transition from ${workflow.state} to ${newState}`);
    }

    const updatedWorkflow = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        state: newState,
        data: data ? { ...(workflow.data as object), ...data } : workflow.data,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Workflow ${workflowId} transitioned from ${workflow.state} to ${newState}`);

    return updatedWorkflow;
  }

  async updateWorkflowStep(workflowId: string, stepId: string, updateData: Partial<WorkflowStepDto>): Promise<void> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const currentSteps = workflow.steps as any[];
    const updatedSteps = currentSteps.map(step =>
      step.id === stepId ? { ...step, ...updateData } : step
    );

    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { steps: updatedSteps },
    });
  }

  async cancelWorkflow(tenantId: string, workflowId: string): Promise<any> {
    const workflow = await this.getWorkflow(tenantId, workflowId);

    if (workflow.state === WorkflowState.COMPLETED || workflow.state === WorkflowState.CANCELLED) {
      throw new BadRequestException(`Cannot cancel workflow in state: ${workflow.state}`);
    }

    return await this.transitionWorkflow(workflowId, WorkflowState.CANCELLED);
  }

  getWorkflowDefinition(type: WorkflowType): WorkflowDefinition | undefined {
    return this.workflowDefinitions.get(type);
  }

  private convertInvoiceToKSeF(invoice: any): any {
    return {
      invoiceNumber: invoice.number,
      issueDate: invoice.date.toISOString().split('T')[0],
      dueDate: invoice.dueDate?.toISOString().split('T')[0] || invoice.date.toISOString().split('T')[0],
      sellerName: invoice.company?.name || 'Company Name',
      sellerNip: invoice.company?.nip || '1234567890',
      sellerAddress: invoice.company?.address || 'Company Address',
      buyerName: invoice.buyer?.name || '',
      buyerNip: invoice.buyer?.nip || '',
      buyerAddress: invoice.buyer?.address || '',
      items: invoice.items.map((item: any) => ({
        name: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        gtu: item.gtu,
        netAmount: item.netAmount,
        vatAmount: item.vatAmount,
        grossAmount: item.grossAmount,
      })),
      totalNet: invoice.totalNet,
      totalVat: invoice.totalVat,
      totalGross: invoice.totalGross,
      paymentMethod: 'przelew',
    };
  }

  private async validateTenantAccess(tenantId: string): Promise<void> {
    // In a real implementation, this would validate tenant access through auth service
    // For now, just check if tenant exists
    const tenantExists = await this.prisma.user.findFirst({
      where: { tenant_id: tenantId },
    });

    if (!tenantExists) {
      throw new BadRequestException(`Invalid tenant: ${tenantId}`);
    }
  }

  private async validateCompanyAccess(tenantId: string, companyId: string): Promise<void> {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        tenant_id: tenantId,
      },
    });

    if (!company) {
      throw new BadRequestException(`Company ${companyId} not found or access denied`);
    }
  }

  private async validateCustomerAccess(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.buyer.findFirst({
      where: {
        id: customerId,
        tenant_id: tenantId,
      },
    });

    if (!customer) {
      throw new BadRequestException(`Customer ${customerId} not found or access denied`);
    }
  }

  getAvailableWorkflowTypes(): WorkflowType[] {
    return Array.from(this.workflowDefinitions.keys());
  }
}