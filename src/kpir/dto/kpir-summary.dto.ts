export interface KPiRMonthlySummary {
  year: number;
  month: number;
  monthName: string;

  salesRevenue: number;       // kol. 7
  otherRevenue: number;       // kol. 8
  totalRevenue: number;       // kol. 9

  purchaseCost: number;       // kol. 10
  sideExpenses: number;       // kol. 11
  salaries: number;           // kol. 12
  otherExpenses: number;      // kol. 13
  totalExpenses: number;      // kol. 14

  researchCosts: number;      // kol. 16

  income: number;             // dochod = przychod - koszty
  entryCount: number;
}

export interface KPiRYearlySummary {
  year: number;
  months: KPiRMonthlySummary[];

  totalSalesRevenue: number;
  totalOtherRevenue: number;
  totalRevenue: number;

  totalPurchaseCost: number;
  totalSideExpenses: number;
  totalSalaries: number;
  totalOtherExpenses: number;
  totalExpenses: number;

  totalResearchCosts: number;

  openingRemanent: number;
  closingRemanent: number;

  // Dochod roczny = przychod - koszty + remanent poczatkowy - remanent koncowy
  annualIncome: number;
  totalEntries: number;
}

export interface KPiREntryResponse {
  id: string;
  lp: number;
  entryDate: string;
  documentNumber: string;
  counterpartyName: string | null;
  counterpartyAddress: string | null;
  description: string;
  salesRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  purchaseCost: number;
  sideExpenses: number;
  salaries: number;
  otherExpenses: number;
  totalExpenses: number;
  otherColumn: string | null;
  researchCosts: number;
  comments: string | null;
  sourceType: string;
  sourceId: string | null;
  month: number;
  year: number;
  isCorrection: boolean;
  createdAt: string;
}

export interface KPiRListResponse {
  entries: KPiREntryResponse[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    income: number;
  };
}
