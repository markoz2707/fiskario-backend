import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaxRulesSeedService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedTaxForms();
  }

  private async seedTaxForms() {
    const existingForms = await this.prisma.taxForm.count();
    if (existingForms > 0) {
      return; // Already seeded
    }

    console.log('Seeding Polish tax forms for 2025...');

    // Create ZUS Rates Form
    const zusRatesForm = await this.prisma.taxForm.create({
      data: {
        name: 'ZUS Contribution Rates 2025',
        code: 'ZUS_RATES',
        description: 'Składki ZUS na ubezpieczenia społeczne i zdrowotne - 2025',
        category: 'social_insurance',
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        parameters: {
          emerytalna: { employer: 9.76, employee: 9.76, total: 19.52 },
          rentowa: { employer: 6.5, employee: 1.5, total: 8.0 },
          chorobowa: { employee: 2.45, total: 2.45 },
          wypadkowa: { employer: 1.67, total: 1.67 },
          zdrowotna: { employee: 9.5, deductible: 7.75, total: 9.5 },
          fp: { employer: 2.45, total: 2.45 },
          fgsp: { employer: 0.1, total: 0.1 }
        },
      },
    });

    // Create PIT skalowy (Tax scales)
    const pitScalesForm = await this.prisma.taxForm.create({
      data: {
        name: 'PIT skalowy 2025',
        code: 'PIT_SCALES',
        description: 'Podatek dochodowy od osób fizycznych - skala podatkowa (18% i 32%) - 2025',
        category: 'income_tax',
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        parameters: {
          taxFreeAmount: 36000, // Kwota wolna od podatku
          firstThreshold: 120000, // Amount for 18% rate
          firstRate: 18,
          secondRate: 32,
        },
      },
    });

    // Create PIT liniowy (Linear tax)
    const pitLinearForm = await this.prisma.taxForm.create({
      data: {
        name: 'PIT liniowy 2025',
        code: 'PIT_LINEAR',
        description: 'Podatek dochodowy od osób fizycznych - podatek liniowy (19%) - 2025',
        category: 'income_tax',
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        parameters: {
          rate: 19,
        },
      },
    });

    // Create Ryczałt (Lump sum tax)
    const pitLumpSumForm = await this.prisma.taxForm.create({
      data: {
        name: 'Ryczałt od przychodów ewidencjonowanych 2025',
        code: 'PIT_LUMP_SUM',
        description: 'Ryczałt od przychodów ewidencjonowanych - 2025',
        category: 'income_tax',
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        parameters: {
          rates: [
            { min: 0, max: 600000, rate: 17 }, // Wolne zawody
            { min: 0, max: 1000000, rate: 15 }, // Świadczenie usług
            { min: 0, max: 10000000, rate: 14 }, // Produkcja/działalność
            { min: 0, max: 10000000, rate: 12.5 }, // Gastronomia
            { min: 0, max: 10000000, rate: 12 }, // Wynajem
            { min: 0, max: 10000000, rate: 10 }, // Ochrona zdrowia
            { min: 0, max: 10000000, rate: 8.5 }, // Oprogramowanie
            { min: 0, max: 10000000, rate: 5.5 }, // Budownictwo
            { min: 0, max: 10000000, rate: 3 }, // Handel
          ],
        },
      },
    });

    // Create CIT (Corporate tax)
    const citForm = await this.prisma.taxForm.create({
      data: {
        name: 'CIT 2025',
        code: 'CIT',
        description: 'Podatek dochodowy od osób prawnych - 2025',
        category: 'corporate_tax',
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        parameters: {
          standardRate: 19,
          reducedRate: 9,
          smallTaxpayerThreshold: 2000000, // For 9% rate
        },
      },
    });

    // Create VAT
    const vatForm = await this.prisma.taxForm.create({
      data: {
        name: 'VAT 2025',
        code: 'VAT',
        description: 'Podatek od towarów i usług - 2025',
        category: 'value_added_tax',
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        parameters: {
          standardRate: 23,
          reducedRates: [8, 5],
          zeroRate: 0,
        },
      },
    });

    // Create tax rules for PIT skalowy
    await this.prisma.taxRule.create({
      data: {
        taxFormId: pitScalesForm.id,
        name: 'Stawka podstawowa 18% (2025)',
        ruleType: 'rate',
        conditions: { maxIncome: 120000 },
        calculationMethod: 'percentage',
        value: 18,
        maxBase: 120000,
        isDefault: true,
        priority: 1,
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
      },
    });

    await this.prisma.taxRule.create({
      data: {
        taxFormId: pitScalesForm.id,
        name: 'Stawka 32% (2025)',
        ruleType: 'rate',
        conditions: { minIncome: 120000 },
        calculationMethod: 'percentage',
        value: 32,
        minBase: 120000,
        isDefault: false,
        priority: 2,
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
      },
    });

    // Create tax rules for PIT liniowy
    await this.prisma.taxRule.create({
      data: {
        taxFormId: pitLinearForm.id,
        name: 'Stawka liniowa 19% (2025)',
        ruleType: 'rate',
        conditions: {},
        calculationMethod: 'percentage',
        value: 19,
        isDefault: true,
        priority: 1,
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
      },
    });

    // Create tax rules for VAT
    await this.prisma.taxRule.create({
      data: {
        taxFormId: vatForm.id,
        name: 'Stawka podstawowa 23% (2025)',
        ruleType: 'rate',
        conditions: {},
        calculationMethod: 'percentage',
        value: 23,
        isDefault: true,
        priority: 1,
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
      },
    });

    await this.prisma.taxRule.create({
      data: {
        taxFormId: vatForm.id,
        name: 'Stawka obniżona 8% (2025)',
        ruleType: 'rate',
        conditions: { reducedRate: true },
        calculationMethod: 'percentage',
        value: 8,
        isDefault: false,
        priority: 2,
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
      },
    });

    await this.prisma.taxRule.create({
      data: {
        taxFormId: vatForm.id,
        name: 'Stawka obniżona 5% (2025)',
        ruleType: 'rate',
        conditions: { reducedRate: true },
        calculationMethod: 'percentage',
        value: 5,
        isDefault: false,
        priority: 3,
        isActive: true,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
      },
    });

    console.log('Polish tax forms for 2025 seeded successfully');
  }
}