import { IsString, IsEnum, IsOptional, IsObject, IsArray, IsUUID, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum WorkflowType {
  INVOICE_CREATION = 'invoice_creation',
  TAX_CALCULATION = 'tax_calculation',
  KSEF_SUBMISSION = 'ksef_submission',
  CUSTOMER_ONBOARDING = 'customer_onboarding',
}

export enum WorkflowState {
  DRAFT = 'draft',
  PENDING_VALIDATION = 'pending_validation',
  VALIDATION_FAILED = 'validation_failed',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum WorkflowTrigger {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT_BASED = 'event_based',
  API_CALL = 'api_call',
}

export class WorkflowStepDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(WorkflowState)
  state: WorkflowState;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @IsString()
  @IsOptional()
  errorMessage?: string;
}

export class WorkflowTemplateDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(WorkflowType)
  type: WorkflowType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];

  @IsObject()
  @IsOptional()
  defaultSettings?: Record<string, any>;

  @IsString()
  @IsOptional()
  version?: string;

  @IsDateString()
  @IsOptional()
  createdAt?: string;

  @IsDateString()
  @IsOptional()
  updatedAt?: string;
}

export class CreateWorkflowDto {
  @IsString()
  tenant_id: string;

  @IsEnum(WorkflowType)
  type: WorkflowType;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsEnum(WorkflowTrigger)
  trigger: WorkflowTrigger;

  @IsObject()
  @IsOptional()
  initialData?: Record<string, any>;

  @IsString()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsOptional()
  customerId?: string;
}

export class UpdateWorkflowDto {
  @IsEnum(WorkflowState)
  @IsOptional()
  state?: WorkflowState;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsString()
  @IsOptional()
  errorMessage?: string;
}

export class WorkflowExecutionDto {
  @IsUUID()
  workflowId: string;

  @IsString()
  stepId: string;

  @IsObject()
  @IsOptional()
  inputData?: Record<string, any>;

  @IsString()
  @IsOptional()
  userId?: string;
}

export class SmartDefaultsDto {
  @IsString()
  tenant_id: string;

  @IsString()
  companyId: string;

  @IsEnum(WorkflowType)
  workflowType: WorkflowType;

  @IsObject()
  @IsOptional()
  context?: Record<string, any>;
}

export class SmartDefaultsResponseDto {
  @IsObject()
  defaults: Record<string, any>;

  @IsArray()
  @IsOptional()
  suggestions?: string[];

  @IsString()
  @IsOptional()
  confidence?: string;
}