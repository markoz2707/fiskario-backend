import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TaxFormType,
  ZusType,
  ThresholdStatus,
  RecommendationPriority,
  Recommendation,
  RecommendationResult,
  AnnualSummaryResult,
  CompareFormsDto,
  TaxFormCalculation,
} from '../dto/tax-optimization.dto';
import { FormComparisonService } from './form-comparison.service';
import { ThresholdMonitorService } from './threshold-monitor.service';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly formComparisonService: FormComparisonService,
    private readonly thresholdMonitorService: ThresholdMonitorService,
  ) {}

  /**
   * Generate personalized tax optimization recommendations for a company.
   */
  async getRecommendations(
    tenantId: string,
    companyId: string,
    year?: number,
  ): Promise<RecommendationResult> {
    const targetYear = year || new Date().getFullYear();

    this.logger.log(
      `Generating recommendations for company=${companyId}, year=${targetYear}`,
    );

    const company = await this.getCompanyInfo(tenantId, companyId);
    const financials = await this.getFinancialSummary(
      tenantId,
      companyId,
      targetYear,
    );
    const thresholds = await this.thresholdMonitorService.monitorThresholds(
      tenantId,
      companyId,
      targetYear,
    );

    const recommendations: Recommendation[] = [];
    let recIndex = 0;

    // 1. Form optimization recommendations
    if (financials.totalRevenue > 0) {
      const formRecs = await this.generateFormRecommendations(
        financials,
        company,
        targetYear,
        recIndex,
      );
      recommendations.push(...formRecs);
      recIndex += formRecs.length;
    }

    // 2. Threshold-based recommendations
    const thresholdRecs = this.generateThresholdRecommendations(
      thresholds.thresholds,
      recIndex,
    );
    recommendations.push(...thresholdRecs);
    recIndex += thresholdRecs.length;

    // 3. ZUS optimization recommendations
    const zusRecs = this.generateZusRecommendations(
      financials,
      company,
      targetYear,
      recIndex,
    );
    recommendations.push(...zusRecs);
    recIndex += zusRecs.length;

    // 4. Deduction opportunities
    const deductionRecs = this.generateDeductionRecommendations(
      financials,
      company,
      targetYear,
      recIndex,
    );
    recommendations.push(...deductionRecs);
    recIndex += deductionRecs.length;

    // 5. Year-end planning (Q4 recommendations)
    const currentMonth = new Date().getMonth() + 1;
    if (currentMonth >= 10 && targetYear === new Date().getFullYear()) {
      const yearEndRecs = this.generateYearEndRecommendations(
        financials,
        company,
        targetYear,
        recIndex,
      );
      recommendations.push(...yearEndRecs);
      recIndex += yearEndRecs.length;
    }

    // Sort by priority
    recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return {
      companyId,
      year: targetYear,
      currentForm: company.taxForm,
      recommendations,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate annual summary with optimization suggestions.
   */
  async getAnnualSummary(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<AnnualSummaryResult> {
    this.logger.log(
      `Generating annual summary for company=${companyId}, year=${year}`,
    );

    const company = await this.getCompanyInfo(tenantId, companyId);
    const monthlyData = await this.getMonthlyData(
      tenantId,
      companyId,
      year,
    );

    const totalRevenue = monthlyData.revenue.reduce((a, b) => a + b, 0);
    const totalCosts = monthlyData.costs.reduce((a, b) => a + b, 0);
    const totalIncome = Math.max(0, totalRevenue - totalCosts);

    // Run comparison for current year data
    const compareDto: CompareFormsDto = {
      annualRevenue: totalRevenue,
      annualCosts: totalCosts,
      zusType: ZusType.DUZY,
      ryczaltRate: 8.5,
      year,
    };

    const comparison = this.formComparisonService.compareForms(compareDto);

    // Current form analysis
    let currentFormAnalysis: TaxFormCalculation | null = null;
    const alternativeForms: TaxFormCalculation[] = [];

    for (const form of comparison.forms) {
      if (
        company.taxForm &&
        this.matchesCompanyForm(form.formType, company.taxForm)
      ) {
        currentFormAnalysis = form;
      } else {
        alternativeForms.push(form);
      }
    }

    // If we couldn't match the company form, default to skala
    if (!currentFormAnalysis) {
      currentFormAnalysis =
        comparison.forms.find((f) => f.formType === TaxFormType.SKALA) || null;
    }

    const currentBurden = currentFormAnalysis?.totalBurden || 0;
    const bestBurden = comparison.cheapestBurden;
    const potentialSavings = Math.max(0, currentBurden - bestBurden);

    // Get thresholds and recommendations
    const thresholdResult =
      await this.thresholdMonitorService.monitorThresholds(
        tenantId,
        companyId,
        year,
      );

    const recResult = await this.getRecommendations(
      tenantId,
      companyId,
      year,
    );

    return {
      companyId,
      year,

      revenue: {
        total: totalRevenue,
        monthly: monthlyData.revenue,
      },
      costs: {
        total: totalCosts,
        monthly: monthlyData.costs,
      },
      income: {
        total: totalIncome,
        monthly: monthlyData.revenue.map(
          (r, i) => Math.max(0, r - monthlyData.costs[i]),
        ),
      },

      currentFormAnalysis,
      alternativeForms,
      potentialSavings,
      bestForm: comparison.cheapestForm,

      thresholds: thresholdResult.thresholds,
      recommendations: recResult.recommendations,

      generatedAt: new Date(),
    };
  }

  // ============================================================
  // RECOMMENDATION GENERATORS
  // ============================================================

  private async generateFormRecommendations(
    financials: { totalRevenue: number; totalCosts: number },
    company: { taxForm: string | null },
    year: number,
    startIndex: number,
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    const compareDto: CompareFormsDto = {
      annualRevenue: financials.totalRevenue,
      annualCosts: financials.totalCosts,
      zusType: ZusType.DUZY,
      year,
    };

    const comparison = this.formComparisonService.compareForms(compareDto);

    // Check if current form is optimal
    if (company.taxForm) {
      const currentForm = comparison.forms.find((f) =>
        this.matchesCompanyForm(f.formType, company.taxForm!),
      );
      const cheapestForm = comparison.forms.find(
        (f) => f.formType === comparison.cheapestForm,
      );

      if (
        currentForm &&
        cheapestForm &&
        currentForm.formType !== cheapestForm.formType
      ) {
        const savings =
          currentForm.totalBurden - cheapestForm.totalBurden;

        if (savings > 1000) {
          recommendations.push({
            id: `rec_${startIndex + recommendations.length}`,
            priority:
              savings > 5000
                ? RecommendationPriority.HIGH
                : RecommendationPriority.MEDIUM,
            category: 'FORMA_OPODATKOWANIA',
            title: `Zmiana formy opodatkowania na ${cheapestForm.formName}`,
            description: `Obecna forma (${currentForm.formName}) generuje wyzsze obciazenie o ${savings.toFixed(0)} PLN rocznie. ` +
              `Przejscie na ${cheapestForm.formName} pozwoli zaoszczedzic.`,
            potentialSavings: Math.round(savings),
            actionItems: [
              `Porownaj obecne obciazenie (${currentForm.totalBurden.toFixed(0)} PLN) z optymalnym (${cheapestForm.totalBurden.toFixed(0)} PLN).`,
              `Zloz oswiadczenie o zmianie formy opodatkowania do 20 lutego ${year + 1}.`,
              'Skonsultuj zmiane z ksiegowym/doradca podatkowym.',
              'Sprawdz, czy nowa forma nie ogranicza dostepnych ulg.',
            ],
            relevantForms: [cheapestForm.formType],
            deadline: `${year + 1}-02-20`,
          });
        }
      }
    }

    // Recommend considering ryczalt if costs are low
    const costRatio =
      financials.totalRevenue > 0
        ? financials.totalCosts / financials.totalRevenue
        : 0;

    if (costRatio < 0.2 && financials.totalRevenue > 50_000) {
      const ryczaltForm = comparison.forms.find(
        (f) => f.formType === TaxFormType.RYCZALT,
      );
      if (
        ryczaltForm &&
        !this.matchesCompanyForm(TaxFormType.RYCZALT, company.taxForm || '')
      ) {
        recommendations.push({
          id: `rec_${startIndex + recommendations.length}`,
          priority: RecommendationPriority.MEDIUM,
          category: 'FORMA_OPODATKOWANIA',
          title: 'Rozwazyc ryczalt przy niskich kosztach',
          description: `Koszty stanowia jedynie ${(costRatio * 100).toFixed(1)}% przychodu. ` +
            `Ryczalt moze byc korzystny, bo nie wymaga udokumentowania kosztow.`,
          potentialSavings: null,
          actionItems: [
            'Zweryfikuj dostepne stawki ryczaltu dla Twojego PKD.',
            'Porownaj obciazenie na ryczalcie vs obecna forma.',
            'Pamietaj, ze na ryczalcie nie odliczysz kosztow uzyskania przychodu.',
          ],
          relevantForms: [TaxFormType.RYCZALT],
          deadline: `${year + 1}-02-20`,
        });
      }
    }

    return recommendations;
  }

  private generateThresholdRecommendations(
    thresholds: Array<{
      name: string;
      status: ThresholdStatus;
      actionRequired: string | null;
      relevantForms: TaxFormType[];
      remainingValue: number;
      usagePercent: number;
    }>,
    startIndex: number,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const threshold of thresholds) {
      if (
        threshold.status === ThresholdStatus.EXCEEDED ||
        threshold.status === ThresholdStatus.WARNING
      ) {
        recommendations.push({
          id: `rec_${startIndex + recommendations.length}`,
          priority:
            threshold.status === ThresholdStatus.EXCEEDED
              ? RecommendationPriority.HIGH
              : RecommendationPriority.MEDIUM,
          category: 'PROG_PODATKOWY',
          title: `${threshold.name}: ${threshold.status === ThresholdStatus.EXCEEDED ? 'PRZEKROCZONY' : 'OSTRZEZENIE'}`,
          description:
            threshold.actionRequired ||
            `Prog ${threshold.name} osiagnal ${threshold.usagePercent.toFixed(1)}%.`,
          potentialSavings: null,
          actionItems: [
            threshold.actionRequired || 'Monitoruj prog.',
            `Pozostalo: ${threshold.remainingValue.toFixed(0)} PLN`,
          ],
          relevantForms: threshold.relevantForms,
          deadline: null,
        });
      }
    }

    return recommendations;
  }

  private generateZusRecommendations(
    financials: { totalRevenue: number; totalCosts: number },
    company: { taxForm: string | null },
    year: number,
    startIndex: number,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Recommend Maly ZUS Plus if eligible
    if (financials.totalRevenue > 0 && financials.totalRevenue < 120_000) {
      recommendations.push({
        id: `rec_${startIndex + recommendations.length}`,
        priority: RecommendationPriority.MEDIUM,
        category: 'ZUS',
        title: 'Sprawdz uprawnienie do Malego ZUS Plus',
        description:
          `Przychod (${financials.totalRevenue.toFixed(0)} PLN) miesci sie w limicie 120 000 PLN. ` +
          'Maly ZUS Plus moze znaczaco obnizyc skladki spoleczne.',
        potentialSavings: null,
        actionItems: [
          'Sprawdz, czy przychod w poprzednim roku nie przekroczyl 120 000 PLN.',
          'Zgloszenie do Malego ZUS Plus do konca stycznia lub w ciagu 7 dni od rozpoczecia dzialalnosci.',
          'Pamietaj, ze Maly ZUS Plus mozna korzystac przez max 36 miesiecy w ciagu 60.',
        ],
        relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
        deadline: `${year}-01-31`,
      });
    }

    // Recommend preferencyjny ZUS for startups
    recommendations.push({
      id: `rec_${startIndex + recommendations.length}`,
      priority: RecommendationPriority.LOW,
      category: 'ZUS',
      title: 'ZUS preferencyjny dla nowych firm',
      description:
        'Przez pierwsze 24 miesiace mozna oplacac skladki od nizszej podstawy (30% minimalnego wynagrodzenia). ' +
        'Sprawdz, czy kwalifikujesz sie do preferencyjnego ZUS.',
      potentialSavings: null,
      actionItems: [
        'Sprawdz, czy firma dziala krocej niz 24 miesiace.',
        'Upewnij sie, ze nie prowadziles dzialalnosci w ciagu ostatnich 60 miesiecy.',
        'Zgloszenie: formularz ZUS ZUA z kodem 05 70.',
      ],
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      deadline: null,
    });

    return recommendations;
  }

  private generateDeductionRecommendations(
    financials: { totalRevenue: number; totalCosts: number },
    company: { taxForm: string | null },
    year: number,
    startIndex: number,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // IKZE recommendation (applicable to all forms)
    recommendations.push({
      id: `rec_${startIndex + recommendations.length}`,
      priority: RecommendationPriority.MEDIUM,
      category: 'ODLICZENIA',
      title: 'Wplaty na IKZE - odliczenie od dochodu/przychodu',
      description:
        'Wplaty na Indywidualne Konto Zabezpieczenia Emerytalnego (IKZE) mozna odliczyc od dochodu (skala/liniowy) lub przychodu (ryczalt). ' +
        'Limit wplat: ok. 9 389 PLN rocznie (2024-2026).',
      potentialSavings: Math.round(9_389 * 0.12), // Approximate savings on skala
      actionItems: [
        'Otworz lub uzupelnij IKZE przed koncem roku.',
        `Maksymalna wplata w ${year}: 9 388,80 PLN.`,
        'Odliczenie: od dochodu (skala 12-32%) lub od przychodu (ryczalt).',
        'Wyplata z IKZE opodatkowana ryczaltem 10% (zamiast normalnej stawki).',
      ],
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      deadline: `${year}-12-31`,
    });

    // Internet deduction (skala only)
    if (
      !company.taxForm ||
      this.matchesCompanyForm(TaxFormType.SKALA, company.taxForm)
    ) {
      recommendations.push({
        id: `rec_${startIndex + recommendations.length}`,
        priority: RecommendationPriority.LOW,
        category: 'ODLICZENIA',
        title: 'Ulga na internet (do 760 PLN)',
        description:
          'Wydatki na internet mozna odliczyc od dochodu do kwoty 760 PLN. ' +
          'Dostepna przez kolejne 2 lata podatkowe od pierwszego odliczenia.',
        potentialSavings: Math.round(760 * 0.12),
        actionItems: [
          'Zachowaj faktury za internet.',
          'Maksymalne odliczenie: 760 PLN rocznie.',
          'Dostepne tylko przez 2 kolejne lata (pierwszego skorzystania).',
        ],
        relevantForms: [TaxFormType.SKALA],
        deadline: `${year}-12-31`,
      });
    }

    // Thermomodernization deduction
    recommendations.push({
      id: `rec_${startIndex + recommendations.length}`,
      priority: RecommendationPriority.LOW,
      category: 'ODLICZENIA',
      title: 'Ulga termomodernizacyjna (do 53 000 PLN)',
      description:
        'Wydatki na termomodernizacje budynku jednorodzinnego mozna odliczyc od dochodu/przychodu. ' +
        'Limit: 53 000 PLN na realizacje przedsiewziecia.',
      potentialSavings: null,
      actionItems: [
        'Dotyczy wlascicieli budynkow jednorodzinnych.',
        'Wymaga audytu energetycznego.',
        'Realizacja do 3 lat od konca roku, w ktorym poniesiono pierwszy wydatek.',
      ],
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      deadline: null,
    });

    return recommendations;
  }

  private generateYearEndRecommendations(
    financials: { totalRevenue: number; totalCosts: number },
    company: { taxForm: string | null },
    year: number,
    startIndex: number,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    recommendations.push({
      id: `rec_${startIndex + recommendations.length}`,
      priority: RecommendationPriority.HIGH,
      category: 'KONIEC_ROKU',
      title: 'Planowanie podatkowe na koniec roku',
      description:
        'Ostatni kwartal to ostatnia szansa na optymalizacje podatkowa za biezacy rok. ' +
        'Rozwazyc przyspieszenie kosztow lub odroczenie przychodow.',
      potentialSavings: null,
      actionItems: [
        'Przeanalizuj, czy warto przyspieszac fakturowanie kosztowe (przed 31.12).',
        'Sprawdz, czy mozesz odroczyc przychody na nastepny rok.',
        'Dokonaj wplaty na IKZE przed koncem roku.',
        'Zweryfikuj stan amortyzacji srodkow trwalych.',
        'Przypomnij o inwentaryzacji (remanent na 31.12).',
        `Termin zmiany formy opodatkowania na ${year + 1}: do 20 lutego ${year + 1}.`,
      ],
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT],
      deadline: `${year}-12-31`,
    });

    // Remanent reminder
    recommendations.push({
      id: `rec_${startIndex + recommendations.length}`,
      priority: RecommendationPriority.HIGH,
      category: 'KONIEC_ROKU',
      title: 'Obowiazek sporzadzenia remanentu (spisu z natury)',
      description:
        'Na dzien 31 grudnia nalezy sporzadzic remanent (spis z natury) towarow, materialow i wyrobow gotowych.',
      potentialSavings: null,
      actionItems: [
        `Przygotuj spis z natury na dzien 31.12.${year}.`,
        'Uwzglednij: towary handlowe, materialy podstawowe i pomocnicze, polwyroby, wyroby gotowe, braki i odpady.',
        'Remanent wpisz do KPiR.',
        'Roznica remanentow wplywa na dochod roczny.',
      ],
      relevantForms: [TaxFormType.SKALA, TaxFormType.LINIOWY],
      deadline: `${year}-12-31`,
    });

    return recommendations;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private matchesCompanyForm(
    formType: TaxFormType,
    companyTaxForm: string,
  ): boolean {
    const normalized = companyTaxForm.toUpperCase().replace(/[^A-Z]/g, '');
    switch (formType) {
      case TaxFormType.SKALA:
        return (
          normalized.includes('SKALA') ||
          normalized.includes('PIT36') ||
          normalized === 'ZASADYOGOLNE' ||
          normalized === 'OGOLNE'
        );
      case TaxFormType.LINIOWY:
        return (
          normalized.includes('LINIOW') ||
          normalized.includes('PIT36L') ||
          normalized.includes('FLAT')
        );
      case TaxFormType.RYCZALT:
        return (
          normalized.includes('RYCZALT') ||
          normalized.includes('PIT28') ||
          normalized.includes('LUMP')
        );
      default:
        return false;
    }
  }

  private async getCompanyInfo(
    tenantId: string,
    companyId: string,
  ): Promise<{ taxForm: string | null; name: string; nip: string | null }> {
    try {
      const company = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          tenant_id: tenantId,
        },
        select: {
          name: true,
          nip: true,
          taxForm: true,
        },
      });

      return {
        taxForm: company?.taxForm || null,
        name: company?.name || 'Nieznana firma',
        nip: company?.nip || null,
      };
    } catch {
      return { taxForm: null, name: 'Nieznana firma', nip: null };
    }
  }

  private async getFinancialSummary(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<{ totalRevenue: number; totalCosts: number }> {
    try {
      const kpirEntries = await this.prisma.kPiREntry.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          year,
        },
      });

      if (kpirEntries.length > 0) {
        return {
          totalRevenue: kpirEntries.reduce(
            (sum, e) => sum + (e.totalRevenue || 0),
            0,
          ),
          totalCosts: kpirEntries.reduce(
            (sum, e) => sum + (e.totalExpenses || 0),
            0,
          ),
        };
      }

      // Fallback to invoices
      const salesInvoices = await this.prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          date: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
          isIncoming: false,
          status: { not: 'cancelled' },
        },
      });

      const purchaseInvoices = await this.prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          date: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
          isIncoming: true,
          status: { not: 'cancelled' },
        },
      });

      return {
        totalRevenue: salesInvoices.reduce(
          (sum, inv) => sum + (inv.totalNet || 0),
          0,
        ),
        totalCosts: purchaseInvoices.reduce(
          (sum, inv) => sum + (inv.totalNet || 0),
          0,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch financial summary: ${error.message}`,
      );
      return { totalRevenue: 0, totalCosts: 0 };
    }
  }

  private async getMonthlyData(
    tenantId: string,
    companyId: string,
    year: number,
  ): Promise<{
    revenue: number[];
    costs: number[];
  }> {
    const revenue = new Array(12).fill(0);
    const costs = new Array(12).fill(0);

    try {
      const kpirEntries = await this.prisma.kPiREntry.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          year,
        },
      });

      if (kpirEntries.length > 0) {
        for (const entry of kpirEntries) {
          const monthIndex = (entry.month || 1) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            revenue[monthIndex] += entry.totalRevenue || 0;
            costs[monthIndex] += entry.totalExpenses || 0;
          }
        }
        return { revenue, costs };
      }

      // Fallback: aggregate from invoices by month
      for (let month = 1; month <= 12; month++) {
        const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
        const endDate = new Date(year, month, 1); // First day of next month

        const salesInvoices = await this.prisma.invoice.findMany({
          where: {
            tenant_id: tenantId,
            company_id: companyId,
            date: { gte: startDate, lt: endDate },
            isIncoming: false,
            status: { not: 'cancelled' },
          },
        });

        const purchaseInvoices = await this.prisma.invoice.findMany({
          where: {
            tenant_id: tenantId,
            company_id: companyId,
            date: { gte: startDate, lt: endDate },
            isIncoming: true,
            status: { not: 'cancelled' },
          },
        });

        revenue[month - 1] = salesInvoices.reduce(
          (sum, inv) => sum + (inv.totalNet || 0),
          0,
        );
        costs[month - 1] = purchaseInvoices.reduce(
          (sum, inv) => sum + (inv.totalNet || 0),
          0,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch monthly data: ${error.message}`,
      );
    }

    return { revenue, costs };
  }
}
