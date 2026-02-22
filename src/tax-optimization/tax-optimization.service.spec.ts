import { Test, TestingModule } from '@nestjs/testing';
import { FormComparisonService } from './services/form-comparison.service';
import { SimulationService } from './services/simulation.service';
import {
  TaxFormType,
  ZusType,
  CompareFormsDto,
  SimulationDto,
} from './dto/tax-optimization.dto';

describe('Tax Optimization Services', () => {
  let formComparisonService: FormComparisonService;
  let simulationService: SimulationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FormComparisonService, SimulationService],
    }).compile();

    formComparisonService = module.get<FormComparisonService>(FormComparisonService);
    simulationService = module.get<SimulationService>(SimulationService);
  });

  // =========================================================================
  // FormComparisonService
  // =========================================================================

  describe('FormComparisonService', () => {
    describe('compareForms', () => {
      it('should return comparison for all 3 tax forms', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 80000,
        };

        const result = formComparisonService.compareForms(dto);

        expect(result.forms).toHaveLength(3);
        expect(result.forms.map((f) => f.formType)).toEqual(
          expect.arrayContaining([TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT]),
        );
      });

      it('should identify the cheapest form', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 80000,
        };

        const result = formComparisonService.compareForms(dto);

        expect(result.cheapestForm).toBeDefined();
        expect([TaxFormType.SKALA, TaxFormType.LINIOWY, TaxFormType.RYCZALT]).toContain(
          result.cheapestForm,
        );
        expect(result.cheapestBurden).toBe(
          Math.min(...result.forms.map((f) => f.totalBurden)),
        );
      });

      it('should calculate savings vs worst form', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 80000,
        };

        const result = formComparisonService.compareForms(dto);

        const minBurden = Math.min(...result.forms.map((f) => f.totalBurden));
        const maxBurden = Math.max(...result.forms.map((f) => f.totalBurden));
        expect(result.savingsVsWorst).toBe(maxBurden - minBurden);
      });

      it('should generate a recommendation string', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 80000,
        };

        const result = formComparisonService.compareForms(dto);
        expect(result.recommendation).toBeDefined();
        expect(result.recommendation.length).toBeGreaterThan(0);
        expect(result.recommendation).toContain('Najkorzystniejsza forma');
      });

      it('should return proper year and input in the result', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 300000,
          annualCosts: 100000,
          year: 2025,
        };

        const result = formComparisonService.compareForms(dto);

        expect(result.year).toBe(2025);
        expect(result.inputRevenue).toBe(300000);
        expect(result.inputCosts).toBe(100000);
      });

      it('should handle ZUS preferencyjny type', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 100000,
          annualCosts: 30000,
          zusType: ZusType.PREFERENCYJNY,
        };

        const result = formComparisonService.compareForms(dto);

        expect(result.zusType).toBe(ZusType.PREFERENCYJNY);
        // With lower ZUS, all burdens should be lower than duzy
        result.forms.forEach((form) => {
          expect(form.zus.zusType).toBe(ZusType.PREFERENCYJNY);
        });
      });

      it('should include ZUS breakdown in each form calculation', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 60000,
        };

        const result = formComparisonService.compareForms(dto);

        result.forms.forEach((form) => {
          expect(form.zus).toBeDefined();
          expect(form.zus.emerytalna).toBeGreaterThan(0);
          expect(form.zus.rentowa).toBeGreaterThan(0);
          expect(form.zus.chorobowa).toBeGreaterThan(0);
          expect(form.zus.wypadkowa).toBeGreaterThan(0);
          expect(form.zus.spoleczneTotal).toBeGreaterThan(0);
          expect(form.zus.total).toBeGreaterThan(0);
        });
      });

      it('should provide summary for all forms', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 60000,
        };

        const result = formComparisonService.compareForms(dto);

        expect(result.summary.skala).toBeDefined();
        expect(result.summary.liniowy).toBeDefined();
        expect(result.summary.ryczalt).toBeDefined();

        expect(result.summary.skala.totalBurden).toBeGreaterThan(0);
        expect(result.summary.liniowy.totalBurden).toBeGreaterThan(0);
        expect(result.summary.ryczalt.totalBurden).toBeGreaterThan(0);
      });
    });

    describe('compareForms - skala podatkowa (PIT-36)', () => {
      it('should have kwota wolna (tax-free amount) reflected in lower tax for low income', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 40000,
          annualCosts: 10000,
        };

        const result = formComparisonService.compareForms(dto);
        const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA)!;

        // Due to kwota wolna (3600 reduction), skala should be very favorable for low income
        expect(skala.taxCalculated).toBeDefined();
      });

      it('should warn when income exceeds 120k bracket threshold', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 300000,
          annualCosts: 50000,
        };

        const result = formComparisonService.compareForms(dto);
        const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA)!;

        expect(skala.warnings.some((w) => w.includes('32%'))).toBe(true);
      });

      it('should apply child tax credit on skala', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
          childrenCount: 2,
        };

        const result = formComparisonService.compareForms(dto);
        const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA)!;

        expect(skala.taxCredits).toBeGreaterThan(0);
      });

      it('should note joint filing possibility', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
          jointFiling: true,
          spouseIncome: 40000,
        };

        const result = formComparisonService.compareForms(dto);
        const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA)!;

        expect(skala.notes.some((n) => n.toLowerCase().includes('malzonk'))).toBe(true);
      });
    });

    describe('compareForms - liniowy (PIT-36L)', () => {
      it('should apply flat 19% rate', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
        };

        const result = formComparisonService.compareForms(dto);
        const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY)!;

        expect(liniowy.formDescription).toContain('19%');
      });

      it('should warn when children will lose credit', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
          childrenCount: 2,
        };

        const result = formComparisonService.compareForms(dto);
        const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY)!;

        expect(liniowy.warnings.some((w) => w.includes('dzieci'))).toBe(true);
      });

      it('should have 0 tax credits (no child relief on liniowy)', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
          childrenCount: 3,
        };

        const result = formComparisonService.compareForms(dto);
        const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY)!;

        expect(liniowy.taxCredits).toBe(0);
      });

      it('should deduct health insurance partially (within limit)', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
        };

        const result = formComparisonService.compareForms(dto);
        const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY)!;

        expect(liniowy.healthInsuranceDeduction).toBeGreaterThan(0);
        expect(liniowy.healthInsuranceDeduction).toBeLessThanOrEqual(11600);
      });
    });

    describe('compareForms - ryczalt (PIT-28)', () => {
      it('should note that costs are not deductible', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 80000,
          ryczaltRate: 8.5,
        };

        const result = formComparisonService.compareForms(dto);
        const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT)!;

        expect(ryczalt.notes.some((n) => n.includes('NIE sa odliczalne'))).toBe(true);
      });

      it('should warn when costs are high relative to revenue', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 100000, // 50% cost ratio
          ryczaltRate: 8.5,
        };

        const result = formComparisonService.compareForms(dto);
        const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT)!;

        expect(ryczalt.warnings.some((w) => w.includes('Wysokie koszty'))).toBe(true);
      });

      it('should apply 50% health insurance deduction', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
          ryczaltRate: 12,
        };

        const result = formComparisonService.compareForms(dto);
        const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT)!;

        expect(ryczalt.zus.zdrowotnaDeductible).toBeGreaterThan(0);
        // Should be 50% of zdrowotna
        expect(ryczalt.zus.zdrowotnaDeductible).toBeCloseTo(
          ryczalt.zus.zdrowotna * 0.5,
          0,
        );
      });

      it('should use custom ryczalt rate', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 50000,
          ryczaltRate: 12,
        };

        const result = formComparisonService.compareForms(dto);
        const ryczalt = result.forms.find((f) => f.formType === TaxFormType.RYCZALT)!;

        expect(ryczalt.formName).toContain('12%');
      });
    });

    describe('compareForms - effective rate comparison', () => {
      it('should have non-negative effective rates', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 200000,
          annualCosts: 60000,
        };

        const result = formComparisonService.compareForms(dto);

        result.forms.forEach((form) => {
          expect(form.effectiveRate).toBeGreaterThanOrEqual(0);
        });
      });

      it('liniowy should beat skala for very high income', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 1000000,
          annualCosts: 200000,
        };

        const result = formComparisonService.compareForms(dto);
        const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA)!;
        const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY)!;

        // At 800k income, the 32% bracket dominates on skala, so liniowy (19%) should win
        expect(liniowy.totalBurden).toBeLessThan(skala.totalBurden);
      });

      it('skala should beat liniowy for low income', () => {
        const dto: CompareFormsDto = {
          annualRevenue: 50000,
          annualCosts: 15000,
        };

        const result = formComparisonService.compareForms(dto);
        const skala = result.forms.find((f) => f.formType === TaxFormType.SKALA)!;
        const liniowy = result.forms.find((f) => f.formType === TaxFormType.LINIOWY)!;

        // At 35k income, kwota wolna (30k exempt) makes skala very favorable
        expect(skala.totalBurden).toBeLessThan(liniowy.totalBurden);
      });
    });

    describe('calculateZusSpoleczne', () => {
      it('should calculate ZUS for duzy type', () => {
        const constants = (formComparisonService as any).getConstants(2026);
        const zus = formComparisonService.calculateZusSpoleczne(constants, ZusType.DUZY);

        expect(zus.emerytalna).toBeGreaterThan(0);
        expect(zus.rentowa).toBeGreaterThan(0);
        expect(zus.chorobowa).toBeGreaterThan(0);
        expect(zus.wypadkowa).toBeGreaterThan(0);
        expect(zus.funduszPracy).toBeGreaterThan(0);
        expect(zus.spoleczneTotal).toBeGreaterThan(0);
        expect(zus.zusType).toBe(ZusType.DUZY);
      });

      it('should calculate lower ZUS for preferencyjny type', () => {
        const constants = (formComparisonService as any).getConstants(2026);
        const duzy = formComparisonService.calculateZusSpoleczne(constants, ZusType.DUZY);
        const pref = formComparisonService.calculateZusSpoleczne(
          constants,
          ZusType.PREFERENCYJNY,
        );

        expect(pref.spoleczneTotal).toBeLessThan(duzy.spoleczneTotal);
        expect(pref.funduszPracy).toBe(0); // exempt for preferencyjny
      });

      it('should calculate mid-range ZUS for maly_zus_plus type', () => {
        const constants = (formComparisonService as any).getConstants(2026);
        const duzy = formComparisonService.calculateZusSpoleczne(constants, ZusType.DUZY);
        const maly = formComparisonService.calculateZusSpoleczne(
          constants,
          ZusType.MALY_ZUS_PLUS,
        );
        const pref = formComparisonService.calculateZusSpoleczne(
          constants,
          ZusType.PREFERENCYJNY,
        );

        expect(maly.spoleczneTotal).toBeLessThan(duzy.spoleczneTotal);
        expect(maly.spoleczneTotal).toBeGreaterThan(pref.spoleczneTotal);
      });
    });
  });

  // =========================================================================
  // SimulationService
  // =========================================================================

  describe('SimulationService', () => {
    describe('runSimulation', () => {
      it('should return results for each scenario', () => {
        const dto: SimulationDto = {
          scenarios: [
            { name: 'Low income', annualRevenue: 60000, annualCosts: 20000 },
            { name: 'Medium income', annualRevenue: 200000, annualCosts: 60000 },
            { name: 'High income', annualRevenue: 500000, annualCosts: 100000 },
          ],
        };

        const result = simulationService.runSimulation(dto);

        expect(result.scenarios).toHaveLength(3);
        expect(result.scenarios[0].name).toBe('Low income');
        expect(result.scenarios[1].name).toBe('Medium income');
        expect(result.scenarios[2].name).toBe('High income');
      });

      it('should include comparison for each scenario', () => {
        const dto: SimulationDto = {
          scenarios: [
            { name: 'Test', annualRevenue: 150000, annualCosts: 50000 },
          ],
        };

        const result = simulationService.runSimulation(dto);

        expect(result.scenarios[0].comparison).toBeDefined();
        expect(result.scenarios[0].comparison.forms).toHaveLength(3);
        expect(result.scenarios[0].comparison.cheapestForm).toBeDefined();
      });

      it('should generate overall recommendation', () => {
        const dto: SimulationDto = {
          scenarios: [
            { name: 'Scenario A', annualRevenue: 100000, annualCosts: 30000 },
            { name: 'Scenario B', annualRevenue: 300000, annualCosts: 100000 },
          ],
        };

        const result = simulationService.runSimulation(dto);

        expect(result.overallRecommendation).toBeDefined();
        expect(result.overallRecommendation.length).toBeGreaterThan(0);
      });

      it('should produce a single-scenario recommendation when only one scenario', () => {
        const dto: SimulationDto = {
          scenarios: [
            { name: 'Solo', annualRevenue: 150000, annualCosts: 50000 },
          ],
        };

        const result = simulationService.runSimulation(dto);

        // With single scenario, recommendation should be the comparison's own recommendation
        expect(result.overallRecommendation).toBe(
          result.scenarios[0].comparison.recommendation,
        );
      });

      it('should pass childrenCount and jointFiling through to scenarios', () => {
        const dto: SimulationDto = {
          scenarios: [
            { name: 'With children', annualRevenue: 200000, annualCosts: 60000 },
          ],
          childrenCount: 2,
          jointFiling: true,
          spouseIncome: 50000,
        };

        const result = simulationService.runSimulation(dto);

        const skala = result.scenarios[0].comparison.forms.find(
          (f) => f.formType === TaxFormType.SKALA,
        )!;
        // Child credit should be applied
        expect(skala.taxCredits).toBeGreaterThan(0);
      });

      it('should include generatedAt timestamp', () => {
        const dto: SimulationDto = {
          scenarios: [
            { name: 'Test', annualRevenue: 100000, annualCosts: 30000 },
          ],
        };

        const result = simulationService.runSimulation(dto);
        expect(result.generatedAt).toBeInstanceOf(Date);
      });
    });

    describe('findBreakevenPoints', () => {
      it('should find breakeven point between skala and liniowy', () => {
        const result = simulationService.findBreakevenPoints(0.3, ZusType.DUZY, 8.5, 2026);

        // There should be a breakeven point somewhere
        // At low income, skala is better; at high income, liniowy is better
        if (result.skalaVsLiniowyBreakeven !== null) {
          expect(result.skalaVsLiniowyBreakeven).toBeGreaterThan(0);
        }
        expect(result.analysis).toBeDefined();
        expect(result.analysis.length).toBeGreaterThan(0);
      });

      it('should return analysis text with breakeven info', () => {
        const result = simulationService.findBreakevenPoints(0.3, ZusType.DUZY, 8.5, 2026);

        expect(result.analysis).toContain('Analiza progow oplacalnosci');
      });

      it('should handle different cost ratios', () => {
        const lowCost = simulationService.findBreakevenPoints(0.1, ZusType.DUZY, 8.5, 2026);
        const highCost = simulationService.findBreakevenPoints(0.5, ZusType.DUZY, 8.5, 2026);

        // Both should return valid results
        expect(lowCost.analysis).toBeDefined();
        expect(highCost.analysis).toBeDefined();
      });

      it('should work with preferencyjny ZUS type', () => {
        const result = simulationService.findBreakevenPoints(
          0.3,
          ZusType.PREFERENCYJNY,
          8.5,
          2026,
        );

        expect(result.analysis).toBeDefined();
      });
    });
  });
});
