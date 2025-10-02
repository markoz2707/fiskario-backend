import { Injectable, Logger } from '@nestjs/common';
import { DatabaseEncryptionService } from './database-encryption.service';

export interface PIIPattern {
  name: string;
  pattern: RegExp;
  category: 'personal' | 'financial' | 'contact' | 'identification';
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  maskChar?: string;
  preserveLength?: boolean;
}

export interface DataClassificationResult {
  hasPII: boolean;
  piiFields: Array<{
    field: string;
    type: string;
    category: string;
    sensitivity: string;
    confidence: number;
  }>;
  riskScore: number;
  recommendedActions: string[];
}

export interface MaskingResult {
  original: string;
  masked: string;
  piiDetected: boolean;
  maskType: 'full' | 'partial' | 'tokenized' | 'none';
}

@Injectable()
export class DataMinimizationService {
  private readonly logger = new Logger(DataMinimizationService.name);

  private readonly piiPatterns: PIIPattern[] = [
    // Polish PESEL numbers
    {
      name: 'PESEL',
      pattern: /\b\d{11}\b/g,
      category: 'identification',
      sensitivity: 'critical',
      maskChar: '*',
      preserveLength: true,
    },
    // Polish NIP numbers
    {
      name: 'NIP',
      pattern: /\b\d{10}\b/g,
      category: 'identification',
      sensitivity: 'high',
      maskChar: '*',
      preserveLength: true,
    },
    // Polish REGON numbers
    {
      name: 'REGON',
      pattern: /\b(\d{9}|\d{14})\b/g,
      category: 'identification',
      sensitivity: 'high',
      maskChar: '*',
      preserveLength: true,
    },
    // Email addresses
    {
      name: 'Email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      category: 'contact',
      sensitivity: 'medium',
      maskChar: '*',
      preserveLength: false,
    },
    // Phone numbers (Polish format)
    {
      name: 'Phone',
      pattern: /(\+\d{2}\s?)?\d{3}[\s\-]?\d{3}[\s\-]?\d{3}/g,
      category: 'contact',
      sensitivity: 'medium',
      maskChar: '*',
      preserveLength: false,
    },
    // Bank account numbers
    {
      name: 'BankAccount',
      pattern: /\b\d{8,26}\b/g,
      category: 'financial',
      sensitivity: 'critical',
      maskChar: '*',
      preserveLength: true,
    },
    // IBAN numbers
    {
      name: 'IBAN',
      pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
      category: 'financial',
      sensitivity: 'critical',
      maskChar: '*',
      preserveLength: true,
    },
    // Credit card numbers
    {
      name: 'CreditCard',
      pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
      category: 'financial',
      sensitivity: 'critical',
      maskChar: '*',
      preserveLength: true,
    },
    // Polish postal codes
    {
      name: 'PostalCode',
      pattern: /\b\d{2}-\d{3}\b/g,
      category: 'contact',
      sensitivity: 'low',
      maskChar: '*',
      preserveLength: true,
    },
    // Names (Polish format - basic detection)
    {
      name: 'Name',
      pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
      category: 'personal',
      sensitivity: 'medium',
      maskChar: '*',
      preserveLength: false,
    },
    // IP addresses
    {
      name: 'IPAddress',
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      category: 'identification',
      sensitivity: 'medium',
      maskChar: '*',
      preserveLength: false,
    },
  ];

  constructor(private readonly encryptionService: DatabaseEncryptionService) {}

  /**
   * Detects PII in data object
   */
  detectPII(data: any): DataClassificationResult {
    try {
      const piiFields: DataClassificationResult['piiFields'] = [];
      let riskScore = 0;

      // Convert data to string for pattern matching
      const dataString = JSON.stringify(data);

      for (const pattern of this.piiPatterns) {
        const matches = dataString.match(pattern.pattern);

        if (matches && matches.length > 0) {
          // Find which fields contain PII
          for (const field of Object.keys(data)) {
            const fieldValue = String(data[field] || '');

            if (pattern.pattern.test(fieldValue)) {
              piiFields.push({
                field,
                type: pattern.name,
                category: pattern.category,
                sensitivity: pattern.sensitivity,
                confidence: this.calculateConfidence(fieldValue, pattern),
              });

              // Add to risk score based on sensitivity
              riskScore += this.getSensitivityScore(pattern.sensitivity);
            }
          }
        }
      }

      const recommendedActions = this.generateRecommendations(piiFields);

      return {
        hasPII: piiFields.length > 0,
        piiFields,
        riskScore: Math.min(riskScore, 10),
        recommendedActions,
      };
    } catch (error) {
      this.logger.error(`PII detection failed: ${error.message}`, error.stack);
      return {
        hasPII: false,
        piiFields: [],
        riskScore: 0,
        recommendedActions: ['manual_review_required'],
      };
    }
  }

