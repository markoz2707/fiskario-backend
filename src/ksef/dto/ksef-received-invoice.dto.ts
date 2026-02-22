import { IsString, IsNumber, IsDate, IsOptional, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class KSeFReceivedInvoiceItemDto {
    @IsNumber()
    lineNumber: number;

    @IsString()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsNumber()
    quantity: number;

    @IsString()
    unit: string;

    @IsNumber()
    unitPrice: number;

    @IsNumber()
    netAmount: number;

    @IsNumber()
    vatRate: number;

    @IsNumber()
    vatAmount: number;

    @IsNumber()
    grossAmount: number;

    @IsString()
    @IsOptional()
    gtu?: string;
}

export class KSeFReceivedInvoiceDto {
    @IsString()
    ksefNumber: string;

    @IsString()
    ksefReferenceNumber: string;

    @IsString()
    invoiceNumber: string;

    @IsString()
    @Type(() => Date)
    issueDate: string;

    @IsString()
    @IsOptional()
    @Type(() => Date)
    dueDate?: string;

    @IsString()
    @IsOptional()
    saleDate?: string;

    @IsString()
    sellerNip: string;

    @IsString()
    sellerName: string;

    @IsString()
    sellerAddress: string;

    @IsString()
    @IsOptional()
    sellerCity?: string;

    @IsString()
    @IsOptional()
    sellerPostalCode?: string;

    @IsString()
    @IsOptional()
    sellerCountry?: string;

    @IsString()
    buyerNip: string;

    @IsString()
    buyerName: string;

    @IsString()
    buyerAddress: string;

    @IsString()
    @IsOptional()
    buyerCity?: string;

    @IsString()
    @IsOptional()
    buyerPostalCode?: string;

    @IsString()
    @IsOptional()
    buyerCountry?: string;

    @IsNumber()
    totalNet: number;

    @IsNumber()
    totalVat: number;

    @IsNumber()
    totalGross: number;

    @IsString()
    @IsOptional()
    currency?: string;

    @IsString()
    @IsOptional()
    paymentMethod?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KSeFReceivedInvoiceItemDto)
    items: KSeFReceivedInvoiceItemDto[];

    @IsString()
    xmlContent: string;

    @IsString()
    @IsOptional()
    upoNumber?: string;

    @IsDate()
    @IsOptional()
    @Type(() => Date)
    downloadedAt?: Date;
}

export class KSeFInvoiceListDto {
    @IsString()
    ksefNumber: string;

    @IsString()
    invoiceNumber: string;

    @IsDate()
    @Type(() => Date)
    issueDate: Date;

    @IsString()
    sellerNip: string;

    @IsString()
    sellerName: string;

    @IsNumber()
    totalGross: number;

    @IsString()
    status: string; // new, downloaded, processed
}

export class KSeFSyncRequestDto {
    @IsDate()
    @IsOptional()
    @Type(() => Date)
    dateFrom?: Date;

    @IsDate()
    @IsOptional()
    @Type(() => Date)
    dateTo?: Date;

    @IsBoolean()
    @IsOptional()
    forceSync?: boolean;
}

export class KSeFSyncResponseDto {
    @IsNumber()
    totalFound: number;

    @IsNumber()
    newInvoices: number;

    @IsNumber()
    updatedInvoices: number;

    @IsArray()
    invoiceNumbers: string[];

    @IsDate()
    @Type(() => Date)
    syncTimestamp: Date;

    @IsString()
    @IsOptional()
    error?: string;
}
