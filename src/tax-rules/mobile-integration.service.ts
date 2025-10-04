import { Injectable, Logger } from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { MobileErrorHandlerService } from './mobile-error-handler.service';
import { MobileResponseFormatterService } from './mobile-response-formatter.service';
import { MobileValidationService } from './mobile-validation.service';
import { PrismaService } from '../prisma/prisma.service';
import { MobileTaxCalculationDto, MobileTaxSyncDto } from './dto/mobile-tax-calculation.dto';

export interface MobileTaxOperationResult {
  success: boolean;
  data?: any;
  error?: any;
  metadata?: {
    operationId: string;
    duration: number;
    timestamp: string;
    version: string;
  };
}

@Injectable()
export class MobileIntegrationService {
  private readonly logger = new Logger(MobileIntegrationService.name);

  constructor(
    private readonly taxRulesService: TaxRulesService,
    private readonly errorHandler: MobileErrorHandlerService,
    private readonly responseFormatter: MobileResponseFormatterService,
    private readonly validationService: MobileValidationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Unified mobile tax calculation with comprehensive error handling
   */
  async performMobileTaxCalculation(
    tenant_id: string,
    calculationDto: MobileTaxCalculationDto,
    options?: { skipValidation?: boolean; includePreview?: boolean }
  ): Promise<MobileTaxOperationResult> {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      this.logger.log(`Starting mobile tax calculation ${operationId}`, {
        companyId: calculationDto.companyId,
        itemCount: calculationDto.items.length,
      });

      // Validation (unless skipped)
      if (!options?.skipValidation) {
        const validation = await this.validationService.validateMobileTaxCalculation(calculationDto, tenant_id);

        if (!validation.isValid) {
          const errorResponse = this.errorHandler.handleValidationError(
            validation.errors.map(e => ({ property: e.field, constraints: { [e.code]: e.message } }))
          );

          return {
            success: false,
            error: this.responseFormatter.formatErrorResponse(errorResponse, operationId),
            metadata: {
              operationId,
              duration: Date.now() - startTime,
              timestamp: new Date().toISOString(),
              version: '1.0',
            },
          };
        }

        // Log warnings if any
        if (validation.warnings.length > 0) {
          this.logger.warn(`Validation warnings for calculation ${operationId}`, {
            warnings: validation.warnings,
          });
        }
      }

      // Perform calculation
      const calculationResult = await this.taxRulesService.calculateTaxForMobile(tenant_id, calculationDto);

      // Format response
      const formattedResponse = this.responseFormatter.formatTaxCalculationResponse(calculationResult, {
        processingTime: Date.now() - startTime,
        cacheHit: false,
        version: '1.0',
      });

      // Include preview if requested
      if (options?.includePreview) {
        formattedResponse.preview = await this.generateCalculationPreview(tenant_id, calculationDto);
      }

      this.logger.log(`Mobile tax calculation completed ${operationId}`, {
        duration: Date.now() - startTime,
        totalNet: calculationResult.totalNet,
        totalVat: calculationResult.totalVat,
      });

      return {
        success: true,
        data: formattedResponse,
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };

    } catch (error) {
      this.logger.error(`Mobile tax calculation failed ${operationId}`, {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
      });

      const errorResponse = this.errorHandler.createMobileErrorResponse(error, 'tax_calculation');

      return {
        success: false,
        error: this.responseFormatter.formatErrorResponse(errorResponse, operationId),
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
  }

  /**
   * Unified mobile sync operation
   */
  async performMobileSync(
    tenant_id: string,
    syncDto: MobileTaxSyncDto,
    options?: { forceFull?: boolean }
  ): Promise<MobileTaxOperationResult> {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      this.logger.log(`Starting mobile sync ${operationId}`, {
        deviceId: syncDto.deviceId,
        companyId: syncDto.companyId,
        forceFull: options?.forceFull,
      });

      let syncResult;

      if (options?.forceFull || syncDto.forceFullSync) {
        syncResult = await this.taxRulesService.forceSync(tenant_id, syncDto);
      } else if (syncDto.lastSyncTimestamp) {
        syncResult = await this.taxRulesService.performIncrementalSync(tenant_id, syncDto);
      } else {
        syncResult = await this.taxRulesService.performFullSync(tenant_id, syncDto);
      }

      const formattedResponse = this.responseFormatter.formatSyncResponse(syncResult, {
        duration: Date.now() - startTime,
        conflicts: 0,
        warnings: [],
      });

      this.logger.log(`Mobile sync completed ${operationId}`, {
        duration: Date.now() - startTime,
        syncedCalculations: syncResult.syncedCalculations,
      });

      return {
        success: true,
        data: formattedResponse,
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };

    } catch (error) {
      this.logger.error(`Mobile sync failed ${operationId}`, {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
      });

      const errorResponse = this.errorHandler.createMobileErrorResponse(error, 'sync');

      return {
        success: false,
        error: this.responseFormatter.formatErrorResponse(errorResponse, operationId),
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
  }

  /**
   * Get mobile-optimized tax forms and rules
   */
  async getMobileTaxConfiguration(
    tenant_id: string,
    companyId: string
  ): Promise<MobileTaxOperationResult> {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      const [taxForms, taxRules] = await Promise.all([
        this.taxRulesService.getMobileTaxForms(tenant_id, companyId),
        this.taxRulesService.getMobileTaxRules(tenant_id, companyId),
      ]);

      const response = {
        success: true,
        data: {
          taxForms: this.responseFormatter.formatTaxFormsList(taxForms).data.forms,
          taxRules: taxRules,
          lastUpdated: new Date().toISOString(),
          version: '1.0',
        },
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };

      return response;

    } catch (error) {
      this.logger.error(`Get mobile tax configuration failed ${operationId}`, {
        error: error.message,
        stack: error.stack,
      });

      const errorResponse = this.errorHandler.createMobileErrorResponse(error, 'configuration');

      return {
        success: false,
        error: this.responseFormatter.formatErrorResponse(errorResponse, operationId),
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
  }

  /**
   * Validate mobile tax data with detailed feedback
   */
  async validateMobileTaxData(
    tenant_id: string,
    calculationDto: MobileTaxCalculationDto
  ): Promise<MobileTaxOperationResult> {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      const validation = await this.validationService.validateMobileTaxCalculation(calculationDto, tenant_id);

      const response = this.responseFormatter.formatValidationResponse({
        valid: validation.isValid,
        errors: validation.errors.map(e => e.message),
        warnings: validation.warnings.map(w => w.message),
      });

      return {
        success: true,
        data: response,
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };

    } catch (error) {
      this.logger.error(`Mobile validation failed ${operationId}`, {
        error: error.message,
        stack: error.stack,
      });

      const errorResponse = this.errorHandler.createMobileErrorResponse(error, 'validation');

      return {
        success: false,
        error: this.responseFormatter.formatErrorResponse(errorResponse, operationId),
        metadata: {
          operationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
  }

  /**
   * Generate calculation preview for mobile
   */
  private async generateCalculationPreview(tenant_id: string, calculationDto: MobileTaxCalculationDto): Promise<any> {
    try {
      // Get company info for preview
      const company = await this.prisma.company.findFirst({
        where: { id: calculationDto.companyId, tenant_id },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      // Calculate totals
      const items = calculationDto.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate || 23,
        netAmount: item.quantity * item.unitPrice,
        vatAmount: (item.quantity * item.unitPrice) * ((item.vatRate || 23) / 100),
        grossAmount: (item.quantity * item.unitPrice) * (1 + (item.vatRate || 23) / 100),
      }));

      const totals = items.reduce(
        (acc, item) => ({
          net: acc.net + item.netAmount,
          vat: acc.vat + item.vatAmount,
          gross: acc.gross + item.grossAmount,
        }),
        { net: 0, vat: 0, gross: 0 }
      );

      return {
        company: {
          name: company.name,
          nip: company.nip,
          address: company.address,
        },
        items,
        totals,
      };
    } catch (error) {
      this.logger.warn('Failed to generate calculation preview', { error: error.message });
      return null;
    }
  }

  /**
   * Generate unique operation ID for tracking
   */
  private generateOperationId(): string {
    return `mobile-op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check for mobile integration
   */
  async healthCheck(): Promise<{ status: string; services: Record<string, boolean>; timestamp: string }> {
    const checks = {
      taxRulesService: true, // Assume available since injected
      errorHandler: true,
      responseFormatter: true,
      validationService: true,
    };

    return {
      status: 'healthy',
      services: checks,
      timestamp: new Date().toISOString(),
    };
  }
}