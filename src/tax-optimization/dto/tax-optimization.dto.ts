import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================================
// ENUMS
// ============================================================

export enum TaxFormType {
  SKALA = 'SKALA',
  LINIOWY = 'LINIOWY',
  RYCZALT = 'RYCZALT',
}

export enum ZusType {
  DUZY = 'DUZY',
  PREFERENCYJNY = 'PREFERENCYJNY',
  MALY_ZUS_PLUS = 'MALY_ZUS_PLUS',
}

export enum ThresholdStatus {
  SAFE = 'SAFE',
  WARNING = 'WARNING',
  EXCEEDED = 'EXCEEDED',
}

export enum RecommendationPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

// ============================================================
// INPUT DTOs
// ============================================================

export class CompareFormsDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  annualRevenue: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  annualCosts: number;

  @IsOptional()
  @IsEnum(ZusType)
  zusType?: ZusType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(15)
  @Type(() => Number)
  ryczaltRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  childrenCount?: number;

  @IsOptional()
  @IsBoolean()
  jointFiling?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  spouseIncome?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employmentIncome?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employmentCosts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employmentTaxPaid?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  internetDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  donationsDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  ikzeDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  thermomodernizationDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rehabilitationDeduction?: number;

  @IsOptional()
  @IsInt()
  @Min(2024)
  @Max(2030)
  @Type(() => Number)
  year?: number;
}

export class SimulationScenarioDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  annualRevenue: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  annualCosts: number;

  @IsOptional()
  @IsEnum(ZusType)
  zusType?: ZusType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(15)
  @Type(() => Number)
  ryczaltRate?: number;
}

export class SimulationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulationScenarioDto)
  scenarios: SimulationScenarioDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  childrenCount?: number;

  @IsOptional()
  @IsBoolean()
  jointFiling?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  spouseIncome?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employmentIncome?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employmentCosts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employmentTaxPaid?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  internetDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  donationsDeduction?: number;

  @IsOptional()
  @IsInt()
  @Min(2024)
  @Max(2030)
  @Type(() => Number)
  year?: number;
}

// ============================================================
// OUTPUT DTOs / Interfaces
// ============================================================

export interface ZusBreakdown {
  emerytalna: number;
  rentowa: number;
  chorobowa: number;
  wypadkowa: number;
  spoleczneTotal: number;
  zdrowotna: number;
  zdrowotnaDeductible: number;
  funduszPracy: number;
  total: number;
  monthlyTotal: number;
  basis: number;
  zusType: ZusType;
}

export interface TaxFormCalculation {
  formType: TaxFormType;
  formName: string;
  formDescription: string;

  // Income
  revenue: number;
  costs: number;
  income: number;

  // Deductions
  zusSpoleczneDeduction: number;
  healthInsuranceDeduction: number;
  otherDeductions: number;
  taxBase: number;

  // Tax
  taxCalculated: number;
  taxCredits: number;
  taxDue: number;

  // ZUS
  zus: ZusBreakdown;

  // Employment (if applicable)
  employmentIncome: number;
  employmentTaxPaid: number;

  // Total burden
  totalTax: number;
  totalZus: number;
  totalBurden: number;
  effectiveRate: number;
  netIncome: number;

  // Metadata
  availableDeductions: string[];
  warnings: string[];
  notes: string[];
}

export interface FormComparisonResult {
  year: number;
  inputRevenue: number;
  inputCosts: number;
  zusType: ZusType;

  forms: TaxFormCalculation[];
  cheapestForm: TaxFormType;
  cheapestBurden: number;
  savingsVsWorst: number;

  summary: {
    skala: { totalBurden: number; netIncome: number; effectiveRate: number };
    liniowy: { totalBurden: number; netIncome: number; effectiveRate: number };
    ryczalt: { totalBurden: number; netIncome: number; effectiveRate: number };
  };

  recommendation: string;
  generatedAt: Date;
}

export interface SimulationResult {
  scenarios: Array<{
    name: string;
    revenue: number;
    costs: number;
    comparison: FormComparisonResult;
  }>;
  overallRecommendation: string;
  generatedAt: Date;
}

export interface ThresholdInfo {
  name: string;
  description: string;
  limitValue: number;
  limitCurrency: string;
  currentValue: number;
  remainingValue: number;
  usagePercent: number;
  status: ThresholdStatus;
  relevantForms: TaxFormType[];
  actionRequired: string | null;
  deadline: string | null;
}

export interface ThresholdMonitorResult {
  companyId: string;
  year: number;
  thresholds: ThresholdInfo[];
  criticalAlerts: ThresholdInfo[];
  generatedAt: Date;
}

export interface Recommendation {
  id: string;
  priority: RecommendationPriority;
  category: string;
  title: string;
  description: string;
  potentialSavings: number | null;
  actionItems: string[];
  relevantForms: TaxFormType[];
  deadline: string | null;
}

export interface RecommendationResult {
  companyId: string;
  year: number;
  currentForm: string | null;
  recommendations: Recommendation[];
  generatedAt: Date;
}

export interface AnnualSummaryResult {
  companyId: string;
  year: number;

  revenue: {
    total: number;
    monthly: number[];
  };
  costs: {
    total: number;
    monthly: number[];
  };
  income: {
    total: number;
    monthly: number[];
  };

  currentFormAnalysis: TaxFormCalculation | null;
  alternativeForms: TaxFormCalculation[];
  potentialSavings: number;
  bestForm: TaxFormType;

  thresholds: ThresholdInfo[];
  recommendations: Recommendation[];

  generatedAt: Date;
}
