import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ValidationRule {
  field: string;
  rule: string;
  value?: any;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  infos: ValidationError[];
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  value?: any;
}

export interface DataValidationPipeline {
  entityType: string;
  tenantId: string;
  data: any;
  rules: ValidationRule[];
  context?: any;
}

@Injectable()
export class DataValidationService {
  private readonly logger = new Logger(DataValidationService.name);

  constructor(private prisma: PrismaService) {}

  async validatePipeline(pipeline: DataValidationPipeline): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const infos: ValidationError[] = [];

    try {
      // Apply all validation rules
      for (const rule of pipeline.rules) {
        const result = await this.validateRule(pipeline.data, rule, pipeline.context);

        if (result) {
          switch (result.severity) {
            case 'error':
              errors.push(result);
              break;
            case 'warning':
              warnings.push(result);
              break;
            case 'info':
              infos.push(result);
              break;
          }
        }
      }

      // Additional entity-specific validations
      const entityErrors = await this.validateEntitySpecific(pipeline);
      errors.push(...entityErrors);

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        infos,
      };

      // Log validation results
      this.logValidationResult(pipeline, result);

      return result;
    } catch (error) {
      this.logger.error(`Validation pipeline error for ${pipeline.entityType}`, error);
      throw error;
    }
  }

  private async validateRule(data: any, rule: ValidationRule, context?: any): Promise<ValidationError | null> {
    const fieldValue = this.getNestedValue(data, rule.field);

    try {
      switch (rule.rule) {
        case 'required':
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
            return this.createValidationError(rule, fieldValue);
          }
          break;

        case 'minLength':
          if (typeof fieldValue === 'string' && fieldValue.length < rule.value) {
            return this.createValidationError(rule, fieldValue);
          }
          break;

        case 'maxLength':
          if (typeof fieldValue === 'string' && fieldValue.length > rule.value) {
            return this.createValidationError(rule, fieldValue);
          }
          break;

        case 'pattern':
          if (typeof fieldValue === 'string' && !new RegExp(rule.value).test(fieldValue)) {
            return this.createValidationError(rule, fieldValue);
          }
          break;

        case 'range':
          if (typeof fieldValue === 'number') {
            const [min, max] = rule.value;
            if (fieldValue < min || fieldValue > max) {
              return this.createValidationError(rule, fieldValue);
            }
          }
          break;

        case 'oneOf':
          if (!rule.value.includes(fieldValue)) {
            return this.createValidationError(rule, fieldValue);
          }
          break;

        case 'custom':
          const isValid = await this.validateCustomRule(rule, fieldValue, data, context);
          if (!isValid) {
            return this.createValidationError(rule, fieldValue);
          }
          break;

        default:
          this.logger.warn(`Unknown validation rule: ${rule.rule}`);
      }
    } catch (error) {
      this.logger.error(`Error validating rule ${rule.rule} for field ${rule.field}`, error);
      return {
        field: rule.field,
        rule: rule.rule,
        message: `Validation error: ${error.message}`,
        severity: 'error',
        value: fieldValue,
      };
    }

    return null;
  }

  private createValidationError(rule: ValidationRule, fieldValue: any): ValidationError {
    return {
      field: rule.field,
      rule: rule.rule,
      message: rule.message,
      severity: rule.severity,
      value: fieldValue,
    };
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async validateCustomRule(rule: ValidationRule, value: any, data: any, context?: any): Promise<boolean> {
    // Custom validation logic based on rule name
    switch (rule.field) {
      case 'nip':
        return this.validatePolishNIP(value);
      case 'regon':
        return this.validatePolishREGON(value);
      case 'email':
        return this.validateEmail(value);
      case 'taxNumber':
        return this.validateTaxNumber(value, context);
      case 'invoice.totalGross':
        return this.validateInvoiceTotal(data);
      default:
        return true; // Unknown custom rule - pass by default
    }
  }

  private async validateEntitySpecific(pipeline: DataValidationPipeline): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    switch (pipeline.entityType) {
      case 'company':
        errors.push(...await this.validateCompany(pipeline.data, pipeline.tenantId));
        break;
      case 'invoice':
        errors.push(...await this.validateInvoice(pipeline.data, pipeline.tenantId));
        break;
      case 'buyer':
        errors.push(...await this.validateBuyer(pipeline.data, pipeline.tenantId));
        break;
      case 'declaration':
        errors.push(...await this.validateDeclaration(pipeline.data, pipeline.tenantId));
        break;
    }

    return errors;
  }

  // Polish tax compliance validations
  private validatePolishNIP(nip: string): boolean {
    if (!nip || typeof nip !== 'string') return false;

    // Remove spaces and dashes
    const cleanNip = nip.replace(/[\s-]/g, '');

    // Check length
    if (cleanNip.length !== 10) return false;

    // Check if all digits
    if (!/^\d{10}$/.test(cleanNip)) return false;

    // Validate checksum
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanNip[i]) * weights[i];
    }

    const checksum = sum % 11;
    const lastDigit = parseInt(cleanNip[9]);

    return checksum === lastDigit || (checksum === 10 && lastDigit === 0);
  }

  private validatePolishREGON(regon: string): boolean {
    if (!regon || typeof regon !== 'string') return false;

    const cleanRegon = regon.replace(/[\s-]/g, '');

    // Check length (9 or 14 digits)
    if (cleanRegon.length !== 9 && cleanRegon.length !== 14) return false;

    if (!/^\d+$/.test(cleanRegon)) return false;

    // Validate checksum for 9-digit REGON
    if (cleanRegon.length === 9) {
      const weights = [8, 9, 2, 3, 4, 5, 6, 7];
      let sum = 0;

      for (let i = 0; i < 8; i++) {
        sum += parseInt(cleanRegon[i]) * weights[i];
      }

      const checksum = sum % 11;
      const lastDigit = parseInt(cleanRegon[8]);

      return checksum === lastDigit || (checksum === 10 && lastDigit === 0);
    }

    // For 14-digit REGON, validate both parts
    return this.validatePolishREGON(cleanRegon.substring(0, 9)) &&
           this.validatePolishREGON(cleanRegon.substring(9));
  }

  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async validateTaxNumber(taxNumber: string, context?: any): Promise<boolean> {
    // Additional validation based on tax form type
    if (context?.taxForm === 'VAT') {
      return this.validatePolishNIP(taxNumber);
    }

    return true;
  }

  private validateInvoiceTotal(invoice: any): boolean {
    if (!invoice.items || !Array.isArray(invoice.items)) return false;

    const calculatedTotal = invoice.items.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unitPrice * (1 + item.vatRate / 100));
    }, 0);

    const tolerance = 0.01; // 1 cent tolerance
    return Math.abs(calculatedTotal - invoice.totalGross) < tolerance;
  }

  private async validateCompany(data: any, tenantId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Check for duplicate NIP within tenant
    if (data.nip) {
      const existingCompany = await this.prisma.company.findFirst({
        where: {
          nip: data.nip,
          tenant_id: tenantId,
          id: { not: data.id }, // Exclude current company if updating
        },
      });

      if (existingCompany) {
        errors.push({
          field: 'nip',
          rule: 'unique',
          message: 'NIP already exists for another company in this tenant',
          severity: 'error',
          value: data.nip,
        });
      }
    }

    // Validate tax form requirements
    if (data.vatPayer && !data.nip) {
      errors.push({
        field: 'nip',
        rule: 'requiredForVat',
        message: 'NIP is required for VAT payers',
        severity: 'error',
      });
    }

    return errors;
  }

  private async validateInvoice(data: any, tenantId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Validate buyer exists and belongs to tenant
    if (data.buyer_id) {
      const buyer = await this.prisma.buyer.findFirst({
        where: {
          id: data.buyer_id,
          tenant_id: tenantId,
        },
      });

      if (!buyer) {
        errors.push({
          field: 'buyer_id',
          rule: 'exists',
          message: 'Buyer does not exist or does not belong to this tenant',
          severity: 'error',
          value: data.buyer_id,
        });
      }
    }

    // Validate company exists and belongs to tenant
    if (data.company_id) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: data.company_id,
          tenant_id: tenantId,
        },
      });

      if (!company) {
        errors.push({
          field: 'company_id',
          rule: 'exists',
          message: 'Company does not exist or does not belong to this tenant',
          severity: 'error',
          value: data.company_id,
        });
      }
    }

    return errors;
  }

  private async validateBuyer(data: any, tenantId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Check for duplicate NIP within tenant
    if (data.nip) {
      const existingBuyer = await this.prisma.buyer.findFirst({
        where: {
          nip: data.nip,
          tenant_id: tenantId,
          id: { not: data.id },
        },
      });

      if (existingBuyer) {
        errors.push({
          field: 'nip',
          rule: 'unique',
          message: 'NIP already exists for another buyer in this tenant',
          severity: 'error',
          value: data.nip,
        });
      }
    }

    return errors;
  }

  private async validateDeclaration(data: any, tenantId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Validate company exists and belongs to tenant
    if (data.company_id) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: data.company_id,
          tenant_id: tenantId,
        },
      });

      if (!company) {
        errors.push({
          field: 'company_id',
          rule: 'exists',
          message: 'Company does not exist or does not belong to this tenant',
          severity: 'error',
          value: data.company_id,
        });
      }
    }

    // Validate period format
    if (data.period && !/^\d{4}-\d{2}$/.test(data.period)) {
      errors.push({
        field: 'period',
        rule: 'format',
        message: 'Period must be in YYYY-MM format',
        severity: 'error',
        value: data.period,
      });
    }

    return errors;
  }

  private logValidationResult(pipeline: DataValidationPipeline, result: ValidationResult): void {
    const logData = {
      entityType: pipeline.entityType,
      tenantId: pipeline.tenantId,
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      infoCount: result.infos.length,
    };

    if (!result.isValid) {
      this.logger.warn(`Validation failed for ${pipeline.entityType}`, logData);
    } else if (result.warnings.length > 0) {
      this.logger.log(`Validation passed with warnings for ${pipeline.entityType}`, logData);
    } else {
      this.logger.log(`Validation passed for ${pipeline.entityType}`, logData);
    }
  }

  // Get predefined validation rules for common entities
  getValidationRules(entityType: string): ValidationRule[] {
    const commonRules: Record<string, ValidationRule[]> = {
      company: [
        { field: 'name', rule: 'required', message: 'Company name is required', severity: 'error' },
        { field: 'name', rule: 'minLength', value: 2, message: 'Company name must be at least 2 characters', severity: 'error' },
        { field: 'nip', rule: 'custom', message: 'Invalid Polish NIP format', severity: 'error' },
        { field: 'regon', rule: 'custom', message: 'Invalid Polish REGON format', severity: 'error' },
        { field: 'email', rule: 'custom', message: 'Invalid email format', severity: 'error' },
      ],
      invoice: [
        { field: 'number', rule: 'required', message: 'Invoice number is required', severity: 'error' },
        { field: 'date', rule: 'required', message: 'Invoice date is required', severity: 'error' },
        { field: 'buyer_id', rule: 'required', message: 'Buyer is required', severity: 'error' },
        { field: 'totalGross', rule: 'custom', message: 'Invoice total does not match calculated amount', severity: 'error' },
      ],
      buyer: [
        { field: 'name', rule: 'required', message: 'Buyer name is required', severity: 'error' },
        { field: 'nip', rule: 'custom', message: 'Invalid Polish NIP format', severity: 'warning' },
        { field: 'email', rule: 'custom', message: 'Invalid email format', severity: 'warning' },
      ],
    };

    return commonRules[entityType] || [];
  }
}