  /**
   * Masks PII in data object
   */
  maskPII(data: any, options?: {
    maskType?: 'full' | 'partial' | 'tokenized';
    preserveStructure?: boolean;
    excludeFields?: string[];
  }): any {
    try {
      const opts = {
        maskType: 'full' as const,
        preserveStructure: true,
        excludeFields: [] as string[],
        ...options,
      };

      const maskedData = opts.preserveStructure ? { ...data } : {};

      for (const field of Object.keys(data)) {
        if (opts.excludeFields.includes(field)) {
          if (opts.preserveStructure) {
            maskedData[field] = data[field];
          }
          continue;
        }

        const fieldValue = String(data[field] || '');
        const maskingResult = this.maskValue(fieldValue, opts.maskType);

        if (opts.preserveStructure) {
          maskedData[field] = maskingResult.masked;
        } else if (maskingResult.piiDetected) {
          maskedData[field] = maskingResult.masked;
        }
      }

      return maskedData;
    } catch (error) {
      this.logger.error(`PII masking failed: ${error.message}`, error.stack);
      return data;
    }
  }

  /**
   * Anonymizes data by removing or generalizing PII
   */
  anonymizeData(data: any, strategy: 'remove' | 'generalize' | 'aggregate' = 'generalize'): any {
    try {
      const classification = this.detectPII(data);

      if (!classification.hasPII) {
        return data;
      }

      const anonymizedData = { ...data };

      for (const piiField of classification.piiFields) {
        const fieldValue = String(data[piiField.field] || '');

        switch (strategy) {
          case 'remove':
            delete anonymizedData[piiField.field];
            break;
          case 'generalize':
            anonymizedData[piiField.field] = this.generalizeValue(fieldValue, piiField.type);
            break;
          case 'aggregate':
            anonymizedData[piiField.field] = this.aggregateValue(fieldValue, piiField.type);
            break;
        }
      }

      return anonymizedData;
    } catch (error) {
      this.logger.error(`Data anonymization failed: ${error.message}`, error.stack);
      return data;
    }
  }

  /**
   * Creates data retention schedule based on data classification
   */
  createRetentionSchedule(dataClassification: DataClassificationResult): {
    retentionDays: number;
    justification: string;
    legalBasis: string;
  } {
    try {
      const maxSensitivity = Math.max(
        ...dataClassification.piiFields.map(field => this.getSensitivityScore(field.sensitivity))
      );

      let retentionDays: number;
      let justification: string;
      let legalBasis: string;

      if (maxSensitivity >= this.getSensitivityScore('critical')) {
        retentionDays = 180; // 6 months for critical data
        justification = 'Critical PII requires minimal retention for security';
        legalBasis = 'legitimate_interests';
      } else if (maxSensitivity >= this.getSensitivityScore('high')) {
        retentionDays = 365; // 1 year for high sensitivity data
        justification = 'High sensitivity data retained for legal compliance';
        legalBasis = 'legal_obligation';
      } else if (maxSensitivity >= this.getSensitivityScore('medium')) {
        retentionDays = 730; // 2 years for medium sensitivity data
        justification = 'Medium sensitivity data retained for business purposes';
        legalBasis = 'legitimate_interests';
      } else {
        retentionDays = 2555; // 7 years for low sensitivity data (tax requirement)
        justification = 'Low sensitivity data retained for tax and accounting purposes';
        legalBasis = 'legal_obligation';
      }

      return {
        retentionDays,
        justification,
        legalBasis,
      };
    } catch (error) {
      this.logger.error(`Retention schedule creation failed: ${error.message}`, error.stack);
      return {
        retentionDays: 365,
        justification: 'Default retention period',
        legalBasis: 'legitimate_interests',
      };
    }
  }

