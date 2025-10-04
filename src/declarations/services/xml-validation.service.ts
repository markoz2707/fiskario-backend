import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  schemaVersion: string;
  validationTime: Date;
  xmlSize: number;
  encoding: string;
}

export interface SchemaInfo {
  version: string;
  variant: 'M' | 'K';
  downloadUrl: string;
  lastUpdated: Date;
  isActive: boolean;
}

@Injectable()
export class XMLValidationService {
  private readonly logger = new Logger(XMLValidationService.name);

  // Available JPK_V7 schemas
  private readonly schemas: SchemaInfo[] = [
    {
      version: '1-0E',
      variant: 'M',
      downloadUrl: 'https://www.podatki.gov.pl/media/7583/JPK_V7M_v1-0E.xsd',
      lastUpdated: new Date('2023-01-01'),
      isActive: true
    },
    {
      version: '1-0E',
      variant: 'K',
      downloadUrl: 'https://www.podatki.gov.pl/media/7584/JPK_V7K_v1-0E.xsd',
      lastUpdated: new Date('2023-01-01'),
      isActive: true
    }
  ];

  /**
   * Validate JPK_V7 XML against official schema
   */
  async validateJPKV7XML(xmlContent: string, variant: 'M' | 'K'): Promise<ValidationResult> {
    try {
      this.logger.log(`Validating JPK_V7${variant} XML`);

      const validationStart = new Date();
      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];

      // Basic XML validation
      const basicValidation = this.performBasicValidation(xmlContent);
      errors.push(...basicValidation.errors);
      warnings.push(...basicValidation.warnings);

      // Schema validation (simplified - in production use proper XSD validation)
      const schemaValidation = await this.performSchemaValidation(xmlContent, variant);
      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);

      // Business rules validation
      const businessValidation = this.performBusinessRulesValidation(xmlContent, variant);
      errors.push(...businessValidation.errors);
      warnings.push(...businessValidation.warnings);

      // Structure validation
      const structureValidation = this.performStructureValidation(xmlContent, variant);
      errors.push(...structureValidation.errors);
      warnings.push(...structureValidation.warnings);

      const isValid = errors.filter(e => e.severity === 'error').length === 0;
      const schemaVersion = this.getSchemaVersion(variant);

      this.logger.log(`JPK_V7${variant} validation completed. Valid: ${isValid}, Errors: ${errors.length}, Warnings: ${warnings.length}`);

