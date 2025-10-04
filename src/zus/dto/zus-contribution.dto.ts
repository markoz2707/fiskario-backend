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

// Current ZUS contribution rates (as of 2025)
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
    employee: 9.5,
    deductible: 7.75, // Percentage of basis for tax deduction
    total: 9.5
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

// ZUS contribution rates for historical reference and dynamic calculation
export const ZUS_RATES_HISTORY = {
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