import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SmartDefaultsDto, SmartDefaultsResponseDto, WorkflowType } from '../dto/workflow.dto';

@Injectable()
export class SmartDefaultsEngineService {
  private readonly logger = new Logger(SmartDefaultsEngineService.name);

  constructor(private prisma: PrismaService) {}

  async getSmartDefaults(smartDefaultsDto: SmartDefaultsDto): Promise<SmartDefaultsResponseDto> {
    const { tenant_id, companyId, workflowType, context } = smartDefaultsDto;

    this.logger.log(`Generating smart defaults for workflow type ${workflowType} in tenant ${tenant_id}`);

    let defaults: Record<string, any> = {};
    let suggestions: string[] = [];
    let confidence = 'medium';

    switch (workflowType) {
      case WorkflowType.INVOICE_CREATION:
        ({ defaults, suggestions, confidence } = await this.getInvoiceCreationDefaults(tenant_id, companyId, context));
        break;
      case WorkflowType.TAX_CALCULATION:
        ({ defaults, suggestions, confidence } = await this.getTaxCalculationDefaults(tenant_id, companyId, context));
        break;
      case WorkflowType.KSEF_SUBMISSION:
        ({ defaults, suggestions, confidence } = await this.getKSeFSubmissionDefaults(tenant_id, companyId, context));
        break;
      case WorkflowType.CUSTOMER_ONBOARDING:
        ({ defaults, suggestions, confidence } = await this.getCustomerOnboardingDefaults(tenant_id, companyId, context));
        break;
      default:
        defaults = {};
        suggestions = ['Please specify workflow type for better defaults'];
        confidence = 'low';
    }

    return {
      defaults,
      suggestions,
      confidence,
    };
  }