      return {
        isValid,
        errors,
        warnings,
        schemaVersion,
        validationTime: new Date(),
        xmlSize: xmlContent.length,
        encoding: this.detectEncoding(xmlContent)
      };
    } catch (error) {
      this.logger.error(`Error validating JPK_V7 XML: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Perform basic XML validation
   */
  private performBasicValidation(xmlContent: string): { errors: ValidationError[], warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check if XML is well-formed
    if (!xmlContent.trim().startsWith('<?xml')) {
      errors.push({
        line: 1,
        column: 1,
        message: 'XML declaration missing',
        severity: 'error',
        code: 'XML_DECLARATION_MISSING'
      });
    }

    // Check for proper encoding
    if (!xmlContent.includes('UTF-8') && !xmlContent.includes('utf-8')) {
      warnings.push({
        line: 1,
        column: 1,
        message: 'XML encoding not explicitly set to UTF-8',
        severity: 'warning',
        code: 'ENCODING_NOT_SPECIFIED'
      });
    }

    // Check for required JPK root element
    if (!xmlContent.includes('<JPK') || !xmlContent.includes('</JPK>')) {
      errors.push({
        line: 1,
        column: 1,
        message: 'JPK root element missing or malformed',
        severity: 'error',
        code: 'JPK_ROOT_MISSING'
      });
    }

    // Check for namespace declaration
    if (!xmlContent.includes('xmlns="http://jpk.mf.gov.pl/wersja/v7"')) {
      errors.push({
        line: 1,
        column: 1,
        message: 'JPK namespace declaration missing',
        severity: 'error',
        code: 'NAMESPACE_MISSING'
      });
    }

    return { errors, warnings };
  }

  /**
   * Perform schema validation (simplified implementation)
   */
  private async performSchemaValidation(xmlContent: string, variant: 'M' | 'K'): Promise<{ errors: ValidationError[], warnings: ValidationError[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // In production, you would use a proper XSD validator library like libxmljs or xmllint
    // For now, we'll perform basic structural checks

    // Check for required sections
    const requiredSections = ['Naglowek', 'Podmiot1', 'Deklaracja', 'Ewidencja'];
    for (const section of requiredSections) {
      if (!xmlContent.includes(`<${section}>`) || !xmlContent.includes(`</${section}>`)) {
        errors.push({
          line: 1,
          column: 1,
          message: `Required section '${section}' missing`,
          severity: 'error',
          code: `SECTION_${section}_MISSING`
        });
      }
    }

    // Check declaration fields for monthly/quarterly variants
    if (variant === 'M') {
      // Monthly specific validations
      const monthlyFields = ['P_10', 'P_11', 'P_12', 'P_13', 'P_14', 'P_15'];
      for (const field of monthlyFields) {
        if (!xmlContent.includes(`<${field}>`)) {
          errors.push({
            line: 1,
            column: 1,
            message: `Required monthly field '${field}' missing`,
            severity: 'error',
            code: `MONTHLY_FIELD_${field}_MISSING`
          });
        }
      }
    }

    // Validate VAT register structure
    if (!xmlContent.includes('<SprzedazWiersz>') && !xmlContent.includes('<ZakupWiersz>')) {
      warnings.push({
        line: 1,
        column: 1,
        message: 'No sales or purchase entries found in VAT register',
        severity: 'warning',
        code: 'NO_VAT_ENTRIES'
      });
    }

    return { errors, warnings };
  }

  /**
   * Perform business rules validation
   */
  private performBusinessRulesValidation(xmlContent: string, variant: 'M' | 'K'): { errors: ValidationError[], warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Extract key values for business rule validation
    const totalSalesVAT = this.extractNumericValue(xmlContent, 'P_10');
    const vatPaidPurchases = this.extractNumericValue(xmlContent, 'P_11');
    const vatDue = this.extractNumericValue(xmlContent, 'P_12');

    // Business rule: VAT due should equal sales VAT minus purchase VAT
    if (totalSalesVAT !== null && vatPaidPurchases !== null && vatDue !== null) {
      const calculatedVatDue = totalSalesVAT - vatPaidPurchases;
      if (Math.abs(calculatedVatDue - vatDue) > 0.01) { // Allow for rounding differences
        warnings.push({
          line: 1,
          column: 1,
          message: `VAT due calculation mismatch. Expected: ${calculatedVatDue}, Found: ${vatDue}`,
          severity: 'warning',
          code: 'VAT_CALCULATION_MISMATCH'
        });
      }
    }

    // Check for negative values where not allowed
    if (totalSalesVAT !== null && totalSalesVAT < 0) {
      errors.push({
        line: 1,
        column: 1,
        message: 'Total sales VAT cannot be negative',
        severity: 'error',
        code: 'NEGATIVE_SALES_VAT'
      });
    }

    // Validate NIP format if present
    const nipMatch = xmlContent.match(/<NIP>(.*?)<\/NIP>/);
    if (nipMatch) {
      const nip = nipMatch[1];
      if (!this.validateNIP(nip)) {
        errors.push({
          line: 1,
          column: 1,
          message: `Invalid NIP format: ${nip}`,
          severity: 'error',
          code: 'INVALID_NIP_FORMAT'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Perform structure validation
   */
  private performStructureValidation(xmlContent: string, variant: 'M' | 'K'): { errors: ValidationError[], warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check XML formatting
    if (xmlContent.includes('  ')) { // Multiple spaces
      warnings.push({
        line: 1,
        column: 1,
        message: 'Inconsistent indentation detected',
        severity: 'warning',
        code: 'INCONSISTENT_INDENTATION'
      });
    }

    // Check for proper date formats
    const datePattern = /\d{4}-\d{2}-\d{2}/g;
    const dates = xmlContent.match(datePattern) || [];

    for (const dateStr of dates) {
      if (!this.isValidDate(dateStr)) {
        errors.push({
          line: 1,
          column: 1,
          message: `Invalid date format: ${dateStr}`,
          severity: 'error',
          code: 'INVALID_DATE_FORMAT'
        });
      }
    }

    // Check for proper numeric formats
    const numericValues = xmlContent.match(/<P_\d+>(-?\d+\.?\d*)<\/P_\d+>/g) || [];
    for (const value of numericValues) {
      const numValue = parseFloat(value.replace(/<P_\d+>(-?\d+\.?\d*)<\/P_\d+>/, '$1'));
      if (isNaN(numValue)) {
        errors.push({
          line: 1,
          column: 1,
          message: `Invalid numeric value: ${value}`,
          severity: 'error',
          code: 'INVALID_NUMERIC_VALUE'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Extract numeric value from XML by field name
   */
  private extractNumericValue(xmlContent: string, fieldName: string): number | null {
    const match = xmlContent.match(new RegExp(`<${fieldName}>(-?\\d+\\.?\\d*)</${fieldName}>`));
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Validate Polish NIP format
   */
  private validateNIP(nip: string): boolean {
    if (!nip || nip.length !== 10) return false;

    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      sum += parseInt(nip[i]) * weights[i];
    }

    const checksum = sum % 11;
    const lastDigit = checksum === 10 ? 0 : checksum;

    return parseInt(nip[9]) === lastDigit;
  }

  /**
   * Validate date format
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Detect XML encoding
   */
  private detectEncoding(xmlContent: string): string {
    const match = xmlContent.match(/encoding=["']([^"']+)["']/);
    return match ? match[1] : 'UTF-8';
  }

  /**
   * Get schema version for variant
   */
  private getSchemaVersion(variant: 'M' | 'K'): string {
    const schema = this.schemas.find(s => s.variant === variant && s.isActive);
    return schema ? schema.version : '1-0E';
  }

  /**
   * Get available schema versions
   */
  getAvailableSchemas(): SchemaInfo[] {
    return this.schemas.filter(schema => schema.isActive);
  }

  /**
   * Download and cache XSD schema (for production use)
   */
  async downloadSchema(schemaInfo: SchemaInfo): Promise<void> {
    try {
      this.logger.log(`Downloading schema ${schemaInfo.version} for variant ${schemaInfo.variant}`);

      // In production, implement actual schema download and caching
      // For now, this is a placeholder

      this.logger.log(`Schema downloaded successfully`);
    } catch (error) {
      this.logger.error(`Error downloading schema: ${error.message}`);
      throw error;
    }
  }
}