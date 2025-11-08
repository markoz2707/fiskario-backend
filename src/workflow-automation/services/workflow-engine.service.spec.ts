import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowEngineService } from './workflow-engine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicingService } from '../../invoicing/invoicing.service';
import { TaxRulesService } from '../../tax-rules/tax-rules.service';
import { KsefService } from '../../ksef/ksef.service';
import { BuyersService } from '../../invoicing/buyers.service';
import { WorkflowType, WorkflowState, WorkflowTrigger } from '../dto/workflow.dto';

describe('WorkflowEngineService', () => {
  let service: WorkflowEngineService;
  let prismaService: PrismaService;
  let invoicingService: InvoicingService;
  let taxRulesService: TaxRulesService;
  let ksefService: KsefService;
  let buyersService: BuyersService;

  const mockPrismaService = {
    workflow: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
    buyer: {
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockInvoicingService = {
    createInvoice: jest.fn(),
    validateMobileInvoice: jest.fn(),
    getInvoiceById: jest.fn(),
  };

  const mockTaxRulesService = {};
  const mockKsefService = {
    submitInvoice: jest.fn(),
  };
  const mockBuyersService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngineService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: InvoicingService,
          useValue: mockInvoicingService,
        },
        {
          provide: TaxRulesService,
          useValue: mockTaxRulesService,
        },
        {
          provide: KsefService,
          useValue: mockKsefService,
        },
        {
          provide: BuyersService,
          useValue: mockBuyersService,
        },
      ],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
    prismaService = module.get<PrismaService>(PrismaService);
    invoicingService = module.get<InvoicingService>(InvoicingService);
    taxRulesService = module.get<TaxRulesService>(TaxRulesService);
    ksefService = module.get<KsefService>(KsefService);
    buyersService = module.get<BuyersService>(BuyersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createWorkflow', () => {
    it('should create a workflow successfully', async () => {
      const createWorkflowDto = {
        tenant_id: 'test-tenant',
        type: WorkflowType.INVOICE_CREATION,
        trigger: WorkflowTrigger.MANUAL,
        initialData: { test: 'data' },
      };

      const mockWorkflow = {
        id: 'workflow-1',
        ...createWorkflowDto,
        state: WorkflowState.DRAFT,
        steps: [],
      };

      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrismaService.workflow.create.mockResolvedValue(mockWorkflow);

      const result = await service.createWorkflow(createWorkflowDto);

      expect(result).toEqual(mockWorkflow);
      expect(mockPrismaService.workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: createWorkflowDto.tenant_id,
          type: createWorkflowDto.type,
          state: WorkflowState.DRAFT,
          trigger: createWorkflowDto.trigger,
          data: createWorkflowDto.initialData,
        }),
      });
    });

    it('should throw error for invalid tenant', async () => {
      const createWorkflowDto = {
        tenant_id: 'invalid-tenant',
        type: WorkflowType.INVOICE_CREATION,
        trigger: WorkflowTrigger.MANUAL,
      };

      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.createWorkflow(createWorkflowDto)).rejects.toThrow('Invalid tenant');
    });

    it('should throw error for unsupported workflow type', async () => {
      const createWorkflowDto = {
        tenant_id: 'test-tenant',
        type: 'invalid-type' as any,
        trigger: WorkflowTrigger.MANUAL,
      };

      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'user-1' });

      await expect(service.createWorkflow(createWorkflowDto)).rejects.toThrow('Unsupported workflow type');
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow for valid tenant and workflow ID', async () => {
      const tenantId = 'test-tenant';
      const workflowId = 'workflow-1';
      const mockWorkflow = { id: workflowId, tenant_id: tenantId };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);

      const result = await service.getWorkflow(tenantId, workflowId);

      expect(result).toEqual(mockWorkflow);
    });

    it('should throw NotFoundException for non-existent workflow', async () => {
      const tenantId = 'test-tenant';
      const workflowId = 'non-existent';

      mockPrismaService.workflow.findFirst.mockResolvedValue(null);

      await expect(service.getWorkflow(tenantId, workflowId)).rejects.toThrow('Workflow non-existent not found');
    });
  });

  describe('getWorkflows', () => {
    it('should return workflows with filters', async () => {
      const tenantId = 'test-tenant';
      const filters = {
        type: WorkflowType.INVOICE_CREATION,
        state: WorkflowState.DRAFT,
        limit: 10,
        offset: 0,
      };

      const mockWorkflows = [
        { id: 'workflow-1', type: WorkflowType.INVOICE_CREATION, state: WorkflowState.DRAFT },
      ];

      mockPrismaService.workflow.findMany.mockResolvedValue(mockWorkflows);

      const result = await service.getWorkflows(tenantId, filters);

      expect(result).toEqual(mockWorkflows);
      expect(mockPrismaService.workflow.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: tenantId,
          type: filters.type,
          state: filters.state,
        }),
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      });
    });
  });

  describe('executeWorkflowStep', () => {
    it('should execute invoice creation step successfully', async () => {
      const executionDto = {
        workflowId: 'workflow-1',
        stepId: 'draft_invoice',
        inputData: { invoiceData: 'test' },
      };

      const mockWorkflow = {
        id: 'workflow-1',
        type: WorkflowType.INVOICE_CREATION,
        steps: [{ id: 'draft_invoice', state: WorkflowState.DRAFT }],
      };

      const mockInvoice = { id: 'invoice-1', number: 'INV-001' };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);
      mockInvoicingService.createInvoice.mockResolvedValue(mockInvoice);

      const result = await service.executeWorkflowStep(executionDto);

      expect(result.success).toBe(true);
      expect(result.data.invoiceId).toBe('invoice-1');
      expect(mockInvoicingService.createInvoice).toHaveBeenCalled();
    });

    it('should handle validation failure in invoice creation', async () => {
      const executionDto = {
        workflowId: 'workflow-1',
        stepId: 'validate_invoice',
        inputData: {},
      };

      const mockWorkflow = {
        id: 'workflow-1',
        type: WorkflowType.INVOICE_CREATION,
        steps: [{ id: 'validate_invoice', state: WorkflowState.PENDING_VALIDATION }],
        data: { invoiceId: 'inv-1' },
      };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);
      mockInvoicingService.validateMobileInvoice.mockResolvedValue({
        valid: false,
        errors: ['Invalid VAT rate'],
        warnings: [],
      });

      const result = await service.executeWorkflowStep(executionDto);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should execute KSeF submission step successfully', async () => {
      const executionDto = {
        workflowId: 'workflow-1',
        stepId: 'submit_ksef',
        inputData: {},
      };

      const mockWorkflow = {
        id: 'workflow-1',
        type: WorkflowType.INVOICE_CREATION,
        steps: [{ id: 'submit_ksef', state: WorkflowState.PROCESSING }],
        data: { invoiceId: 'inv-1' },
      };

      const mockInvoice = {
        id: 'inv-1',
        number: 'INV-001',
        date: new Date(),
        dueDate: new Date(),
        company: { name: 'Test Company', nip: '1234567890', address: 'Test Address' },
        buyer: { name: 'Test Buyer', nip: '0987654321', address: 'Buyer Address' },
        items: [{ description: 'Test Item', quantity: 1, unitPrice: 100, vatRate: 23, gtu: 'GTU_01', netAmount: 100, vatAmount: 23, grossAmount: 123 }],
        totalNet: 100,
        totalVat: 23,
        totalGross: 123,
      };

      const mockKSeFResult = {
        referenceNumber: 'KSEF-123',
        status: 'submitted',
      };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);
      mockInvoicingService.getInvoiceById.mockResolvedValue(mockInvoice);
      mockKsefService.submitInvoice.mockResolvedValue(mockKSeFResult);

      const result = await service.executeWorkflowStep(executionDto);

      expect(result.success).toBe(true);
      expect(result.data.referenceNumber).toBe('KSEF-123');
      expect(mockKsefService.submitInvoice).toHaveBeenCalled();
    });
  });

  describe('transitionWorkflow', () => {
    it('should transition workflow state successfully', async () => {
      const workflowId = 'workflow-1';
      const newState = WorkflowState.COMPLETED;
      const data = { completed: true };

      const mockWorkflow = {
        id: workflowId,
        state: WorkflowState.PROCESSING,
        type: WorkflowType.INVOICE_CREATION,
        data: {},
      };

      const updatedWorkflow = { ...mockWorkflow, state: newState, data };

      mockPrismaService.workflow.findUnique.mockResolvedValue(mockWorkflow);
      mockPrismaService.workflow.update.mockResolvedValue(updatedWorkflow);

      const result = await service.transitionWorkflow(workflowId, newState, data);

      expect(result.state).toBe(newState);
      expect(mockPrismaService.workflow.update).toHaveBeenCalledWith({
        where: { id: workflowId },
        data: expect.objectContaining({
          state: newState,
          data: data,
        }),
      });
    });

    it('should throw error for invalid state transition', async () => {
      const workflowId = 'workflow-1';
      const newState = WorkflowState.CANCELLED;

      const mockWorkflow = {
        id: workflowId,
        state: WorkflowState.COMPLETED, // Cannot cancel completed workflow
        type: WorkflowType.INVOICE_CREATION,
      };

      mockPrismaService.workflow.findUnique.mockResolvedValue(mockWorkflow);

      await expect(service.transitionWorkflow(workflowId, newState)).rejects.toThrow('Invalid state transition');
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel workflow successfully', async () => {
      const tenantId = 'test-tenant';
      const workflowId = 'workflow-1';

      const mockWorkflow = {
        id: workflowId,
        state: WorkflowState.DRAFT,
        type: WorkflowType.INVOICE_CREATION,
      };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);
      mockPrismaService.workflow.update.mockResolvedValue({
        ...mockWorkflow,
        state: WorkflowState.CANCELLED,
      });

      const result = await service.cancelWorkflow(tenantId, workflowId);

      expect(result.state).toBe(WorkflowState.CANCELLED);
    });

    it('should throw error when trying to cancel completed workflow', async () => {
      const tenantId = 'test-tenant';
      const workflowId = 'workflow-1';

      const mockWorkflow = {
        id: workflowId,
        state: WorkflowState.COMPLETED,
        type: WorkflowType.INVOICE_CREATION,
      };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);

      await expect(service.cancelWorkflow(tenantId, workflowId)).rejects.toThrow('Cannot cancel workflow in state: completed');
    });
  });

  describe('getWorkflowDefinition', () => {
    it('should return workflow definition for valid type', () => {
      const definition = service.getWorkflowDefinition(WorkflowType.INVOICE_CREATION);

      expect(definition).toBeDefined();
      expect(definition?.type).toBe(WorkflowType.INVOICE_CREATION);
      expect(definition?.states).toContain(WorkflowState.DRAFT);
      expect(definition?.states).toContain(WorkflowState.COMPLETED);
    });

    it('should return undefined for invalid type', () => {
      const definition = service.getWorkflowDefinition('invalid-type' as any);

      expect(definition).toBeUndefined();
    });
  });

  describe('getAvailableWorkflowTypes', () => {
    it('should return all available workflow types', () => {
      const types = service.getAvailableWorkflowTypes();

      expect(types).toContain(WorkflowType.INVOICE_CREATION);
      expect(types).toContain(WorkflowType.TAX_CALCULATION);
      expect(types).toContain(WorkflowType.KSEF_SUBMISSION);
      expect(types).toContain(WorkflowType.CUSTOMER_ONBOARDING);
      expect(types).toHaveLength(4);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors during workflow creation', async () => {
      const createWorkflowDto = {
        tenant_id: 'test-tenant',
        type: WorkflowType.INVOICE_CREATION,
        trigger: WorkflowTrigger.MANUAL,
      };

      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrismaService.workflow.create.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.createWorkflow(createWorkflowDto)).rejects.toThrow('Failed to create workflow');
    });

    it('should handle step execution errors', async () => {
      const executionDto = {
        workflowId: 'workflow-1',
        stepId: 'invalid_step',
        inputData: {},
      };

      const mockWorkflow = {
        id: 'workflow-1',
        type: WorkflowType.INVOICE_CREATION,
        steps: [],
      };

      mockPrismaService.workflow.findFirst.mockResolvedValue(mockWorkflow);

      const result = await service.executeWorkflowStep(executionDto);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown step');
    });

    it('should handle null tenant_id', async () => {
      const createWorkflowDto = {
        tenant_id: null as any,
        type: WorkflowType.INVOICE_CREATION,
        trigger: WorkflowTrigger.MANUAL,
      };

      await expect(service.createWorkflow(createWorkflowDto)).rejects.toThrow();
    });

    it('should handle undefined tenant_id', async () => {
      const createWorkflowDto = {
        tenant_id: undefined as any,
        type: WorkflowType.INVOICE_CREATION,
        trigger: WorkflowTrigger.MANUAL,
      };

      await expect(service.createWorkflow(createWorkflowDto)).rejects.toThrow();
    });
  });
});