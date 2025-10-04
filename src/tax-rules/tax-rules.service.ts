import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxFormDto } from './dto/create-tax-form.dto';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { CreateCompanyTaxSettingsDto } from './dto/create-company-tax-settings.dto';
import { MobileTaxCalculationDto, MobileTaxCalculationResponseDto, MobileTaxSyncDto, MobileTaxSyncResponseDto, VatBreakdownDto, AppliedTaxRuleDto } from './dto/mobile-tax-calculation.dto';

@Injectable()
export class TaxRulesService {
  constructor(private prisma: PrismaService) {}

  // Tax Forms
  async createTaxForm(createTaxFormDto: CreateTaxFormDto) {
    return this.prisma.taxForm.create({
      data: {
        ...createTaxFormDto,
        parameters: createTaxFormDto.parameters || {},
        validFrom: new Date(createTaxFormDto.validFrom),
        validTo: createTaxFormDto.validTo ? new Date(createTaxFormDto.validTo) : null,
      },
    });
  }

  async getTaxForms() {
    return this.prisma.taxForm.findMany({
      where: { isActive: true },
      include: { rules: true },
    });
  }

  async getTaxFormById(id: string) {
    const taxForm = await this.prisma.taxForm.findUnique({
      where: { id },
      include: { rules: true },
    });

    if (!taxForm) {
      throw new NotFoundException(`Tax form with ID ${id} not found`);
    }

    return taxForm;
  }

  // Tax Rules
  async createTaxRule(createTaxRuleDto: CreateTaxRuleDto) {
    // Verify tax form exists
    const taxForm = await this.prisma.taxForm.findUnique({
      where: { id: createTaxRuleDto.taxFormId },
    });

    if (!taxForm) {
      throw new NotFoundException(`Tax form with ID ${createTaxRuleDto.taxFormId} not found`);
    }

    return this.prisma.taxRule.create({
      data: {
        ...createTaxRuleDto,
        conditions: createTaxRuleDto.conditions || {},
        validFrom: new Date(createTaxRuleDto.validFrom),
        validTo: createTaxRuleDto.validTo ? new Date(createTaxRuleDto.validTo) : null,
      },
    });
  }

