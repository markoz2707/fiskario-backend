import { IsString, IsDateString, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateZUSContributionDto {
  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  period: string; // YYYY-MM

  @IsDateString()
  contributionDate: string;

  // Social Insurance Contributions (ubezpieczenia społeczne)
  @IsNumber()
  @Min(0)
  @IsOptional()
  emerytalnaEmployer?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  emerytalnaEmployee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  rentowaEmployer?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  rentowaEmployee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  chorobowaEmployee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  wypadkowaEmployer?: number;

  // Health Insurance (ubezpieczenie zdrowotne)
  @IsNumber()
  @Min(0)
  @IsOptional()
  zdrowotnaEmployee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  zdrowotnaDeductible?: number;

  // Other contributions
  @IsNumber()
  @Min(0)
  @IsOptional()
  fpEmployee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fgspEmployee?: number;

  // Bases for calculations
  @IsNumber()
  @Min(0)
  @IsOptional()
  basisEmerytalnaRentowa?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basisChorobowa?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basisZdrowotna?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basisFPFGSP?: number;
}

export interface ZUSContributionCalculation {
  basis: number;
  emerytalnaEmployer: number;
  emerytalnaEmployee: number;
  rentowaEmployer: number;
  rentowaEmployee: number;
  chorobowaEmployee: number;
  wypadkowaEmployer: number;
  zdrowotnaEmployee: number;
  zdrowotnaDeductible: number;
  fpEmployee: number;
  fgspEmployee: number;
  totalEmployer: number;
  totalEmployee: number;
  totalContribution: number;
}

// Current ZUS contribution rates (as of 2026)
export const ZUS_RATES = {
  emerytalna: {
    employer: 9.76,
    employee: 9.76,
    total: 19.52
  },
  rentowa: {
    employer: 6.5,
    employee: 1.5,
    total: 8.0
  },
  chorobowa: {
    employee: 2.45,
    total: 2.45
  },
  wypadkowa: {
    employer: 1.67, // Average rate - actual rate depends on company size/risk
    total: 1.67
  },
  zdrowotna: {
    employee: 9.0,
    deductible: 7.75, // Percentage of basis for tax deduction
    total: 9.0
  },
  fp: {
    employer: 2.45,
    total: 2.45
  },
  fgsp: {
    employer: 0.1,
    total: 0.1
  }
} as const;

// JDG ZUS contribution tiers for sole proprietors (jednoosobowa działalność gospodarcza)
export type JDGTierType = 'ulga_na_start' | 'preferencyjny' | 'maly_zus_plus' | 'pelny';

export interface JDGTierInfo {
  type: JDGTierType;
  label: string;
  description: string;
  durationMonths: number | null; // null = unlimited
  basisMultiplier: number; // multiplier of minimum wage or declared basis
  healthOnly: boolean; // ulga na start = only health insurance
  fpExempt: boolean; // exempt from FP/FGSP
}

export const ZUS_JDG_TIERS: Record<JDGTierType, JDGTierInfo> = {
  ulga_na_start: {
    type: 'ulga_na_start',
    label: 'Ulga na start',
    description: 'Pierwsze 6 miesięcy działalności — tylko składka zdrowotna',
    durationMonths: 6,
    basisMultiplier: 0, // no social insurance basis
    healthOnly: true,
    fpExempt: true,
  },
  preferencyjny: {
    type: 'preferencyjny',
    label: 'ZUS preferencyjny',
    description: 'Przez 24 miesiące od rejestracji (lub po uldze na start) — 30% minimalnego wynagrodzenia',
    durationMonths: 24,
    basisMultiplier: 0.3, // 30% of minimum wage
    healthOnly: false,
    fpExempt: true,
  },
  maly_zus_plus: {
    type: 'maly_zus_plus',
    label: 'Mały ZUS Plus',
    description: 'Dla firm z przychodem < 120 000 zł rocznie — podstawa proporcjonalna do dochodu',
    durationMonths: 36, // max 36 months in 60-month window
    basisMultiplier: 0, // calculated from income
    healthOnly: false,
    fpExempt: true,
  },
  pelny: {
    type: 'pelny',
    label: 'Pełny ZUS',
    description: 'Pełne składki społeczne od zadeklarowanej podstawy (min. 60% prognozowanego przeciętnego wynagrodzenia)',
    durationMonths: null,
    basisMultiplier: 0.6, // 60% of average wage
    healthOnly: false,
    fpExempt: false,
  },
} as const;

// Reference values for 2026
export const ZUS_REFERENCE_VALUES_2026 = {
  minimumWage: 4666, // PLN gross (od 01.01.2026)
  averageWage: 8673, // PLN prognozowane przeciętne wynagrodzenie
  minBasisPreferencyjny: 4666 * 0.3, // 30% min. wynagrodzenia = 1399.80
  minBasisPelny: 8673 * 0.6, // 60% prognoz. przeciętnego = 5203.80
  malyZusPlusMaxRevenue: 120000, // max przychód rocznie
  malyZusPlusMinBasis: 4666 * 0.3, // dolna granica
  malyZusPlusMaxBasis: 8673 * 0.6, // górna granica
} as const;

// ZUS contribution rates for historical reference and dynamic calculation
export const ZUS_RATES_HISTORY = {
  '2026': {
    emerytalna: { employer: 9.76, employee: 9.76, total: 19.52 },
    rentowa: { employer: 6.5, employee: 1.5, total: 8.0 },
    chorobowa: { employee: 2.45, total: 2.45 },
    wypadkowa: { employer: 1.67, total: 1.67 },
    zdrowotna: { employee: 9.0, deductible: 7.75, total: 9.0 },
    fp: { employer: 2.45, total: 2.45 },
    fgsp: { employer: 0.1, total: 0.1 }
  },
  '2025': {
    emerytalna: { employer: 9.76, employee: 9.76, total: 19.52 },
    rentowa: { employer: 6.5, employee: 1.5, total: 8.0 },
    chorobowa: { employee: 2.45, total: 2.45 },
    wypadkowa: { employer: 1.67, total: 1.67 },
    zdrowotna: { employee: 9.5, deductible: 7.75, total: 9.5 },
    fp: { employer: 2.45, total: 2.45 },
    fgsp: { employer: 0.1, total: 0.1 }
  },
  '2024': {
    emerytalna: { employer: 9.76, employee: 9.76, total: 19.52 },
    rentowa: { employer: 6.5, employee: 1.5, total: 8.0 },
    chorobowa: { employee: 2.45, total: 2.45 },
    wypadkowa: { employer: 1.67, total: 1.67 },
    zdrowotna: { employee: 9.0, deductible: 7.75, total: 9.0 },
    fp: { employer: 2.45, total: 2.45 },
    fgsp: { employer: 0.1, total: 0.1 }
  }
} as const;