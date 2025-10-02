import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'deadline' | 'status' | 'reminder' | 'info';
  title: string;
  body: string;
  variables: string[]; // Array of variable names like ['companyName', 'dueDate']
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPayload {
  userId: string;
  tenantId: string;
  type: 'deadline' | 'status' | 'reminder' | 'info';
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  scheduledFor?: Date;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(private prisma: PrismaService) {}

  async createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
    try {
      const newTemplate = await this.prisma.notificationTemplate.create({
        data: {
          name: template.name,
          type: template.type,
          title: template.title,
          body: template.body,
          variables: template.variables,
          isActive: template.isActive,
        },
      });

      this.logger.log(`Created notification template: ${template.name}`);
      return newTemplate;
    } catch (error) {
      this.logger.error(`Error creating notification template: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTemplates(type?: string): Promise<NotificationTemplate[]> {
    try {
      const whereClause: any = { isActive: true };
      if (type) {
        whereClause.type = type;
      }

      const templates = await this.prisma.notificationTemplate.findMany({
        where: whereClause,
        orderBy: { name: 'asc' },
      });

      return templates;
    } catch (error) {
      this.logger.error(`Error fetching notification templates: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTemplateById(id: string): Promise<NotificationTemplate | null> {
    try {
      const template = await this.prisma.notificationTemplate.findUnique({
        where: { id },
      });

      return template;
    } catch (error) {
      this.logger.error(`Error fetching notification template ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateTemplate(id: string, updates: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    try {
      const updatedTemplate = await this.prisma.notificationTemplate.update({
        where: { id },
        data: updates,
      });

      this.logger.log(`Updated notification template: ${id}`);
      return updatedTemplate;
    } catch (error) {
      this.logger.error(`Error updating notification template ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    try {
      await this.prisma.notificationTemplate.delete({
        where: { id },
      });

      this.logger.log(`Deleted notification template: ${id}`);
    } catch (error) {
      this.logger.error(`Error deleting notification template ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      // Store notification in database
      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          tenantId: payload.tenantId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          priority: payload.priority || 'normal',
          scheduledFor: payload.scheduledFor || new Date(),
          status: payload.scheduledFor && payload.scheduledFor > new Date() ? 'scheduled' : 'pending',
        },
      });

      // Here you would integrate with actual push notification services
      // like Firebase Cloud Messaging, Apple Push Notifications, etc.
      await this.sendPushNotification(payload);

      this.logger.log(`Notification sent to user ${payload.userId}: ${payload.title}`);
    } catch (error) {
      this.logger.error(`Error sending notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendBulkNotifications(payloads: NotificationPayload[]): Promise<void> {
    try {
      const notifications = payloads.map(payload => ({
        userId: payload.userId,
        tenantId: payload.tenantId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        priority: payload.priority || 'normal',
        scheduledFor: payload.scheduledFor || new Date(),
        status: payload.scheduledFor && payload.scheduledFor > new Date() ? 'scheduled' : 'pending',
      }));

      await this.prisma.notification.createMany({
        data: notifications,
      });

      // Send actual push notifications
      for (const payload of payloads) {
        await this.sendPushNotification(payload);
      }

      this.logger.log(`Bulk notifications sent: ${payloads.length} notifications`);
    } catch (error) {
      this.logger.error(`Error sending bulk notifications: ${error.message}`, error.stack);
      throw error;
    }
  }

  async processTemplate(
    template: NotificationTemplate,
    variables: Record<string, any>,
  ): Promise<{ title: string; body: string }> {
    let processedTitle = template.title;
    let processedBody = template.body;

    // Replace variables in title and body
    for (const variable of template.variables) {
      const placeholder = `{${variable}}`;
      const value = variables[variable] || '';

      processedTitle = processedTitle.replace(new RegExp(placeholder, 'g'), String(value));
      processedBody = processedBody.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return {
      title: processedTitle,
      body: processedBody,
    };
  }

  async sendTemplatedNotification(
    userId: string,
    tenantId: string,
    templateName: string,
    variables: Record<string, any>,
    options?: {
      priority?: 'low' | 'normal' | 'high';
      scheduledFor?: Date;
      data?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      // Find the template
      const templates = await this.getTemplates();
      const template = templates.find(t => t.name === templateName);

      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // Process template with variables
      const { title, body } = await this.processTemplate(template, variables);

      // Send notification
      await this.sendNotification({
        userId,
        tenantId,
        type: template.type,
        title,
        body,
        priority: options?.priority,
        scheduledFor: options?.scheduledFor,
        data: options?.data,
      });

      this.logger.log(`Templated notification sent to user ${userId} using template ${templateName}`);
    } catch (error) {
      this.logger.error(`Error sending templated notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserNotifications(
    userId: string,
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: string;
      status?: string;
    },
  ) {
    try {
      const whereClause: any = {
        userId,
        tenantId,
      };

      if (options?.type) {
        whereClause.type = options.type;
      }

      if (options?.status) {
        whereClause.status = options.status;
      }

      const notifications = await this.prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      });

      const total = await this.prisma.notification.count({
        where: whereClause,
      });

      return {
        notifications,
        total,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      };
    } catch (error) {
      this.logger.error(`Error fetching user notifications: ${error.message}`, error.stack);
      throw error;
    }
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          readAt: new Date(),
          status: 'read',
        },
      });

      this.logger.log(`Notification ${notificationId} marked as read for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error marking notification as read: ${error.message}`, error.stack);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string, tenantId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          tenantId,
          status: {
            in: ['pending', 'sent'],
          },
        },
        data: {
          readAt: new Date(),
          status: 'read',
        },
      });

      this.logger.log(`Marked ${result.count} notifications as read for user ${userId}`);
      return result.count;
    } catch (error) {
      this.logger.error(`Error marking all notifications as read: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async sendPushNotification(payload: NotificationPayload): Promise<void> {
    // Here you would integrate with actual push notification services
    // For now, we'll just log the notification

    this.logger.log(`[PUSH NOTIFICATION] To: ${payload.userId}`);
    this.logger.log(`[PUSH NOTIFICATION] Title: ${payload.title}`);
    this.logger.log(`[PUSH NOTIFICATION] Body: ${payload.body}`);
    this.logger.log(`[PUSH NOTIFICATION] Type: ${payload.type}`);

    // Example integrations you might add:
    // - Firebase Cloud Messaging (FCM)
    // - Apple Push Notification Service (APNs)
    // - Microsoft Push Notification Service (MPNS)
    // - Web Push API

    // For production, you would:
    // 1. Get user's device tokens from database
    // 2. Send push notification via chosen service
    // 3. Handle delivery confirmations and failures
  }

  async initializeDefaultTemplates(): Promise<void> {
    try {
      const defaultTemplates = [
        {
          name: 'vat_deadline_reminder',
          type: 'deadline' as const,
          title: 'Przypomnienie: Termin składania deklaracji VAT',
          body: 'Przypominamy o zbliżającym się terminie składania deklaracji VAT za okres {period}. Termin upływa {dueDate}.',
          variables: ['period', 'dueDate'],
          isActive: true,
        },
        {
          name: 'zus_deadline_reminder',
          type: 'deadline' as const,
          title: 'Przypomnienie: Termin płatności składek ZUS',
          body: 'Przypominamy o terminie płatności składek ZUS za okres {period}. Kwota do zapłaty: {amount} PLN. Termin: {dueDate}.',
          variables: ['period', 'amount', 'dueDate'],
          isActive: true,
        },
        {
          name: 'ksef_submission_status',
          type: 'status' as const,
          title: 'Status przesyłania faktury KSeF',
          body: 'Faktura {invoiceNumber} została {status} w systemie KSeF. Numer referencyjny: {referenceNumber}.',
          variables: ['invoiceNumber', 'status', 'referenceNumber'],
          isActive: true,
        },
        {
          name: 'pit_deadline_reminder',
          type: 'deadline' as const,
          title: 'Przypomnienie: Termin składania PIT',
          body: 'Przypominamy o terminie składania deklaracji PIT-{pitType} za rok {year}. Termin upływa {dueDate}.',
          variables: ['pitType', 'year', 'dueDate'],
          isActive: true,
        },
        {
          name: 'invoice_overdue',
          type: 'reminder' as const,
          title: 'Faktura przeterminowana',
          body: 'Faktura {invoiceNumber} na kwotę {amount} PLN jest przeterminowana od {daysOverdue} dni. Kontrahent: {counterpartyName}.',
          variables: ['invoiceNumber', 'amount', 'daysOverdue', 'counterpartyName'],
          isActive: true,
        },
      ];

      for (const template of defaultTemplates) {
        const existing = await this.prisma.notificationTemplate.findFirst({
          where: { name: template.name },
        });

        if (!existing) {
          await this.createTemplate(template);
          this.logger.log(`Created default template: ${template.name}`);
        }
      }

      this.logger.log('Default notification templates initialized');
    } catch (error) {
      this.logger.error(`Error initializing default templates: ${error.message}`, error.stack);
      throw error;
    }
  }
}