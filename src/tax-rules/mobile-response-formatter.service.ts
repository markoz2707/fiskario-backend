import { Injectable } from '@nestjs/common';
import { MobileTaxCalculationResponseDto, VatBreakdownDto, AppliedTaxRuleDto } from './dto/mobile-tax-calculation.dto';

@Injectable()
export class MobileResponseFormatterService {

  /**
   * Format tax calculation response for mobile consumption
   */
  formatTaxCalculationResponse(
    calculation: any,
    metadata?: { processingTime?: number; cacheHit?: boolean; version?: string }
  ): any {
    return {
      success: true,
      data: {
        totals: {
          net: this.formatCurrency(calculation.totalNet),
          vat: this.formatCurrency(calculation.totalVat),
          gross: this.formatCurrency(calculation.totalGross),
        },
        vatBreakdown: calculation.vatBreakdown.map((vat: VatBreakdownDto) => ({
          rate: `${vat.vatRate}%`,
          netAmount: this.formatCurrency(vat.netAmount),
          vatAmount: this.formatCurrency(vat.vatAmount),
          grossAmount: this.formatCurrency(vat.grossAmount),
          itemCount: vat.itemCount,
        })),
        appliedRules: calculation.appliedRules.map((rule: AppliedTaxRuleDto) => ({
          name: rule.ruleName,
          type: rule.ruleType,
          description: rule.description || 'Applied automatically',
          amount: rule.amount ? this.formatCurrency(rule.amount) : null,
        })),
        summary: this.generateCalculationSummary(calculation),
      },
      metadata: {
        processingTime: metadata?.processingTime || 0,
        cacheHit: metadata?.cacheHit || false,
        version: metadata?.version || '1.0',
        timestamp: new Date().toISOString(),
        formattedAt: new Date().toLocaleString('pl-PL'),
      },
    };
  }

  /**
   * Format sync response for mobile consumption
   */
  formatSyncResponse(
    syncResult: any,
    metadata?: { duration?: number; conflicts?: number; warnings?: string[] }
  ): any {
    return {
      success: true,
      data: {
        syncedCalculations: syncResult.syncedCalculations || 0,
        updatedTaxRules: syncResult.updatedTaxRules?.length || 0,
        updatedTaxForms: syncResult.updatedTaxForms?.length || 0,
        serverTimestamp: syncResult.serverTimestamp,
        nextSyncSuggested: this.calculateNextSyncTime(),
        statistics: {
          totalProcessed: (syncResult.syncedCalculations || 0) +
                         (syncResult.updatedTaxRules?.length || 0) +
                         (syncResult.updatedTaxForms?.length || 0),
          conflictsResolved: metadata?.conflicts || 0,
          warnings: metadata?.warnings?.length || 0,
        },
      },
      metadata: {
        duration: metadata?.duration || 0,
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  /**
   * Format invoice preview for mobile consumption
   */
  formatInvoicePreview(preview: any): any {
    return {
      success: true,
      data: {
        preview: {
          company: preview.company,
          items: preview.items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: this.formatCurrency(item.unitPrice),
            vatRate: `${item.vatRate}%`,
            netAmount: this.formatCurrency(item.netAmount),
            vatAmount: this.formatCurrency(item.vatAmount),
            grossAmount: this.formatCurrency(item.grossAmount),
          })),
          totals: {
            net: this.formatCurrency(preview.totals.totalNet),
            vat: this.formatCurrency(preview.totals.totalVat),
            gross: this.formatCurrency(preview.totals.totalGross),
          },
          vatBreakdown: preview.vatBreakdown,
          appliedRules: preview.appliedRules,
        },
        metadata: {
          estimatedFileSize: preview.estimatedFileSize,
          processingTime: preview.processingTime,
          canGenerate: true,
          format: 'PDF',
        },
      },
    };
  }

