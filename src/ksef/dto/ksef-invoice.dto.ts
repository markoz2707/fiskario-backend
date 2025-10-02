import { IsString, IsDateString, IsArray, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class KSeFInvoiceItemDto {
  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  vatRate: number;

  @IsString()
  @IsOptional()
  gtu?: string;

  @IsNumber()
  netAmount: number;

  @IsNumber()
  vatAmount: number;

  @IsNumber()
  grossAmount: number;
}

export class KSeFInvoiceDto {
  @IsString()
  invoiceNumber: string;

  @IsDateString()
  issueDate: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  sellerName: string;

  @IsString()
  sellerNip: string;

  @IsString()
  sellerAddress: string;

  @IsString()
  buyerName: string;

  @IsString()
  buyerNip: string;

  @IsString()
  buyerAddress: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KSeFInvoiceItemDto)
  items: KSeFInvoiceItemDto[];

  @IsNumber()
  totalNet: number;

  @IsNumber()
  totalVat: number;

  @IsNumber()
  totalGross: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}

export class KSeFSubmissionResponseDto {
  @IsString()
  referenceNumber: string;

  @IsString()
  status: string;

  @IsString()
  @IsOptional()
  upoNumber?: string;

  @IsString()
  @IsOptional()
  timestamp?: string;
}