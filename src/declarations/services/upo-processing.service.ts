import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as xml2js from 'xml2js';

export interface UPOData {
  upoNumber: string;
  confirmationDate: string;
  declarationId: string;
  taxpayerNIP: string;
  taxOfficeCode: string;
  formCode: string;
  period: string;
  amount?: number;
  status: string;
  xmlContent: string;
  signature?: string;
}

export interface UPOValidationResult {
  isValid: boolean;
  upoNumber?: string;
  confirmationDate?: string;
  errors: string[];
  warnings: string[];
  details?: {
    taxpayerNIP: string;
    taxOfficeCode: string;
    formCode: string;
    period: string;
    amount?: number;
  };
}

export interface UPOStorageResult {
  success: boolean;
  upoId?: string;
  error?: string;
}

@Injectable()
export class UPOProcessingService {
  private readonly logger = new Logger(UPOProcessingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Process and validate UPO from e-Deklaracje response
   */
  async processUPO(upoXml: string, declarationId: string): Promise<UPOValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.log(`Processing UPO for declaration ${declarationId}`);

      // Parse UPO XML
      const upoData = await this.parseUPOXML(upoXml);

      // Validate UPO structure
      const structureValidation = this.validateUPOStructure(upoData);
      if (!structureValidation.isValid) {
        errors.push(...structureValidation.errors);
      }
      warnings.push(...structureValidation.warnings);

      // Validate UPO signature if present
      if (upoData.signature) {
        const signatureValidation = await this.validateUPOSignature(upoData);
        if (!signatureValidation.isValid) {
          errors.push(...signatureValidation.errors);
        }
      } else {
        warnings.push('UPO does not contain digital signature');
      }

      // Validate UPO against declaration data
      const declarationValidation = await this.validateUPOAgainstDeclaration(upoData, declarationId);
      if (!declarationValidation.isValid) {
        errors.push(...declarationValidation.errors);
      }
      warnings.push(...declarationValidation.warnings);

      // Check for duplicate UPO
      const duplicateCheck = await this.checkDuplicateUPO(upoData.upoNumber);
      if (duplicateCheck.exists) {
        warnings.push(`UPO ${upoData.upoNumber} already exists in database`);
      }

      const isValid = errors.length === 0;

      if (isValid) {
        this.logger.log(`UPO ${upoData.upoNumber} validated successfully`);
      } else {
        this.logger.error(`UPO validation failed: ${errors.join(', ')}`);
      }

      return {
        isValid,
        upoNumber: upoData.upoNumber,
        confirmationDate: upoData.confirmationDate,
        errors,
        warnings,
        details: {
          taxpayerNIP: upoData.taxpayerNIP,
          taxOfficeCode: upoData.taxOfficeCode,
          formCode: upoData.formCode,
          period: upoData.period,
          amount: upoData.amount
        }
      };
    } catch (error) {
      this.logger.error(`Failed to process UPO for declaration ${declarationId}:`, error);
      errors.push(error.message || 'UPO processing failed');

      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Parse UPO XML content
   */
  private async parseUPOXML(upoXml: string): Promise<UPOData> {
    try {
      const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        trim: true
      });

      const parsed = await parser.parseStringPromise(upoXml);

      // Extract UPO data based on Polish tax authority XML structure
      const potw = parsed?.DeklaracjaPotwierdzenie?.Potwierdzenie;
      const header = parsed?.DeklaracjaPotwierdzenie?.Naglowek;

      if (!potw || !header) {
        throw new BadRequestException('Invalid UPO XML structure');
      }

      return {
        upoNumber: potw.NumerPotwierdzenia,
        confirmationDate: potw.DataPotwierdzenia,
        declarationId: potw.IdentyfikatorDeklaracji,
        taxpayerNIP: header.Podmiot?.NIP || header.Podmiot?.PESEL,
        taxOfficeCode: header.KodUrzedu,
        formCode: header.KodFormularza,
        period: header.Okres,
        amount: header.Kwota ? parseFloat(header.Kwota) : undefined,
        status: potw.Status,
        xmlContent: upoXml,
        signature: parsed?.DeklaracjaPotwierdzenie?.Podpis
      };
    } catch (error) {
      this.logger.error('Failed to parse UPO XML:', error);
      throw new BadRequestException('Invalid UPO XML format');
    }
  }

  /**
   * Validate UPO structure
   */
  private validateUPOStructure(upoData: UPOData): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate UPO number format (32 alphanumeric characters)
    if (!/^[A-Z0-9]{32}$/.test(upoData.upoNumber)) {
      errors.push('Invalid UPO number format');
    }

    // Validate confirmation date
    const confirmationDate = new Date(upoData.confirmationDate);
    if (isNaN(confirmationDate.getTime())) {
      errors.push('Invalid confirmation date format');
    } else {
      // Check if confirmation date is reasonable (not too far in future/past)
      const now = new Date();
      const maxDaysDiff = 30;

      if (Math.abs(now.getTime() - confirmationDate.getTime()) > maxDaysDiff * 24 * 60 * 60 * 1000) {
        warnings.push('Confirmation date seems unusual');
      }
    }

    // Validate taxpayer identification
    if (!upoData.taxpayerNIP || (!/^\d{10}$/.test(upoData.taxpayerNIP) && !/^\d{11}$/.test(upoData.taxpayerNIP))) {
      errors.push('Invalid taxpayer NIP format');
    }

    // Validate tax office code
    if (!upoData.taxOfficeCode || !/^\d{4}$/.test(upoData.taxOfficeCode)) {
      errors.push('Invalid tax office code format');
    }

    // Validate form code
    const validFormCodes = ['JPK_V7M', 'JPK_V7K', 'VAT-7', 'PIT-36', 'PIT-37', 'CIT-8', 'VAT-UE'];
    if (!upoData.formCode || !validFormCodes.includes(upoData.formCode)) {
      errors.push('Invalid or unsupported form code');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate UPO digital signature
   */
  private async validateUPOSignature(upoData: UPOData): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (!upoData.signature) {
        return {
          isValid: false,
          errors: ['No signature found in UPO'],
          warnings: []
        };
      }

      // In a real implementation, you would:
      // 1. Extract the signature from the XML
      // 2. Verify the certificate chain
      // 3. Validate the signature against the document content
      // 4. Check certificate revocation status

      // For now, we'll do basic validation
      if (typeof upoData.signature !== 'string' || upoData.signature.length < 100) {
        errors.push('Invalid signature format');
      }

      // Mock signature validation - in real implementation use proper crypto validation
      const isValidSignature = await this.mockSignatureValidation(upoData);

      if (!isValidSignature) {
        errors.push('Digital signature verification failed');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      this.logger.error('Signature validation error:', error);
      errors.push('Signature validation failed');

      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Mock signature validation (replace with proper implementation)
   */
  private async mockSignatureValidation(upoData: UPOData): Promise<boolean> {
    // In real implementation, this would verify the actual digital signature
    // For now, we'll just check if signature exists and has reasonable length
    return Boolean(upoData.signature && upoData.signature.length > 100);
  }

  /**
   * Validate UPO against declaration data
   */
  private async validateUPOAgainstDeclaration(
    upoData: UPOData,
    declarationId: string
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get declaration from database
      const declaration = await this.prisma.declaration.findUnique({
        where: { id: declarationId },
        include: { company: true }
      });

      if (!declaration) {
        errors.push('Declaration not found');
        return { isValid: false, errors, warnings };
      }

      // Validate taxpayer NIP matches company
      if (declaration.company.nip && upoData.taxpayerNIP !== declaration.company.nip) {
        errors.push('UPO taxpayer NIP does not match declaration company NIP');
      }

      // Validate form code matches declaration type
      const expectedFormCode = this.mapDeclarationTypeToFormCode(declaration.type);
      if (upoData.formCode !== expectedFormCode) {
        errors.push(`UPO form code ${upoData.formCode} does not match declaration type ${declaration.type}`);
      }

      // Validate period matches
      if (upoData.period && upoData.period !== declaration.period) {
        warnings.push(`UPO period ${upoData.period} differs from declaration period ${declaration.period}`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      this.logger.error('Declaration validation error:', error);
      errors.push('Failed to validate UPO against declaration');

      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Map declaration type to form code
   */
  private mapDeclarationTypeToFormCode(declarationType: string): string {
    const mapping: { [key: string]: string } = {
      'JPK_V7M': 'JPK_V7M',
      'JPK_V7K': 'JPK_V7K',
      'VAT-7': 'VAT-7',
      'PIT-36': 'PIT-36',
      'PIT-37': 'PIT-37',
      'CIT-8': 'CIT-8',
      'VAT-UE': 'VAT-UE'
    };

    return mapping[declarationType] || declarationType;
  }

  /**
   * Check for duplicate UPO
   */
  private async checkDuplicateUPO(upoNumber: string): Promise<{ exists: boolean; declarationId?: string }> {
    try {
      const existingDeclaration = await this.prisma.declaration.findFirst({
        where: { upoNumber: upoNumber }
      });

      return {
        exists: !!existingDeclaration,
        declarationId: existingDeclaration?.id
      };
    } catch (error) {
      this.logger.error('Duplicate UPO check failed:', error);
      return { exists: false };
    }
  }

  /**
   * Store validated UPO in database
   */
  async storeUPO(upoData: UPOData, declarationId: string): Promise<UPOStorageResult> {
    try {
      this.logger.log(`Storing UPO ${upoData.upoNumber} for declaration ${declarationId}`);

      // Update declaration with UPO information
      await this.prisma.declaration.update({
        where: { id: declarationId },
        data: {
          upoNumber: upoData.upoNumber,
          upoDate: new Date(upoData.confirmationDate),
          status: 'submitted',
          submittedAt: new Date()
        }
      });

      // Create UPO record for audit trail
      const upoRecord = await this.prisma.officialCommunication.create({
        data: {
          tenant_id: '', // This should come from the request context
          company_id: '', // This should come from the declaration
          type: 'confirmation',
          entityType: 'declaration',
          entityId: declarationId,
          status: 'delivered',
          direction: 'inbound',
          officialBody: 'urzad_skarbowy',
          referenceNumber: upoData.upoNumber,
          upoNumber: upoData.upoNumber,
          description: `UPO for ${upoData.formCode} declaration, period ${upoData.period}`,
          content: {
            taxpayerNIP: upoData.taxpayerNIP,
            taxOfficeCode: upoData.taxOfficeCode,
            formCode: upoData.formCode,
            period: upoData.period,
            amount: upoData.amount,
            confirmationDate: upoData.confirmationDate,
            xmlContent: upoData.xmlContent
          }
        }
      });

      this.logger.log(`UPO ${upoData.upoNumber} stored successfully`);

      return {
        success: true,
        upoId: upoRecord.id
      };
    } catch (error) {
      this.logger.error(`Failed to store UPO ${upoData.upoNumber}:`, error);

      return {
        success: false,
        error: error.message || 'Failed to store UPO'
      };
    }
  }

  /**
   * Get UPO by number
   */
  async getUPOByNumber(upoNumber: string): Promise<UPOData | null> {
    try {
      const communication = await this.prisma.officialCommunication.findFirst({
        where: { upoNumber: upoNumber }
      });

      if (!communication) {
        return null;
      }

      const content = communication.content as any;

      return {
        upoNumber: communication.upoNumber || upoNumber,
        confirmationDate: content.confirmationDate,
        declarationId: communication.entityId,
        taxpayerNIP: content.taxpayerNIP,
        taxOfficeCode: content.taxOfficeCode,
        formCode: content.formCode,
        period: content.period,
        amount: content.amount,
        status: 'confirmed',
        xmlContent: content.xmlContent
      };
    } catch (error) {
      this.logger.error(`Failed to get UPO ${upoNumber}:`, error);
      return null;
    }
  }

  /**
   * Get UPOs for a company
   */
  async getUPOsForCompany(companyId: string, limit: number = 50): Promise<UPOData[]> {
    try {
      const communications = await this.prisma.officialCommunication.findMany({
        where: {
          company_id: companyId,
          upoNumber: { not: null }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      return communications.map(comm => {
        const content = comm.content as any;
        return {
          upoNumber: comm.upoNumber!,
          confirmationDate: content.confirmationDate,
          declarationId: comm.entityId,
          taxpayerNIP: content.taxpayerNIP,
          taxOfficeCode: content.taxOfficeCode,
          formCode: content.formCode,
          period: content.period,
          amount: content.amount,
          status: comm.status,
          xmlContent: content.xmlContent
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get UPOs for company ${companyId}:`, error);
      return [];
    }
  }
}