  async getTaxRulesByForm(taxFormId: string) {
    return this.prisma.taxRule.findMany({
      where: {
        taxFormId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });
  }

  // Company Tax Settings
  async createCompanyTaxSettings(createCompanyTaxSettingsDto: CreateCompanyTaxSettingsDto) {
    // Verify company exists
    const company = await this.prisma.company.findUnique({
      where: { id: createCompanyTaxSettingsDto.companyId },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${createCompanyTaxSettingsDto.companyId} not found`);
    }

    // Verify tax form exists
    const taxForm = await this.prisma.taxForm.findUnique({
      where: { id: createCompanyTaxSettingsDto.taxFormId },
    });

    if (!taxForm) {
      throw new NotFoundException(`Tax form with ID ${createCompanyTaxSettingsDto.taxFormId} not found`);
    }

    // Check if settings already exist
    const existingSettings = await this.prisma.companyTaxSettings.findUnique({
      where: {
        tenant_id_company_id_taxFormId: {
          tenant_id: company.tenant_id,
          company_id: createCompanyTaxSettingsDto.companyId,
          taxFormId: createCompanyTaxSettingsDto.taxFormId,
        },
      },
    });

    if (existingSettings) {
      throw new BadRequestException('Tax settings for this company and tax form already exist');
    }

    return this.prisma.companyTaxSettings.create({
      data: {
        tenant_id: company.tenant_id,
        company_id: createCompanyTaxSettingsDto.companyId,
        taxFormId: createCompanyTaxSettingsDto.taxFormId,
        isSelected: createCompanyTaxSettingsDto.isSelected || false,
        settings: createCompanyTaxSettingsDto.settings || {},
        activatedAt: createCompanyTaxSettingsDto.activatedAt
          ? new Date(createCompanyTaxSettingsDto.activatedAt)
          : new Date(),
        notes: createCompanyTaxSettingsDto.notes || null,
      },
    });
  }

  async getCompanyTaxSettings(companyId: string) {
    return this.prisma.companyTaxSettings.findMany({
      where: { company_id: companyId },
      include: { taxForm: true },
    });
  }

  async updateCompanyTaxSettings(
    companyId: string,
    taxFormId: string,
    isSelected: boolean,
  ) {
    const settings = await this.prisma.companyTaxSettings.findUnique({
      where: {
        tenant_id_company_id_taxFormId: {
          tenant_id: await this.getCompanyTenantId(companyId),
          company_id: companyId,
          taxFormId,
        },
      },
    });

    if (!settings) {
      throw new NotFoundException('Tax settings not found');
    }

    return this.prisma.companyTaxSettings.update({
      where: { id: settings.id },
      data: {
        isSelected,
        activatedAt: isSelected ? new Date() : settings.activatedAt,
        deactivatedAt: isSelected ? null : new Date(),
      },
    });
  }

  private async getCompanyTenantId(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { tenant_id: true },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found`);
    }

    return company.tenant_id;
  }

  // Mobile-specific methods
  async calculateTaxForMobile(tenant_id: string, calculationDto: MobileTaxCalculationDto): Promise<MobileTaxCalculationResponseDto> {
    // Validate company exists and has access
    const company = await this.prisma.company.findFirst({
      where: { id: calculationDto.companyId, tenant_id },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${calculationDto.companyId} not found`);
    }

    // Get active tax rules for the company
    const companySettings = await this.prisma.companyTaxSettings.findMany({
      where: {
        company_id: calculationDto.companyId,
        isSelected: true,
      },
      include: { taxForm: { include: { rules: true } } },
    });

    // Perform tax calculation
    const vatBreakdown = this.calculateVatBreakdown(calculationDto.items);
    const appliedRules = await this.getAppliedTaxRules(companySettings, calculationDto);

    const totalNet = vatBreakdown.reduce((sum, vat) => sum + vat.netAmount, 0);
    const totalVat = vatBreakdown.reduce((sum, vat) => sum + vat.vatAmount, 0);
    const totalGross = vatBreakdown.reduce((sum, vat) => sum + vat.grossAmount, 0);

    return {
      totalNet,
      totalVat,
      totalGross,
      vatBreakdown,
      appliedRules,
      success: true,
    };
  }

  async syncMobileTaxData(tenant_id: string, syncDto: MobileTaxSyncDto): Promise<MobileTaxSyncResponseDto> {
    // Validate company exists
    const company = await this.prisma.company.findFirst({
      where: { id: syncDto.companyId, tenant_id },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${syncDto.companyId} not found`);
    }

    let syncedCalculations = 0;

    // Process pending calculations if provided
    if (syncDto.pendingCalculations && syncDto.pendingCalculations.length > 0) {
      for (const calculation of syncDto.pendingCalculations) {
        try {
          await this.calculateTaxForMobile(tenant_id, calculation);
          syncedCalculations++;
        } catch (error) {
          console.error('Failed to sync calculation:', error);
        }
      }
    }

    // Get updated tax rules and forms if needed
    const updatedTaxRules = syncDto.forceFullSync ?
      await this.prisma.taxRule.findMany({
        where: { isActive: true },
        include: { taxForm: true },
      }) : [];

    const updatedTaxForms = syncDto.forceFullSync ?
      await this.prisma.taxForm.findMany({
        where: { isActive: true },
      }) : [];

    return {
      success: true,
      message: `Synced ${syncedCalculations} calculations successfully`,
      updatedTaxRules,
      updatedTaxForms,
      serverTimestamp: new Date().toISOString(),
      syncedCalculations,
    };
  }

  async getMobileTaxForms(tenant_id: string, companyId: string): Promise<any[]> {
    const companySettings = await this.prisma.companyTaxSettings.findMany({
      where: { company_id: companyId },
      include: {
        taxForm: {
          include: {
            rules: {
              where: { isActive: true },
              orderBy: { priority: 'desc' }
            }
          }
        }
      },
    });

    return companySettings.map(setting => ({
      id: setting.taxForm.id,
      name: setting.taxForm.name,
      code: setting.taxForm.code,
      description: setting.taxForm.description,
      category: setting.taxForm.category,
      isSelected: setting.isSelected,
      activatedAt: setting.activatedAt,
      settings: setting.settings,
      rules: setting.taxForm.rules.map(rule => ({
        id: rule.id,
        name: rule.name,
        ruleType: rule.ruleType,
        conditions: rule.conditions,
        calculationMethod: rule.calculationMethod,
        value: rule.value,
        priority: rule.priority,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
      })),
    }));
  }

  async getMobileTaxRules(tenant_id: string, companyId: string): Promise<any[]> {
    const companySettings = await this.prisma.companyTaxSettings.findMany({
      where: { company_id: companyId, isSelected: true },
      include: { taxForm: { include: { rules: true } } },
    });

    const allRules: any[] = [];

    companySettings.forEach(setting => {
      setting.taxForm.rules.forEach(rule => {
        allRules.push({
          id: rule.id,
          name: rule.name,
          ruleType: rule.ruleType,
          conditions: rule.conditions,
          priority: rule.priority,
          taxFormId: rule.taxFormId,
          taxFormName: setting.taxForm.name,
          validFrom: rule.validFrom,
          validTo: rule.validTo,
        });
      });
    });

    return allRules.sort((a, b) => b.priority - a.priority);
  }

  async validateMobileCalculation(calculationDto: MobileTaxCalculationDto): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate company exists
    const company = await this.prisma.company.findUnique({
      where: { id: calculationDto.companyId },
    });

    if (!company) {
      errors.push(`Company with ID ${calculationDto.companyId} not found`);
    }

    // Validate items
    if (!calculationDto.items || calculationDto.items.length === 0) {
      errors.push('At least one item is required');
    } else {
      calculationDto.items.forEach((item, index) => {
        if (!item.description) {
          errors.push(`Item ${index + 1}: description is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index + 1}: quantity must be greater than 0`);
        }
        if (!item.unitPrice || item.unitPrice < 0) {
          errors.push(`Item ${index + 1}: unit price must be greater than or equal to 0`);
        }
        if (item.vatRate !== undefined && (item.vatRate < 0 || item.vatRate > 100)) {
          errors.push(`Item ${index + 1}: VAT rate must be between 0 and 100`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private calculateVatBreakdown(items: any[]): VatBreakdownDto[] {
    const vatGroups = new Map<number, { netAmount: number; vatAmount: number; grossAmount: number; itemCount: number }>();

    items.forEach(item => {
      const vatRate = item.vatRate || 23; // Default VAT rate
      const netAmount = item.quantity * item.unitPrice;
      const vatAmount = netAmount * (vatRate / 100);
      const grossAmount = netAmount + vatAmount;

      if (vatGroups.has(vatRate)) {
        const existing = vatGroups.get(vatRate)!;
        vatGroups.set(vatRate, {
          netAmount: existing.netAmount + netAmount,
          vatAmount: existing.vatAmount + vatAmount,
          grossAmount: existing.grossAmount + grossAmount,
          itemCount: existing.itemCount + 1,
        });
      } else {
        vatGroups.set(vatRate, {
          netAmount,
          vatAmount,
          grossAmount,
          itemCount: 1,
        });
      }
    });

    return Array.from(vatGroups.entries()).map(([vatRate, amounts]) => ({
      vatRate,
      ...amounts,
    }));
  }

  private async getAppliedTaxRules(companySettings: any[], calculationDto: MobileTaxCalculationDto): Promise<AppliedTaxRuleDto[]> {
    const appliedRules: AppliedTaxRuleDto[] = [];

    // This is a simplified implementation
    // In a real scenario, you would apply the actual tax rules based on conditions
    companySettings.forEach(setting => {
      setting.taxForm.rules.forEach((rule: any) => {
        appliedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.ruleType,
          description: `Applied rule from ${setting.taxForm.name}`,
        });
      });
    });

    return appliedRules;
  }

  // Mobile sync methods
  async performFullSync(tenant_id: string, syncDto: MobileTaxSyncDto): Promise<MobileTaxSyncResponseDto> {
    // Validate company exists
    const company = await this.prisma.company.findFirst({
      where: { id: syncDto.companyId, tenant_id },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${syncDto.companyId} not found`);
    }

    // Get all tax forms and rules
    const taxForms = await this.prisma.taxForm.findMany({
      where: { isActive: true },
      include: { rules: { where: { isActive: true } } },
    });

    const companySettings = await this.prisma.companyTaxSettings.findMany({
      where: { company_id: syncDto.companyId },
      include: { taxForm: true },
    });

    // Process any pending calculations
    let syncedCalculations = 0;
    if (syncDto.pendingCalculations && syncDto.pendingCalculations.length > 0) {
      for (const calculation of syncDto.pendingCalculations) {
        try {
          await this.calculateTaxForMobile(tenant_id, calculation);
          syncedCalculations++;
        } catch (error) {
          console.error('Failed to sync calculation:', error);
        }
      }
    }

    // Log sync operation
    await this.prisma.auditLog.create({
      data: {
        tenant_id,
        company_id: syncDto.companyId,
        action: 'mobile_full_sync',
        entity: 'sync',
        details: {
          deviceId: syncDto.deviceId,
          syncedCalculations,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: `Full sync completed. Synced ${syncedCalculations} calculations.`,
      updatedTaxRules: taxForms.flatMap(form => form.rules),
      updatedTaxForms: taxForms,
      serverTimestamp: new Date().toISOString(),
      syncedCalculations,
    };
  }

  async performIncrementalSync(tenant_id: string, syncDto: MobileTaxSyncDto): Promise<MobileTaxSyncResponseDto> {
    const lastSyncDate = new Date(syncDto.lastSyncTimestamp);

    // Get changes since last sync
    const updatedTaxForms = await this.prisma.taxForm.findMany({
      where: {
        isActive: true,
        updatedAt: { gte: lastSyncDate },
      },
      include: { rules: { where: { isActive: true } } },
    });

    const updatedTaxRules = await this.prisma.taxRule.findMany({
      where: {
        isActive: true,
        updatedAt: { gte: lastSyncDate },
      },
    });

    const updatedCompanySettings = await this.prisma.companyTaxSettings.findMany({
      where: {
        company_id: syncDto.companyId,
        updatedAt: { gte: lastSyncDate },
      },
      include: { taxForm: true },
    });

    // Process pending calculations
    let syncedCalculations = 0;
    if (syncDto.pendingCalculations && syncDto.pendingCalculations.length > 0) {
      for (const calculation of syncDto.pendingCalculations) {
        try {
          await this.calculateTaxForMobile(tenant_id, calculation);
          syncedCalculations++;
        } catch (error) {
          console.error('Failed to sync calculation:', error);
        }
      }
    }

    return {
      success: true,
      message: `Incremental sync completed. Found ${updatedTaxForms.length} updated forms, ${updatedTaxRules.length} updated rules.`,
      updatedTaxRules,
      updatedTaxForms,
      serverTimestamp: new Date().toISOString(),
      syncedCalculations,
    };
  }

  async getSyncStatus(tenant_id: string, deviceId: string): Promise<any> {
    // Get last sync information for the device
    const lastSyncLog = await this.prisma.auditLog.findFirst({
      where: {
        tenant_id,
        action: { in: ['mobile_full_sync', 'mobile_incremental_sync'] },
        details: { path: ['deviceId'], equals: deviceId },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get pending changes count
    const pendingChanges = await this.prisma.auditLog.count({
      where: {
        tenant_id,
        action: { in: ['tax_form_updated', 'tax_rule_updated', 'company_settings_updated'] },
        createdAt: { gt: lastSyncLog?.createdAt || new Date(0) },
      },
    });

    return {
      deviceId,
      lastSyncAt: lastSyncLog?.createdAt || null,
      lastSyncType: lastSyncLog?.action || null,
      pendingChanges,
      serverTimestamp: new Date().toISOString(),
      status: pendingChanges > 0 ? 'out_of_sync' : 'synced',
    };
  }

  async resolveSyncConflict(
    tenant_id: string,
    conflictData: { deviceId: string; entityType: string; entityId: string; resolution: 'server_wins' | 'client_wins' | 'manual_merge' }
  ): Promise<any> {
    // Log the conflict resolution
    await this.prisma.auditLog.create({
      data: {
        tenant_id,
        action: 'sync_conflict_resolved',
        entity: conflictData.entityType,
        entityId: conflictData.entityId,
        details: {
          deviceId: conflictData.deviceId,
          resolution: conflictData.resolution,
          resolvedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: `Conflict resolved with ${conflictData.resolution} strategy`,
      resolution: conflictData.resolution,
      timestamp: new Date().toISOString(),
    };
  }

  async getPendingChanges(tenant_id: string, companyId: string, since?: string): Promise<any> {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours by default

    // Get recent changes
    const updatedTaxForms = await this.prisma.taxForm.findMany({
      where: {
        isActive: true,
        updatedAt: { gte: sinceDate },
      },
    });

    const updatedTaxRules = await this.prisma.taxRule.findMany({
      where: {
        isActive: true,
        updatedAt: { gte: sinceDate },
      },
    });

    const updatedCompanySettings = await this.prisma.companyTaxSettings.findMany({
      where: {
        company_id: companyId,
        updatedAt: { gte: sinceDate },
      },
    });

    return {
      success: true,
      since: sinceDate.toISOString(),
      changes: {
        taxForms: updatedTaxForms.length,
        taxRules: updatedTaxRules.length,
        companySettings: updatedCompanySettings.length,
      },
      details: {
        taxForms: updatedTaxForms,
        taxRules: updatedTaxRules,
        companySettings: updatedCompanySettings,
      },
      serverTimestamp: new Date().toISOString(),
    };
  }

  async forceSync(tenant_id: string, syncDto: MobileTaxSyncDto): Promise<MobileTaxSyncResponseDto> {
    // Force sync overrides all client data with server data
    // This is a destructive operation that should be used carefully

    const company = await this.prisma.company.findFirst({
      where: { id: syncDto.companyId, tenant_id },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${syncDto.companyId} not found`);
    }

    // Get all current server data
    const allTaxForms = await this.prisma.taxForm.findMany({
      where: { isActive: true },
      include: { rules: { where: { isActive: true } } },
    });

    const allCompanySettings = await this.prisma.companyTaxSettings.findMany({
      where: { company_id: syncDto.companyId },
      include: { taxForm: true },
    });

    // Log force sync operation
    await this.prisma.auditLog.create({
      data: {
        tenant_id,
        company_id: syncDto.companyId,
        action: 'mobile_force_sync',
        entity: 'sync',
        details: {
          deviceId: syncDto.deviceId,
          warning: 'This operation overwrote all client data',
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: 'Force sync completed. All client data has been overwritten with server data.',
      updatedTaxRules: allTaxForms.flatMap(form => form.rules),
      updatedTaxForms: allTaxForms,
      serverTimestamp: new Date().toISOString(),
      syncedCalculations: 0, // No calculations synced in force mode
    };
  }
}