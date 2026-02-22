import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BackupService, BackupOptions } from './backup.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises module
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  access: jest.fn(),
  rm: jest.fn().mockResolvedValue(undefined),
}));

describe('BackupService', () => {
  let service: BackupService;
  let configService: ConfigService;
  let prisma: PrismaService;
  let schedulerRegistry: SchedulerRegistry;

  const TENANT_ID = 'tenant-1';
  const DATA_SUBJECT_ID = 'user-123';

  // Mock Prisma models used by backup entity mapping
  const mockCompanyFindMany = jest.fn().mockResolvedValue([]);
  const mockBuyerFindMany = jest.fn().mockResolvedValue([]);
  const mockInvoiceFindMany = jest.fn().mockResolvedValue([]);
  const mockInvoiceItemFindMany = jest.fn().mockResolvedValue([]);
  const mockDeclarationFindMany = jest.fn().mockResolvedValue([]);
  const mockZUSEmployeeFindMany = jest.fn().mockResolvedValue([]);
  const mockZUSRegistrationFindMany = jest.fn().mockResolvedValue([]);
  const mockZUSReportFindMany = jest.fn().mockResolvedValue([]);
  const mockZUSContributionFindMany = jest.fn().mockResolvedValue([]);
  const mockZUSSubmissionFindMany = jest.fn().mockResolvedValue([]);
  const mockVATRegisterFindMany = jest.fn().mockResolvedValue([]);
  const mockTaxCalculationFindMany = jest.fn().mockResolvedValue([]);
  const mockAuditLogFindMany = jest.fn().mockResolvedValue([]);
  const mockUserFindMany = jest.fn().mockResolvedValue([]);
  const mockNotificationFindMany = jest.fn().mockResolvedValue([]);
  const mockConsentRecordFindMany = jest.fn().mockResolvedValue([]);
  const mockDataProcessingRecordFindMany = jest.fn().mockResolvedValue([]);
  const mockNotificationTemplateFindMany = jest.fn().mockResolvedValue([]);
  const mockDeadlineReminderFindMany = jest.fn().mockResolvedValue([]);
  const mockOfficialCommunicationFindMany = jest.fn().mockResolvedValue([]);

  const mockPrisma = {
    company: { findMany: mockCompanyFindMany },
    buyer: { findMany: mockBuyerFindMany },
    invoice: { findMany: mockInvoiceFindMany },
    invoiceItem: { findMany: mockInvoiceItemFindMany },
    declaration: { findMany: mockDeclarationFindMany },
    zUSEmployee: { findMany: mockZUSEmployeeFindMany },
    zUSRegistration: { findMany: mockZUSRegistrationFindMany },
    zUSReport: { findMany: mockZUSReportFindMany },
    zUSContribution: { findMany: mockZUSContributionFindMany },
    zUSSubmission: { findMany: mockZUSSubmissionFindMany },
    vATRegister: { findMany: mockVATRegisterFindMany },
    taxCalculation: { findMany: mockTaxCalculationFindMany },
    auditLog: { findMany: mockAuditLogFindMany },
    user: { findMany: mockUserFindMany },
    notification: { findMany: mockNotificationFindMany },
    notificationTemplate: { findMany: mockNotificationTemplateFindMany },
    deadlineReminder: { findMany: mockDeadlineReminderFindMany },
    officialCommunication: { findMany: mockOfficialCommunicationFindMany },
    consentRecord: { findMany: mockConsentRecordFindMany },
    dataProcessingRecord: { findMany: mockDataProcessingRecordFindMany },
    role: { findMany: jest.fn().mockResolvedValue([]) },
    permission: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        AWS_REGION: 'eu-central-1',
        AWS_ACCESS_KEY_ID: undefined,
        AWS_SECRET_ACCESS_KEY: undefined,
        AWS_S3_BACKUP_BUCKET: undefined, // No S3 configured by default
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    }),
  };

  const mockSchedulerRegistry = {
    getCronJobs: jest.fn().mockReturnValue(new Map()),
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    configService = module.get<ConfigService>(ConfigService);
    prisma = module.get<PrismaService>(PrismaService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);

    // Reset fs mocks
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1024 });
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.rm as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ====================================================================
  // createBackup - tworzenie kopii zapasowej
  // ====================================================================
  describe('createBackup', () => {
    it('should create a backup with default entities when none specified', async () => {
      const result = await service.createBackup();

      expect(result.status).toBe('success');
      expect(result.id).toMatch(/^backup_\d+_/);
      expect(result.entities).toEqual([
        'companies',
        'buyers',
        'invoices',
        'invoiceItems',
        'declarations',
        'zusEmployees',
        'zusRegistrations',
        'zusReports',
        'zusContributions',
        'vatRegisters',
        'taxCalculations',
      ]);
      expect(result.size).toBe(1024); // from mocked fs.stat
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify fs operations
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should create a backup with custom entities', async () => {
      const options: BackupOptions = {
        entities: ['companies', 'invoices'],
      };

      const result = await service.createBackup(options);

      expect(result.status).toBe('success');
      expect(result.entities).toEqual(['companies', 'invoices']);

      // Only requested entities should be backed up
      expect(mockCompanyFindMany).toHaveBeenCalled();
      expect(mockInvoiceFindMany).toHaveBeenCalled();
      // Others should NOT be called
      expect(mockBuyerFindMany).not.toHaveBeenCalled();
      expect(mockDeclarationFindMany).not.toHaveBeenCalled();
    });

    it('should filter by tenant_id when provided', async () => {
      const options: BackupOptions = {
        tenantId: TENANT_ID,
        entities: ['companies'],
      };

      await service.createBackup(options);

      expect(mockCompanyFindMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should backup all entities without tenant filter when no tenantId provided', async () => {
      const options: BackupOptions = {
        entities: ['companies'],
      };

      await service.createBackup(options);

      expect(mockCompanyFindMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should include audit logs when includeAuditLogs is true', async () => {
      const options: BackupOptions = {
        entities: ['companies'],
        includeAuditLogs: true,
      };

      await service.createBackup(options);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should not include audit logs by default', async () => {
      const options: BackupOptions = {
        entities: ['companies'],
      };

      await service.createBackup(options);

      // auditLog.findMany should only be called for backup entity itself (if in list)
      // but NOT for the separate includeAuditLogs path
      // Since 'auditLogs' is not in entities, it should not be called
      expect(mockAuditLogFindMany).not.toHaveBeenCalled();
    });

    it('should return failed status when backup operation throws', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const result = await service.createBackup();

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Permission denied');
      expect(result.size).toBe(0);
    });

    it('should handle entity backup failure in global mode (non-tenant)', async () => {
      mockCompanyFindMany.mockRejectedValue(new Error('Table not found'));

      // In global mode (no tenantId), individual entity errors are logged but do not fail the whole backup
      const options: BackupOptions = {
        entities: ['companies', 'invoices'],
      };

      const result = await service.createBackup(options);

      // Should still succeed (partial) because we are in global mode
      expect(result.status).toBe('success');
      // invoices should still have been backed up
      expect(mockInvoiceFindMany).toHaveBeenCalled();
    });

    it('should fail entirely for tenant-specific backup when any entity fails', async () => {
      mockCompanyFindMany.mockRejectedValue(new Error('Entity backup failed'));

      const options: BackupOptions = {
        tenantId: TENANT_ID,
        entities: ['companies', 'invoices'],
      };

      const result = await service.createBackup(options);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Entity backup failed');
    });

    it('should write compressed backup when compression is enabled', async () => {
      const options: BackupOptions = {
        entities: ['companies'],
        compression: true,
      };

      // For compressed backups, stat is called on .gz file
      (fs.stat as jest.Mock).mockResolvedValue({ size: 512 });

      const result = await service.createBackup(options);

      expect(result.status).toBe('success');
      expect(result.size).toBe(512);

      // writeFile should be called (for compressed data)
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should record backup data for each entity', async () => {
      const companies = [
        { id: 'c1', name: 'Company A', createdAt: '2025-01-01T00:00:00.000Z' },
        { id: 'c2', name: 'Company B', createdAt: '2025-02-01T00:00:00.000Z' },
      ];
      const invoices = [
        { id: 'inv-1', number: 'FV/0001', createdAt: '2025-03-01T00:00:00.000Z' },
      ];

      mockCompanyFindMany.mockResolvedValue(companies);
      mockInvoiceFindMany.mockResolvedValue(invoices);

      const options: BackupOptions = {
        entities: ['companies', 'invoices'],
      };

      const result = await service.createBackup(options);

      expect(result.status).toBe('success');
      // Verify that writeFile was called with JSON data containing both entities
      const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1]);
      expect(writtenData.companies).toEqual(companies);
      expect(writtenData.invoices).toEqual(invoices);
    });
  });

  // ====================================================================
  // listBackups - listowanie kopii zapasowych
  // ====================================================================
  describe('listBackups', () => {
    it('should return empty array when no backups exist', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([]);

      const result = await service.listBackups();

      expect(result).toEqual([]);
    });

    it('should return backups sorted by timestamp descending', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([
        'backup_1000000_abc',
        'backup_2000000_def',
      ]);

      // Fail metadata reads to trigger fallback
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('No metadata'));
      (fs.stat as jest.Mock)
        .mockResolvedValueOnce({ size: 512 })  // first backup
        .mockResolvedValueOnce({ size: 1024 }); // second backup

      const result = await service.listBackups();

      expect(result).toHaveLength(2);
      // Sorted descending by timestamp: 2000000 first, then 1000000
      expect(result[0].id).toBe('backup_2000000_def');
      expect(result[1].id).toBe('backup_1000000_abc');
    });

    it('should filter backups by tenantId when provided', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['backup_1000000_abc']);

      // Return metadata with a specific tenantId
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        id: 'backup_1000000_abc',
        timestamp: new Date(1000000),
        size: 512,
        entities: ['companies'],
        tenantId: 'tenant-other',
        status: 'success',
      }));

      const result = await service.listBackups(TENANT_ID);

      // Should be empty because tenantId does not match
      expect(result).toEqual([]);
    });

    it('should return backups matching tenantId filter', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['backup_1000000_abc']);

      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        id: 'backup_1000000_abc',
        timestamp: new Date(1000000).toISOString(),
        size: 512,
        entities: ['companies'],
        tenantId: TENANT_ID,
        status: 'success',
      }));

      const result = await service.listBackups(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe(TENANT_ID);
    });

    it('should return empty array on filesystem error', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await service.listBackups();

      expect(result).toEqual([]);
    });

    it('should skip invalid backup directories', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([
        'backup_1000000_abc', // valid
        'not_a_backup_dir',   // invalid - no match for backup_ pattern
        '.gitkeep',           // invalid
      ]);

      (fs.readFile as jest.Mock).mockRejectedValue(new Error('No metadata'));
      (fs.stat as jest.Mock).mockResolvedValue({ size: 256 });

      const result = await service.listBackups();

      // Only the valid backup directory should produce a result
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('backup_1000000_abc');
    });
  });

  // ====================================================================
  // deleteBackup - usuwanie kopii zapasowej
  // ====================================================================
  describe('deleteBackup', () => {
    it('should delete backup directory and return true', async () => {
      const result = await service.deleteBackup('backup_1000000_abc');

      expect(result).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(
        path.join('backups', 'backup_1000000_abc'),
        { recursive: true, force: true },
      );
    });

    it('should return false on filesystem error', async () => {
      (fs.rm as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await service.deleteBackup('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ====================================================================
  // createTaxComplianceBackup - backup podatkowy
  // ====================================================================
  describe('createTaxComplianceBackup', () => {
    it('should create backup with tax-related entities and audit logs', async () => {
      // Spy on createBackup to verify it's called with correct params
      const createBackupSpy = jest.spyOn(service, 'createBackup');
      createBackupSpy.mockResolvedValue({
        id: 'backup_tax',
        timestamp: new Date(),
        size: 2048,
        entities: [
          'companies', 'declarations', 'vatRegisters', 'taxCalculations',
          'zusEmployees', 'zusRegistrations', 'zusReports', 'zusContributions',
        ],
        tenantId: TENANT_ID,
        status: 'success',
      });

      const result = await service.createTaxComplianceBackup(TENANT_ID);

      expect(result.status).toBe('success');
      expect(createBackupSpy).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        entities: [
          'companies',
          'declarations',
          'vatRegisters',
          'taxCalculations',
          'zusEmployees',
          'zusRegistrations',
          'zusReports',
          'zusContributions',
        ],
        includeAuditLogs: true,
        compression: true,
      });

      createBackupSpy.mockRestore();
    });
  });

  // ====================================================================
  // createGDPRBackup - backup GDPR dla podmiotu danych
  // ====================================================================
  describe('createGDPRBackup', () => {
    it('should create GDPR backup with user-related data only', async () => {
      const userData = [{ id: DATA_SUBJECT_ID, email: 'user@example.com' }];
      const auditLogs = [{ id: 'log-1', action: 'LOGIN', user_id: DATA_SUBJECT_ID }];
      const notifications = [{ id: 'notif-1', user_id: DATA_SUBJECT_ID }];
      const consentRecords = [{ id: 'consent-1', dataSubjectId: DATA_SUBJECT_ID }];
      const dataProcessingRecords = [{ id: 'dp-1', dataSubjectId: DATA_SUBJECT_ID }];

      mockUserFindMany.mockResolvedValue(userData);
      mockAuditLogFindMany.mockResolvedValue(auditLogs);
      mockNotificationFindMany.mockResolvedValue(notifications);
      mockConsentRecordFindMany.mockResolvedValue(consentRecords);
      mockDataProcessingRecordFindMany.mockResolvedValue(dataProcessingRecords);

      const result = await service.createGDPRBackup(TENANT_ID, DATA_SUBJECT_ID);

      expect(result.status).toBe('success');
      expect(result.id).toMatch(/^gdpr_backup_user-123_\d+$/);
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.entities).toEqual([
        'userData',
        'auditLogs',
        'notifications',
        'consentRecords',
        'dataProcessingRecords',
      ]);

      // Verify tenant and data subject isolation in queries
      expect(mockUserFindMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, id: DATA_SUBJECT_ID },
      });
      expect(mockAuditLogFindMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, user_id: DATA_SUBJECT_ID },
      });
      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, user_id: DATA_SUBJECT_ID },
      });
      expect(mockConsentRecordFindMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, dataSubjectId: DATA_SUBJECT_ID },
      });
      expect(mockDataProcessingRecordFindMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, dataSubjectId: DATA_SUBJECT_ID },
      });
    });

    it('should write GDPR backup data as JSON to file', async () => {
      mockUserFindMany.mockResolvedValue([{ id: DATA_SUBJECT_ID }]);
      mockAuditLogFindMany.mockResolvedValue([]);
      mockNotificationFindMany.mockResolvedValue([]);
      mockConsentRecordFindMany.mockResolvedValue([]);
      mockDataProcessingRecordFindMany.mockResolvedValue([]);

      await service.createGDPRBackup(TENANT_ID, DATA_SUBJECT_ID);

      // Verify file was written
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
      const filePath = writeCall[0] as string;
      expect(filePath).toContain('gdpr_backup_user-123_');
      expect(filePath).toMatch(/\.json$/);

      // Verify the written content structure
      const writtenData = JSON.parse(writeCall[1]);
      expect(writtenData).toHaveProperty('userData');
      expect(writtenData).toHaveProperty('auditLogs');
      expect(writtenData).toHaveProperty('notifications');
      expect(writtenData).toHaveProperty('consentRecords');
      expect(writtenData).toHaveProperty('dataProcessingRecords');
    });

    it('should propagate errors from database queries', async () => {
      mockUserFindMany.mockRejectedValue(new Error('Database connection lost'));

      await expect(service.createGDPRBackup(TENANT_ID, DATA_SUBJECT_ID))
        .rejects.toThrow('Database connection lost');
    });

    it('should create backup directory structure', async () => {
      mockUserFindMany.mockResolvedValue([]);
      mockAuditLogFindMany.mockResolvedValue([]);
      mockNotificationFindMany.mockResolvedValue([]);
      mockConsentRecordFindMany.mockResolvedValue([]);
      mockDataProcessingRecordFindMany.mockResolvedValue([]);

      await service.createGDPRBackup(TENANT_ID, DATA_SUBJECT_ID);

      // Should create the backup directory
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('gdpr_backup_user-123_'),
        { recursive: true },
      );
    });
  });

  // ====================================================================
  // onModuleDestroy - cleanup scheduled jobs
  // ====================================================================
  describe('onModuleDestroy', () => {
    it('should clean up scheduled backup jobs on shutdown', () => {
      const jobs = new Map();
      jobs.set('automated-backup-global-12345', { stop: jest.fn() });
      jobs.set('automated-backup-tenant-1-67890', { stop: jest.fn() });
      jobs.set('other-job', { stop: jest.fn() });
      mockSchedulerRegistry.getCronJobs.mockReturnValue(jobs);

      service.onModuleDestroy();

      // Only backup jobs should be deleted
      expect(mockSchedulerRegistry.deleteCronJob).toHaveBeenCalledWith('automated-backup-global-12345');
      expect(mockSchedulerRegistry.deleteCronJob).toHaveBeenCalledWith('automated-backup-tenant-1-67890');
      expect(mockSchedulerRegistry.deleteCronJob).not.toHaveBeenCalledWith('other-job');
    });

    it('should handle empty scheduler gracefully', () => {
      mockSchedulerRegistry.getCronJobs.mockReturnValue(new Map());

      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should handle scheduler errors gracefully', () => {
      mockSchedulerRegistry.getCronJobs.mockImplementation(() => {
        throw new Error('Scheduler not initialized');
      });

      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  // ====================================================================
  // restoreBackup
  // ====================================================================
  describe('restoreBackup', () => {
    it('should throw when backup file does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(service.restoreBackup({ backupId: 'nonexistent' }))
        .rejects.toThrow('Backup nonexistent not found');
    });
  });

  // ====================================================================
  // exportBackupToExternalStorage
  // ====================================================================
  describe('exportBackupToExternalStorage', () => {
    it('should return false when S3 is not configured', async () => {
      const result = await service.exportBackupToExternalStorage('backup_123');

      expect(result).toBe(false);
    });
  });
});
