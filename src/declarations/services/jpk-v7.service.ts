import { Injectable, Logger } from '@nestjs/common';
import { XMLGenerationService } from './xml-generation.service';
import { JPKV7CalculationService } from './jpk-v7-calculation.service';
import { GTUAssignmentService } from './gtu-assignment.service';
import { ProcedureCodeService } from './procedure-code.service';
import { XMLValidationService } from './xml-validation.service';
import { XMLSigningService, SignatureConfig } from './xml-signing.service';

export interface JPKV7GenerationRequest {
  period: string; // YYYY-MM for monthly, YYYY-QX for quarterly
  variant: 'M' | 'K';
  companyId: string;
  tenantId: string;
  signatureConfig?: SignatureConfig;
  validateOnly?: boolean;
}

export interface JPKV7GenerationResult {
  success: boolean;
  xmlContent?: string;
  validationResult?: any;
  signatureResult?: any;
  calculationData?: any;
  errors: string[];
  warnings: string[];
  metadata: {
    generatedAt: Date;
    processingTime: number;
    version: string;
  };
}

@Injectable()
export class JPKV7Service {
  private readonly logger = new Logger(JPKV7Service.name);

  constructor(
    private xmlGeneration: XMLGenerationService,
    private calculation: JPKV7CalculationService,
    private gtuAssignment: GTUAssignmentService,
    private procedureCode: ProcedureCodeService,
    private validation: XMLValidationService,
    private signing: XMLSigningService
  ) {}

  /**
   * Generate complete JPK_V7 XML with all validations and signatures
   */
  async generateJPKV7(request: JPKV7GenerationRequest): Promise<JPKV7GenerationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.log(`Starting JPK_V7${request.variant} generation for period ${request.period}`);

      // Step 1: Validate input data
      const validation = await this.calculation.validateCalculationData({
        period: request.period,
        variant: request.variant,
        companyId: request.companyId,
        tenantId: request.tenantId
      });

      if (!validation.isValid) {
        errors.push(...validation.errors);
        return {
          success: false,
          errors,
          warnings: validation.warnings,
          metadata: {
            generatedAt: new Date(),
            processingTime: Date.now() - startTime,
            version: '1.0'
          }
        };
      }
      warnings.push(...validation.warnings);

      // Step 2: Calculate JPK_V7 data
      const calculationData = await this.calculation.calculateJPKV7Data({
        period: request.period,
        variant: request.variant,
        companyId: request.companyId,
        tenantId: request.tenantId
      });

      // Step 3: Generate XML
      const xmlContent = this.xmlGeneration.generateJPKV7XML({
        period: request.period,
        variant: request.variant,
        companyInfo: calculationData.companyInfo,
        declaration: calculationData.declaration,
        salesEntries: calculationData.salesEntries,
        purchaseEntries: calculationData.purchaseEntries
      });

      // Step 4: Validate generated XML
      const validationResult = await this.validation.validateJPKV7XML(xmlContent, request.variant);

      if (!validationResult.isValid) {
        errors.push(...validationResult.errors.map(e => e.message));
      }
      warnings.push(...validationResult.warnings.map(w => w.message));

      // If validation only requested, return here
      if (request.validateOnly) {
        return {
          success: validationResult.isValid,
          validationResult,
          errors,
          warnings,
          metadata: {
            generatedAt: new Date(),
            processingTime: Date.now() - startTime,
            version: '1.0'
          }
        };
      }

      // Step 5: Sign XML if signature config provided
      let signatureResult;
      if (request.signatureConfig) {
        signatureResult = await this.signing.signJPKV7XML(
          xmlContent,
          request.signatureConfig,
          calculationData.companyInfo
        );
      }

      this.logger.log(`JPK_V7${request.variant} generation completed successfully for period ${request.period}`);

      return {
        success: true,
        xmlContent: signatureResult?.signedXml || xmlContent,
        validationResult,
        signatureResult,
        calculationData,
        errors,
        warnings,
        metadata: {
          generatedAt: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0'
        }
      };
    } catch (error) {
      this.logger.error(`Error generating JPK_V7: ${error.message}`, error.stack);
      errors.push(error.message);

      return {
        success: false,
        errors,
        warnings,
        metadata: {
          generatedAt: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0'
        }
      };
    }
  }

  /**
   * Generate JPK_V7M (monthly)
   */
  async generateJPKV7M(request: Omit<JPKV7GenerationRequest, 'variant'>): Promise<JPKV7GenerationResult> {
    return this.generateJPKV7({
      ...request,
      variant: 'M'
    });
  }

  /**
   * Generate JPK_V7K (quarterly)
   */
  async generateJPKV7K(request: Omit<JPKV7GenerationRequest, 'variant'>): Promise<JPKV7GenerationResult> {
    return this.generateJPKV7({
      ...request,
      variant: 'K'
    });
  }

  /**
   * Validate JPK_V7 XML without generating new data
   */
  async validateJPKV7XML(xmlContent: string, variant: 'M' | 'K'): Promise<any> {
    return this.validation.validateJPKV7XML(xmlContent, variant);
  }

  /**
   * Sign existing JPK_V7 XML
   */
  async signJPKV7XML(
    xmlContent: string,
    signatureConfig: SignatureConfig,
    companyInfo?: any
  ): Promise<any> {
    return this.signing.signJPKV7XML(xmlContent, signatureConfig, companyInfo);
  }

  /**
   * Get GTU codes for transaction
   */
  assignGTUCodes(
    description: string,
    category?: string,
    amount?: number,
    additionalContext?: string
  ): any {
    return this.gtuAssignment.assignGTUCodes(description, category, amount, additionalContext);
  }

  /**
   * Get procedure codes for transaction
   */
  assignProcedureCodes(transactionData: any): any {
    return this.procedureCode.assignProcedureCodes(transactionData);
  }

  /**
   * Get available signature methods
   */
  getAvailableSignatureMethods(): any[] {
    return this.signing.getAvailableSignatureMethods();
  }

  /**
   * Get all GTU codes
   */
  getAllGTUCodes(): any[] {
    return this.gtuAssignment.getAllGTUCodes();
  }

  /**
   * Get all procedure codes
   */
  getAllProcedureCodes(): any[] {
    return this.procedureCode.getAllProcedureCodes();
  }

  /**
   * Check if period requires JPK_V7 submission
   */
  isJPKV7Required(period: string, companyInfo: any): boolean {
    // Check if company is VAT payer and period is after JPK_V7 introduction
    if (!companyInfo.vatPayer) {
      return false;
    }

    const periodDate = new Date(period + '-01');
    const jpkV7StartDate = new Date('2020-10-01');

    return periodDate >= jpkV7StartDate;
  }

  /**
   * Get submission deadline for period
   */
  getSubmissionDeadline(period: string, variant: 'M' | 'K'): Date {
    const [year, monthOrQuarter] = period.split('-');
    const yearNum = parseInt(year);

    if (variant === 'M') {
      // Monthly: 25th of next month
      const monthNum = parseInt(monthOrQuarter);
      return new Date(yearNum, monthNum, 25);
    } else {
      // Quarterly: 25th of month after quarter ends
      const quarterNum = parseInt(monthOrQuarter);
      const endMonth = quarterNum * 3;
      return new Date(yearNum, endMonth, 25);
    }
  }
}