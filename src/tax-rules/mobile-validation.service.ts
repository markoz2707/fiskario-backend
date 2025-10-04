import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobileTaxCalculationDto, MobileTaxCalculationItemDto } from './dto/mobile-tax-calculation.dto';

export interface MobileValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidationSuggestion {
  type: 'optimization' | 'compliance' | 'usability';
  message: string;
  impact: 'low' | 'medium' | 'high';
}

@Injectable()
export class MobileValidationService {
  private readonly logger = new Logger(MobileValidationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Comprehensive validation for mobile tax calculations
   */
  async validateMobileTaxCalculation(
    calculationDto: MobileTaxCalculationDto,
    tenant_id: string
  ): Promise<MobileValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Basic structure validation
    this.validateBasicStructure(calculationDto, errors);

    // Company validation
    await this.validateCompany(calculationDto.companyId, tenant_id, errors);

    // Items validation
    this.validateItems(calculationDto.items, errors, warnings);

    // Tax rules validation
    await this.validateTaxRules(calculationDto, tenant_id, errors, warnings);

    // Business logic validation
    this.validateBusinessLogic(calculationDto, errors, warnings, suggestions);

    // Mobile-specific validation
    this.validateMobileSpecific(calculationDto, warnings, suggestions);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Validate basic DTO structure
   */
  private validateBasicStructure(calculationDto: MobileTaxCalculationDto, errors: ValidationError[]): void {
    if (!calculationDto.companyId) {
      errors.push({
        field: 'companyId',
        code: 'REQUIRED',
        message: 'Company ID is required',
        severity: 'error',
      });
    }

    if (!calculationDto.items || !Array.isArray(calculationDto.items)) {
      errors.push({
        field: 'items',
        code: 'REQUIRED',
        message: 'Items array is required',
        severity: 'error',
      });
    } else if (calculationDto.items.length === 0) {
      errors.push({
        field: 'items',
        code: 'EMPTY',
        message: 'At least one item is required',
        severity: 'error',
      });
    }
  }

  /**
   * Validate company exists and is accessible
   */
  private async validateCompany(companyId: string, tenant_id: string, errors: ValidationError[]): Promise<void> {
    try {
      const company = await this.prisma.company.findFirst({
        where: { id: companyId, tenant_id },
      });

      if (!company) {
        errors.push({
          field: 'companyId',
          code: 'NOT_FOUND',
          message: 'Company not found or access denied',
          severity: 'error',
        });
      } else {
        // Check if company is active
        if (!company.vatPayer) {
          errors.push({
            field: 'companyId',
            code: 'NOT_VAT_PAYER',
            message: 'Company is not registered as VAT payer',
            severity: 'warning',
          });
        }
      }
    } catch (error) {
      this.logger.error('Error validating company:', error);
      errors.push({
        field: 'companyId',
        code: 'VALIDATION_ERROR',
        message: 'Error validating company',
        severity: 'error',
      });
    }
  }

  /**
   * Validate calculation items
   */
  private validateItems(items: MobileTaxCalculationItemDto[], errors: ValidationError[], warnings: ValidationWarning[]): void {
    items.forEach((item, index) => {
      const itemPath = `items[${index}]`;

      // Description validation
      if (!item.description || item.description.trim().length === 0) {
        errors.push({
          field: `${itemPath}.description`,
          code: 'REQUIRED',
          message: 'Item description is required',
          severity: 'error',
        });
      } else if (item.description.length > 255) {
        errors.push({
          field: `${itemPath}.description`,
          code: 'TOO_LONG',
          message: 'Item description is too long (max 255 characters)',
          severity: 'error',
        });
      }

      // Quantity validation
      if (item.quantity === undefined || item.quantity === null) {
        errors.push({
          field: `${itemPath}.quantity`,
          code: 'REQUIRED',
          message: 'Item quantity is required',
          severity: 'error',
        });
      } else if (item.quantity <= 0) {
        errors.push({
          field: `${itemPath}.quantity`,
          code: 'INVALID',
          message: 'Item quantity must be greater than 0',
          severity: 'error',
        });
      } else if (item.quantity > 999999) {
        warnings.push({
          field: `${itemPath}.quantity`,
          code: 'UNUSUALLY_HIGH',
          message: 'Item quantity seems unusually high',
          suggestion: 'Please verify the quantity is correct',
        });
      }

      // Unit price validation
      if (item.unitPrice === undefined || item.unitPrice === null) {
        errors.push({
          field: `${itemPath}.unitPrice`,
          code: 'REQUIRED',
          message: 'Item unit price is required',
          severity: 'error',
        });
      } else if (item.unitPrice < 0) {
        errors.push({
          field: `${itemPath}.unitPrice`,
          code: 'NEGATIVE',
          message: 'Item unit price cannot be negative',
          severity: 'error',
        });
      } else if (item.unitPrice > 1000000) {
        warnings.push({
          field: `${itemPath}.unitPrice`,
          code: 'UNUSUALLY_HIGH',
          message: 'Item unit price seems unusually high',
          suggestion: 'Please verify the unit price is correct',
        });
      }

      // VAT rate validation
      if (item.vatRate !== undefined) {
        if (item.vatRate < 0 || item.vatRate > 100) {
          errors.push({
            field: `${itemPath}.vatRate`,
            code: 'INVALID_RANGE',
            message: 'VAT rate must be between 0 and 100',
            severity: 'error',
          });
        } else {
          const validRates = [0, 5, 8, 23]; // Common Polish VAT rates
          if (!validRates.includes(item.vatRate)) {
            warnings.push({
              field: `${itemPath}.vatRate`,
              code: 'UNCOMMON_RATE',
              message: `VAT rate ${item.vatRate}% is not a standard rate`,
              suggestion: 'Consider using standard VAT rates: 0%, 5%, 8%, 23%',
            });
          }
        }
      }

      // GTU code validation (Polish tax system)
      if (item.gtu) {
        const validGtuCodes = ['GTU_01', 'GTU_02', 'GTU_03', 'GTU_04', 'GTU_05', 'GTU_06', 'GTU_07', 'GTU_08', 'GTU_09', 'GTU_10', 'GTU_11', 'GTU_12', 'GTU_13'];
        if (!validGtuCodes.includes(item.gtu)) {
          errors.push({
            field: `${itemPath}.gtu`,
            code: 'INVALID_GTU',
            message: `Invalid GTU code: ${item.gtu}`,
            severity: 'error',
          });
        }
      }
    });
  }

  /**
   * Validate against tax rules
   */
  private async validateTaxRules(
    calculationDto: MobileTaxCalculationDto,
    tenant_id: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    try {
      const companySettings = await this.prisma.companyTaxSettings.findMany({
        where: {
          company_id: calculationDto.companyId,
          isSelected: true,
        },
        include: { taxForm: { include: { rules: true } } },
      });

      if (companySettings.length === 0) {
        warnings.push({
          field: 'taxSettings',
          code: 'NO_TAX_SETTINGS',
          message: 'No tax settings configured for this company',
          suggestion: 'Configure tax settings in company profile',
        });
      }

      // Validate against active tax rules
      for (const setting of companySettings) {
        for (const rule of setting.taxForm.rules) {
          if (rule.isActive) {
            await this.validateAgainstRule(rule, calculationDto, errors, warnings);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error validating tax rules:', error);
    }
  }

  /**
   * Validate business logic
   */
  private validateBusinessLogic(
    calculationDto: MobileTaxCalculationDto,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ): void {
    const totalValue = calculationDto.items.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    // High value invoice warning
    if (totalValue > 50000) {
      warnings.push({
        field: 'totalValue',
        code: 'HIGH_VALUE',
        message: 'Invoice value exceeds 50,000 PLN',
        suggestion: 'Consider splitting into multiple invoices or verify amounts',
      });
    }

    // Many items warning
    if (calculationDto.items.length > 100) {
      warnings.push({
        field: 'itemCount',
        code: 'MANY_ITEMS',
        message: 'Invoice contains many items',
        suggestion: 'Consider grouping similar items to simplify the invoice',
      });
    }

    // Zero VAT items
    const zeroVatItems = calculationDto.items.filter(item => item.vatRate === 0);
    if (zeroVatItems.length > 0) {
      suggestions.push({
        type: 'compliance',
        message: 'Zero VAT items detected - ensure proper VAT exemption justification is documented',
        impact: 'medium',
      });
    }

    // Mixed VAT rates
    const vatRates = [...new Set(calculationDto.items.map(item => item.vatRate || 23))];
    if (vatRates.length > 3) {
      suggestions.push({
        type: 'optimization',
        message: 'Multiple VAT rates detected - consider consolidating items with same VAT rate',
        impact: 'low',
      });
    }
  }

  /**
   * Mobile-specific validation
   */
  private validateMobileSpecific(
    calculationDto: MobileTaxCalculationDto,
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ): void {
    // Large data payload warning
    const estimatedPayloadSize = JSON.stringify(calculationDto).length;
    if (estimatedPayloadSize > 50000) { // 50KB
      warnings.push({
        field: 'payload',
        code: 'LARGE_PAYLOAD',
        message: 'Data payload is large and may affect performance',
        suggestion: 'Consider reducing item descriptions or splitting into multiple requests',
      });
    }

    // Complex calculations suggestion
    const complexItems = calculationDto.items.filter(item =>
      item.vatRate !== 23 && item.vatRate !== 0
    );

    if (complexItems.length > 5) {
      suggestions.push({
        type: 'usability',
        message: 'Multiple non-standard VAT rates detected - consider using draft mode for complex calculations',
        impact: 'low',
      });
    }
  }

  /**
   * Validate against specific tax rule
   */
  private async validateAgainstRule(
    rule: any,
    calculationDto: MobileTaxCalculationDto,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // This is a simplified rule validation
    // In a real implementation, you would evaluate the rule conditions

    if (rule.ruleType === 'rate' && rule.calculationMethod === 'percentage') {
      const applicableItems = calculationDto.items.filter(item => {
        // Apply rule conditions (simplified)
        return true; // Placeholder for actual condition evaluation
      });

      if (applicableItems.length > 0) {
        warnings.push({
          field: 'taxRules',
          code: 'RULE_APPLIED',
          message: `Tax rule "${rule.name}" will be applied`,
          suggestion: 'Review applied tax rules in calculation results',
        });
      }
    }
  }

  /**
   * Quick validation for real-time feedback
   */
  async quickValidate(calculationDto: MobileTaxCalculationDto): Promise<{ valid: boolean; blockingErrors: number }> {
    const result = await this.validateMobileTaxCalculation(calculationDto, 'default-tenant');

    const blockingErrors = result.errors.filter(error => error.severity === 'error').length;

    return {
      valid: result.isValid,
      blockingErrors,
    };
  }
}