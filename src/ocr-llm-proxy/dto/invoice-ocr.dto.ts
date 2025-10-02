import { IsString, IsNumber, IsDate, IsArray, IsOptional, IsObject, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum InvoiceType {
  VAT = 'VAT',
  PROFORMA = 'PROFORMA',
  CORRECTIVE = 'CORRECTIVE',
  RECEIPT = 'RECEIPT'
}

export enum ConfidenceLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export class InvoiceItemDto {
  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  @IsOptional()
  vatRate?: number;

  @IsNumber()
  totalPrice: number;
}

export class InvoiceSellerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  nip?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;
}

export class InvoiceBuyerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  nip?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;
}

export class InvoiceOcrResultDto {
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  issueDate?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  saleDate?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  dueDate?: Date;

  @IsEnum(InvoiceType)
  @IsOptional()
  type?: InvoiceType;

  @ValidateNested()
  @IsObject()
  @IsOptional()
  @Type(() => InvoiceSellerDto)
  seller?: InvoiceSellerDto;

  @ValidateNested()
  @IsObject()
  @IsOptional()
  @Type(() => InvoiceBuyerDto)
  buyer?: InvoiceBuyerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @IsOptional()
  items?: InvoiceItemDto[];

  @IsNumber()
  @IsOptional()
  netAmount?: number;

  @IsNumber()
  @IsOptional()
  vatAmount?: number;

  @IsNumber()
  @IsOptional()
  grossAmount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ConfidenceLevel)
  overallConfidence: ConfidenceLevel;

  @IsNumber()
  @IsOptional()
  confidenceScore?: number;

  @IsString()
  @IsOptional()
  rawText?: string;

  @IsString()
  @IsOptional()
  processingNotes?: string;
}

export class OcrProcessingRequestDto {
  @IsString()
  imageBase64: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  companyId?: string;
}

export class OcrProcessingResponseDto {
  @IsString()
  requestId: string;

  @IsEnum(['PROCESSING', 'COMPLETED', 'FAILED'])
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @ValidateNested()
  @IsObject()
  @IsOptional()
  @Type(() => InvoiceOcrResultDto)
  result?: InvoiceOcrResultDto;

  @IsString()
  @IsOptional()
  error?: string;

  @IsDate()
  @Type(() => Date)
  createdAt: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  completedAt?: Date;
}