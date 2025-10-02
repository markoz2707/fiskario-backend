import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

export interface DeclarationDeadline {
  type: string;
  period: string;
  deadline: Date;
  description: string;
  daysUntilDeadline: number;
  isOverdue: boolean;
}

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get upcoming declaration deadlines for a company
   */
  async getUpcomingDeadlines(tenantId: string, companyId: string): Promise<DeclarationDeadline[]> {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const deadlines: DeclarationDeadline[] = [];

    // VAT-7 monthly deadlines (25th of following month)
    for (let month = currentDate.getMonth() + 1; month <= 12; month++) {
      const deadline = new Date(currentYear, month, 25);
      if (deadline >= currentDate) {
        const daysUntilDeadline = Math.ceil(
          (deadline.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        deadlines.push({
          type: 'VAT-7',
          period: `${currentYear}-${month.toString().padStart(2, '0')}`,
          deadline,
          description: `VAT-7 za ${month}/${currentYear}`,
          daysUntilDeadline,
          isOverdue: false,
        });
      }
    }

    // JPK_V7M monthly deadlines (25th of following month)
    for (let month = currentDate.getMonth() + 1; month <= 12; month++) {
      const deadline = new Date(currentYear, month, 25);
      if (deadline >= currentDate) {
        const daysUntilDeadline = Math.ceil(
          (deadline.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        deadlines.push({
          type: 'JPK_V7M',
          period: `${currentYear}-${month.toString().padStart(2, '0')}`,
          deadline,
          description: `JPK_V7M za ${month}/${currentYear}`,
          daysUntilDeadline,
          isOverdue: false,
        });
      }
    }

    // JPK_V7K quarterly deadlines
    const quarters = [
      { quarter: 1, month: 4, description: 'Q1' },
      { quarter: 2, month: 7, description: 'Q2' },
      { quarter: 3, month: 10, description: 'Q3' },
      { quarter: 4, month: 1, description: 'Q4' }
    ];

    for (const q of quarters) {
      let deadlineYear = currentYear;
      let deadlineMonth = q.month;

      if (q.quarter === 4) {
        deadlineYear = currentYear + 1;
        deadlineMonth = 1;
      }

      const deadline = new Date(deadlineYear, deadlineMonth, 25);
      if (deadline >= currentDate) {
        const daysUntilDeadline = Math.ceil(
          (deadline.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        deadlines.push({
          type: 'JPK_V7K',
          period: `${deadlineYear}-K${q.quarter}`,
          deadline,
          description: `JPK_V7K ${q.description} ${deadlineYear}`,
          daysUntilDeadline,
          isOverdue: false,
        });
      }
    }

    // Check for overdue declarations
    const overdueDeclarations = await this.getOverdueDeclarations(tenantId, companyId);
    for (const overdue of overdueDeclarations) {
      deadlines.push({
        type: overdue.type,
        period: overdue.period,
        deadline: overdue.deadline,
        description: `${overdue.type} za ${overdue.period} (przeterminowana)`,
        daysUntilDeadline: overdue.daysOverdue * -1,
        isOverdue: true,
      });
    }

    // Sort by deadline
    return deadlines.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  }

  /**
   * Check for missed deadlines and send notifications
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkAndSendDeadlineReminders(): Promise<void> {
    this.logger.log('Checking for upcoming declaration deadlines...');

    try {
      // Get all companies
      const companies = await this.prisma.company.findMany({
        where: {
          vatPayer: true, // Only VAT payers need declaration reminders
        },
      });

      for (const company of companies) {
        const deadlines = await this.getUpcomingDeadlines(company.tenant_id, company.id);

        // Send reminders for deadlines within 7 days
        const urgentDeadlines = deadlines.filter(d => d.daysUntilDeadline <= 7 && !d.isOverdue);

        if (urgentDeadlines.length > 0) {
          await this.sendDeadlineNotification(company.tenant_id, company.id, urgentDeadlines);
        }

        // Send overdue notifications
        const overdueDeadlines = deadlines.filter(d => d.isOverdue);
        if (overdueDeadlines.length > 0) {
          await this.sendOverdueNotification(company.tenant_id, company.id, overdueDeadlines);
        }
      }
    } catch (error) {
      this.logger.error('Error checking deadline reminders:', error);
    }
  }

  /**
   * Send deadline reminder notification
   */
  private async sendDeadlineNotification(
    tenantId: string,
    companyId: string,
    deadlines: DeclarationDeadline[]
  ): Promise<void> {
    try {
      const company = await this.prisma.company.findFirst({
        where: { tenant_id: tenantId, id: companyId },
      });

      if (!company) return;

      const message = `Przypomnienie: Nadchodzące terminy deklaracji dla firmy ${company.name}:\n\n` +
        deadlines.map(d =>
          `${d.description} - termin: ${d.deadline.toLocaleDateString('pl-PL')} (${d.daysUntilDeadline} dni)`
        ).join('\n');

      // Here you would integrate with the notifications service
      this.logger.log(`Sending deadline reminder for company ${company.name}: ${message}`);

      // Store notification in database (if notifications table exists)
      // await this.prisma.notification.create({
      //   data: {
      //     tenant_id: tenantId,
      //     user_id: company.users[0]?.id, // Send to first user
      //     type: 'deadline_reminder',
      //     message,
      //     data: { deadlines, companyId },
      //   },
      // });
    } catch (error) {
      this.logger.error(`Failed to send deadline notification for company ${companyId}:`, error);
    }
  }

  /**
   * Send overdue declaration notification
   */
  private async sendOverdueNotification(
    tenantId: string,
    companyId: string,
    deadlines: DeclarationDeadline[]
  ): Promise<void> {
    try {
      const company = await this.prisma.company.findFirst({
        where: { tenant_id: tenantId, id: companyId },
      });

      if (!company) return;

      const message = `UWAGA: Przeterminowane deklaracje dla firmy ${company.name}:\n\n` +
        deadlines.map(d =>
          `${d.description} - termin był: ${d.deadline.toLocaleDateString('pl-PL')} (${Math.abs(d.daysUntilDeadline)} dni temu)`
        ).join('\n');

      // Here you would integrate with the notifications service
      this.logger.log(`Sending overdue notification for company ${company.name}: ${message}`);

      // Store notification in database (if notifications table exists)
      // await this.prisma.notification.create({
      //   data: {
      //     tenant_id: tenantId,
      //     user_id: company.users[0]?.id, // Send to first user
      //     type: 'overdue_declaration',
      //     message,
      //     data: { deadlines, companyId },
      //   },
      // });
    } catch (error) {
      this.logger.error(`Failed to send overdue notification for company ${companyId}:`, error);
    }
  }

  /**
   * Get overdue declarations that haven't been submitted
   */
  private async getOverdueDeclarations(tenantId: string, companyId: string): Promise<any[]> {
    const currentDate = new Date();
    const overdueDeclarations: any[] = [];

    // Check for overdue VAT-7 declarations
    for (let month = 1; month <= 12; month++) {
      const deadline = new Date(currentDate.getFullYear(), month, 25);
      if (deadline < currentDate) {
        const period = `${currentDate.getFullYear()}-${month.toString().padStart(2, '0')}`;

        // Check if VAT-7 for this period has been submitted
        const existingDeclaration = await this.prisma.declaration.findFirst({
          where: {
            tenant_id: tenantId,
            company_id: companyId,
            type: 'VAT-7',
            period: period,
            status: { in: ['submitted', 'accepted'] },
          },
        });

        if (!existingDeclaration) {
          const daysOverdue = Math.floor(
            (currentDate.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)
          );

          overdueDeclarations.push({
            type: 'VAT-7',
            period,
            deadline,
            daysOverdue,
          });
        }
      }
    }

    return overdueDeclarations;
  }

  /**
   * Schedule custom reminder for specific declaration
   */
  async scheduleCustomReminder(
    tenantId: string,
    companyId: string,
    declarationType: string,
    period: string,
    customDeadline: Date,
    reminderDays: number[] = [7, 3, 1] // Default: 7, 3, and 1 day before deadline
  ): Promise<void> {
    try {
      // Here you would store custom reminder configuration
      // For now, just log the action

      this.logger.log(
        `Scheduling custom reminder for ${declarationType} ${period} - ` +
        `${reminderDays.length} reminders at ${reminderDays.join(', ')} days before deadline`
      );

      // In a real implementation, you would:
      // 1. Store reminder configuration in database
      // 2. Set up scheduled jobs for each reminder
      // 3. Send notifications at specified intervals
    } catch (error) {
      this.logger.error('Failed to schedule custom reminder:', error);
      throw error;
    }
  }

  /**
   * Get reminder settings for a company
   */
  async getReminderSettings(tenantId: string, companyId: string): Promise<any> {
    // Return default reminder settings
    return {
      enabled: true,
      reminderDays: [7, 3, 1],
      notificationMethods: ['push', 'email'],
      customReminders: [],
    };
  }

  /**
   * Update reminder settings for a company
   */
  async updateReminderSettings(
    tenantId: string,
    companyId: string,
    settings: {
      enabled: boolean;
      reminderDays: number[];
      notificationMethods: string[];
    }
  ): Promise<void> {
    try {
      this.logger.log(`Updating reminder settings for company ${companyId}:`, settings);

      // Here you would store the settings in database
      // For now, just log the action
    } catch (error) {
      this.logger.error('Failed to update reminder settings:', error);
      throw error;
    }
  }
}