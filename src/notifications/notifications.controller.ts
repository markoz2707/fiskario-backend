import { Controller, Get, Post, Put, Delete, Query, Param, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PushNotificationService, NotificationTemplate } from './services/push-notification.service';
import { DeadlineManagementService, DeadlineInfo } from './services/deadline-management.service';
import { StatusCenterService, OfficialCommunication } from './services/status-center.service';
import { Request } from 'express';

interface AuthenticatedUser {
  userId: string;
  email: string;
  tenant_id: string;
  company_id?: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly pushNotificationService: PushNotificationService,
    private readonly deadlineManagementService: DeadlineManagementService,
    private readonly statusCenterService: StatusCenterService,
  ) {}

  // Template Management
  @Post('templates')
  @Roles('admin')
  async createTemplate(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() templateData: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    try {
      const template = await this.pushNotificationService.createTemplate(templateData);

      return {
        success: true,
        data: template,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to create notification template: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('templates')
  @Roles('user', 'admin')
  async getTemplates(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query('type') type?: string,
  ) {
    try {
      const templates = await this.pushNotificationService.getTemplates(type);

      return {
        success: true,
        data: templates,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch notification templates: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('templates/:id')
  @Roles('admin')
  async updateTemplate(
    @Param('id') templateId: string,
    @Body() updates: Partial<NotificationTemplate>,
  ) {
    try {
      const template = await this.pushNotificationService.updateTemplate(templateId, updates);

      return {
        success: true,
        data: template,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update notification template: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('templates/:id')
  @Roles('admin')
  async deleteTemplate(@Param('id') templateId: string) {
    try {
      await this.pushNotificationService.deleteTemplate(templateId);

      return {
        success: true,
        message: 'Template deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        `Failed to delete notification template: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // User Notifications
  @Get('user')
  @Roles('user', 'admin')
  async getUserNotifications(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: {
      limit?: string;
      offset?: string;
      type?: string;
      status?: string;
    },
  ) {
    try {
      const { userId, tenant_id } = req.user;

      const options = {
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
        type: query.type,
        status: query.status,
      };

      const result = await this.pushNotificationService.getUserNotifications(userId, tenant_id, options);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch user notifications: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('user/:notificationId/read')
  @Roles('user', 'admin')
  async markNotificationAsRead(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('notificationId') notificationId: string,
  ) {
    try {
      const { userId } = req.user;

      await this.pushNotificationService.markNotificationAsRead(notificationId, userId);

      return {
        success: true,
        message: 'Notification marked as read',
      };
    } catch (error) {
      throw new HttpException(
        `Failed to mark notification as read: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('user/mark-all-read')
  @Roles('user', 'admin')
  async markAllNotificationsAsRead(
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    try {
      const { userId, tenant_id } = req.user;

      const count = await this.pushNotificationService.markAllNotificationsAsRead(userId, tenant_id);

      return {
        success: true,
        message: `${count} notifications marked as read`,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to mark all notifications as read: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Deadline Management
  @Get('deadlines')
  @Roles('user', 'admin')
  async getDeadlines(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: { daysAhead?: string },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const daysAhead = query.daysAhead ? parseInt(query.daysAhead) : 30;
      const deadlines = await this.deadlineManagementService.getUpcomingDeadlines(tenant_id, company_id, daysAhead);

      return {
        success: true,
        data: deadlines,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch deadlines: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('deadlines/calculate')
  @Roles('user', 'admin')
  async calculateDeadlines(
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const deadlines = await this.deadlineManagementService.calculateDeadlines(tenant_id, company_id);

      return {
        success: true,
        data: deadlines,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to calculate deadlines: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('deadlines/:deadlineId/complete')
  @Roles('user', 'admin')
  async markDeadlineAsCompleted(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('deadlineId') deadlineId: string,
    @Body() body: { notes?: string },
  ) {
    try {
      const { userId } = req.user;

      await this.deadlineManagementService.markDeadlineAsCompleted(deadlineId, userId);

      return {
        success: true,
        message: 'Deadline marked as completed',
      };
    } catch (error) {
      throw new HttpException(
        `Failed to mark deadline as completed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Status Center
  @Get('status-center')
  @Roles('user', 'admin')
  async getStatusCenter(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: {
      entityType?: string;
      officialBody?: string;
      status?: string;
      direction?: string;
      limit?: string;
      offset?: string;
    },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const filters = {
        entityType: query.entityType,
        officialBody: query.officialBody,
        status: query.status,
        direction: query.direction,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
      };

      const result = await this.statusCenterService.getCommunications(tenant_id, company_id, filters);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch status center data: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status-center/pending-responses')
  @Roles('user', 'admin')
  async getPendingResponses(
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const pendingResponses = await this.statusCenterService.getPendingResponses(tenant_id, company_id);

      return {
        success: true,
        data: pendingResponses,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch pending responses: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status-center/timeline')
  @Roles('user', 'admin')
  async getCommunicationTimeline(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: { entityType?: string; entityId?: string },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const timeline = await this.statusCenterService.getCommunicationTimeline(
        tenant_id,
        company_id,
        query.entityType,
        query.entityId,
      );

      return {
        success: true,
        data: timeline,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch communication timeline: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('status-center/communications')
  @Roles('admin')
  async recordCommunication(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() communicationData: {
      type: 'submission' | 'confirmation' | 'rejection' | 'correction' | 'inquiry';
      entityType: 'invoice' | 'declaration' | 'zus' | 'tax';
      entityId: string;
      status: 'sent' | 'delivered' | 'acknowledged' | 'rejected' | 'pending_response';
      direction: 'outbound' | 'inbound';
      officialBody: 'urzad_skarbowy' | 'zus' | 'ksef' | 'other';
      referenceNumber?: string;
      upoNumber?: string;
      description: string;
      content: Record<string, any>;
      responseRequired?: boolean;
      responseDeadline?: string;
    },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const communication = await this.statusCenterService.recordCommunication(tenant_id, company_id, {
        ...communicationData,
        responseDeadline: communicationData.responseDeadline ? new Date(communicationData.responseDeadline) : undefined,
        responseRequired: communicationData.responseRequired || false,
      });

      return {
        success: true,
        data: communication,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to record communication: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('status-center/communications/:communicationId/status')
  @Roles('admin')
  async updateCommunicationStatus(
    @Param('communicationId') communicationId: string,
    @Body() body: {
      status: 'sent' | 'delivered' | 'acknowledged' | 'rejected' | 'pending_response';
      additionalData?: Record<string, any>;
    },
  ) {
    try {
      const communication = await this.statusCenterService.updateCommunicationStatus(
        communicationId,
        body.status,
        body.additionalData,
      );

      return {
        success: true,
        data: communication,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update communication status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('status-center/submission-status')
  @Roles('user', 'admin')
  async recordSubmissionStatus(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: {
      entityType: 'invoice' | 'declaration' | 'zus' | 'tax';
      entityId: string;
      status: 'submitted' | 'accepted' | 'rejected';
      referenceNumber?: string;
      upoNumber?: string;
      details?: Record<string, any>;
    },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const communication = await this.statusCenterService.recordSubmissionStatus(
        tenant_id,
        company_id,
        body.entityType,
        body.entityId,
        body.status,
        body.referenceNumber,
        body.upoNumber,
        body.details,
      );

      return {
        success: true,
        data: communication,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to record submission status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status-center/compliance-report')
  @Roles('admin')
  async getComplianceReport(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: { startDate: string; endDate: string },
  ) {
    try {
      const { tenant_id, company_id } = req.user;

      if (!company_id) {
        throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
      }

      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);

      const report = await this.statusCenterService.generateComplianceReport(
        tenant_id,
        company_id,
        startDate,
        endDate,
      );

      return {
        success: true,
        data: report,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate compliance report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Test/Utility endpoints
  @Post('test-notification')
  @Roles('admin')
  async sendTestNotification(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: {
      templateName: string;
      variables?: Record<string, any>;
    },
  ) {
    try {
      const { userId, tenant_id } = req.user;

      await this.pushNotificationService.sendTemplatedNotification(
        userId,
        tenant_id,
        body.templateName,
        body.variables || {},
        {
          priority: 'normal',
          data: { test: true },
        },
      );

      return {
        success: true,
        message: 'Test notification sent',
      };
    } catch (error) {
      throw new HttpException(
        `Failed to send test notification: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('initialize-templates')
  @Roles('admin')
  async initializeDefaultTemplates() {
    try {
      await this.pushNotificationService.initializeDefaultTemplates();

      return {
        success: true,
        message: 'Default templates initialized',
      };
    } catch (error) {
      throw new HttpException(
        `Failed to initialize default templates: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}