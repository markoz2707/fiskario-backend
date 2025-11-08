import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import { TemplateManagementService } from '../services/template-management.service';
import { SmartDefaultsEngineService } from '../services/smart-defaults-engine.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowExecutionDto,
  SmartDefaultsDto,
  WorkflowTemplateDto,
  WorkflowType,
} from '../dto/workflow.dto';

@Controller('workflow-automation')
export class WorkflowAutomationController {
  private readonly logger = new Logger(WorkflowAutomationController.name);

  constructor(
    private readonly workflowEngine: WorkflowEngineService,
    private readonly templateService: TemplateManagementService,
    private readonly smartDefaultsEngine: SmartDefaultsEngineService,
  ) {}

  // Workflow Management Endpoints

  @Post('workflows')
  async createWorkflow(@Body() createWorkflowDto: CreateWorkflowDto) {
    try {
      this.logger.log(`Creating workflow of type ${createWorkflowDto.type} for tenant ${createWorkflowDto.tenant_id}`);
      const workflow = await this.workflowEngine.createWorkflow(createWorkflowDto);
      return {
        success: true,
        data: workflow,
        message: 'Workflow created successfully',
      };
    } catch (error) {
      this.logger.error('Failed to create workflow', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create workflow',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('workflows')
  async getWorkflows(
    @Query('tenantId') tenantId: string,
    @Query('type') type?: WorkflowType,
    @Query('state') state?: string,
    @Query('companyId') companyId?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const workflows = await this.workflowEngine.getWorkflows(tenantId, {
        type,
        state: state as any,
        companyId,
        customerId,
        limit: limit ? parseInt(limit.toString()) : undefined,
        offset: offset ? parseInt(offset.toString()) : undefined,
      });

      return {
        success: true,
        data: workflows,
        count: workflows.length,
      };
    } catch (error) {
      this.logger.error('Failed to get workflows', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve workflows',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('workflows/:id')
  async getWorkflow(@Param('id') workflowId: string, @Query('tenantId') tenantId: string) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const workflow = await this.workflowEngine.getWorkflow(tenantId, workflowId);
      return {
        success: true,
        data: workflow,
      };
    } catch (error) {
      this.logger.error(`Failed to get workflow ${workflowId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve workflow',
          error: error.message,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Put('workflows/:id/cancel')
  async cancelWorkflow(@Param('id') workflowId: string, @Query('tenantId') tenantId: string) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const workflow = await this.workflowEngine.cancelWorkflow(tenantId, workflowId);
      return {
        success: true,
        data: workflow,
        message: 'Workflow cancelled successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to cancel workflow ${workflowId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to cancel workflow',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('workflows/:id/execute')
  async executeWorkflowStep(
    @Param('id') workflowId: string,
    @Body() executionDto: WorkflowExecutionDto,
  ) {
    try {
      executionDto.workflowId = workflowId;
      const result = await this.workflowEngine.executeWorkflowStep(executionDto);
      return {
        success: true,
        data: result,
        message: 'Workflow step executed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to execute workflow step for ${workflowId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to execute workflow step',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Template Management Endpoints

  @Post('templates')
  async createTemplate(@Body() templateDto: WorkflowTemplateDto, @Query('tenantId') tenantId: string) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const template = await this.templateService.createTemplate(tenantId, templateDto);
      return {
        success: true,
        data: template,
        message: 'Template created successfully',
      };
    } catch (error) {
      this.logger.error('Failed to create template', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create template',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('templates')
  async getTemplates(
    @Query('tenantId') tenantId: string,
    @Query('type') type?: WorkflowType,
    @Query('isActive') isActive?: boolean,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const templates = await this.templateService.getTemplates(tenantId, {
        type,
        isActive: isActive !== undefined ? isActive : true,
      });

      return {
        success: true,
        data: templates,
        count: templates.length,
      };
    } catch (error) {
      this.logger.error('Failed to get templates', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve templates',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('templates/default')
  async getDefaultTemplates() {
    try {
      const templates = await this.templateService.getDefaultTemplates();
      return {
        success: true,
        data: templates,
        count: templates.length,
      };
    } catch (error) {
      this.logger.error('Failed to get default templates', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve default templates',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') templateId: string, @Query('tenantId') tenantId: string) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const template = await this.templateService.getTemplateById(tenantId, templateId);
      return {
        success: true,
        data: template,
      };
    } catch (error) {
      this.logger.error(`Failed to get template ${templateId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve template',
          error: error.message,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id') templateId: string,
    @Body() updateData: Partial<WorkflowTemplateDto>,
    @Query('tenantId') tenantId: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const template = await this.templateService.updateTemplate(tenantId, templateId, updateData);
      return {
        success: true,
        data: template,
        message: 'Template updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update template ${templateId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to update template',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') templateId: string, @Query('tenantId') tenantId: string) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      await this.templateService.deleteTemplate(tenantId, templateId);
      return {
        success: true,
        message: 'Template deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete template ${templateId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to delete template',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('templates/:id/clone')
  async cloneTemplate(
    @Param('id') templateId: string,
    @Body('newName') newName: string,
    @Query('tenantId') tenantId: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      if (!newName?.trim()) {
        throw new HttpException('New template name is required', HttpStatus.BAD_REQUEST);
      }

      const template = await this.templateService.cloneTemplate(tenantId, templateId, newName);
      return {
        success: true,
        data: template,
        message: 'Template cloned successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to clone template ${templateId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to clone template',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('templates/:id/stats')
  async getTemplateStats(@Param('id') templateId: string, @Query('tenantId') tenantId: string) {
    try {
      if (!tenantId) {
        throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
      }

      const stats = await this.templateService.getTemplateUsageStats(tenantId, templateId);
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Failed to get template stats ${templateId}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve template statistics',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Smart Defaults Endpoints

  @Post('smart-defaults')
  async getSmartDefaults(@Body() smartDefaultsDto: SmartDefaultsDto) {
    try {
      const result = await this.smartDefaultsEngine.getSmartDefaults(smartDefaultsDto);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Failed to get smart defaults', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to generate smart defaults',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Workflow Types and Definitions

  @Get('workflow-types')
  async getWorkflowTypes() {
    try {
      const types = this.workflowEngine.getAvailableWorkflowTypes();
      return {
        success: true,
        data: types,
        count: types.length,
      };
    } catch (error) {
      this.logger.error('Failed to get workflow types', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve workflow types',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('workflow-definitions/:type')
  async getWorkflowDefinition(@Param('type') type: WorkflowType) {
    try {
      const definition = this.workflowEngine.getWorkflowDefinition(type);
      if (!definition) {
        throw new HttpException(`Workflow type ${type} not found`, HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        data: definition as any,
      };
    } catch (error) {
      this.logger.error(`Failed to get workflow definition for ${type}`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve workflow definition',
          error: error.message,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }
}