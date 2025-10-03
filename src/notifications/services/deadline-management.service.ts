import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PushNotificationService } from './push-notification.service';

export interface DeadlineInfo {
  id: string;
  type: 'vat' | 'zus' | 'pit' | 'cit' | 'ksef';
  name: string;
  description: string;
  dueDate: Date;
  period: string;
  companyId: string;
  tenantId: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed';
  daysUntilDue: number;
  priority: 'low' | 'normal' | 'high';
  amount?: number;
}

export interface DeadlineReminder {
  deadlineId: string;
  userId: string;
  tenantId: string;
  reminderType: 'upcoming' | 'due' | 'overdue';
  scheduledFor: Date;
  sent: boolean;
}

@Injectable()
export class DeadlineManagementService {
  private readonly logger = new Logger(DeadlineManagementService.name);

  constructor(
    private prisma: PrismaService,
    private pushNotificationService: PushNotificationService,
  ) {}

  async calculateDeadlines(tenantId: string, companyId: string): Promise<DeadlineInfo[]> {
    try {
      const deadlines: DeadlineInfo[] = [];
      const now = new Date();

      // Calculate VAT deadlines
      deadlines.push(...await this.calculateVATDeadlines(tenantId, companyId, now));

      // Calculate ZUS deadlines
      deadlines.push(...await this.calculateZUSDeadlines(tenantId, companyId, now));

      // Calculate PIT deadlines
      deadlines.push(...await this.calculatePITDeadlines(tenantId, companyId, now));

      // Calculate CIT deadlines (if applicable)
      deadlines.push(...await this.calculateCITDeadlines(tenantId, companyId, now));

      // Calculate KSeF deadlines (if applicable)
      deadlines.push(...await this.calculateKSeFDeadlines(tenantId, companyId, now));

      return deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    } catch (error) {
      this.logger.error(`Error calculating deadlines: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async calculateVATDeadlines(tenantId: string, companyId: string, now: Date): Promise<DeadlineInfo[]> {
    const deadlines: DeadlineInfo[] = [];

    // Monthly VAT-7 deadline is 25th of the following month
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const vatDeadline = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 25);

    if (vatDeadline > now) {
      const daysUntilDue = Math.ceil((vatDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      deadlines.push({
        id: `vat_monthly_${currentMonth.getFullYear()}_${currentMonth.getMonth() + 1}`,
        type: 'vat',
        name: 'VAT-7 (miesięczna)',
        description: 'Miesięczna deklaracja VAT',
        dueDate: vatDeadline,
        period: `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}`,
        companyId,
        tenantId,
        status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 7 ? 'due' : 'upcoming',
        daysUntilDue,
        priority: 'high',
      });
    }

    // Quarterly VAT deadlines (25th of month following quarter end)
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
    const quarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
    const quarterlyVATDeadline = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth() + 1, 25);

    if (quarterlyVATDeadline > now) {
      const daysUntilDue = Math.ceil((quarterlyVATDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      deadlines.push({
        id: `vat_quarterly_${quarterEnd.getFullYear()}_Q${currentQuarter + 1}`,
        type: 'vat',
        name: 'VAT-7K (kwartalna)',
        description: 'Kwartalna deklaracja VAT',
        dueDate: quarterlyVATDeadline,
        period: `${quarterEnd.getFullYear()}-Q${currentQuarter + 1}`,
        companyId,
        tenantId,
        status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 7 ? 'due' : 'upcoming',
        daysUntilDue,
        priority: 'high',
      });
    }

    return deadlines;
  }

  private async calculateZUSDeadlines(tenantId: string, companyId: string, now: Date): Promise<DeadlineInfo[]> {
    const deadlines: DeadlineInfo[] = [];

    // ZUS contributions are typically due by 15th of following month
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const zusDeadline = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 15);

    if (zusDeadline > now) {
      const daysUntilDue = Math.ceil((zusDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Get estimated ZUS amount from previous contributions
      const previousContributions = await this.prisma.zUSContribution.aggregate({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          period: {
            startsWith: currentMonth.getFullYear().toString(),
          },
        },
        _sum: {
          emerytalnaEmployer: true,
          rentowaEmployer: true,
          chorobowaEmployee: true,
          wypadkowaEmployer: true,
          zdrowotnaEmployee: true,
          fpEmployee: true,
          fgspEmployee: true,
        },
      });

      const estimatedAmount = this.calculateTotalZUSContributions(previousContributions);

      deadlines.push({
        id: `zus_monthly_${currentMonth.getFullYear()}_${currentMonth.getMonth() + 1}`,
        type: 'zus',
        name: 'Składki ZUS',
        description: 'Miesięczne składki na ubezpieczenia społeczne',
        dueDate: zusDeadline,
        period: `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}`,
        companyId,
        tenantId,
        status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 5 ? 'due' : 'upcoming',
        daysUntilDue,
        priority: 'high',
        amount: estimatedAmount,
      });
    }

    return deadlines;
  }

  private async calculatePITDeadlines(tenantId: string, companyId: string, now: Date): Promise<DeadlineInfo[]> {
    const deadlines: DeadlineInfo[] = [];

    // PIT annual deadline is April 30th of following year
    const pitDeadline = new Date(now.getFullYear() + 1, 3, 30); // April 30th

    if (pitDeadline > now) {
      const daysUntilDue = Math.ceil((pitDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      deadlines.push({
        id: `pit_annual_${now.getFullYear()}`,
        type: 'pit',
        name: 'PIT-36/PIT-37',
        description: 'Roczna deklaracja podatku dochodowego od osób fizycznych',
        dueDate: pitDeadline,
        period: now.getFullYear().toString(),
        companyId,
        tenantId,
        status: daysUntilDue <= 30 ? 'due' : 'upcoming',
        daysUntilDue,
        priority: 'normal',
      });
    }

    return deadlines;
  }

  private async calculateCITDeadlines(tenantId: string, companyId: string, now: Date): Promise<DeadlineInfo[]> {
    const deadlines: DeadlineInfo[] = [];

    // CIT annual deadline is March 31st of following year (for calendar year)
    const citDeadline = new Date(now.getFullYear() + 1, 2, 31); // March 31st

    if (citDeadline > now) {
      const daysUntilDue = Math.ceil((citDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      deadlines.push({
        id: `cit_annual_${now.getFullYear()}`,
        type: 'cit',
        name: 'CIT-8',
        description: 'Roczna deklaracja podatku dochodowego od osób prawnych',
        dueDate: citDeadline,
        period: now.getFullYear().toString(),
        companyId,
        tenantId,
        status: daysUntilDue <= 30 ? 'due' : 'upcoming',
        daysUntilDue,
        priority: 'normal',
      });
    }

    return deadlines;
  }

  private async calculateKSeFDeadlines(tenantId: string, companyId: string, now: Date): Promise<DeadlineInfo[]> {
    const deadlines: DeadlineInfo[] = [];

    // KSeF deadlines depend on invoice dates
    // Get invoices that need to be submitted to KSeF
    const pendingInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        ksefStatus: {
          in: ['pending', 'failed'],
        },
        date: {
          gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), // Last month
          lte: now,
        },
      },
    });

    for (const invoice of pendingInvoices) {
      // KSeF submission should be done within 7 days of invoice issuance
      const ksefDeadline = new Date(invoice.date);
      ksefDeadline.setDate(ksefDeadline.getDate() + 7);

      if (ksefDeadline > now) {
        const daysUntilDue = Math.ceil((ksefDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        deadlines.push({
          id: `ksef_${invoice.id}`,
          type: 'ksef',
          name: 'KSeF - Przesłanie faktury',
          description: `Faktura ${invoice.series}${invoice.number} - przesłanie do KSeF`,
          dueDate: ksefDeadline,
          period: invoice.date.toISOString().slice(0, 10),
          companyId,
          tenantId,
          status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 2 ? 'due' : 'upcoming',
          daysUntilDue,
          priority: 'high',
        });
      }
    }

    return deadlines;
  }

  private calculateTotalZUSContributions(contributions: any): number {
    return (
      (contributions._sum.emerytalnaEmployer || 0) +
      (contributions._sum.rentowaEmployer || 0) +
      (contributions._sum.chorobowaEmployee || 0) +
      (contributions._sum.wypadkowaEmployer || 0) +
      (contributions._sum.zdrowotnaEmployee || 0) +
      (contributions._sum.fpEmployee || 0) +
      (contributions._sum.fgspEmployee || 0)
    );
  }

  async scheduleDeadlineReminders(deadlines: DeadlineInfo[], users: string[]): Promise<void> {
    try {
      for (const deadline of deadlines) {
        for (const userId of users) {
          await this.scheduleDeadlineRemindersForUser(deadline, userId);
        }
      }

      this.logger.log(`Scheduled reminders for ${deadlines.length} deadlines to ${users.length} users`);
    } catch (error) {
      this.logger.error(`Error scheduling deadline reminders: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async scheduleDeadlineRemindersForUser(deadline: DeadlineInfo, userId: string): Promise<void> {
    try {
      const reminders: Partial<DeadlineReminder>[] = [];

      // Schedule reminders based on deadline status and days until due
      if (deadline.status === 'upcoming' && deadline.daysUntilDue <= 7) {
        // Reminder 7 days before
        const reminderDate = new Date(deadline.dueDate);
        reminderDate.setDate(reminderDate.getDate() - 7);

        if (reminderDate > new Date()) {
          reminders.push({
            deadlineId: deadline.id,
            userId,
            tenantId: deadline.tenantId,
            reminderType: 'upcoming',
            scheduledFor: reminderDate,
            sent: false,
          });
        }
      }

      if (deadline.status === 'due' || (deadline.status === 'upcoming' && deadline.daysUntilDue <= 0)) {
        // Reminder on due date
        reminders.push({
          deadlineId: deadline.id,
          userId,
          tenantId: deadline.tenantId,
          reminderType: 'due',
          scheduledFor: deadline.dueDate,
          sent: false,
        });
      }

      if (deadline.status === 'overdue') {
        // Reminder 3 days after due date
        const overdueReminderDate = new Date(deadline.dueDate);
        overdueReminderDate.setDate(overdueReminderDate.getDate() + 3);

        reminders.push({
          deadlineId: deadline.id,
          userId,
          tenantId: deadline.tenantId,
          reminderType: 'overdue',
          scheduledFor: overdueReminderDate,
          sent: false,
        });
      }

      // Store reminders in database (you might want to add a DeadlineReminder model)
      for (const reminder of reminders) {
        // Check if reminder already exists
        const existingReminder = await this.prisma.deadlineReminder.findFirst({
          where: {
            deadlineId: reminder.deadlineId,
            user_id: reminder.userId,
            reminderType: reminder.reminderType,
          },
        });

        if (!existingReminder) {
          await this.prisma.deadlineReminder.create({
            data: reminder as any,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error scheduling reminders for user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async processScheduledReminders(): Promise<void> {
    try {
      this.logger.log('Processing scheduled deadline reminders');

      const now = new Date();
      const pendingReminders = await this.prisma.deadlineReminder.findMany({
        where: {
          scheduledFor: {
            lte: now,
          },
          sent: false,
        },
      });

      for (const reminder of pendingReminders) {
        await this.sendDeadlineReminder(reminder);
      }

      this.logger.log(`Processed ${pendingReminders.length} deadline reminders`);
    } catch (error) {
      this.logger.error(`Error processing scheduled reminders: ${error.message}`, error.stack);
    }
  }

  private async sendDeadlineReminder(reminder: any): Promise<void> {
    try {
      // Get deadline information
      const deadline = await this.getDeadlineById(reminder.deadlineId);

      if (!deadline) {
        this.logger.warn(`Deadline not found for reminder: ${reminder.deadlineId}`);
        return;
      }

      // Send notification based on reminder type
      let templateName: string;
      let variables: Record<string, any>;

      switch (reminder.reminderType) {
        case 'upcoming':
          templateName = 'vat_deadline_reminder'; // Generic template
          variables = {
            period: deadline.period,
            dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
          };
          break;
        case 'due':
          templateName = 'vat_deadline_reminder';
          variables = {
            period: deadline.period,
            dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
          };
          break;
        case 'overdue':
          templateName = 'invoice_overdue';
          variables = {
            invoiceNumber: deadline.name,
            amount: deadline.amount || 0,
            daysOverdue: Math.abs(deadline.daysUntilDue),
            counterpartyName: 'Urząd Skarbowy',
          };
          break;
        default:
          return;
      }

      // Send templated notification
      await this.pushNotificationService.sendTemplatedNotification(
        reminder.userId,
        reminder.tenantId,
        templateName,
        variables,
        {
          priority: deadline.priority,
          data: {
            deadlineId: deadline.id,
            reminderType: reminder.reminderType,
          },
        },
      );

      // Mark reminder as sent
      await this.prisma.deadlineReminder.update({
        where: { id: reminder.id },
        data: { sent: true },
      });

      this.logger.log(`Sent ${reminder.reminderType} reminder for deadline ${deadline.id} to user ${reminder.userId}`);
    } catch (error) {
      this.logger.error(`Error sending deadline reminder: ${error.message}`, error.stack);
    }
  }

  private async getDeadlineById(deadlineId: string): Promise<DeadlineInfo | null> {
    // This would typically fetch from a deadlines table
    // For now, we'll reconstruct from the ID pattern
    // In a real implementation, you'd have a proper deadlines table

    // Parse deadline ID to extract information
    const parts = deadlineId.split('_');
    if (parts.length < 3) return null;

    const type = parts[0] as DeadlineInfo['type'];
    const period = parts[parts.length - 2] + '_' + parts[parts.length - 1];

    // This is a simplified implementation
    // In reality, you'd fetch from a proper deadlines table
    return null;
  }

  async getUpcomingDeadlines(
    tenantId: string,
    companyId: string,
    daysAhead: number = 30,
  ): Promise<DeadlineInfo[]> {
    try {
      const deadlines = await this.calculateDeadlines(tenantId, companyId);
      const now = new Date();
      const futureDate = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));

      return deadlines.filter(deadline =>
        deadline.dueDate <= futureDate &&
        deadline.dueDate >= now &&
        deadline.status !== 'completed'
      );
    } catch (error) {
      this.logger.error(`Error getting upcoming deadlines: ${error.message}`, error.stack);
      throw error;
    }
  }

  async markDeadlineAsCompleted(deadlineId: string, userId: string, tenantId: string): Promise<void> {
    try {
      // In a real implementation, you'd update a deadlines table
      // For now, we'll just log the completion
      this.logger.log(`Deadline ${deadlineId} marked as completed by user ${userId}`);

      // You might want to store completion records for audit purposes
      await this.prisma.deadlineCompletion.create({
        data: {
          deadlineId,
          user_id: userId,
          tenant_id: tenantId,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Error marking deadline as completed: ${error.message}`, error.stack);
      throw error;
    }
  }
}