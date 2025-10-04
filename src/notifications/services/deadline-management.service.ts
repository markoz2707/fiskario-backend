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

    // Get company tax settings to determine VAT filing frequency
    const companyTaxSettings = await this.prisma.companyTaxSettings.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        taxForm: {
          category: 'value_added_tax',
        },
        isSelected: true,
      },
      include: {
        taxForm: true,
      },
    });

    const hasMonthlyVAT = companyTaxSettings.some(setting =>
      setting.taxForm.code === 'VAT' && (setting.settings as any)?.filingFrequency === 'monthly'
    );
    const hasQuarterlyVAT = companyTaxSettings.some(setting =>
      setting.taxForm.code === 'VAT' && (setting.settings as any)?.filingFrequency === 'quarterly'
    );

    // JPK_V7M Monthly deadlines (25th of following month)
    if (hasMonthlyVAT) {
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const jpkV7MDeadline = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 25);

      if (jpkV7MDeadline > now) {
        const daysUntilDue = Math.ceil((jpkV7MDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        deadlines.push({
          id: `jpk_v7m_${currentMonth.getFullYear()}_${currentMonth.getMonth() + 1}`,
          type: 'vat',
          name: 'JPK_V7M',
          description: 'Miesięczne Jednolite Pliki Kontrolne VAT (JPK_V7M)',
          dueDate: jpkV7MDeadline,
          period: `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}`,
          companyId,
          tenantId,
          status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 7 ? 'due' : 'upcoming',
          daysUntilDue,
          priority: 'high',
        });
      }
    }

    // JPK_V7K Quarterly deadlines (25th of month following quarter end)
    if (hasQuarterlyVAT) {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
      const quarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      const jpkV7KDeadline = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth() + 1, 25);

      if (jpkV7KDeadline > now) {
        const daysUntilDue = Math.ceil((jpkV7KDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        deadlines.push({
          id: `jpk_v7k_${quarterEnd.getFullYear()}_Q${currentQuarter + 1}`,
          type: 'vat',
          name: 'JPK_V7K',
          description: 'Kwartalne Jednolite Pliki Kontrolne VAT (JPK_V7K)',
          dueDate: jpkV7KDeadline,
          period: `${quarterEnd.getFullYear()}-Q${currentQuarter + 1}`,
          companyId,
          tenantId,
          status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 7 ? 'due' : 'upcoming',
          daysUntilDue,
          priority: 'high',
        });
      }
    }

    // Calculate for next 12 months/4 quarters to ensure we don't miss upcoming deadlines
    const futureDate = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));

    if (hasMonthlyVAT) {
      for (let monthOffset = 1; monthOffset <= 12; monthOffset++) {
        const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        if (targetMonth > futureDate) break;

        const jpkV7MDeadline = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 25);
        if (jpkV7MDeadline > now) {
          const daysUntilDue = Math.ceil((jpkV7MDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          deadlines.push({
            id: `jpk_v7m_${targetMonth.getFullYear()}_${targetMonth.getMonth() + 1}`,
            type: 'vat',
            name: 'JPK_V7M',
            description: `JPK_V7M za ${targetMonth.getMonth() + 1}/${targetMonth.getFullYear()}`,
            dueDate: jpkV7MDeadline,
            period: `${targetMonth.getFullYear()}-${(targetMonth.getMonth() + 1).toString().padStart(2, '0')}`,
            companyId,
            tenantId,
            status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 7 ? 'due' : 'upcoming',
            daysUntilDue,
            priority: 'high',
          });
        }
      }
    }

    if (hasQuarterlyVAT) {
      for (let quarterOffset = 1; quarterOffset <= 4; quarterOffset++) {
        const targetQuarter = Math.floor((now.getMonth() + quarterOffset * 3) / 12);
        const targetYear = now.getFullYear() + (targetQuarter > 0 ? 0 : 1);
        const actualQuarter = ((Math.floor(now.getMonth() / 3) + quarterOffset) % 4) + 1;

        const quarterEnd = new Date(targetYear, actualQuarter * 3, 0);
        if (quarterEnd > futureDate) break;

        const jpkV7KDeadline = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth() + 1, 25);
        if (jpkV7KDeadline > now) {
          const daysUntilDue = Math.ceil((jpkV7KDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          deadlines.push({
            id: `jpk_v7k_${quarterEnd.getFullYear()}_Q${actualQuarter}`,
            type: 'vat',
            name: 'JPK_V7K',
            description: `JPK_V7K za ${actualQuarter} kwartał ${quarterEnd.getFullYear()}`,
            dueDate: jpkV7KDeadline,
            period: `${quarterEnd.getFullYear()}-Q${actualQuarter}`,
            companyId,
            tenantId,
            status: daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 7 ? 'due' : 'upcoming',
            daysUntilDue,
            priority: 'high',
          });
        }
      }
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
      // Get user/company specific reminder settings
      const reminderSettings = await this.getReminderSettings(deadline.tenantId, deadline.companyId);

      if (!reminderSettings.enabled) {
        return; // Reminders disabled for this company
      }

      const reminderDays = reminderSettings.reminderDays || [7, 3, 1];
      const reminders: Partial<DeadlineReminder>[] = [];

      // Schedule configurable reminders before deadline
      for (const daysBefore of reminderDays) {
        if (deadline.daysUntilDue >= daysBefore) {
          const reminderDate = new Date(deadline.dueDate);
          reminderDate.setDate(reminderDate.getDate() - daysBefore);

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
      }

      // Schedule reminder on due date (if enabled)
      if (deadline.daysUntilDue >= 0) {
        reminders.push({
          deadlineId: deadline.id,
          userId,
          tenantId: deadline.tenantId,
          reminderType: 'due',
          scheduledFor: deadline.dueDate,
          sent: false,
        });
      }

      // Schedule overdue reminders (3 and 7 days after deadline)
      if (deadline.status === 'overdue' || deadline.daysUntilDue < 0) {
        const daysOverdue = Math.abs(deadline.daysUntilDue);

        // Reminder 3 days after deadline
        if (daysOverdue >= 3) {
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

        // Reminder 7 days after deadline
        if (daysOverdue >= 7) {
          const overdueReminderDate = new Date(deadline.dueDate);
          overdueReminderDate.setDate(overdueReminderDate.getDate() + 7);

          reminders.push({
            deadlineId: deadline.id,
            userId,
            tenantId: deadline.tenantId,
            reminderType: 'overdue',
            scheduledFor: overdueReminderDate,
            sent: false,
          });
        }
      }

      // Store reminders in database
      for (const reminder of reminders) {
        // Check if reminder already exists
        const existingReminder = await this.prisma.deadlineReminder.findFirst({
          where: {
            deadlineId: reminder.deadlineId,
            user_id: reminder.userId,
            reminderType: reminder.reminderType,
            scheduledFor: reminder.scheduledFor,
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

      // Send notification based on reminder type and deadline type
      let templateName: string;
      let variables: Record<string, any>;

      switch (reminder.reminderType) {
        case 'upcoming':
          if (deadline.type === 'vat') {
            templateName = 'jpk_deadline_reminder';
            variables = {
              declarationType: deadline.name,
              period: this.formatPeriodDisplay(deadline.period),
              dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
              daysUntilDue: deadline.daysUntilDue,
            };
          } else {
            templateName = 'deadline_reminder';
            variables = {
              declarationType: deadline.name,
              period: this.formatPeriodDisplay(deadline.period),
              dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
              daysUntilDue: deadline.daysUntilDue,
            };
          }
          break;
        case 'due':
          if (deadline.type === 'vat') {
            templateName = 'jpk_deadline_due';
            variables = {
              declarationType: deadline.name,
              period: this.formatPeriodDisplay(deadline.period),
              dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
            };
          } else {
            templateName = 'deadline_due';
            variables = {
              declarationType: deadline.name,
              period: this.formatPeriodDisplay(deadline.period),
              dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
            };
          }
          break;
        case 'overdue':
          templateName = 'deadline_overdue';
          variables = {
            declarationType: deadline.name,
            period: this.formatPeriodDisplay(deadline.period),
            dueDate: deadline.dueDate.toLocaleDateString('pl-PL'),
            daysOverdue: Math.abs(deadline.daysUntilDue),
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
            declarationType: deadline.type,
          },
        },
      );

      // Mark reminder as sent
      await this.prisma.deadlineReminder.update({
        where: { id: reminder.id },
        data: {
          sent: true,
          sentAt: new Date(),
        },
      });

      this.logger.log(`Sent ${reminder.reminderType} reminder for deadline ${deadline.id} to user ${reminder.userId}`);
    } catch (error) {
      this.logger.error(`Error sending deadline reminder: ${error.message}`, error.stack);
    }
  }

  private formatPeriodDisplay(period: string): string {
    // Convert YYYY-MM to readable format for monthly periods
    if (period.includes('-') && !period.includes('Q')) {
      const [year, month] = period.split('-');
      const monthNames = [
        'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
        'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'
      ];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    // Convert YYYY-QX to readable format for quarterly periods
    if (period.includes('-Q')) {
      const [year, quarter] = period.split('-Q');
      const quarterNames = ['pierwszy', 'drugi', 'trzeci', 'czwarty'];
      const quarterIndex = parseInt(quarter) - 1;
      return `${quarterNames[quarterIndex]} kwartał ${year}`;
    }

    return period;
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

  async getReminderSettings(tenantId: string, companyId: string): Promise<{
    enabled: boolean;
    reminderDays: number[];
    notificationMethods: string[];
  }> {
    try {
      // Try to get settings from database first
      // For now, return default settings with Polish tax compliance defaults
      return {
        enabled: true,
        reminderDays: [7, 3, 1], // 7 days, 3 days, 1 day before deadline
        notificationMethods: ['push', 'email'],
      };
    } catch (error) {
      this.logger.error(`Error getting reminder settings: ${error.message}`, error.stack);
      // Return safe defaults
      return {
        enabled: true,
        reminderDays: [7, 3, 1],
        notificationMethods: ['push'],
      };
    }
  }

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

      // In a real implementation, you would store these settings in the database
      // For now, just log the action

      // You could extend the Company model to include reminderSettings JSON field
      // await this.prisma.company.update({
      //   where: { tenant_id: tenantId, id: companyId },
      //   data: { reminderSettings: settings }
      // });
    } catch (error) {
      this.logger.error(`Error updating reminder settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  async generateComplianceReport(
    tenantId: string,
    companyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      this.logger.log(`Generating compliance report for company ${companyId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get all deadlines for the period
      const allDeadlines = await this.calculateDeadlines(tenantId, companyId);

      // Filter deadlines within the reporting period
      const periodDeadlines = allDeadlines.filter(deadline =>
        deadline.dueDate >= startDate && deadline.dueDate <= endDate
      );

      // Get completion records for the period
      const completionRecords = await this.prisma.deadlineCompletion.findMany({
        where: {
          tenant_id: tenantId,
          deadlineId: {
            in: periodDeadlines.map(d => d.id),
          },
        },
      });

      // Calculate compliance metrics
      const totalDeadlines = periodDeadlines.length;
      const completedDeadlines = completionRecords.length;
      const overdueDeadlines = periodDeadlines.filter(d => d.status === 'overdue').length;
      const onTimeCompletions = completionRecords.filter(completion => {
        const deadline = periodDeadlines.find(d => d.id === completion.deadlineId);
        return deadline && completion.completedAt <= deadline.dueDate;
      }).length;

      const complianceRate = totalDeadlines > 0 ? (completedDeadlines / totalDeadlines) * 100 : 0;
      const onTimeRate = completedDeadlines > 0 ? (onTimeCompletions / completedDeadlines) * 100 : 0;

      // Group by deadline type
      const deadlinesByType = periodDeadlines.reduce((acc, deadline) => {
        if (!acc[deadline.type]) {
          acc[deadline.type] = { total: 0, completed: 0, overdue: 0 };
        }
        acc[deadline.type].total++;
        if (deadline.status === 'overdue') {
          acc[deadline.type].overdue++;
        }
        if (completionRecords.some(c => c.deadlineId === deadline.id)) {
          acc[deadline.type].completed++;
        }
        return acc;
      }, {} as Record<string, { total: number; completed: number; overdue: number; }>);

      // Generate trends (comparing with previous period)
      const previousPeriodStart = new Date(startDate);
      const previousPeriodEnd = new Date(endDate);
      const periodLength = endDate.getTime() - startDate.getTime();
      previousPeriodStart.setTime(previousPeriodStart.getTime() - periodLength);

      const previousPeriodDeadlines = await this.calculateDeadlines(tenantId, companyId);
      const previousPeriodFiltered = previousPeriodDeadlines.filter(deadline =>
        deadline.dueDate >= previousPeriodStart && deadline.dueDate <= previousPeriodEnd
      );

      const previousCompletions = await this.prisma.deadlineCompletion.count({
        where: {
          tenant_id: tenantId,
          completedAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd,
          },
        },
      });

      const previousComplianceRate = previousPeriodFiltered.length > 0 ?
        (previousCompletions / previousPeriodFiltered.length) * 100 : 0;

      const trend = complianceRate - previousComplianceRate;

      return {
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          totalDeadlines,
          completedDeadlines,
          overdueDeadlines,
          complianceRate: Math.round(complianceRate * 100) / 100,
          onTimeRate: Math.round(onTimeRate * 100) / 100,
          trend: Math.round(trend * 100) / 100,
        },
        breakdownByType: deadlinesByType,
        recommendations: this.generateComplianceRecommendations(
          complianceRate,
          onTimeRate,
          overdueDeadlines,
          deadlinesByType
        ),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error generating compliance report: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateComplianceRecommendations(
    complianceRate: number,
    onTimeRate: number,
    overdueDeadlines: number,
    deadlinesByType: Record<string, any>
  ): string[] {
    const recommendations: string[] = [];

    if (complianceRate < 80) {
      recommendations.push('Niski wskaźnik zgodności - rozważ zwiększenie częstotliwości przypomnień');
    }

    if (onTimeRate < 70) {
      recommendations.push('Niski wskaźnik terminowości - rozważ wcześniejsze wysyłanie przypomnień');
    }

    if (overdueDeadlines > 0) {
      recommendations.push(`${overdueDeadlines} przeterminowanych terminów wymaga natychmiastowej uwagi`);
    }

    // Check for problematic deadline types
    Object.entries(deadlinesByType).forEach(([type, stats]) => {
      const typeCompliance = (stats.completed / stats.total) * 100;
      if (typeCompliance < 50) {
        const typeNames = {
          vat: 'VAT',
          zus: 'ZUS',
          pit: 'PIT',
          cit: 'CIT',
          ksef: 'KSeF',
        };
        recommendations.push(`Niska zgodność dla deklaracji ${typeNames[type] || type} - rozważ dodatkowe szkolenia lub automatyzację`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Doskonała zgodność z terminami - kontynuuj obecne praktyki');
    }

    return recommendations;
  }

  async getDeadlineHistory(
    tenantId: string,
    companyId: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      // Get recent completion records with deadline information
      const completionRecords = await this.prisma.deadlineCompletion.findMany({
        where: {
          tenant_id: tenantId,
        },
        orderBy: {
          completedAt: 'desc',
        },
        take: limit,
      });

      return completionRecords.map(record => ({
        id: record.id,
        deadlineId: record.deadlineId,
        completedAt: record.completedAt,
        completedBy: record.user_id,
        // Additional deadline info would be populated from a deadlines table
      }));
    } catch (error) {
      this.logger.error(`Error getting deadline history: ${error.message}`, error.stack);
      throw error;
    }
  }
}