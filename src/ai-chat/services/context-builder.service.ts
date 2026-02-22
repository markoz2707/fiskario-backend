import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Builds contextual information about the user's company for the AI to reference.
 * Fetches recent KPiR data, ZUS contributions, pending declarations, and tax settings.
 */
@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a comprehensive context string for the AI from the company's data.
   * Returns a formatted string containing company info, recent financial data,
   * ZUS status, and pending declarations.
   */
  async buildCompanyContext(tenantId: string, companyId: string): Promise<string> {
    const contextParts: string[] = [];

    try {
      // 1. Company basic info
      const company = await this.prisma.company.findFirst({
        where: { id: companyId, tenant_id: tenantId },
        include: {
          taxSettings: {
            where: { isSelected: true },
            include: { taxForm: true },
          },
        },
      });

      if (company) {
        contextParts.push(this.buildCompanyInfo(company));
      }

      // 2. Recent KPiR summary (current year)
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const kpirSummary = await this.buildKPiRSummary(tenantId, companyId, currentYear, currentMonth);
      if (kpirSummary) {
        contextParts.push(kpirSummary);
      }

      // 3. Recent ZUS contributions
      const zusSummary = await this.buildZUSSummary(tenantId, companyId);
      if (zusSummary) {
        contextParts.push(zusSummary);
      }

      // 4. Pending declarations
      const declarationsSummary = await this.buildDeclarationsSummary(tenantId, companyId);
      if (declarationsSummary) {
        contextParts.push(declarationsSummary);
      }
    } catch (error) {
      this.logger.warn(`Failed to build full context for company ${companyId}: ${error}`);
      contextParts.push('(Nie udalo sie pobrac pelnych danych firmy)');
    }

    return contextParts.join('\n\n');
  }

  /**
   * Format company basic information.
   */
  private buildCompanyInfo(company: any): string {
    const taxFormName = company.taxSettings?.[0]?.taxForm?.name || 'nie wybrano';
    const vatStatus = company.vatPayer ? 'TAK (czynny podatnik VAT)' : 'NIE (zwolniony/nieVAT)';

    return `=== DANE FIRMY ===
Nazwa: ${company.name}
NIP: ${company.nip || '(zaszyfrowany)'}
Adres: ${company.address || 'brak'}
Forma opodatkowania: ${company.taxForm || taxFormName}
Platnik VAT: ${vatStatus}
Urzad skarbowy: ${company.taxOffice || 'brak'}`;
  }

  /**
   * Build KPiR summary for the current year up to the current month.
   */
  private async buildKPiRSummary(
    tenantId: string,
    companyId: string,
    year: number,
    currentMonth: number,
  ): Promise<string | null> {
    try {
      const entries = await this.prisma.kPiREntry.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          year,
        },
        orderBy: { entryDate: 'desc' },
        take: 100,
      });

      if (entries.length === 0) return null;

      // Aggregate totals
      let totalRevenue = 0;
      let totalExpenses = 0;

      for (const entry of entries) {
        totalRevenue += entry.totalRevenue;
        totalExpenses += entry.totalExpenses;
      }

      const profit = totalRevenue - totalExpenses;

      // Monthly breakdown for the last 3 months
      const monthlyData: { month: number; revenue: number; expenses: number }[] = [];
      for (let m = Math.max(1, currentMonth - 2); m <= currentMonth; m++) {
        const monthEntries = entries.filter((e) => e.month === m);
        const mRevenue = monthEntries.reduce((sum, e) => sum + e.totalRevenue, 0);
        const mExpenses = monthEntries.reduce((sum, e) => sum + e.totalExpenses, 0);
        monthlyData.push({ month: m, revenue: mRevenue, expenses: mExpenses });
      }

      const monthNames = [
        '', 'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
        'lip', 'sie', 'wrz', 'paz', 'lis', 'gru',
      ];

      const monthlyLines = monthlyData
        .map((md) => `  ${monthNames[md.month]}: przychod ${md.revenue.toFixed(2)} zl, koszty ${md.expenses.toFixed(2)} zl`)
        .join('\n');

      return `=== KPiR (rok ${year}) ===
Laczny przychod: ${totalRevenue.toFixed(2)} zl
Laczne koszty: ${totalExpenses.toFixed(2)} zl
Dochod: ${profit.toFixed(2)} zl
Liczba wpisow: ${entries.length}
Ostatnie miesiace:
${monthlyLines}`;
    } catch (error) {
      this.logger.warn(`Failed to build KPiR summary: ${error}`);
      return null;
    }
  }

  /**
   * Build ZUS contributions summary.
   */
  private async buildZUSSummary(tenantId: string, companyId: string): Promise<string | null> {
    try {
      const recentContributions = await this.prisma.zUSContribution.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
        },
        orderBy: { period: 'desc' },
        take: 3,
      });

      if (recentContributions.length === 0) return null;

      const lines = recentContributions.map((c) => {
        const total =
          c.emerytalnaEmployer +
          c.emerytalnaEmployee +
          c.rentowaEmployer +
          c.rentowaEmployee +
          c.chorobowaEmployee +
          c.wypadkowaEmployer +
          c.zdrowotnaEmployee +
          c.fpEmployee +
          c.fgspEmployee;
        return `  ${c.period}: laczna skladka ${total.toFixed(2)} zl (zdrowotna: ${c.zdrowotnaEmployee.toFixed(2)} zl), status: ${c.status}`;
      });

      return `=== SKLADKI ZUS (ostatnie) ===
${lines.join('\n')}`;
    } catch (error) {
      this.logger.warn(`Failed to build ZUS summary: ${error}`);
      return null;
    }
  }

  /**
   * Build pending declarations summary.
   */
  private async buildDeclarationsSummary(tenantId: string, companyId: string): Promise<string | null> {
    try {
      const pendingDeclarations = await this.prisma.declaration.findMany({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          status: { in: ['draft', 'ready', 'pending'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (pendingDeclarations.length === 0) return null;

      const lines = pendingDeclarations.map(
        (d) => `  ${d.type} za okres ${d.period} - status: ${d.status}`,
      );

      return `=== DEKLARACJE DO ZLOZENIA ===
${lines.join('\n')}`;
    } catch (error) {
      this.logger.warn(`Failed to build declarations summary: ${error}`);
      return null;
    }
  }
}
