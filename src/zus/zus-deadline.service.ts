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
   * Mark deadline as completed.
   * Persists a DeadlineCompletion record and creates a confirmation notification
   * for all users in the tenant.
   */
  async markDeadlineCompleted(
    tenantId: string,
    companyId: string,
    deadlineType: string,
    period: string,
    userId?: string,
  ): Promise<void> {
    const deadlineId = `zus-${deadlineType}-${companyId}-${period}`;

    // Persist completion record
    await this.prisma.deadlineCompletion.create({
      data: {
        tenant_id: tenantId,
        deadlineId,
        user_id: userId ?? 'system',
        notes: `ZUS deadline ${deadlineType} for period ${period} completed`,
      },
    });

    // Create a confirmation notification for the acting user (or all tenant users)
    const targetUsers = userId
      ? [{ id: userId }]
      : await this.prisma.user.findMany({
          where: { tenant_id: tenantId },
          select: { id: true },
        });

    for (const user of targetUsers) {
      await this.prisma.notification.create({
        data: {
          tenant_id: tenantId,
          user_id: user.id,
          type: 'zus_deadline_completed',
          title: `ZUS Deadline Completed`,
          body: `ZUS ${deadlineType} for period ${period} has been marked as completed.`,
          data: { companyId, deadlineType, period, deadlineId },
          priority: 'low',
          status: 'pending',
        },
      });
    }

    this.logger.log(
      `Marked deadline as completed: ${deadlineType} for period ${period} in company ${companyId} (tenant: ${tenantId})`,
    );
  }

  /**
   * Send deadline reminders for all tenants.
   * Queries all companies, finds deadlines due in the next 7 days,
   * and creates Notification records for each tenant's users.
   */
  async sendDeadlineReminders(): Promise<void> {
    this.logger.log('Checking for upcoming ZUS deadlines to send reminders...');

    // Get all distinct tenants by querying companies
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, tenant_id: true, name: true },
    });

    // Group companies by tenant
    const tenantCompanies = new Map<string, { id: string; name: string }[]>();
    for (const company of companies) {
      const existing = tenantCompanies.get(company.tenant_id) ?? [];
      existing.push({ id: company.id, name: company.name });
      tenantCompanies.set(company.tenant_id, existing);
    }

    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    let totalReminders = 0;

    for (const [tenantId, tenantCompanyList] of tenantCompanies) {
      // Get all users for this tenant
      const users = await this.prisma.user.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      if (users.length === 0) {
        continue;
      }

      for (const company of tenantCompanyList) {
        const deadlines = await this.getCompanyDeadlines(tenantId, company.id);

        // Filter to upcoming deadlines within next 7 days (not completed)
        const upcomingDeadlines = deadlines.filter(
          (d) =>
            d.status !== 'completed' &&
            d.dueDate >= now &&
            d.dueDate <= next7Days,
        );

        for (const deadline of upcomingDeadlines) {
          const daysLeft = this.calculateDaysUntilDeadline(deadline.dueDate);
          const deadlineId = `zus-${deadline.type}-${company.id}-${deadline.period ?? 'none'}`;

          // Check if a reminder was already sent today for this deadline
          const existingReminder = await this.prisma.deadlineReminder.findFirst({
            where: {
              tenant_id: tenantId,
              deadlineId,
              scheduledFor: {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
              },
            },
          });

          if (existingReminder) {
            continue; // Already sent today
          }

          // Create notification and reminder for each user
          for (const user of users) {
            await this.prisma.notification.create({
              data: {
                tenant_id: tenantId,
                user_id: user.id,
                type: 'zus_deadline_reminder',
                title: `ZUS Deadline Reminder: ${deadline.name}`,
                body: `${deadline.description} - due in ${daysLeft} day(s) (${deadline.dueDate.toISOString().split('T')[0]}). Company: ${company.name}`,
                data: {
                  companyId: company.id,
                  companyName: company.name,
                  deadlineType: deadline.type,
                  period: deadline.period,
                  dueDate: deadline.dueDate.toISOString(),
                  daysLeft,
                },
                priority: daysLeft <= 2 ? 'high' : 'normal',
                status: 'pending',
              },
            });

            await this.prisma.deadlineReminder.create({
              data: {
                tenant_id: tenantId,
                deadlineId,
                user_id: user.id,
                reminderType: daysLeft <= 2 ? 'urgent' : 'standard',
                scheduledFor: now,
                sent: true,
                sentAt: now,
              },
            });

            totalReminders++;
          }
        }
      }
    }

    this.logger.log(`ZUS deadline reminders sent: ${totalReminders} notification(s) created.`);
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
   * Calculate Easter Sunday using the Anonymous Gregorian algorithm.
   * Valid for any year in the Gregorian calendar.
   */
  private calculateEasterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed for JS Date
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month, day);
  }

  /**
   * Get Polish holidays for a given year.
   * Includes all official Polish public holidays (ustawowe dni wolne od pracy).
   */
  private getPolishHolidays(year: number): Date[] {
    const easterSunday = this.calculateEasterSunday(year);

    // Easter Monday = Easter Sunday + 1 day
    const easterMonday = new Date(easterSunday);
    easterMonday.setDate(easterMonday.getDate() + 1);

    // Corpus Christi (Boże Ciało) = Easter Sunday + 60 days
    const corpusChristi = new Date(easterSunday);
    corpusChristi.setDate(corpusChristi.getDate() + 60);

    return [
      new Date(year, 0, 1),   // New Year (Nowy Rok)
      new Date(year, 0, 6),   // Epiphany (Trzech Króli)
      easterMonday,            // Easter Monday (Poniedziałek Wielkanocny)
      new Date(year, 4, 1),   // Labor Day (Święto Pracy)
      new Date(year, 4, 3),   // Constitution Day (Święto Konstytucji 3 Maja)
      corpusChristi,           // Corpus Christi (Boże Ciało)
      new Date(year, 7, 15),  // Assumption Day (Wniebowzięcie NMP)
      new Date(year, 10, 1),  // All Saints' Day (Wszystkich Świętych)
      new Date(year, 10, 11), // Independence Day (Święto Niepodległości)
      new Date(year, 11, 25), // Christmas (Boże Narodzenie)
      new Date(year, 11, 26), // Boxing Day (Drugi dzień Bożego Narodzenia)
    ];
  }
}