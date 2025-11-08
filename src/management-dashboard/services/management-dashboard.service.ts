import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicingService } from '../../invoicing/invoicing.service';
import { BuyersService } from '../../invoicing/buyers.service';
import { TaxRulesService } from '../../tax-rules/tax-rules.service';
import { DeadlineReminderService } from '../../declarations/services/deadline-reminder.service';
import { DeclarationStatusService } from '../../declarations/services/declaration-status.service';
import { KsefService } from '../../ksef/ksef.service';
import { DashboardSummaryDto, DashboardFiltersDto, RealTimeStatusDto } from '../dto/dashboard-summary.dto';

@Injectable()
export class ManagementDashboardService {
  private readonly logger = new Logger(ManagementDashboardService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => InvoicingService))
    private invoicingService: InvoicingService,
    private buyersService: BuyersService,
    private taxRulesService: TaxRulesService,
    private deadlineReminderService: DeadlineReminderService,
    private declarationStatusService: DeclarationStatusService,
    private ksefService: KsefService,
  ) {}

  async getDashboardSummary(
    tenant_id: string,
    filters: DashboardFiltersDto,
  ): Promise<DashboardSummaryDto> {
    this.logger.log(`Getting dashboard summary for tenant ${tenant_id}`);

    // Get invoice statistics
    const invoiceStats = await this.getInvoiceStatistics(tenant_id, filters);

    // Get customer statistics
    const customerStats = await this.getCustomerStatistics(tenant_id, filters);

    // Get declaration statistics
    const declarationStats = await this.getDeclarationStatistics(tenant_id, filters);

    // Get payment statistics
    const paymentStats = await this.getPaymentStatistics(tenant_id, filters);

    // Get KSeF status
    const ksefStatus = await this.getKSeFStatus(tenant_id, filters);

    // Get recent activities
    const recentActivities = await this.getRecentActivities(tenant_id, filters);

    // Get upcoming deadlines
    const upcomingDeadlines = await this.getUpcomingDeadlines(tenant_id, filters);

    return {
      totalInvoices: invoiceStats.total,
      totalRevenue: invoiceStats.totalRevenue,
      totalVat: invoiceStats.totalVat,
      activeCustomers: customerStats.active,
      pendingDeclarations: declarationStats.pending,
      overduePayments: paymentStats.overdue,
      ksefStatus,
      recentActivities,
      upcomingDeadlines,
    };
  }

  async getRealTimeStatus(tenant_id: string): Promise<RealTimeStatusDto> {
    this.logger.log(`Getting real-time status for tenant ${tenant_id}`);

    // Check system status
    const systemStatus = await this.checkSystemStatus(tenant_id);

    // Get active processes
    const activeProcesses = await this.getActiveProcesses(tenant_id);

    // Get system alerts
    const alerts = await this.getSystemAlerts(tenant_id);

    return {
      systemStatus,
      activeProcesses,
      alerts,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getRecentActivities(
    tenant_id: string,
    filters: DashboardFiltersDto,
  ): Promise<any[]> {
    const limit = filters.limit || 20;
    const priority = filters.priority;

    // Get recent invoices
    const recentInvoices = await this.prisma.invoice.findMany({
      where: { tenant_id },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 3),
      include: { buyer: true },
    });

    // Get recent declarations
    const recentDeclarations = await this.prisma.declaration.findMany({
      where: { tenant_id },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 3),
    });

    // Get recent KSeF submissions
    const recentKSeFSubmissions = await this.prisma.taskQueue.findMany({
      where: {
        tenant_id,
        type: 'ksef_submission',
      },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 3),
    });

    // Combine and sort activities
    const activities = [
      ...recentInvoices.map(invoice => ({
        id: `invoice-${invoice.id}`,
        type: 'invoice_created',
        description: `Invoice ${invoice.number} created for ${invoice.buyer?.name || 'Unknown'}`,
        timestamp: invoice.createdAt,
        priority: this.calculatePriority(invoice, priority),
      })),
      ...recentDeclarations.map(declaration => ({
        id: `declaration-${declaration.id}`,
        type: 'declaration_submitted',
        description: `Declaration ${declaration.type} submitted`,
        timestamp: declaration.createdAt,
        priority: this.calculatePriority(declaration, priority),
      })),
      ...recentKSeFSubmissions.map(submission => ({
        id: `ksef-${submission.id}`,
        type: 'ksef_submission',
        description: `KSeF submission processed`,
        timestamp: submission.createdAt,
        priority: 'medium' as const,
      })),
    ];

    // Sort by timestamp and filter by priority if specified
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .filter(activity => !priority || activity.priority === priority)
      .slice(0, limit);
  }

  async getUpcomingDeadlines(
    tenant_id: string,
    filters: DashboardFiltersDto,
  ): Promise<any[]> {
    const limit = filters.limit || 10;
    const priority = filters.priority;

    // Get companies for the tenant to get upcoming tax deadlines
    const companies = await this.prisma.company.findMany({
      where: { tenant_id },
    });

    const allDeadlines: any[] = [];

    // Get upcoming tax deadlines for each company
    for (const company of companies) {
      const taxDeadlines = await this.deadlineReminderService.getUpcomingDeadlines(tenant_id, company.id);
      allDeadlines.push(...taxDeadlines.map(deadline => ({
        id: `tax-${company.id}-${deadline.type}-${deadline.period}`,
        type: 'tax_deadline',
        description: `${deadline.description} (${company.name})`,
        dueDate: deadline.deadline,
        daysRemaining: deadline.daysUntilDeadline,
        priority: this.calculateDeadlinePriority(deadline.daysUntilDeadline),
      })));
    }

    // Get upcoming payment deadlines
    const paymentDeadlines = await this.getUpcomingPaymentDeadlines(tenant_id);
    allDeadlines.push(...paymentDeadlines.map(deadline => ({
      id: `payment-${deadline.id}`,
      type: 'payment_deadline',
      description: deadline.description,
      dueDate: deadline.dueDate,
      daysRemaining: deadline.daysRemaining,
      priority: this.calculateDeadlinePriority(deadline.daysRemaining),
    })));

    // Sort by days remaining and filter by priority if specified
    return allDeadlines
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .filter(deadline => !priority || deadline.priority === priority)
      .slice(0, limit);
  }

  async getDetailedMetrics(
    tenant_id: string,
    filters: DashboardFiltersDto,
  ): Promise<any> {
    // Get monthly revenue trends
    const revenueTrends = await this.getRevenueTrends(tenant_id, filters);

    // Get VAT breakdown
    const vatBreakdown = await this.getVatBreakdown(tenant_id, filters);

    // Get customer acquisition trends
    const customerTrends = await this.getCustomerTrends(tenant_id, filters);

    // Get compliance metrics
    const complianceMetrics = await this.getComplianceMetrics(tenant_id, filters);

    return {
      revenueTrends,
      vatBreakdown,
      customerTrends,
      complianceMetrics,
    };
  }

  private async getInvoiceStatistics(tenant_id: string, filters: DashboardFiltersDto) {
    const whereClause: any = { tenant_id };

    if (filters.companyId) {
      whereClause.company_id = filters.companyId;
    }

    if (filters.dateFrom || filters.dateTo) {
      whereClause.date = {};
      if (filters.dateFrom) whereClause.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) whereClause.date.lte = new Date(filters.dateTo);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
      select: {
        totalNet: true,
        totalVat: true,
        totalGross: true,
      },
    });

    return {
      total: invoices.length,
      totalRevenue: invoices.reduce((sum, inv) => sum + inv.totalGross, 0),
      totalVat: invoices.reduce((sum, inv) => sum + inv.totalVat, 0),
    };
  }

  private async getCustomerStatistics(tenant_id: string, filters: DashboardFiltersDto) {
    const whereClause: any = { tenant_id, isActive: true };

    if (filters.companyId) {
      // Assuming customers are linked to companies through invoices
      const customerIds = await this.prisma.invoice.findMany({
        where: { tenant_id, company_id: filters.companyId },
        select: { buyer_id: true },
      });
      whereClause.id = { in: customerIds.map(inv => inv.buyer_id).filter(Boolean) };
    }

    const activeCustomers = await this.prisma.buyer.count({ where: whereClause });

    return { active: activeCustomers };
  }

  private async getDeclarationStatistics(tenant_id: string, filters: DashboardFiltersDto) {
    const pendingDeclarations = await this.prisma.declaration.count({
      where: {
        tenant_id,
        status: 'pending',
      },
    });

    return { pending: pendingDeclarations };
  }

  private async getPaymentStatistics(tenant_id: string, filters: DashboardFiltersDto) {
    // Calculate overdue payments (invoices past due date)
    const overdueInvoices = await this.prisma.invoice.count({
      where: {
        tenant_id,
        dueDate: { lt: new Date() },
        status: { not: 'paid' },
      },
    });

    return { overdue: overdueInvoices };
  }

  private async getKSeFStatus(tenant_id: string, filters: DashboardFiltersDto) {
    const submitted = await this.prisma.taskQueue.count({
      where: {
        tenant_id,
        type: 'ksef_submission',
        status: 'completed',
      },
    });

    const pending = await this.prisma.taskQueue.count({
      where: {
        tenant_id,
        type: 'ksef_submission',
        status: 'pending',
      },
    });

    const failed = await this.prisma.taskQueue.count({
      where: {
        tenant_id,
        type: 'ksef_submission',
        status: 'failed',
      },
    });

    return { submitted, pending, failed };
  }

  private async checkSystemStatus(tenant_id: string): Promise<'operational' | 'degraded' | 'maintenance'> {
    // Check database connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      return 'degraded';
    }

    // Check for critical errors in logs (simplified)
    const recentErrors = await this.prisma.taskQueue.count({
      where: {
        tenant_id,
        status: 'failed',
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
    });

    if (recentErrors > 10) {
      return 'degraded';
    }

    return 'operational';
  }

  private async getActiveProcesses(tenant_id: string): Promise<any[]> {
    const activeTasks = await this.prisma.taskQueue.findMany({
      where: {
        tenant_id,
        status: 'processing',
      },
      take: 10,
    });

    return activeTasks.map(task => ({
      id: task.id,
      type: task.type,
      progress: 50, // Simplified progress calculation
      estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
    }));
  }

  private async getSystemAlerts(tenant_id: string): Promise<Array<{
    id: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
  }>> {
    const alerts: Array<{
      id: string;
      level: 'info' | 'warning' | 'error';
      message: string;
      timestamp: Date;
    }> = [];

    // Check for failed KSeF submissions
    const failedKSeF = await this.prisma.taskQueue.count({
      where: {
        tenant_id,
        type: 'ksef_submission',
        status: 'failed',
        updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      },
    });

    if (failedKSeF > 0) {
      alerts.push({
        id: 'ksef-failures',
        level: 'error',
        message: `${failedKSeF} KSeF submission(s) failed in the last hour`,
        timestamp: new Date(),
      });
    }

    // Check for overdue payments
    const overduePayments = await this.getPaymentStatistics(tenant_id, {});
    if (overduePayments.overdue > 0) {
      alerts.push({
        id: 'overdue-payments',
        level: 'warning',
        message: `${overduePayments.overdue} payment(s) are overdue`,
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  private async getUpcomingPaymentDeadlines(tenant_id: string): Promise<any[]> {
    const upcomingInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id,
        dueDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, // Next 30 days
        status: { not: 'paid' },
      },
      include: { buyer: true },
      take: 20,
    });

    return upcomingInvoices.map(invoice => {
      if (!invoice.dueDate) return null;
      const daysRemaining = Math.ceil((invoice.dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      return {
        id: invoice.id,
        description: `Payment due for invoice ${invoice.number} to ${invoice.buyer?.name || 'Unknown'}`,
        dueDate: invoice.dueDate,
        daysRemaining,
      };
    }).filter(Boolean);
  }

  private calculatePriority(item: any, filterPriority?: string): 'low' | 'medium' | 'high' | 'critical' {
    // Simplified priority calculation
    if (item.totalGross > 10000) return 'high';
    if (item.status === 'failed') return 'critical';
    return 'medium';
  }

  private calculateDeadlinePriority(daysRemaining: number): 'low' | 'medium' | 'high' | 'critical' {
    if (daysRemaining <= 1) return 'critical';
    if (daysRemaining <= 3) return 'high';
    if (daysRemaining <= 7) return 'medium';
    return 'low';
  }

  private async getRevenueTrends(tenant_id: string, filters: DashboardFiltersDto): Promise<any[]> {
    // Simplified monthly revenue aggregation
    const monthlyRevenue = await this.prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', date) as month,
        SUM("totalGross") as revenue
      FROM invoice
      WHERE tenant_id = ${tenant_id}
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month DESC
      LIMIT 12
    `;

    return monthlyRevenue as any[];
  }

  private async getVatBreakdown(tenant_id: string, filters: DashboardFiltersDto): Promise<any[]> {
    // Simplified VAT rate breakdown
    const vatBreakdown = await this.prisma.invoiceItem.groupBy({
      by: ['vatRate'],
      where: { invoice: { tenant_id } },
      _sum: { vatAmount: true },
      orderBy: { _sum: { vatAmount: 'desc' } },
    });

    return vatBreakdown.map(item => ({
      vatRate: item.vatRate,
      totalVat: item._sum.vatAmount || 0,
    }));
  }

  private async getCustomerTrends(tenant_id: string, filters: DashboardFiltersDto): Promise<any[]> {
    // Simplified customer acquisition trends
    const customerTrends = await this.prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*) as newCustomers
      FROM buyer
      WHERE tenant_id = ${tenant_id}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month DESC
      LIMIT 12
    `;

    return customerTrends as any[];
  }

  private async getComplianceMetrics(tenant_id: string, filters: DashboardFiltersDto): Promise<any> {
    const totalDeclarations = await this.prisma.declaration.count({ where: { tenant_id } });
    const onTimeDeclarations = await this.prisma.declaration.count({
      where: { tenant_id, status: 'submitted_on_time' },
    });

    const complianceRate = totalDeclarations > 0 ? (onTimeDeclarations / totalDeclarations) * 100 : 100;

    return {
      complianceRate: Math.round(complianceRate * 100) / 100,
      totalDeclarations,
      onTimeDeclarations,
    };
  }
}