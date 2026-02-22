import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  IsIn,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================================
// Form Types & Status
// ============================================================

export const FORM_TYPES = ['PIT_36', 'PIT_36L', 'PIT_28'] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const RETURN_STATUSES = [
  'DRAFT',
  'CALCULATING',
  'READY',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'CORRECTED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const DEDUCTION_TYPES = [
  'CHILD_RELIEF',
  'INTERNET',
  'DONATIONS',
  'IKZE',
  'THERMOMODERNIZATION',
  'REHABILITATION',
  'HEALTH_INSURANCE',
  'BLOOD_DONATION',
  'OTHER',
] as const;
export type DeductionType = (typeof DEDUCTION_TYPES)[number];

export const DEDUCTION_CATEGORIES = ['FROM_INCOME', 'FROM_TAX'] as const;
export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number];

export const SOURCE_METHODS = ['MANUAL', 'OCR', 'IMPORT'] as const;
export type SourceMethod = (typeof SOURCE_METHODS)[number];

export const RYCZALT_RATE_TYPES = [
  'IT',
  'FREE_PROFESSIONS',
  'RENT',
  'TRADE',
  'PRODUCTION',
  'SERVICES',
  'GASTRONOMY',
  'CONSTRUCTION',
  'HEALTH_SERVICES',
  'RENT_HIGH',
] as const;
export type RyczaltRateType = (typeof RYCZALT_RATE_TYPES)[number];

// ============================================================
// Annual Tax Return DTOs
// ============================================================

export class CreateAnnualReturnDto {
  @IsInt()
  @Min(2020)
  @Max(2030)
  year: number;

  @IsIn(FORM_TYPES)
  formType: FormType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  businessIncome?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  businessCosts?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  zusDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  healthDeduction?: number;

  @IsOptional()
  @IsBoolean()
  jointFiling?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  spouseIncome?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  spouseCosts?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  spouseTaxAdvances?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'spousePesel must be exactly 11 digits' })
  spousePesel?: string;

  // Ryczalt fields
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  ryczaltRevenue?: number;

  @IsOptional()
  @IsIn(RYCZALT_RATE_TYPES)
  ryczaltRateType?: RyczaltRateType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  ryczaltRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAnnualReturnDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  businessIncome?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  businessCosts?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  zusDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  healthDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  otherDeductions?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  advancesPaid?: number;

  @IsOptional()
  @IsBoolean()
  jointFiling?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  spouseIncome?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  spouseCosts?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  spouseTaxAdvances?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'spousePesel must be exactly 11 digits' })
  spousePesel?: string;

  // Ryczalt fields
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  ryczaltRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  ryczaltRate?: number;

  @IsOptional()
  @IsIn(RETURN_STATUSES)
  status?: ReturnStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListReturnsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2030)
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsIn(FORM_TYPES)
  formType?: FormType;

  @IsOptional()
  @IsIn(RETURN_STATUSES)
  status?: ReturnStatus;
}

// ============================================================
// Tax Deduction DTOs
// ============================================================

export class CreateDeductionDto {
  @IsIn(DEDUCTION_TYPES)
  type: DeductionType;

  @IsIn(DEDUCTION_CATEGORIES)
  category: DeductionCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  documentRef?: string;

  // Child relief specific fields
  @IsOptional()
  @IsString()
  childName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'childPesel must be exactly 11 digits' })
  childPesel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  childMonths?: number;
}

export class UpdateDeductionDto {
  @IsOptional()
  @IsIn(DEDUCTION_TYPES)
  type?: DeductionType;

  @IsOptional()
  @IsIn(DEDUCTION_CATEGORIES)
  category?: DeductionCategory;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  documentRef?: string;

  @IsOptional()
  @IsString()
  childName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'childPesel must be exactly 11 digits' })
  childPesel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  childMonths?: number;
}

// ============================================================
// Employment Income DTOs
// ============================================================

export class CreateEmploymentIncomeDto {
  @IsInt()
  @Min(2020)
  @Max(2030)
  year: number;

  @IsString()
  @MinLength(2)
  employerName: string;

  @IsString()
  @Matches(/^\d{10}$/, { message: 'employerNip must be exactly 10 digits' })
  employerNip: string;

  @IsOptional()
  @IsString()
  employerAddress?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  grossIncome: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxDeductibleCosts: number;

  @IsNumber()
  @Type(() => Number)
  netIncome: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxAdvancePaid: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusEmerytalnaEmpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusRentowaEmpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusChorobowaEmpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusHealthEmpl?: number;

  @IsOptional()
  @IsString()
  pitFormNumber?: string;

  @IsOptional()
  @IsIn(SOURCE_METHODS)
  sourceMethod?: SourceMethod;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}

export class UpdateEmploymentIncomeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  employerName?: string;

  @IsOptional()
  @IsString()
  employerAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  grossIncome?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxDeductibleCosts?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  netIncome?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxAdvancePaid?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusEmerytalnaEmpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusRentowaEmpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusChorobowaEmpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  zusHealthEmpl?: number;

  @IsOptional()
  @IsString()
  pitFormNumber?: string;

  @IsOptional()
  @IsIn(SOURCE_METHODS)
  sourceMethod?: SourceMethod;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}

export class ListEmploymentIncomeQueryDto {
  @IsInt()
  @Min(2020)
  @Max(2030)
  @Type(() => Number)
  year: number;
}

// ============================================================
// Compare Forms DTO
// ============================================================

export class CompareFormsDto {
  @IsOptional()
  @IsArray()
  @IsIn(FORM_TYPES, { each: true })
  forms?: FormType[];
}

// ============================================================
// Response/Summary interfaces (not DTOs, used for typing responses)
// ============================================================

export interface CalculationSummary {
  formType: string;
  year: number;
  businessIncome: number;
  businessCosts: number;
  businessProfit: number;
  employmentIncome: number;
  employmentCosts: number;
  employmentProfit: number;
  totalIncome: number;
  zusDeduction: number;
  healthDeduction: number;
  otherDeductions: number;
  taxBase: number;
  taxCalculated: number;
  taxCredits: number;
  taxDue: number;
  advancesPaid: number;
  finalAmount: number;
  jointFiling: boolean;
  deductions: {
    fromIncome: Array<{ type: string; amount: number; description: string }>;
    fromTax: Array<{ type: string; amount: number; description: string }>;
  };
}

export interface FormComparison {
  formType: string;
  taxDue: number;
  finalAmount: number;
  effectiveRate: number;
  available: boolean;
  reason?: string;
}
