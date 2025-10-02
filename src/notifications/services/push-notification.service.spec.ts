import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService, NotificationTemplate, NotificationPayload } from './push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    notificationTemplate: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTemplate', () => {
    const mockTemplateData = {
      name: 'test_template',
      type: 'deadline' as const,
      title: 'Test Template',
      body: 'This is a test template with {variable}',
      variables: ['variable'],
      isActive: true,
    };

    const mockCreatedTemplate: NotificationTemplate = {
      id: 'template-id',
      name: 'test_template',
      type: 'deadline',
      title: 'Test Template',
      body: 'This is a test template with {variable}',
      variables: ['variable'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.notificationTemplate.create.mockResolvedValue(mockCreatedTemplate);
    });

    it('should create template successfully', async () => {
      const result = await service.createTemplate(mockTemplateData);

      expect(result).toEqual(mockCreatedTemplate);

      expect(prismaService.notificationTemplate.create).toHaveBeenCalledWith({
        data: {
          name: 'test_template',
          type: 'deadline',
          title: 'Test Template',
          body: 'This is a test template with {variable}',
          variables: ['variable'],
          isActive: true,
        },
      });
    });

    it('should handle database errors during template creation', async () => {
      mockPrismaService.notificationTemplate.create.mockRejectedValue(new Error('Database error'));

      await expect(service.createTemplate(mockTemplateData))
        .rejects.toThrow('Database error');
    });

    it('should handle template with no variables', async () => {
      const templateWithoutVariables = {
        ...mockTemplateData,
        variables: [],
      };

      const result = await service.createTemplate(templateWithoutVariables);

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          variables: [],
        }),
      });
    });

    it('should handle template with multiple variables', async () => {
      const templateWithMultipleVariables = {
        ...mockTemplateData,
        variables: ['var1', 'var2', 'var3'],
      };

      const result = await service.createTemplate(templateWithMultipleVariables);

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          variables: ['var1', 'var2', 'var3'],
        }),
      });
    });

    it('should handle special characters in template content', async () => {
      const templateWithSpecialChars = {
        ...mockTemplateData,
        title: 'Template with ñáéíóú 🚀',
        body: 'Body with spëcial çhars!@#$%',
      };

      const result = await service.createTemplate(templateWithSpecialChars);

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Template with ñáéíóú 🚀',
          body: 'Body with spëcial çhars!@#$%',
        }),
      });
    });

    it('should handle very long template content', async () => {
      const longContent = 'A'.repeat(1000);
      const templateWithLongContent = {
        ...mockTemplateData,
        title: longContent,
        body: longContent,
      };

      const result = await service.createTemplate(templateWithLongContent);

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: longContent,
          body: longContent,
        }),
      });
    });

    it('should handle concurrent template creation', async () => {
      const templates = Array.from({ length: 5 }, (_, i) => ({
        ...mockTemplateData,
        name: `template_${i}`,
      }));

      const results = await Promise.all(
        templates.map(template => service.createTemplate(template))
      );

      expect(results).toHaveLength(5);
      expect(prismaService.notificationTemplate.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('getTemplates', () => {
    const mockTemplates: NotificationTemplate[] = [
      {
        id: 'template-1',
        name: 'template_1',
        type: 'deadline',
        title: 'Template 1',
        body: 'Body 1',
        variables: ['var1'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'template-2',
        name: 'template_2',
        type: 'status',
        title: 'Template 2',
        body: 'Body 2',
        variables: ['var2'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    beforeEach(() => {
      mockPrismaService.notificationTemplate.findMany.mockResolvedValue(mockTemplates);
    });

    it('should get all active templates', async () => {
      const result = await service.getTemplates();

      expect(result).toEqual(mockTemplates);
      expect(result).toHaveLength(2);

      expect(prismaService.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });

    it('should get templates filtered by type', async () => {
      const result = await service.getTemplates('deadline');

      expect(result).toEqual([mockTemplates[0]]);

      expect(prismaService.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          type: 'deadline',
        },
        orderBy: { name: 'asc' },
      });
    });

    it('should return empty array when no templates found', async () => {
      mockPrismaService.notificationTemplate.findMany.mockResolvedValue([]);

      const result = await service.getTemplates();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrismaService.notificationTemplate.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getTemplates())
        .rejects.toThrow('Database error');
    });

    it('should handle different template types', async () => {
      const types = ['deadline', 'status', 'reminder', 'info'];

      for (const type of types) {
        const result = await service.getTemplates(type);

        expect(result).toBeDefined();
        expect(prismaService.notificationTemplate.findMany).toHaveBeenCalledWith({
          where: {
            isActive: true,
            type,
          },
          orderBy: { name: 'asc' },
        });
      }
    });

    it('should handle concurrent template retrieval', async () => {
      const types = ['deadline', 'status', 'reminder'];

      const results = await Promise.all(
        types.map(type => service.getTemplates(type))
      );

      expect(results).toHaveLength(3);
      expect(prismaService.notificationTemplate.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('getTemplateById', () => {
    const mockTemplate: NotificationTemplate = {
      id: 'template-123',
      name: 'test_template',
      type: 'deadline',
      title: 'Test Template',
      body: 'Test Body',
      variables: ['variable'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.notificationTemplate.findUnique.mockResolvedValue(mockTemplate);
    });

    it('should get template by ID successfully', async () => {
      const result = await service.getTemplateById('template-123');

      expect(result).toEqual(mockTemplate);

      expect(prismaService.notificationTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: 'template-123' },
      });
    });

    it('should return null when template not found', async () => {
      mockPrismaService.notificationTemplate.findUnique.mockResolvedValue(null);

      const result = await service.getTemplateById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPrismaService.notificationTemplate.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.getTemplateById('template-123'))
        .rejects.toThrow('Database error');
    });

    it('should handle invalid ID formats', async () => {
      const invalidIds = ['', '   ', null, undefined];

      for (const invalidId of invalidIds) {
        await expect(service.getTemplateById(invalidId as any))
          .rejects.toThrow();
      }
    });

    it('should handle very long ID strings', async () => {
      const longId = 'template-' + 'a'.repeat(1000);

      const result = await service.getTemplateById(longId);

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: longId },
      });
    });
  });

  describe('updateTemplate', () => {
    const mockUpdates = {
      title: 'Updated Title',
      body: 'Updated Body',
      isActive: false,
    };

    const mockUpdatedTemplate: NotificationTemplate = {
      id: 'template-123',
      name: 'test_template',
      type: 'deadline',
      title: 'Updated Title',
      body: 'Updated Body',
      variables: ['variable'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.notificationTemplate.update.mockResolvedValue(mockUpdatedTemplate);
    });

    it('should update template successfully', async () => {
      const result = await service.updateTemplate('template-123', mockUpdates);

      expect(result).toEqual(mockUpdatedTemplate);

      expect(prismaService.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: mockUpdates,
      });
    });

    it('should handle partial updates', async () => {
      const partialUpdates = { title: 'Partially Updated' };

      const result = await service.updateTemplate('template-123', partialUpdates);

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: partialUpdates,
      });
    });

    it('should handle empty updates object', async () => {
      const result = await service.updateTemplate('template-123', {});

      expect(result).toBeDefined();
      expect(prismaService.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: {},
      });
    });

    it('should handle database errors', async () => {
      mockPrismaService.notificationTemplate.update.mockRejectedValue(new Error('Database error'));

      await expect(service.updateTemplate('template-123', mockUpdates))
        .rejects.toThrow('Database error');
    });

    it('should handle template not found', async () => {
      mockPrismaService.notificationTemplate.update.mockRejectedValue(new Error('Record not found'));

      await expect(service.updateTemplate('nonexistent-id', mockUpdates))
        .rejects.toThrow('Record not found');
    });

    it('should handle concurrent template updates', async () => {
      const updates = [
        { title: 'Update 1' },
        { title: 'Update 2' },
        { title: 'Update 3' },
      ];

      const results = await Promise.all(
        updates.map((update, i) =>
          service.updateTemplate(`template-${i}`, update)
        )
      );

      expect(results).toHaveLength(3);
      expect(prismaService.notificationTemplate.update).toHaveBeenCalledTimes(3);
    });
  });

  describe('deleteTemplate', () => {
    beforeEach(() => {
      mockPrismaService.notificationTemplate.delete.mockResolvedValue({});
    });

    it('should delete template successfully', async () => {
      await service.deleteTemplate('template-123');

      expect(prismaService.notificationTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'template-123' },
      });
    });

    it('should handle database errors', async () => {
      mockPrismaService.notificationTemplate.delete.mockRejectedValue(new Error('Database error'));

      await expect(service.deleteTemplate('template-123'))
        .rejects.toThrow('Database error');
    });

    it('should handle template not found', async () => {
      mockPrismaService.notificationTemplate.delete.mockRejectedValue(new Error('Record not found'));

      await expect(service.deleteTemplate('nonexistent-id'))
        .rejects.toThrow('Record not found');
    });

    it('should handle concurrent template deletion', async () => {
      const templateIds = ['template-1', 'template-2', 'template-3'];

      await Promise.all(
        templateIds.map(id => service.deleteTemplate(id))
      );

      expect(prismaService.notificationTemplate.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendNotification', () => {
    const mockPayload: NotificationPayload = {
      userId: 'user-123',
      tenantId: 'tenant-456',
      type: 'deadline',
      title: 'Test Notification',
      body: 'This is a test notification',
      priority: 'normal',
    };

    beforeEach(() => {
      mockPrismaService.notification.create.mockResolvedValue({
        id: 'notification-123',
        ...mockPayload,
        data: {},
        scheduledFor: new Date(),
        status: 'pending',
        createdAt: new Date(),
      });
    });

    it('should send notification successfully', async () => {
      await service.sendNotification(mockPayload);

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          tenantId: 'tenant-456',
          type: 'deadline',
          title: 'Test Notification',
          body: 'This is a test notification',
          data: {},
          priority: 'normal',
          scheduledFor: expect.any(Date),
          status: 'pending',
        },
      });
    });

    it('should handle scheduled notifications', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const scheduledPayload = {
        ...mockPayload,
        scheduledFor: futureDate,
      };

      await service.sendNotification(scheduledPayload);

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduledFor: futureDate,
          status: 'scheduled',
        }),
      });
    });

    it('should handle notifications with additional data', async () => {
      const payloadWithData = {
        ...mockPayload,
        data: {
          invoiceId: 'inv-123',
          amount: 1000,
          customField: 'custom-value',
        },
      };

      await service.sendNotification(payloadWithData);

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: {
            invoiceId: 'inv-123',
            amount: 1000,
            customField: 'custom-value',
          },
        }),
      });
    });

    it('should handle different priority levels', async () => {
      const priorities = ['low', 'normal', 'high'] as const;

      for (const priority of priorities) {
        const payloadWithPriority = {
          ...mockPayload,
          priority,
        };

        await service.sendNotification(payloadWithPriority);

        expect(prismaService.notification.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            priority,
          }),
        });
      }
    });

    it('should handle database errors during notification creation', async () => {
      mockPrismaService.notification.create.mockRejectedValue(new Error('Database error'));

      await expect(service.sendNotification(mockPayload))
        .rejects.toThrow('Database error');
    });

    it('should handle push notification sending errors', async () => {
      jest.spyOn(service as any, 'sendPushNotification').mockRejectedValue(new Error('Push service error'));

      await expect(service.sendNotification(mockPayload))
        .rejects.toThrow('Push service error');
    });

    it('should handle concurrent notification sending', async () => {
      const payloads = Array.from({ length: 5 }, (_, i) => ({
        ...mockPayload,
        userId: `user-${i}`,
        title: `Notification ${i}`,
      }));

      await Promise.all(
        payloads.map(payload => service.sendNotification(payload))
      );

      expect(prismaService.notification.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('sendBulkNotifications', () => {
    const mockPayloads: NotificationPayload[] = [
      {
        userId: 'user-1',
        tenantId: 'tenant-456',
        type: 'deadline',
        title: 'Notification 1',
        body: 'Body 1',
      },
      {
        userId: 'user-2',
        tenantId: 'tenant-456',
        type: 'status',
        title: 'Notification 2',
        body: 'Body 2',
      },
    ];

    beforeEach(() => {
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 2 });
    });

    it('should send bulk notifications successfully', async () => {
      await service.sendBulkNotifications(mockPayloads);

      expect(prismaService.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            title: 'Notification 1',
          }),
          expect.objectContaining({
            userId: 'user-2',
            title: 'Notification 2',
          }),
        ]),
      });
    });

    it('should handle empty payloads array', async () => {
      await service.sendBulkNotifications([]);

      expect(prismaService.notification.createMany).toHaveBeenCalledWith({
        data: [],
      });
    });

    it('should handle payloads with different priorities', async () => {
      const mixedPayloads = [
        { ...mockPayloads[0], priority: 'high' as const },
        { ...mockPayloads[1], priority: 'low' as const },
      ];

      await service.sendBulkNotifications(mixedPayloads);

      expect(prismaService.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ priority: 'high' }),
          expect.objectContaining({ priority: 'low' }),
        ]),
      });
    });

    it('should handle database errors during bulk creation', async () => {
      mockPrismaService.notification.createMany.mockRejectedValue(new Error('Database error'));

      await expect(service.sendBulkNotifications(mockPayloads))
        .rejects.toThrow('Database error');
    });

    it('should handle push notification errors during bulk sending', async () => {
      jest.spyOn(service as any, 'sendPushNotification').mockRejectedValue(new Error('Push service error'));

      await expect(service.sendBulkNotifications(mockPayloads))
        .rejects.toThrow('Push service error');
    });

    it('should handle large number of notifications', async () => {
      const largePayloads = Array.from({ length: 1000 }, (_, i) => ({
        userId: `user-${i}`,
        tenantId: 'tenant-456',
        type: 'info' as const,
        title: `Notification ${i}`,
        body: `Body ${i}`,
      }));

      await service.sendBulkNotifications(largePayloads);

      expect(prismaService.notification.createMany).toHaveBeenCalledWith({
        data: expect.any(Array),
      });
    });
  });

  describe('processTemplate', () => {
    const mockTemplate: NotificationTemplate = {
      id: 'template-123',
      name: 'test_template',
      type: 'deadline',
      title: 'Reminder: {event} due on {date}',
      body: 'Your {event} for {company} is due on {date}. Amount: {amount} PLN.',
      variables: ['event', 'date', 'company', 'amount'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should process template with all variables', async () => {
      const variables = {
        event: 'VAT declaration',
        date: '2024-01-15',
        company: 'Test Company',
        amount: '1500',
      };

      const result = await service.processTemplate(mockTemplate, variables);

      expect(result).toEqual({
        title: 'Reminder: VAT declaration due on 2024-01-15',
        body: 'Your VAT declaration for Test Company is due on 2024-01-15. Amount: 1500 PLN.',
      });
    });

    it('should handle missing variables', async () => {
      const variables = {
        event: 'VAT declaration',
        // date, company, amount are missing
      };

      const result = await service.processTemplate(mockTemplate, variables);

      expect(result).toEqual({
        title: 'Reminder: VAT declaration due on ',
        body: 'Your VAT declaration for  is due on . Amount:  PLN.',
      });
    });

    it('should handle empty variables object', async () => {
      const result = await service.processTemplate(mockTemplate, {});

      expect(result).toEqual({
        title: 'Reminder:  due on ',
        body: 'Your  for  is due on . Amount:  PLN.',
      });
    });

    it('should handle variables with special characters', async () => {
      const variables = {
        event: 'José García ñáéíóú',
        date: '2024-01-15',
        company: 'Company with 🚀',
        amount: '1,500.50',
      };

      const result = await service.processTemplate(mockTemplate, variables);

      expect(result.title).toContain('José García ñáéíóú');
      expect(result.body).toContain('Company with 🚀');
      expect(result.body).toContain('1,500.50');
    });

    it('should handle template with no variables', async () => {
      const templateWithoutVariables: NotificationTemplate = {
        ...mockTemplate,
        title: 'Fixed Title',
        body: 'Fixed Body',
        variables: [],
      };

      const result = await service.processTemplate(templateWithoutVariables, {});

      expect(result).toEqual({
        title: 'Fixed Title',
        body: 'Fixed Body',
      });
    });

    it('should handle template with repeated variables', async () => {
      const templateWithRepeats: NotificationTemplate = {
        ...mockTemplate,
        title: '{event} - {event} reminder',
        body: '{event} is due. Please complete {event} by {date}.',
      };

      const variables = {
        event: 'VAT declaration',
        date: '2024-01-15',
      };

      const result = await service.processTemplate(templateWithRepeats, variables);

      expect(result.title).toBe('VAT declaration - VAT declaration reminder');
      expect(result.body).toBe('VAT declaration is due. Please complete VAT declaration by 2024-01-15.');
    });

    it('should handle very long variable values', async () => {
      const longValue = 'A'.repeat(1000);
      const variables = {
        event: longValue,
        date: '2024-01-15',
      };

      const result = await service.processTemplate(mockTemplate, variables);

      expect(result.title).toContain(longValue);
      expect(result.body).toContain(longValue);
    });

    it('should handle concurrent template processing', async () => {
      const variablesArray = Array.from({ length: 5 }, (_, i) => ({
        event: `Event ${i}`,
        date: `2024-01-${15 + i}`,
      }));

      const results = await Promise.all(
        variablesArray.map(variables => service.processTemplate(mockTemplate, variables))
      );

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.title).toContain(`Event ${i}`);
        expect(result.body).toContain(`2024-01-${15 + i}`);
      });
    });
  });

  describe('sendTemplatedNotification', () => {
    const mockTemplate: NotificationTemplate = {
      id: 'template-123',
      name: 'vat_deadline_reminder',
      type: 'deadline',
      title: 'VAT Deadline: {period}',
      body: 'VAT for {period} due on {dueDate}',
      variables: ['period', 'dueDate'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.notificationTemplate.findMany.mockResolvedValue([mockTemplate]);
      mockPrismaService.notification.create.mockResolvedValue({});
    });

    it('should send templated notification successfully', async () => {
      const variables = {
        period: '2024-01',
        dueDate: '2024-02-15',
      };

      await service.sendTemplatedNotification('user-123', 'tenant-456', 'vat_deadline_reminder', variables);

      expect(prismaService.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-456',
          type: 'deadline',
          title: 'VAT Deadline: 2024-01',
          body: 'VAT for 2024-01 due on 2024-02-15',
        }),
      });
    });

    it('should handle template not found', async () => {
      mockPrismaService.notificationTemplate.findMany.mockResolvedValue([]);

      await expect(service.sendTemplatedNotification('user-123', 'tenant-456', 'nonexistent_template', {}))
        .rejects.toThrow('Template not found: nonexistent_template');
    });

    it('should handle template processing errors', async () => {
      jest.spyOn(service, 'processTemplate').mockRejectedValue(new Error('Template processing failed'));

      await expect(service.sendTemplatedNotification('user-123', 'tenant-456', 'vat_deadline_reminder', {}))
        .rejects.toThrow('Template processing failed');
    });

    it('should handle notification sending errors', async () => {
      mockPrismaService.notification.create.mockRejectedValue(new Error('Notification creation failed'));

      await expect(service.sendTemplatedNotification('user-123', 'tenant-456', 'vat_deadline_reminder', {}))
        .rejects.toThrow('Notification creation failed');
    });

    it('should handle notifications with options', async () => {
      const variables = { period: '2024-01', dueDate: '2024-02-15' };
      const options = {
        priority: 'high' as const,
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        data: { customField: 'custom-value' },
      };

      await service.sendTemplatedNotification('user-123', 'tenant-456', 'vat_deadline_reminder', variables, options);

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 'high',
          scheduledFor: options.scheduledFor,
          data: { customField: 'custom-value' },
        }),
      });
    });

    it('should handle concurrent templated notification sending', async () => {
      const notifications = Array.from({ length: 3 }, (_, i) => ({
        userId: `user-${i}`,
        templateName: 'vat_deadline_reminder',
        variables: { period: `2024-0${i + 1}`, dueDate: '2024-02-15' },
      }));

      await Promise.all(
        notifications.map(({ userId, templateName, variables }) =>
          service.sendTemplatedNotification(userId, 'tenant-456', templateName, variables)
        )
      );

      expect(prismaService.notificationTemplate.findMany).toHaveBeenCalledTimes(3);
      expect(prismaService.notification.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('getUserNotifications', () => {
    const mockNotifications = [
      {
        id: 'notif-1',
        userId: 'user-123',
        tenantId: 'tenant-456',
        type: 'deadline',
        title: 'Notification 1',
        body: 'Body 1',
        status: 'sent',
        createdAt: new Date('2024-01-15'),
      },
      {
        id: 'notif-2',
        userId: 'user-123',
        tenantId: 'tenant-456',
        type: 'status',
        title: 'Notification 2',
        body: 'Body 2',
        status: 'read',
        createdAt: new Date('2024-01-14'),
      },
    ];

    beforeEach(() => {
      mockPrismaService.notification.findMany.mockResolvedValue(mockNotifications);
      mockPrismaService.notification.count.mockResolvedValue(2);
    });

    it('should get user notifications successfully', async () => {
      const result = await service.getUserNotifications('user-123', 'tenant-456');

      expect(result).toEqual({
        notifications: mockNotifications,
        total: 2,
        limit: 50,
        offset: 0,
      });

      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          tenantId: 'tenant-456',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });

      expect(prismaService.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          tenantId: 'tenant-456',
        },
      });
    });

    it('should get notifications with pagination', async () => {
      const options = { limit: 10, offset: 20 };

      const result = await service.getUserNotifications('user-123', 'tenant-456', options);

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);

      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          tenantId: 'tenant-456',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 20,
      });
    });

    it('should get notifications filtered by type', async () => {
      const options = { type: 'deadline' };

      const result = await service.getUserNotifications('user-123', 'tenant-456', options);

      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          tenantId: 'tenant-456',
          type: 'deadline',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('should get notifications filtered by status', async () => {
      const options = { status: 'read' };

      const result = await service.getUserNotifications('user-123', 'tenant-456', options);

      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          tenantId: 'tenant-456',
          status: 'read',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('should return empty result when no notifications found', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      const result = await service.getUserNotifications('user-123', 'tenant-456');

      expect(result).toEqual({
        notifications: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('should handle database errors during notification retrieval', async () => {
      mockPrismaService.notification.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getUserNotifications('user-123', 'tenant-456'))
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during count operation', async () => {
      mockPrismaService.notification.count.mockRejectedValue(new Error('Count error'));

      await expect(service.getUserNotifications('user-123', 'tenant-456'))
        .rejects.toThrow('Count error');
    });

    it('should handle different notification types', async () => {
      const types = ['deadline', 'status', 'reminder', 'info'];

      for (const type of types) {
        const options = { type };

        await service.getUserNotifications('user-123', 'tenant-456', options);

        expect(prismaService.notification.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ type }),
          orderBy: { createdAt: 'desc' },
          take: 50,
          skip: 0,
        });
      }
    });

    it('should handle different notification statuses', async () => {
      const statuses = ['pending', 'sent', 'read', 'scheduled'];

      for (const status of statuses) {
        const options = { status };

        await service.getUserNotifications('user-123', 'tenant-456', options);

        expect(prismaService.notification.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ status }),
          orderBy: { createdAt: 'desc' },
          take: 50,
          skip: 0,
        });
      }
    });

    it('should handle concurrent notification retrieval', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];

      const results = await Promise.all(
        userIds.map(userId => service.getUserNotifications(userId, 'tenant-456'))
      );

      expect(results).toHaveLength(3);
      expect(prismaService.notification.findMany).toHaveBeenCalledTimes(3);
      expect(prismaService.notification.count).toHaveBeenCalledTimes(3);
    });
  });

  describe('markNotificationAsRead', () => {
    beforeEach(() => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 1 });
    });

    it('should mark notification as read successfully', async () => {
      await service.markNotificationAsRead('notification-123', 'user-123');

      expect(prismaService.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notification-123',
          userId: 'user-123',
        },
        data: {
          readAt: expect.any(Date),
          status: 'read',
        },
      });
    });

    it('should handle notification not found', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 0 });

      await service.markNotificationAsRead('nonexistent-notification', 'user-123');

      expect(prismaService.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'nonexistent-notification',
          userId: 'user-123',
        },
        data: expect.objectContaining({
          status: 'read',
        }),
      });
    });

    it('should handle database errors', async () => {
      mockPrismaService.notification.updateMany.mockRejectedValue(new Error('Database error'));

      await expect(service.markNotificationAsRead('notification-123', 'user-123'))
        .rejects.toThrow('Database error');
    });

    it('should handle concurrent read marking', async () => {
      const notificationIds = ['notif-1', 'notif-2', 'notif-3'];

      await Promise.all(
        notificationIds.map(id => service.markNotificationAsRead(id, 'user-123'))
      );

      expect(prismaService.notification.updateMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('markAllNotificationsAsRead', () => {
    beforeEach(() => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 5 });
    });

    it('should mark all notifications as read successfully', async () => {
      const result = await service.markAllNotificationsAsRead('user-123', 'tenant-456');

      expect(result).toBe(5);

      expect(prismaService.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          tenantId: 'tenant-456',
          status: {
            in: ['pending', 'sent'],
          },
        },
        data: {
          readAt: expect.any(Date),
          status: 'read',
        },
      });
    });

    it('should return 0 when no notifications to mark', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllNotificationsAsRead('user-123', 'tenant-456');

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      mockPrismaService.notification.updateMany.mockRejectedValue(new Error('Database error'));

      await expect(service.markAllNotificationsAsRead('user-123', 'tenant-456'))
        .rejects.toThrow('Database error');
    });

    it('should handle concurrent bulk read marking', async () => {
      const userTenantPairs = [
        { userId: 'user-1', tenantId: 'tenant-1' },
        { userId: 'user-2', tenantId: 'tenant-2' },
      ];

      const results = await Promise.all(
        userTenantPairs.map(({ userId, tenantId }) =>
          service.markAllNotificationsAsRead(userId, tenantId)
        )
      );

      expect(results).toEqual([5, 5]);
      expect(prismaService.notification.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendPushNotification', () => {
    const mockPayload: NotificationPayload = {
      userId: 'user-123',
      tenantId: 'tenant-456',
      type: 'deadline',
      title: 'Test Notification',
      body: 'Test Body',
    };

    it('should log push notification details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await (service as any).sendPushNotification(mockPayload);

      expect(consoleSpy).toHaveBeenCalledWith('[PUSH NOTIFICATION] To: user-123');
      expect(consoleSpy).toHaveBeenCalledWith('[PUSH NOTIFICATION] Title: Test Notification');
      expect(consoleSpy).toHaveBeenCalledWith('[PUSH NOTIFICATION] Body: Test Body');
      expect(consoleSpy).toHaveBeenCalledWith('[PUSH NOTIFICATION] Type: deadline');

      consoleSpy.mockRestore();
    });

    it('should handle notifications with special characters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const payloadWithSpecialChars = {
        ...mockPayload,
        title: 'Notification with ñáéíóú 🚀',
        body: 'Body with spëcial çhars!@#$%',
      };

      await (service as any).sendPushNotification(payloadWithSpecialChars);

      expect(consoleSpy).toHaveBeenCalledWith('[PUSH NOTIFICATION] Title: Notification with ñáéíóú 🚀');
      expect(consoleSpy).toHaveBeenCalledWith('[PUSH NOTIFICATION] Body: Body with spëcial çhars!@#$%');

      consoleSpy.mockRestore();
    });

    it('should handle very long notification content', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const longContent = 'A'.repeat(1000);
      const payloadWithLongContent = {
        ...mockPayload,
        title: longContent,
        body: longContent,
      };

      await (service as any).sendPushNotification(payloadWithLongContent);

      expect(consoleSpy).toHaveBeenCalledWith(`[PUSH NOTIFICATION] Title: ${longContent}`);
      expect(consoleSpy).toHaveBeenCalledWith(`[PUSH NOTIFICATION] Body: ${longContent}`);

      consoleSpy.mockRestore();
    });

    it('should handle concurrent push notification sending', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const payloads = Array.from({ length: 3 }, (_, i) => ({
        ...mockPayload,
        userId: `user-${i}`,
        title: `Notification ${i}`,
      }));

      await Promise.all(
        payloads.map(payload => (service as any).sendPushNotification(payload))
      );

      expect(consoleSpy).toHaveBeenCalledTimes(12); // 4 log calls per notification × 3 notifications

      consoleSpy.mockRestore();
    });
  });

  describe('initializeDefaultTemplates', () => {
    beforeEach(() => {
      mockPrismaService.notificationTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.notificationTemplate.create.mockResolvedValue({} as any);
    });

    it('should initialize default templates successfully', async () => {
      await service.initializeDefaultTemplates();

      expect(prismaService.notificationTemplate.findFirst).toHaveBeenCalledTimes(5); // 5 default templates
      expect(prismaService.notificationTemplate.create).toHaveBeenCalledTimes(5);
    });

    it('should skip existing templates', async () => {
      mockPrismaService.notificationTemplate.findFirst
        .mockResolvedValueOnce({} as any) // First template exists
        .mockResolvedValue(null); // Others don't exist

      await service.initializeDefaultTemplates();

      expect(prismaService.notificationTemplate.create).toHaveBeenCalledTimes(4); // Only non-existing templates
    });

    it('should handle database errors during template lookup', async () => {
      mockPrismaService.notificationTemplate.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.initializeDefaultTemplates())
        .rejects.toThrow('Database error');
    });

    it('should handle database errors during template creation', async () => {
      mockPrismaService.notificationTemplate.create.mockRejectedValue(new Error('Creation error'));

      await expect(service.initializeDefaultTemplates())
        .rejects.toThrow('Creation error');
    });

    it('should handle mixed existing/non-existing templates', async () => {
      mockPrismaService.notificationTemplate.findFirst
        .mockResolvedValueOnce({} as any) // First exists
        .mockResolvedValueOnce(null) // Second doesn't exist
        .mockResolvedValueOnce({} as any) // Third exists
        .mockResolvedValueOnce(null) // Fourth doesn't exist
        .mockResolvedValueOnce(null); // Fifth doesn't exist

      await service.initializeDefaultTemplates();

      expect(prismaService.notificationTemplate.create).toHaveBeenCalledTimes(3); // Templates 2, 4, 5
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle null userId in sendNotification', async () => {
      const payloadWithNullUser = {
        userId: null as any,
        tenantId: 'tenant-456',
        type: 'deadline' as const,
        title: 'Test',
        body: 'Test',
      };

      await expect(service.sendNotification(payloadWithNullUser))
        .rejects.toThrow();
    });

    it('should handle undefined tenantId in sendNotification', async () => {
      const payloadWithUndefinedTenant = {
        userId: 'user-123',
        tenantId: undefined as any,
        type: 'deadline' as const,
        title: 'Test',
        body: 'Test',
      };

      await expect(service.sendNotification(payloadWithUndefinedTenant))
        .rejects.toThrow();
    });

    it('should handle very long notification content', async () => {
      const longContent = 'A'.repeat(10000);
      const payloadWithLongContent = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        type: 'info' as const,
        title: longContent,
        body: longContent,
      };

      const result = await service.sendNotification(payloadWithLongContent);

      expect(result).toBeUndefined(); // sendNotification returns void
    });

    it('should handle special characters in notification content', async () => {
      const payloadWithSpecialChars = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        type: 'info' as const,
        title: 'Notification with ñáéíóú 🚀',
        body: 'Body with spëcial çhars!@#$%',
      };

      const result = await service.sendNotification(payloadWithSpecialChars);

      expect(result).toBeUndefined();
    });

    it('should handle concurrent operations across all methods', async () => {
      mockPrismaService.notificationTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      const operations = [
        service.getTemplates(),
        service.getUserNotifications('user-123', 'tenant-456'),
        service.markAllNotificationsAsRead('user-123', 'tenant-456'),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      expect(Array.isArray(results[0])).toBe(true);
      expect(results[1]).toHaveProperty('notifications');
      expect(typeof results[2]).toBe('number');
    });

    it('should handle malformed template data', async () => {
      const malformedTemplate = {
        name: 'malformed_template',
        type: 'invalid_type' as any,
        title: 'Title',
        body: 'Body',
        variables: 'not_an_array' as any,
        isActive: 'not_a_boolean' as any,
      };

      await expect(service.createTemplate(malformedTemplate))
        .rejects.toThrow();
    });

    it('should handle malformed notification payload', async () => {
      const malformedPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        type: 'invalid_type' as any,
        title: null as any,
        body: undefined as any,
      };

      await expect(service.sendNotification(malformedPayload as any))
        .rejects.toThrow();
    });

    it('should handle very large number of templates', async () => {
      const largeTemplateArray = Array.from({ length: 1000 }, (_, i) => ({
        id: `template-${i}`,
        name: `template_${i}`,
        type: 'info' as const,
        title: `Template ${i}`,
        body: `Body ${i}`,
        variables: [`var${i}`],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockPrismaService.notificationTemplate.findMany.mockResolvedValue(largeTemplateArray);

      const result = await service.getTemplates();

      expect(result).toHaveLength(1000);
    });

    it('should handle very large number of notifications', async () => {
      const largeNotificationArray = Array.from({ length: 1000 }, (_, i) => ({
        id: `notification-${i}`,
        userId: 'user-123',
        tenantId: 'tenant-456',
        type: 'info' as const,
        title: `Notification ${i}`,
        body: `Body ${i}`,
        status: 'sent' as const,
        createdAt: new Date(),
      }));

      mockPrismaService.notification.findMany.mockResolvedValue(largeNotificationArray);
      mockPrismaService.notification.count.mockResolvedValue(1000);

      const result = await service.getUserNotifications('user-123', 'tenant-456');

      expect(result.notifications).toHaveLength(1000);
      expect(result.total).toBe(1000);
    });
  });
});