import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface ZUSDeadline {
  type: 'monthly_report' | 'annual_report' | 'registration';
  name: string;
  description: string;
  dueDate: Date;
  period?: string;
  formTypes?: string[];
  isMandatory: boolean;
  companyId?: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed';
}

@Injectable()
export class ZusDeadlineService {
  private readonly logger = new Logger(ZusDeadlineService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get ZUS deadlines for a specific company
   */
  async getCompanyDeadlines(tenantId: string, companyId: string): Promise<ZUSDeadline[]> {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    const deadlines: ZUSDeadline[] = [];

    // Monthly report deadlines (15th of following month)
    for (let month = 0; month < 12; month++) {
      const reportDate = new Date(currentYear, month, 15);
      const period = `${currentYear}-${(month + 1).toString().padStart(2, '0')}`;

      if (reportDate >= currentDate) {
        deadlines.push({
          type: 'monthly_report',
          name: `ZUS Monthly Report - ${period}`,
          description: 'Monthly ZUS reports (RCA, RZA) must be submitted by 15th of the following month',
          dueDate: reportDate,
          period,
          formTypes: ['RCA', 'RZA'],
          isMandatory: true,
          companyId,
          status: this.getDeadlineStatus(reportDate, currentDate),
        });
      }
    }

    // Annual report deadline (January 31st of following year)
    const annualReportDate = new Date(currentYear + 1, 0, 31);

    if (annualReportDate >= currentDate) {
      deadlines.push({
        type: 'annual_report',
        name: `ZUS Annual Report - ${currentYear}`,
        description: 'Annual ZUS report (RSA) must be submitted by January 31st of the following year',
        dueDate: annualReportDate,
        period: `${currentYear}`,
        formTypes: ['RSA'],
        isMandatory: true,
        companyId,
        status: this.getDeadlineStatus(annualReportDate, currentDate),
      });
    }

    // Check for existing submissions and mark as completed
    const existingSubmissions = await this.prisma.zUSSubmission.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
      },
    });

    const existingReports = await this.prisma.zUSReport.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
      },
    });

    // Mark deadlines as completed if submissions exist
    deadlines.forEach(deadline => {
      const hasSubmission = existingSubmissions.some(sub =>
        sub.period === deadline.period &&
        deadline.formTypes?.some(formType => sub.data?.toString().includes(formType))
      );

      const hasReport = existingReports.some(report =>
        report.period === deadline.period &&
        deadline.formTypes?.includes(report.reportType)
      );

      if (hasSubmission || hasReport) {
        deadline.status = 'completed';
      }
    });

    return deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  /**
   * Get all ZUS deadlines for a tenant
   */
  async getAllDeadlines(tenantId: string): Promise<ZUSDeadline[]> {
    const companies = await this.prisma.company.findMany({
      where: { tenant_id: tenantId },
    });

    const allDeadlines: ZUSDeadline[] = [];

    for (const company of companies) {
      const companyDeadlines = await this.getCompanyDeadlines(tenantId, company.id);
      allDeadlines.push(...companyDeadlines);
    }

    return allDeadlines;
  }

  /**
   * Get upcoming deadlines (next 30 days)
   */
  async getUpcomingDeadlines(tenantId: string, companyId?: string): Promise<ZUSDeadline[]> {
    const allDeadlines = companyId
      ? await this.getCompanyDeadlines(tenantId, companyId)
      : await this.getAllDeadlines(tenantId);

    const currentDate = new Date();
    const next30Days = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    return allDeadlines.filter(deadline =>
      deadline.dueDate <= next30Days &&
      deadline.status !== 'completed'
    );
  }

  /**
   * Get overdue deadlines
   */
  async getOverdueDeadlines(tenantId: string, companyId?: string): Promise<ZUSDeadline[]> {
    const allDeadlines = companyId
      ? await this.getCompanyDeadlines(tenantId, companyId)
      : await this.getAllDeadlines(tenantId);

    const currentDate = new Date();

    return allDeadlines.filter(deadline =>
      deadline.dueDate < currentDate &&
      deadline.status !== 'completed'
    );
  }

  /**
   * Mark deadline as completed
   */
  async markDeadlineCompleted(
    tenantId: string,
    companyId: string,
    deadlineType: string,
    period: string,
  ): Promise<void> {
    // This would typically update a deadline tracking table
    // For now, we'll just log the action
    this.logger.log(`Marked deadline as completed: ${deadlineType} for period ${period} in company ${companyId}`);

    // In a real implementation, you might want to store this in a separate table:
    // await this.prisma.zUSDeadline.updateMany({
    //   where: { tenant_id: tenantId, company_id: companyId, type: deadlineType, period },
    //   data: { status: 'completed', completedAt: new Date() }
    // });
  }

  /**
   * Send deadline reminders
   */
  async sendDeadlineReminders(): Promise<void> {
    // This method would be called by a cron job to send reminders
    // Implementation would depend on the notification system

    this.logger.log('Checking for upcoming ZUS deadlines to send reminders...');

    // Get all upcoming deadlines (next 7 days)
    // Send email/push notifications to users
    // This is a placeholder for the actual implementation
  }

  /**
   * Calculate days until deadline
   */
  calculateDaysUntilDeadline(dueDate: Date): number {
    const currentDate = new Date();
    const timeDiff = dueDate.getTime() - currentDate.getTime();
    return Math.ceil(timeDiff / (24 * 60 * 60 * 1000));
  }

  /**
   * Get deadline status based on dates
   */
  private getDeadlineStatus(dueDate: Date, currentDate: Date): 'upcoming' | 'due' | 'overdue' {
    if (currentDate > dueDate) {
      return 'overdue';
    } else if (currentDate.toDateString() === dueDate.toDateString()) {
      return 'due';
    } else {
      return 'upcoming';
    }
  }

  /**
   * Cron job to check deadlines daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDeadlineCheck() {
    this.logger.log('Running daily ZUS deadline check...');

    try {
      await this.sendDeadlineReminders();
    } catch (error) {
      this.logger.error('Error in daily deadline check', error.message);
    }
  }

  /**
   * Get ZUS calendar for a specific year
   */
  async getZUSCalendar(year: number): Promise<{
    monthlyDeadlines: Date[];
    annualDeadlines: Date[];
    holidays: Date[];
  }> {
    const monthlyDeadlines: Date[] = [];
    const annualDeadlines: Date[] = [];

    // Monthly deadlines (15th of each month)
    for (let month = 0; month < 12; month++) {
      monthlyDeadlines.push(new Date(year, month, 15));
    }

    // Annual deadline (January 31st of following year)
    annualDeadlines.push(new Date(year + 1, 0, 31));

    // Polish holidays that might affect ZUS deadlines
    const holidays = this.getPolishHolidays(year);

    return {
      monthlyDeadlines,
      annualDeadlines,
      holidays,
    };
  }

  /**
   * Get Polish holidays for a given year
   */
  private getPolishHolidays(year: number): Date[] {
    // This is a simplified list - in reality, you'd want a more comprehensive holiday calculation
    return [
      new Date(year, 0, 1),   // New Year
      new Date(year, 0, 6),   // Epiphany
      new Date(year, 3, 1),   // Easter Monday (simplified)
      new Date(year, 4, 1),   // Labor Day
      new Date(year, 4, 3),   // Constitution Day
      new Date(year, 7, 15),  // Assumption Day
      new Date(year, 10, 1),  // All Saints' Day
      new Date(year, 10, 11), // Independence Day
      new Date(year, 11, 25), // Christmas
      new Date(year, 11, 26), // Boxing Day
    ];
  }
}