  private async getInvoiceCreationDefaults(tenant_id: string, companyId: string, context?: any): Promise<{
    defaults: Record<string, any>;
    suggestions: string[];
    confidence: string;
  }> {
    const defaults: Record<string, any> = {};
    const suggestions: string[] = [];
    let confidence = 'medium';

    // Get company information
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenant_id },
    });

    if (!company) {
      return { defaults: {}, suggestions: ['Company not found'], confidence: 'low' };
    }

    // Get historical invoice data for patterns
    const recentInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id,
        company_id: companyId,
      },
      include: {
        items: true,
        buyer: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Analyze payment terms patterns
    const paymentTerms = this.analyzePaymentTerms(recentInvoices);
    if (paymentTerms.mostCommon) {
      defaults.paymentTerms = paymentTerms.mostCommon;
      defaults.dueDate = this.calculateDueDate(paymentTerms.mostCommon);
      suggestions.push(`Based on your history, ${paymentTerms.mostCommon} day payment terms are most common`);
    }

    // Analyze currency patterns
    const currencies = this.analyzeCurrencies(recentInvoices);
    if (currencies.mostCommon) {
      defaults.currency = currencies.mostCommon;
      if (currencies.mostCommon !== 'PLN') {
        suggestions.push('Consider PLN for domestic transactions to avoid currency conversion fees');
      }
    }

    // Analyze VAT rates
    const vatRates = this.analyzeVatRates(recentInvoices);
    defaults.commonVatRates = vatRates;

    // Analyze buyer patterns
    if (context?.buyerNip) {
      const buyerDefaults = await this.getBuyerDefaults(tenant_id, context.buyerNip);
      if (buyerDefaults) {
        Object.assign(defaults, buyerDefaults);
        suggestions.push('Pre-filled buyer information based on previous transactions');
        confidence = 'high';
      }
    }

    // Analyze seasonal patterns
    const seasonalDefaults = this.analyzeSeasonalPatterns(recentInvoices);
    if (seasonalDefaults) {
      Object.assign(defaults, seasonalDefaults);
      suggestions.push('Applied seasonal adjustments based on historical data');
    }

    // Tax compliance defaults
    defaults.taxCompliance = {
      requireKSeF: true,
      validateNIP: true,
      checkGTU: true,
      requireApproval: recentInvoices.length > 10, // Require approval for established businesses
    };

    return { defaults, suggestions, confidence };
  }

  private async getTaxCalculationDefaults(tenant_id: string, companyId: string, context?: any): Promise<{
    defaults: Record<string, any>;
    suggestions: string[];
    confidence: string;
  }> {
    const defaults: Record<string, any> = {};
    const suggestions: string[] = [];
    let confidence = 'medium';

    // Get company tax settings
    const taxSettings = await this.prisma.companyTaxSettings.findMany({
      where: {
        company_id: companyId,
        isSelected: true,
      },
      include: { taxForm: true },
    });

    if (taxSettings.length === 0) {
      suggestions.push('No tax forms selected - please configure tax settings first');
      return { defaults, suggestions, confidence: 'low' };
    }

    // Get historical tax calculations
    const recentCalculations = await this.prisma.taxCalculation.findMany({
      where: {
        tenant_id,
        company_id: companyId,
      },
      orderBy: { createdAt: 'desc' },
      take: 12, // Last 12 months
    });

    // Analyze tax form preferences
    const preferredForms = taxSettings.map(setting => ({
      code: setting.taxForm.code,
      name: setting.taxForm.name,
      settings: setting.settings,
    }));
    defaults.preferredTaxForms = preferredForms;

    // Analyze calculation patterns
    if (recentCalculations.length > 0) {
      const avgTaxRate = recentCalculations.reduce((sum, calc) => sum + (calc.taxDue / calc.taxableIncome), 0) / recentCalculations.length;
      defaults.expectedTaxRate = Math.round(avgTaxRate * 10000) / 100; // Round to 2 decimal places

      const avgAdvance = recentCalculations.reduce((sum, calc) => sum + calc.advanceToPay, 0) / recentCalculations.length;
      defaults.expectedAdvancePayment = Math.round(avgAdvance);

      suggestions.push(`Based on your history, expect approximately ${defaults.expectedTaxRate}% tax rate`);
      confidence = 'high';
    }

    // Seasonal tax patterns
    const seasonalAdjustments = this.analyzeTaxSeasonalPatterns(recentCalculations);
    if (seasonalAdjustments) {
      defaults.seasonalAdjustments = seasonalAdjustments;
      suggestions.push('Applied seasonal tax adjustments based on historical patterns');
    }

    // Compliance defaults
    defaults.complianceChecks = {
      validateAmounts: true,
      checkDeadlines: true,
      requireDocumentation: true,
      autoCalculateAdvances: true,
    };

    return { defaults, suggestions, confidence };
  }

  private async getKSeFSubmissionDefaults(tenant_id: string, companyId: string, context?: any): Promise<{
    defaults: Record<string, any>;
    suggestions: string[];
    confidence: string;
  }> {
    const defaults: Record<string, any> = {};
    const suggestions: string[] = [];
    let confidence = 'medium';

    // Get KSeF submission history
    const recentSubmissions = await this.prisma.invoice.findMany({
      where: {
        tenant_id,
        company_id: companyId,
        ksefStatus: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Analyze submission success rate
    const successfulSubmissions = recentSubmissions.filter(inv => inv.ksefStatus === 'confirmed').length;
    const successRate = recentSubmissions.length > 0 ? (successfulSubmissions / recentSubmissions.length) * 100 : 0;

    if (successRate > 95) {
      defaults.autoSubmit = true;
      suggestions.push('High success rate detected - enabling automatic KSeF submission');
      confidence = 'high';
    } else if (successRate < 80) {
      defaults.autoSubmit = false;
      suggestions.push('Lower success rate detected - manual review recommended before submission');
      confidence = 'medium';
    }

    // Analyze submission timing patterns
    const submissionTimes = this.analyzeSubmissionTiming(recentSubmissions);
    if (submissionTimes.optimalTime) {
      defaults.preferredSubmissionTime = submissionTimes.optimalTime;
      suggestions.push(`Optimal submission time: ${submissionTimes.optimalTime}`);
    }

    // Environment defaults
    defaults.environment = recentSubmissions.some(inv => inv.ksefStatus === 'confirmed') ? 'production' : 'test';
    if (defaults.environment === 'test') {
      suggestions.push('Using test environment - switch to production when ready');
    }

    // Retry configuration
    defaults.retryConfig = {
      maxRetries: successRate > 90 ? 2 : 3,
      retryDelay: 300000, // 5 minutes
      exponentialBackoff: true,
    };

    // Validation defaults
    defaults.validationRules = {
      checkSchema: true,
      validateNIP: true,
      verifyAmounts: true,
      checkDuplicates: true,
    };

    return { defaults, suggestions, confidence };
  }

  private async getCustomerOnboardingDefaults(tenant_id: string, companyId: string, context?: any): Promise<{
    defaults: Record<string, any>;
    suggestions: string[];
    confidence: string;
  }> {
    const defaults: Record<string, any> = {};
    const suggestions: string[] = [];
    let confidence = 'medium';

    // Get existing customers for pattern analysis
    const existingCustomers = await this.prisma.buyer.findMany({
      where: { tenant_id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Analyze customer types
    const customerTypes = this.analyzeCustomerTypes(existingCustomers);
    defaults.customerType = customerTypes.mostCommon || 'individual';

    // Analyze required documents
    const documentRequirements = this.analyzeDocumentRequirements(existingCustomers);
    defaults.requiredDocuments = documentRequirements;

    // Tax settings defaults
    const taxDefaults = await this.getTaxSettingsDefaults(tenant_id, companyId);
    defaults.taxSettings = taxDefaults;

    // Communication preferences
    defaults.communicationPrefs = {
      emailInvoices: true,
      emailReminders: true,
      language: 'pl', // Default to Polish
    };

    // Risk assessment defaults
    defaults.riskLevel = 'medium';
    defaults.requireApproval = existingCustomers.length > 50; // Require approval for larger customer bases

    if (context?.customerType === 'business') {
      defaults.requireNIP = true;
      defaults.requireREGON = true;
      defaults.checkVATStatus = true;
      suggestions.push('Business customer - additional verification required');
      confidence = 'high';
    }

    return { defaults, suggestions, confidence };
  }

  // Helper methods for analysis
  private analyzePaymentTerms(invoices: any[]): { mostCommon?: number; average?: number } {
    const terms = invoices
      .filter(inv => inv.dueDate && inv.date)
      .map(inv => Math.ceil((new Date(inv.dueDate).getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24)));

    if (terms.length === 0) return {};

    const termCounts = terms.reduce((acc, term) => {
      acc[term] = (acc[term] || 0) + 1;
      return acc;
    }, {});

    const mostCommon = Object.keys(termCounts).reduce((a, b) =>
      termCounts[a] > termCounts[b] ? a : b
    );

    return {
      mostCommon: parseInt(mostCommon),
      average: terms.reduce((sum, term) => sum + term, 0) / terms.length,
    };
  }

  private calculateDueDate(paymentTerms: number): string {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);
    return dueDate.toISOString().split('T')[0];
  }

  private analyzeCurrencies(invoices: any[]): { mostCommon?: string; currencies: string[] } {
    const currencies = invoices.map(inv => 'PLN'); // Assuming all are PLN for now
    const currencyCounts = currencies.reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {});

    const mostCommon = Object.keys(currencyCounts).reduce((a, b) =>
      currencyCounts[a] > currencyCounts[b] ? a : b, 'PLN'
    );

    return {
      mostCommon,
      currencies: Object.keys(currencyCounts),
    };
  }

  private analyzeVatRates(invoices: any[]): number[] {
    const vatRates = new Set<number>();

    invoices.forEach(invoice => {
      invoice.items.forEach((item: any) => {
        vatRates.add(item.vatRate);
      });
    });

    return Array.from(vatRates).sort((a, b) => a - b);
  }

  private async getBuyerDefaults(tenant_id: string, buyerNip: string): Promise<any> {
    const recentInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id,
        buyer: { nip: buyerNip },
      },
      include: { buyer: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recentInvoices.length === 0) return null;

    const buyer = recentInvoices[0].buyer;
    if (!buyer) return null;

    return {
      buyerName: buyer.name,
      buyerNip: buyer.nip,
      buyerAddress: buyer.address,
      buyerCity: buyer.city,
      buyerPostalCode: buyer.postalCode,
      buyerCountry: buyer.country,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone,
    };
  }

  private analyzeSeasonalPatterns(invoices: any[]): any {
    // Simple seasonal analysis - could be enhanced with more sophisticated algorithms
    const currentMonth = new Date().getMonth();
    const seasonalInvoices = invoices.filter(inv => new Date(inv.date).getMonth() === currentMonth);

    if (seasonalInvoices.length < 3) return null;

    const avgAmount = seasonalInvoices.reduce((sum, inv) => sum + inv.totalGross, 0) / seasonalInvoices.length;

    return {
      seasonalMultiplier: 1.0, // Could be calculated based on historical patterns
      expectedAmount: Math.round(avgAmount),
    };
  }

  private analyzeTaxSeasonalPatterns(calculations: any[]): any {
    if (calculations.length < 6) return null;

    const monthlyPatterns = calculations.reduce((acc, calc) => {
      const month = new Date(calc.createdAt).getMonth();
      if (!acc[month]) acc[month] = [];
      acc[month].push(calc);
      return acc;
    }, {});

    // Calculate seasonal adjustments
    const adjustments = {};
    Object.keys(monthlyPatterns).forEach(month => {
      const monthCalcs = monthlyPatterns[month];
      const avgTaxRate = monthCalcs.reduce((sum, calc) => sum + (calc.taxDue / calc.taxableIncome), 0) / monthCalcs.length;
      adjustments[month] = Math.round(avgTaxRate * 10000) / 100;
    });

    return adjustments;
  }

  private analyzeSubmissionTiming(invoices: any[]): { optimalTime?: string } {
    const submissionHours = invoices
      .filter(inv => inv.ksefStatus === 'confirmed')
      .map(inv => new Date(inv.createdAt).getHours());

    if (submissionHours.length < 5) return {};

    // Find most successful hour
    const hourCounts = submissionHours.reduce((acc, hour) => {
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    const optimalHour = Object.keys(hourCounts).reduce((a, b) =>
      hourCounts[a] > hourCounts[b] ? a : b
    );

    return {
      optimalTime: `${optimalHour}:00`,
    };
  }

  private analyzeCustomerTypes(customers: any[]): { mostCommon?: string; types: string[] } {
    // Simple heuristic based on NIP presence
    const types = customers.map(customer => customer.nip ? 'business' : 'individual');
    const typeCounts = types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const mostCommon = Object.keys(typeCounts).reduce((a, b) =>
      typeCounts[a] > typeCounts[b] ? a : b
    );

    return {
      mostCommon,
      types: Object.keys(typeCounts),
    };
  }

  private analyzeDocumentRequirements(customers: any[]): string[] {
    const requirements = ['id_proof'];

    if (customers.some(c => c.nip)) {
      requirements.push('nip_certificate', 'business_registration');
    }

    return requirements;
  }

  private async getTaxSettingsDefaults(tenant_id: string, companyId: string): Promise<any> {
    const taxSettings = await this.prisma.companyTaxSettings.findMany({
      where: {
        company_id: companyId,
        isSelected: true,
      },
      include: { taxForm: true },
    });

    return taxSettings.map(setting => ({
      taxFormId: setting.taxFormId,
      taxFormCode: setting.taxForm.code,
      settings: setting.settings,
    }));
  }
}