import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZUS_RATES, ZUS_RATES_HISTORY } from '../zus/dto/zus-contribution.dto';

export interface TaxRateValidity {
  validFrom: Date;
  validTo?: Date;
  isActive: boolean;
}

export interface ZUSRateSet {
  emerytalna: { employer: number; employee: number; total: number };
  rentowa: { employer: number; employee: number; total: number };
  chorobowa: { employee: number; total: number };
  wypadkowa: { employer: number; total: number };
  zdrowotna: { employee: number; deductible: number; total: number };
  fp: { employer: number; total: number };
  fgsp: { employer: number; total: number };
}

export interface TaxThresholds {
  taxFreeAmount: number;
  firstThreshold: number;
  firstRate: number;
  secondRate: number;
}

@Injectable()
export class TaxRateManagerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get ZUS rates for a specific date
   * Falls back to historical data if no rates found in database
   */
  async getZUSRates(forDate: Date = new Date()): Promise<ZUSRateSet> {
    // First check if we have dynamic rates in the database
    const rateForm = await this.prisma.taxForm.findFirst({
      where: {
        code: 'ZUS_RATES',
        isActive: true,
        validFrom: { lte: forDate },
        OR: [
          { validTo: null },
          { validTo: { gte: forDate } }
        ]
      }
    });

    if (rateForm?.parameters) {
      return rateForm.parameters as unknown as ZUSRateSet;
    }

    // Fall back to historical data
    const year = forDate.getFullYear().toString();
    return ZUS_RATES_HISTORY[year as keyof typeof ZUS_RATES_HISTORY] || ZUS_RATES;
  }

  /**
   * Get tax thresholds for a specific date
   */
  async getTaxThresholds(forDate: Date = new Date()): Promise<TaxThresholds> {
    const thresholdForm = await this.prisma.taxForm.findFirst({
      where: {
        code: 'PIT_THRESHOLDS',
        isActive: true,
        validFrom: { lte: forDate },
        OR: [
          { validTo: null },
          { validTo: { gte: forDate } }
        ]
      }
    });

    if (thresholdForm?.parameters) {
      return thresholdForm.parameters as unknown as TaxThresholds;
    }

    // Default 2025 thresholds
    return {
      taxFreeAmount: 36000, // 30,000 PLN tax-free amount
      firstThreshold: 120000,
      firstRate: 18,
      secondRate: 32
    };
  }

  /**
   * Get VAT rates for a specific date
   */
  async getVATRates(forDate: Date = new Date()) {
    const vatForm = await this.prisma.taxForm.findFirst({
      where: {
        code: 'VAT_RATES',
        isActive: true,
        validFrom: { lte: forDate },
        OR: [
          { validTo: null },
          { validTo: { gte: forDate } }
        ]
      }
    });

    if (vatForm?.parameters) {
      return vatForm.parameters;
    }

    // Default VAT rates
    return {
      standardRate: 23,
      reducedRates: [8, 5],
      zeroRate: 0,
      exempt: 0
    };
  }

  /**
   * Update ZUS rates for a specific validity period
   */
  async updateZUSRates(
    rates: ZUSRateSet,
    validFrom: Date,
    validTo?: Date,
    description: string = 'Updated ZUS rates'
  ) {
    return this.prisma.taxForm.upsert({
      where: {
        code: 'ZUS_RATES'
      },
      update: {
        parameters: rates as unknown as any,
        validFrom,
        validTo,
        description,
        updatedAt: new Date()
      },
      create: {
        name: 'ZUS Contribution Rates',
        code: 'ZUS_RATES',
        description,
        category: 'social_insurance',
        isActive: true,
        validFrom,
        validTo,
        parameters: rates as unknown as any
      }
    });
  }

  /**
   * Update tax thresholds for a specific validity period
   */
  async updateTaxThresholds(
    thresholds: TaxThresholds,
    validFrom: Date,
    validTo?: Date,
    description: string = 'Updated tax thresholds'
  ) {
    return this.prisma.taxForm.upsert({
      where: {
        code: 'PIT_THRESHOLDS'
      },
      update: {
        parameters: thresholds as unknown as any,
        validFrom,
        validTo,
        description,
        updatedAt: new Date()
      },
      create: {
        name: 'PIT Tax Thresholds',
        code: 'PIT_THRESHOLDS',
        description,
        category: 'income_tax',
        isActive: true,
        validFrom,
        validTo,
        parameters: thresholds as unknown as any
      }
    });
  }

  /**
   * Get all active tax forms with their validity periods
   */
  async getActiveTaxForms() {
    return this.prisma.taxForm.findMany({
      where: {
        isActive: true,
        OR: [
          { validTo: null },
          { validTo: { gte: new Date() } }
        ]
      },
      include: {
        rules: {
          where: {
            isActive: true,
            OR: [
              { validTo: null },
              { validTo: { gte: new Date() } }
            ]
          }
        }
      },
      orderBy: { validFrom: 'desc' }
    });
  }

  /**
   * Check if rates need updating based on current date
   */
  async checkRateUpdatesNeeded(): Promise<boolean> {
    const activeForms = await this.getActiveTaxForms();
    const currentDate = new Date();

    // Check if any forms expire soon (within 30 days)
    const soonToExpire = activeForms.filter(form =>
      form.validTo && form.validTo <= new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
    );

    return soonToExpire.length > 0;
  }

  /**
   * Get rate change history for audit purposes
   */
  async getRateChangeHistory(limit: number = 50) {
    return this.prisma.taxForm.findMany({
      where: {
        OR: [
          { code: 'ZUS_RATES' },
          { code: 'PIT_THRESHOLDS' },
          { code: 'VAT_RATES' }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
  }

  /**
   * Automatically update rates that are expiring soon
   * This method should be called periodically (e.g., daily)
   */
  async performAutomaticRateUpdates() {
    const currentDate = new Date();
    const updates: string[] = [];

    // Find forms that expire within 30 days
    const expiringSoonForms = await this.prisma.taxForm.findMany({
      where: {
        isActive: true,
        validTo: {
          gte: currentDate,
          lte: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
        }
      }
    });

    for (const form of expiringSoonForms) {
      try {
        // Create new version with updated validity period
        await this.extendRateValidity(form.id, form.code);
        updates.push(`Extended validity for ${form.code}`);
      } catch (error) {
        console.error(`Failed to update ${form.code}:`, error);
      }
    }

    return updates;
  }

  /**
   * Extend the validity period of a tax form
   */
  async extendRateValidity(formId: string, formCode: string) {
    const form = await this.prisma.taxForm.findUnique({
      where: { id: formId }
    });

    if (!form) {
      throw new Error(`Tax form ${formId} not found`);
    }

    const currentValidTo = form.validTo || new Date();
    const newValidTo = new Date(currentValidTo.getTime() + 365 * 24 * 60 * 60 * 1000); // Extend by 1 year

    // Create new form with extended validity
    const newForm = await this.prisma.taxForm.create({
      data: {
        name: `${form.name} (Extended)`,
        code: `${formCode}_${Date.now()}`, // Create unique code for historical tracking
        description: `Extended validity from ${form.name}`,
        category: form.category,
        isActive: true,
        validFrom: currentValidTo,
        validTo: newValidTo,
        parameters: form.parameters as unknown as any
      }
    });

    // Deactivate old form
    await this.prisma.taxForm.update({
      where: { id: formId },
      data: { isActive: false }
    });

    return newForm;
  }

  /**
   * Create a new version of rates for the next year
   */
  async createNextYearRates(
    currentFormCode: string,
    nextYearRates: any,
    nextYear: number
  ) {
    const validFrom = new Date(`${nextYear}-01-01`);
    const validTo = new Date(`${nextYear}-12-31`);

    return this.prisma.taxForm.create({
      data: {
        name: `${currentFormCode} ${nextYear}`,
        code: `${currentFormCode}_${nextYear}`,
        description: `${currentFormCode} rates for ${nextYear}`,
        category: this.getCategoryFromCode(currentFormCode),
        isActive: false, // Will be activated when the year starts
        validFrom,
        validTo,
        parameters: nextYearRates as unknown as any
      }
    });
  }

  /**
   * Get category from form code
   */
  private getCategoryFromCode(code: string): string {
    if (code.includes('ZUS')) return 'social_insurance';
    if (code.includes('PIT')) return 'income_tax';
    if (code.includes('CIT')) return 'corporate_tax';
    if (code.includes('VAT')) return 'value_added_tax';
    return 'other';
  }

  /**
   * Validate rate consistency across forms
   */
  async validateRateConsistency() {
    const issues: string[] = [];

    // Check ZUS rates consistency
    const zusForm = await this.prisma.taxForm.findFirst({
      where: { code: 'ZUS_RATES', isActive: true }
    });

    if (zusForm?.parameters) {
      const rates = zusForm.parameters as unknown as ZUSRateSet;

      // Validate that total equals sum of parts
      const calculatedTotal = rates.emerytalna.total +
                            rates.rentowa.total +
                            rates.chorobowa.total +
                            rates.wypadkowa.total +
                            rates.zdrowotna.total +
                            rates.fp.total +
                            rates.fgsp.total;

      if (Math.abs(calculatedTotal - 100) > 0.01) {
        issues.push(`ZUS rates total is ${calculatedTotal}%, should be 100%`);
      }
    }

    return issues;
  }

  /**
   * Get upcoming rate changes (next 90 days)
   */
  async getUpcomingRateChanges() {
    const currentDate = new Date();
    const futureDate = new Date(currentDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    return this.prisma.taxForm.findMany({
      where: {
        isActive: true,
        validFrom: {
          gte: currentDate,
          lte: futureDate
        }
      },
      orderBy: { validFrom: 'asc' }
    });
  }
}