  /**
   * Validates data minimization compliance
   */
  validateDataMinimization(
    collectedData: any,
    purpose: string,
    requiredFields?: string[]
  ): {
    isCompliant: boolean;
    unnecessaryFields: string[];
    missingFields: string[];
    recommendations: string[];
  } {
    try {
      const classification = this.detectPII(collectedData);
      const unnecessaryFields: string[] = [];
      const recommendations: string[] = [];

      // Check for unnecessary PII collection
      for (const piiField of classification.piiFields) {
        if (requiredFields && !requiredFields.includes(piiField.field)) {
          unnecessaryFields.push(piiField.field);
          recommendations.push(`Consider removing ${piiField.field} if not essential for ${purpose}`);
        }
      }

      // Check for missing required fields
      const missingFields: string[] = [];
      if (requiredFields) {
        for (const requiredField of requiredFields) {
          if (!(requiredField in collectedData)) {
            missingFields.push(requiredField);
            recommendations.push(`Missing required field: ${requiredField}`);
          }
        }
      }

      return {
        isCompliant: unnecessaryFields.length === 0 && missingFields.length === 0,
        unnecessaryFields,
        missingFields,
        recommendations,
      };
    } catch (error) {
      this.logger.error(`Data minimization validation failed: ${error.message}`, error.stack);
      return {
        isCompliant: false,
        unnecessaryFields: [],
        missingFields: [],
        recommendations: ['validation_error'],
      };
    }
  }

  /**
   * Helper methods
   */
  private maskValue(value: string, maskType: 'full' | 'partial' | 'tokenized'): MaskingResult {
    let masked = value;
    let piiDetected = false;

    for (const pattern of this.piiPatterns) {
      if (pattern.pattern.test(value)) {
        piiDetected = true;

        switch (maskType) {
          case 'full':
            if (pattern.preserveLength) {
              masked = pattern.maskChar!.repeat(value.length);
            } else {
              masked = `${pattern.maskChar!.repeat(3)}***${pattern.maskChar!.repeat(3)}`;
            }
            break;
          case 'partial':
            const visibleChars = Math.max(2, Math.floor(value.length * 0.3));
            const hiddenChars = value.length - visibleChars;
            masked = value.substring(0, visibleChars) + pattern.maskChar!.repeat(hiddenChars);
            break;
          case 'tokenized':
            // In a real implementation, this would generate a token
            masked = `[TOKEN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}]`;
            break;
        }
        break;
      }
    }

    return {
      original: value,
      masked,
      piiDetected,
      maskType,
    };
  }

  private generalizeValue(value: string, piiType: string): string {
    const generalizations: Record<string, string> = {
      'PESEL': '[PERSON_ID]',
      'NIP': '[TAX_ID]',
      'REGON': '[BUSINESS_ID]',
      'Email': '[EMAIL]',
      'Phone': '[PHONE]',
      'BankAccount': '[ACCOUNT]',
      'IBAN': '[IBAN]',
      'CreditCard': '[CARD]',
      'PostalCode': '[POSTAL]',
      'Name': '[NAME]',
      'IPAddress': '[IP_ADDRESS]',
    };

    return generalizations[piiType] || '[REDACTED]';
  }

  private aggregateValue(value: string, piiType: string): string {
    // Return aggregated/statistical representation
    const aggregations: Record<string, string> = {
      'PESEL': '[AGE_GROUP]',
      'NIP': '[REGION]',
      'Email': '[DOMAIN]',
      'Phone': '[COUNTRY_CODE]',
      'PostalCode': '[CITY]',
      'Name': '[INITIALS]',
    };

    return aggregations[piiType] || '[AGGREGATED]';
  }

  private calculateConfidence(value: string, pattern: PIIPattern): number {
    // Simple confidence calculation based on pattern specificity
    const specificity = pattern.pattern.source.length;
    const matchStrength = value.match(pattern.pattern)?.[0]?.length || 0;

    return Math.min((matchStrength / specificity) * 100, 100);
  }

  private getSensitivityScore(sensitivity: string): number {
    const scores = {
      'low': 1,
      'medium': 3,
      'high': 7,
      'critical': 10,
    };

    return scores[sensitivity as keyof typeof scores] || 1;
  }

  private generateRecommendations(piiFields: DataClassificationResult['piiFields']): string[] {
    const recommendations: string[] = [];

    const criticalFields = piiFields.filter(field => field.sensitivity === 'critical');
    const highFields = piiFields.filter(field => field.sensitivity === 'high');

    if (criticalFields.length > 0) {
      recommendations.push('Immediate encryption required for critical PII fields');
      recommendations.push('Access logging mandatory for critical data');
    }

    if (highFields.length > 0) {
      recommendations.push('Encryption recommended for high sensitivity fields');
      recommendations.push('Consider data minimization for high sensitivity data');
    }

    if (piiFields.length > 5) {
      recommendations.push('High volume of PII detected - review data collection necessity');
    }

    return recommendations;
  }
}