  /**
   * Format validation response for mobile consumption
   */
  formatValidationResponse(validation: { valid: boolean; errors: string[]; warnings: string[] }): any {
    return {
      success: validation.valid,
      data: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        summary: {
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          canProceed: validation.valid,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  /**
   * Format tax forms list for mobile consumption
   */
  formatTaxFormsList(taxForms: any[]): any {
    return {
      success: true,
      data: {
        forms: taxForms.map(form => ({
          id: form.id,
          name: form.name,
          code: form.code,
          description: form.description,
          category: form.category,
          isSelected: form.isSelected,
          activatedAt: form.activatedAt,
          ruleCount: form.rules?.length || 0,
          lastUpdated: form.updatedAt,
        })),
        summary: {
          total: taxForms.length,
          active: taxForms.filter(f => f.isSelected).length,
          categories: this.groupByCategory(taxForms),
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  /**
   * Format error response for mobile consumption
   */
  formatErrorResponse(error: any, correlationId?: string): any {
    return {
      success: false,
      error: {
        code: error.errorCode || 'UNKNOWN_ERROR',
        message: error.message || 'An unexpected error occurred',
        details: error.details || null,
        correlationId: correlationId || error.correlationId,
        retryAfter: error.retryAfter,
        fieldErrors: error.fieldErrors || [],
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        userMessage: this.getUserFriendlyMessage(error.errorCode),
      },
    };
  }

  /**
   * Format templates response for mobile consumption
   */
  formatTemplatesResponse(templates: any[]): any {
    return {
      success: true,
      data: {
        templates: templates.map(template => ({
          id: template.id,
          name: template.name,
          code: template.code,
          description: template.description,
          category: template.category,
          isSelected: template.isSelected,
          settings: template.settings,
          fields: template.fields.map((field: any) => ({
            name: field.name,
            type: field.type,
            required: field.required,
            label: field.label,
            placeholder: this.generatePlaceholder(field),
          })),
        })),
        summary: {
          total: templates.length,
          selected: templates.filter(t => t.isSelected).length,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  /**
   * Generate calculation summary for mobile display
   */
  private generateCalculationSummary(calculation: MobileTaxCalculationResponseDto): any {
    const vatRates = [...new Set(calculation.vatBreakdown.map(vat => vat.vatRate))];
    const highestVatRate = Math.max(...vatRates);
    const lowestVatRate = Math.min(...vatRates);

    return {
      itemCount: calculation.vatBreakdown.reduce((sum, vat) => sum + vat.itemCount, 0),
      vatRateRange: vatRates.length > 1 ? `${lowestVatRate}% - ${highestVatRate}%` : `${highestVatRate}%`,
      averageVatRate: calculation.totalNet > 0 ?
        Math.round((calculation.totalVat / calculation.totalNet) * 100 * 100) / 100 : 0,
      ruleCount: calculation.appliedRules.length,
    };
  }

  /**
   * Group tax forms by category
   */
  private groupByCategory(forms: any[]): Record<string, number> {
    return forms.reduce((acc, form) => {
      acc[form.category] = (acc[form.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Format currency values for mobile display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Calculate suggested next sync time
   */
  private calculateNextSyncTime(): string {
    const nextSync = new Date();
    nextSync.setHours(nextSync.getHours() + 1); // Suggest sync every hour
    return nextSync.toISOString();
  }

  /**
   * Generate placeholder text for form fields
   */
  private generatePlaceholder(field: any): string {
    switch (field.type) {
      case 'text':
        return `Enter ${field.label.toLowerCase()}`;
      case 'number':
        return `0.00`;
      case 'date':
        return 'YYYY-MM-DD';
      case 'textarea':
        return `Enter ${field.label.toLowerCase()}`;
      default:
        return field.label;
    }
  }

  /**
   * Get user-friendly error messages
   */
  private getUserFriendlyMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      'VALIDATION_ERROR': 'Please check your input and try again.',
      'CALCULATION_ERROR': 'Calculation failed. Please verify your data.',
      'SYNC_ERROR': 'Sync failed. Please check your connection.',
      'NETWORK_ERROR': 'Connection problem. Please try again.',
      'AUTH_ERROR': 'Please log in again.',
      'RATE_LIMIT_ERROR': 'Too many requests. Please wait a moment.',
      'BUSINESS_ERROR': 'Operation not allowed. Please check your permissions.',
      'GENERIC_ERROR': 'Something went wrong. Please try again.',
    };

    return messages[errorCode] || messages['GENERIC_ERROR'];
  }
}