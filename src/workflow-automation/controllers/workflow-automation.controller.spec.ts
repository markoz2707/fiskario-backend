import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowAutomationController } from './workflow-automation.controller';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import { TemplateManagementService } from '../services/template-management.service';
import { SmartDefaultsEngineService } from '../services/smart-defaults-engine.service';
import { WorkflowType } from '../dto/workflow.dto';

describe('WorkflowAutomationController', () => {
  let controller: WorkflowAutomationController;
  let workflowEngine: WorkflowEngineService;
  let templateService: TemplateManagementService;
  let smartDefaultsEngine: SmartDefaultsEngineService;

  const mockWorkflowEngine = {
    createWorkflow: jest.fn(),
    getWorkflow: jest.fn(),
    getWorkflows: jest.fn(),
    cancelWorkflow: jest.fn(),
    executeWorkflowStep: jest.fn(),
    getAvailableWorkflowTypes: jest.fn(),
    getWorkflowDefinition: jest.fn(),
  };

  const mockTemplateService = {
    createTemplate: jest.fn(),
    getTemplates: jest.fn(),
    getDefaultTemplates: jest.fn(),
    getTemplateById: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    cloneTemplate: jest.fn(),
    getTemplateUsageStats: jest.fn(),
  };

  const mockSmartDefaultsEngine = {
    getSmartDefaults: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowAutomationController],
      providers: [
        {
          provide: WorkflowEngineService,
          useValue: mockWorkflowEngine,
        },
        {
          provide: TemplateManagementService,
          useValue: mockTemplateService,
        },
        {
          provide: SmartDefaultsEngineService,
          useValue: mockSmartDefaultsEngine,
        },
      ],
    }).compile();

    controller = module.get<WorkflowAutomationController>(WorkflowAutomationController);
    workflowEngine = module.get<WorkflowEngineService>(WorkflowEngineService);
    templateService = module.get<TemplateManagementService>(TemplateManagementService);
    smartDefaultsEngine = module.get<SmartDefaultsEngineService>(SmartDefaultsEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createWorkflow', () => {
    it('should create workflow successfully', async () => {
      const createWorkflowDto = {
        tenant_id: 'test-tenant',
        type: WorkflowType.INVOICE_CREATION,
        trigger: 'manual' as any,
      };

      const mockWorkflow = { id: 'workflow-1', ...createWorkflowDto };

      mockWorkflowEngine.createWorkflow.mockResolvedValue(mockWorkflow);

      const result = await controller.createWorkflow(createWorkflowDto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockWorkflow);
      expect(mockWorkflowEngine.createWorkflow).toHaveBeenCalledWith(createWorkflowDto);
    });

    it('should handle workflow creation errors', async () => {
      const createWorkflowDto = {
        tenant_id: 'test-tenant',
        type: WorkflowType.INVOICE_CREATION,
        trigger: 'manual' as any,
      };

      mockWorkflowEngine.createWorkflow.mockRejectedValue(new Error('Creation failed'));

      await expect(controller.createWorkflow(createWorkflowDto)).rejects.toThrow();
    });
  });

  describe('getWorkflows', () => {
    it('should return workflows successfully', async () => {
      const tenantId = 'test-tenant';
      const query = {
        type: WorkflowType.INVOICE_CREATION,
        state: 'draft',
        companyId: 'comp-1',
        limit: '10',
        offset: '0',
      };

      const mockWorkflows = [{ id: 'workflow-1' }, { id: 'workflow-2' }];

      mockWorkflowEngine.getWorkflows.mockResolvedValue(mockWorkflows);

      const result = await controller.getWorkflows(tenantId, query.type, query.state, query.companyId, undefined, 10, 0);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockWorkflows);
      expect(result.count).toBe(2);
    });

    it('should throw error when tenant ID is missing', async () => {
      await expect(controller.getWorkflows('', WorkflowType.INVOICE_CREATION)).rejects.toThrow('Tenant ID is required');
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow successfully', async () => {
      const workflowId = 'workflow-1';
      const tenantId = 'test-tenant';
      const mockWorkflow = { id: workflowId, tenant_id: tenantId };

      mockWorkflowEngine.getWorkflow.mockResolvedValue(mockWorkflow);

      const result = await controller.getWorkflow(workflowId, tenantId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockWorkflow);
    });

    it('should throw error when tenant ID is missing', async () => {
      await expect(controller.getWorkflow('workflow-1', '')).rejects.toThrow('Tenant ID is required');
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel workflow successfully', async () => {
      const workflowId = 'workflow-1';
      const tenantId = 'test-tenant';
      const mockWorkflow = { id: workflowId, state: 'cancelled' };

      mockWorkflowEngine.cancelWorkflow.mockResolvedValue(mockWorkflow);

      const result = await controller.cancelWorkflow(workflowId, tenantId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockWorkflow);
    });
  });

  describe('executeWorkflowStep', () => {
    it('should execute workflow step successfully', async () => {
      const workflowId = 'workflow-1';
      const executionDto = {
        workflowId,
        stepId: 'step-1',
        inputData: { test: 'data' },
      };

      const mockResult = { success: true, data: { executed: true } };

      mockWorkflowEngine.executeWorkflowStep.mockResolvedValue(mockResult);

      const result = await controller.executeWorkflowStep(workflowId, executionDto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
    });
  });

  describe('Template Management', () => {
    describe('createTemplate', () => {
      it('should create template successfully', async () => {
        const templateDto = {
          name: 'Test Template',
          type: WorkflowType.INVOICE_CREATION,
          steps: [],
        };
        const tenantId = 'test-tenant';
        const mockTemplate = { id: 'template-1', ...templateDto };

        mockTemplateService.createTemplate.mockResolvedValue(mockTemplate);

        const result = await controller.createTemplate(templateDto, tenantId);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockTemplate);
      });

      it('should throw error when tenant ID is missing', async () => {
        const templateDto = {
          name: 'Test Template',
          type: WorkflowType.INVOICE_CREATION,
          steps: [],
        };

        await expect(controller.createTemplate(templateDto, '')).rejects.toThrow('Tenant ID is required');
      });
    });

    describe('getTemplates', () => {
      it('should return templates successfully', async () => {
        const tenantId = 'test-tenant';
        const mockTemplates = [{ id: 'template-1' }, { id: 'template-2' }];

        mockTemplateService.getTemplates.mockResolvedValue(mockTemplates);

        const result = await controller.getTemplates(tenantId, WorkflowType.INVOICE_CREATION, true);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockTemplates);
      });
    });

    describe('getDefaultTemplates', () => {
      it('should return default templates successfully', async () => {
        const mockTemplates = [{ id: 'default-1' }, { id: 'default-2' }];

        mockTemplateService.getDefaultTemplates.mockResolvedValue(mockTemplates);

        const result = await controller.getDefaultTemplates();

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockTemplates);
      });
    });

    describe('updateTemplate', () => {
      it('should update template successfully', async () => {
        const templateId = 'template-1';
        const tenantId = 'test-tenant';
        const updateData = { name: 'Updated Name' };
        const mockTemplate = { id: templateId, name: 'Updated Name' };

        mockTemplateService.updateTemplate.mockResolvedValue(mockTemplate);

        const result = await controller.updateTemplate(templateId, updateData, tenantId);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockTemplate);
      });
    });

    describe('deleteTemplate', () => {
      it('should delete template successfully', async () => {
        const templateId = 'template-1';
        const tenantId = 'test-tenant';

        mockTemplateService.deleteTemplate.mockResolvedValue(undefined);

        const result = await controller.deleteTemplate(templateId, tenantId);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Template deleted successfully');
      });
    });

    describe('cloneTemplate', () => {
      it('should clone template successfully', async () => {
        const templateId = 'template-1';
        const tenantId = 'test-tenant';
        const newName = 'Cloned Template';
        const mockTemplate = { id: 'template-2', name: newName };

        mockTemplateService.cloneTemplate.mockResolvedValue(mockTemplate);

        const result = await controller.cloneTemplate(templateId, newName, tenantId);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockTemplate);
      });

      it('should throw error when new name is empty', async () => {
        const templateId = 'template-1';
        const tenantId = 'test-tenant';

        await expect(controller.cloneTemplate(templateId, '', tenantId)).rejects.toThrow('New template name is required');
      });
    });

    describe('getTemplateStats', () => {
      it('should return template statistics successfully', async () => {
        const templateId = 'template-1';
        const tenantId = 'test-tenant';
        const mockStats = { usageCount: 10, successRate: 95 };

        mockTemplateService.getTemplateUsageStats.mockResolvedValue(mockStats);

        const result = await controller.getTemplateStats(templateId, tenantId);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockStats);
      });
    });
  });

  describe('Smart Defaults', () => {
    describe('getSmartDefaults', () => {
      it('should return smart defaults successfully', async () => {
        const smartDefaultsDto = {
          tenant_id: 'test-tenant',
          companyId: 'comp-1',
          workflowType: WorkflowType.INVOICE_CREATION,
        };

        const mockResult = { defaults: { vatRate: 23 }, suggestions: ['Use standard VAT rate'] };

        mockSmartDefaultsEngine.getSmartDefaults.mockResolvedValue(mockResult);

        const result = await controller.getSmartDefaults(smartDefaultsDto);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockResult);
      });
    });
  });

  describe('Workflow Types and Definitions', () => {
    describe('getWorkflowTypes', () => {
      it('should return available workflow types', async () => {
        const mockTypes = [WorkflowType.INVOICE_CREATION, WorkflowType.TAX_CALCULATION];

        mockWorkflowEngine.getAvailableWorkflowTypes.mockReturnValue(mockTypes);

        const result = await controller.getWorkflowTypes();

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockTypes);
      });
    });

    describe('getWorkflowDefinition', () => {
      it('should return workflow definition successfully', async () => {
        const type = WorkflowType.INVOICE_CREATION;
        const mockDefinition = {
          type,
          initialState: 'draft' as any,
          states: [],
          transitions: [],
          steps: [],
        };

        mockWorkflowEngine.getWorkflowDefinition.mockReturnValue(mockDefinition);

        const result = await controller.getWorkflowDefinition(type);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockDefinition);
      });

      it('should throw error for unknown workflow type', async () => {
        const type = 'unknown-type' as any;

        mockWorkflowEngine.getWorkflowDefinition.mockReturnValue(undefined);

        await expect(controller.getWorkflowDefinition(type)).rejects.toThrow('Workflow type unknown-type not found');
      });
    });
  });

  describe('Error handling', () => {
    it('should handle HttpException properly', async () => {
      mockWorkflowEngine.createWorkflow.mockRejectedValue(new Error('Service error'));

      const createWorkflowDto = {
        tenant_id: 'test-tenant',
        type: WorkflowType.INVOICE_CREATION,
        trigger: 'manual' as any,
      };

      try {
        await controller.createWorkflow(createWorkflowDto);
        fail('Should have thrown HttpException');
      } catch (error: any) {
        expect(error.response.success).toBe(false);
        expect(error.response.message).toBe('Failed to create workflow');
      }
    });

    it('should handle null tenant_id', async () => {
      const createWorkflowDto = {
        tenant_id: null as any,
        type: WorkflowType.INVOICE_CREATION,
        trigger: 'manual' as any,
      };

      mockWorkflowEngine.createWorkflow.mockRejectedValue(new Error('Invalid tenant'));

      await expect(controller.createWorkflow(createWorkflowDto)).rejects.toThrow();
    });

    it('should handle undefined tenant_id', async () => {
      const createWorkflowDto = {
        tenant_id: undefined as any,
        type: WorkflowType.INVOICE_CREATION,
        trigger: 'manual' as any,
      };

      mockWorkflowEngine.createWorkflow.mockRejectedValue(new Error('Invalid tenant'));

      await expect(controller.createWorkflow(createWorkflowDto)).rejects.toThrow();
    });
  });
});