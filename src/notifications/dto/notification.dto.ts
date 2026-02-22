import { IsString, IsOptional, IsObject, IsBoolean, IsEnum, IsDateString, IsNumber, IsArray, Min } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables: string[] = [];

  @IsBoolean()
  @IsOptional()
  isActive: boolean = true;
}

export class GetNotificationsQueryDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  limit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class SendTestNotificationDto {
  @IsString()
  templateName: string;

  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;
}

export class RecordCommunicationDto {
  @IsEnum(['submission', 'confirmation', 'rejection', 'correction', 'inquiry'])
  type: 'submission' | 'confirmation' | 'rejection' | 'correction' | 'inquiry';

  @IsEnum(['invoice', 'declaration', 'zus', 'tax'])
  entityType: 'invoice' | 'declaration' | 'zus' | 'tax';

  @IsString()
  entityId: string;

  @IsEnum(['sent', 'delivered', 'acknowledged', 'rejected', 'pending_response'])
  status: 'sent' | 'delivered' | 'acknowledged' | 'rejected' | 'pending_response';

  @IsEnum(['outbound', 'inbound'])
  direction: 'outbound' | 'inbound';

  @IsEnum(['urzad_skarbowy', 'zus', 'ksef', 'other'])
  officialBody: 'urzad_skarbowy' | 'zus' | 'ksef' | 'other';

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsString()
  @IsOptional()
  upoNumber?: string;

  @IsString()
  description: string;

  @IsObject()
  content: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  responseRequired?: boolean;

  @IsDateString()
  @IsOptional()
  responseDeadline?: string;
}

export class UpdateCommunicationStatusDto {
  @IsEnum(['sent', 'delivered', 'acknowledged', 'rejected', 'pending_response'])
  status: 'sent' | 'delivered' | 'acknowledged' | 'rejected' | 'pending_response';

  @IsObject()
  @IsOptional()
  additionalData?: Record<string, any>;
}

export class RecordSubmissionStatusDto {
  @IsEnum(['invoice', 'declaration', 'zus', 'tax'])
  entityType: 'invoice' | 'declaration' | 'zus' | 'tax';

  @IsString()
  entityId: string;

  @IsEnum(['submitted', 'accepted', 'rejected'])
  status: 'submitted' | 'accepted' | 'rejected';

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsString()
  @IsOptional()
  upoNumber?: string;

  @IsObject()
  @IsOptional()
  details?: Record<string, any>;
}
