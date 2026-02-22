import { Injectable, Logger } from '@nestjs/common';
import {
  SimulationDto,
  SimulationResult,
  CompareFormsDto,
  ZusType,
} from '../dto/tax-optimization.dto';
import { FormComparisonService } from './form-comparison.service';

@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  constructor(
    private readonly formComparisonService: FormComparisonService,
  ) {}

  /**
   * Run "what if" simulations across multiple scenarios.
   * Each scenario gets a full 3-form comparison.
   */
  runSimulation(dto: SimulationDto): SimulationResult {
    this.logger.log(
      `Running simulation with ${dto.scenarios.length} scenario(s)`,
    );

    const scenarioResults = dto.scenarios.map((scenario) => {
      const compareDto: CompareFormsDto = {
        annualRevenue: scenario.annualRevenue,
        annualCosts: scenario.annualCosts,
        zusType: scenario.zusType || ZusType.DUZY,
        ryczaltRate: scenario.ryczaltRate || 8.5,
        childrenCount: dto.childrenCount,
        jointFiling: dto.jointFiling,
        spouseIncome: dto.spouseIncome,
        employmentIncome: dto.employmentIncome,
        employmentCosts: dto.employmentCosts,
        employmentTaxPaid: dto.employmentTaxPaid,
        internetDeduction: dto.internetDeduction,
        donationsDeduction: dto.donationsDeduction,
        year: dto.year,
      };

      const comparison = this.formComparisonService.compareForms(compareDto);

      return {
        name: scenario.name,
        revenue: scenario.annualRevenue,
        costs: scenario.annualCosts,
        comparison,
      };
    });

    const overallRecommendation = this.generateOverallRecommendation(
      scenarioResults,
    );

    return {
      scenarios: scenarioResults,
      overallRecommendation,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate quick breakeven analysis: at what revenue does liniowy beat skala?
   */
  findBreakevenPoints(
    costRatio: number,
    zusType: ZusType = ZusType.DUZY,
    ryczaltRate: number = 8.5,
    year?: number,
  ): {
    skalaVsLiniowyBreakeven: number | null;
    skalaVsRyczaltBreakeven: number | null;
    liniowyVsRyczaltBreakeven: number | null;
    analysis: string;
  } {
    this.logger.log(
      `Finding breakeven points for costRatio=${costRatio}, zusType=${zusType}`,
    );

    // Binary search for breakeven points
    const skalaVsLiniowyBreakeven = this.findBreakevenBetweenForms(
      'SKALA_VS_LINIOWY',
      costRatio,
      zusType,
      ryczaltRate,
      year,
    );

    const skalaVsRyczaltBreakeven = this.findBreakevenBetweenForms(
      'SKALA_VS_RYCZALT',
      costRatio,
      zusType,
      ryczaltRate,
      year,
    );

    const liniowyVsRyczaltBreakeven = this.findBreakevenBetweenForms(
      'LINIOWY_VS_RYCZALT',
      costRatio,
      zusType,
      ryczaltRate,
      year,
    );

    let analysis = 'Analiza progow oplacalnosci:\n';

    if (skalaVsLiniowyBreakeven !== null) {
      analysis += `- Liniowy staje sie korzystniejszy od skali przy dochodzie okolo ${skalaVsLiniowyBreakeven.toFixed(0)} PLN.\n`;
    } else {
      analysis += '- Brak punktu zrownania skala/liniowy w badanym zakresie.\n';
    }

    if (skalaVsRyczaltBreakeven !== null) {
      analysis += `- Ryczalt staje sie korzystniejszy od skali przy przychodzie okolo ${skalaVsRyczaltBreakeven.toFixed(0)} PLN.\n`;
    } else {
      analysis += '- Brak punktu zrownania skala/ryczalt w badanym zakresie.\n';
    }

    if (liniowyVsRyczaltBreakeven !== null) {
      analysis += `- Ryczalt staje sie korzystniejszy od liniowego przy przychodzie okolo ${liniowyVsRyczaltBreakeven.toFixed(0)} PLN.\n`;
    } else {
      analysis += '- Brak punktu zrownania liniowy/ryczalt w badanym zakresie.\n';
    }

    return {
      skalaVsLiniowyBreakeven,
      skalaVsRyczaltBreakeven,
      liniowyVsRyczaltBreakeven,
      analysis,
    };
  }

  /**
   * Binary search to find breakeven revenue between two forms.
   */
  private findBreakevenBetweenForms(
    comparison:
      | 'SKALA_VS_LINIOWY'
      | 'SKALA_VS_RYCZALT'
      | 'LINIOWY_VS_RYCZALT',
    costRatio: number,
    zusType: ZusType,
    ryczaltRate: number,
    year?: number,
  ): number | null {
    let low = 10_000;
    let high = 5_000_000;
    const tolerance = 500;
    let iterations = 0;
    const maxIterations = 50;

    // Check if there's a crossover in the range
    const lowResult = this.compareAtRevenue(
      low,
      costRatio,
      zusType,
      ryczaltRate,
      comparison,
      year,
    );
    const highResult = this.compareAtRevenue(
      high,
      costRatio,
      zusType,
      ryczaltRate,
      comparison,
      year,
    );

    // If sign doesn't change, no breakeven in range
    if (lowResult * highResult > 0) {
      return null;
    }

    while (high - low > tolerance && iterations < maxIterations) {
      const mid = (low + high) / 2;
      const midResult = this.compareAtRevenue(
        mid,
        costRatio,
        zusType,
        ryczaltRate,
        comparison,
        year,
      );

      if (midResult * lowResult > 0) {
        low = mid;
      } else {
        high = mid;
      }
      iterations++;
    }

    return Math.round((low + high) / 2);
  }

  /**
   * Returns difference in burden between two forms at a given revenue.
   * Positive = first form is more expensive.
   */
  private compareAtRevenue(
    revenue: number,
    costRatio: number,
    zusType: ZusType,
    ryczaltRate: number,
    comparison: string,
    year?: number,
  ): number {
    const costs = revenue * costRatio;
    const dto: CompareFormsDto = {
      annualRevenue: revenue,
      annualCosts: costs,
      zusType,
      ryczaltRate,
      year,
    };

    const result = this.formComparisonService.compareForms(dto);
    const skala = result.forms.find((f) => f.formType === 'SKALA');
    const liniowy = result.forms.find((f) => f.formType === 'LINIOWY');
    const ryczalt = result.forms.find((f) => f.formType === 'RYCZALT');

    switch (comparison) {
      case 'SKALA_VS_LINIOWY':
        return (skala?.totalBurden || 0) - (liniowy?.totalBurden || 0);
      case 'SKALA_VS_RYCZALT':
        return (skala?.totalBurden || 0) - (ryczalt?.totalBurden || 0);
      case 'LINIOWY_VS_RYCZALT':
        return (liniowy?.totalBurden || 0) - (ryczalt?.totalBurden || 0);
      default:
        return 0;
    }
  }

  /**
   * Generate overall recommendation across all simulated scenarios.
   */
  private generateOverallRecommendation(
    scenarioResults: Array<{
      name: string;
      revenue: number;
      costs: number;
      comparison: any;
    }>,
  ): string {
    if (scenarioResults.length === 0) {
      return 'Brak scenariuszy do analizy.';
    }

    if (scenarioResults.length === 1) {
      return scenarioResults[0].comparison.recommendation;
    }

    // Count how often each form wins
    const wins: Record<string, number> = {
      SKALA: 0,
      LINIOWY: 0,
      RYCZALT: 0,
    };

    for (const scenario of scenarioResults) {
      const cheapest = scenario.comparison.cheapestForm;
      wins[cheapest] = (wins[cheapest] || 0) + 1;
    }

    const formNames: Record<string, string> = {
      SKALA: 'skala podatkowa',
      LINIOWY: 'podatek liniowy',
      RYCZALT: 'ryczalt',
    };

    const entries = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    const totalScenarios = scenarioResults.length;

    let recommendation = `Analiza ${totalScenarios} scenariuszy: `;

    if (entries[0][1] === totalScenarios) {
      recommendation += `We wszystkich scenariuszach najkorzystniejsza jest ${formNames[entries[0][0]].toUpperCase()}.`;
    } else {
      recommendation += entries
        .filter(([, count]) => count > 0)
        .map(
          ([form, count]) =>
            `${formNames[form]} wygrywa w ${count}/${totalScenarios} scenariuszach`,
        )
        .join(', ');
      recommendation += '.';
    }

    // Show range of savings
    const savings = scenarioResults.map(
      (s) => s.comparison.savingsVsWorst,
    );
    const minSavings = Math.min(...savings);
    const maxSavings = Math.max(...savings);

    recommendation += ` Potencjalne oszczednosci: od ${minSavings.toFixed(0)} do ${maxSavings.toFixed(0)} PLN rocznie.`;

    return recommendation;
  }
}
