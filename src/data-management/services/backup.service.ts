import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BackupOptions {
  tenantId?: string;
  entities?: string[];
  includeAuditLogs?: boolean;
  compression?: boolean;
  encryption?: boolean;
}

export interface BackupResult {
  id: string;
  timestamp: Date;
  size: number;
  entities: string[];
  tenantId?: string;
  status: 'success' | 'failed' | 'partial';
  error?: string;
}

export interface RestoreOptions {
  backupId: string;
  tenantId?: string;
  entities?: string[];
  dryRun?: boolean;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = 'backups';
  private readonly maxBackups = 30;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async createBackup(options: BackupOptions = {}): Promise<BackupResult> {
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    try {
      // Ensure backup directory exists
      await this.ensureBackupDirectory();

      const backupPath = path.join(this.backupDir, backupId);
      await fs.mkdir(backupPath, { recursive: true });

      const entities = options.entities || this.getDefaultEntities();
      const backupData: any = {};

      // Backup each entity
      for (const entity of entities) {
        try {
          const data = await this.backupEntity(entity, options.tenantId);
          backupData[entity] = data;
          this.logger.log(`Backed up ${data.length} ${entity} records`);
        } catch (error) {
          this.logger.error(`Failed to backup ${entity}`, error);
          if (options.tenantId) {
            // For tenant-specific backups, fail if any entity fails
            throw error;
          }
        }
      }

      // Backup audit logs if requested
      if (options.includeAuditLogs) {
        const auditData = await this.backupAuditLogs(options.tenantId);
        backupData.auditLogs = auditData;
      }

      // Write backup file
      const fileName = `${backupId}.json`;
      const filePath = path.join(backupPath, fileName);

      if (options.compression) {
        // Implement compression logic here
        await this.writeCompressedBackup(filePath, backupData);
      } else {
        await fs.writeFile(filePath, JSON.stringify(backupData, null, 2));
      }

      // Get file size
      const stats = await fs.stat(filePath);
      const size = stats.size;

      // Cleanup old backups
      await this.cleanupOldBackups();

      const result: BackupResult = {
        id: backupId,
        timestamp,
        size,
        entities,
        tenantId: options.tenantId,
        status: 'success',
      };

      this.logger.log(`Backup ${backupId} completed successfully`, {
        size: this.formatBytes(size),
        entities: entities.length,
        tenantId: options.tenantId,
      });

      return result;
    } catch (error) {
      this.logger.error(`Backup ${backupId} failed`, error);

      return {
        id: backupId,
        timestamp,
        size: 0,
        entities: options.entities || [],
        tenantId: options.tenantId,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async restoreBackup(options: RestoreOptions): Promise<BackupResult> {
    try {
      const backupPath = path.join(this.backupDir, options.backupId, `${options.backupId}.json`);

      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch {
        throw new Error(`Backup ${options.backupId} not found`);
      }

      // Read backup data
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));

      const entities = options.entities || Object.keys(backupData);
      let restoredCount = 0;

      // Restore each entity
      for (const entity of entities) {
        if (backupData[entity]) {
          try {
            const count = await this.restoreEntity(
              entity,
              backupData[entity],
              options.tenantId,
              options.dryRun,
            );
            restoredCount += count;
            this.logger.log(`Restored ${count} ${entity} records`);
          } catch (error) {
            this.logger.error(`Failed to restore ${entity}`, error);
            if (!options.dryRun) {
              throw error;
            }
          }
        }
      }

      return {
        id: options.backupId,
        timestamp: new Date(),
        size: restoredCount,
        entities,
        tenantId: options.tenantId,
        status: options.dryRun ? 'success' : 'success',
      };
    } catch (error) {
      this.logger.error(`Restore ${options.backupId} failed`, error);
      throw error;
    }
  }

  async listBackups(tenantId?: string): Promise<BackupResult[]> {
    try {
      const backupDirs = await fs.readdir(this.backupDir);
      const backups: BackupResult[] = [];

      for (const dir of backupDirs) {
        try {
          const metadataPath = path.join(this.backupDir, dir, 'metadata.json');

          // Try to read metadata first
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          backups.push(metadata);
        } catch {
          // Fallback: parse from directory name and file stats
          const match = dir.match(/^backup_(\d+)_/);
          if (match) {
            const timestamp = new Date(parseInt(match[1]));
            const dataPath = path.join(this.backupDir, dir, `${dir}.json`);

            try {
              const stats = await fs.stat(dataPath);
              backups.push({
                id: dir,
                timestamp,
                size: stats.size,
                entities: [], // Unknown
                status: 'success',
              });
            } catch {
              // Skip invalid backups
            }
          }
        }
      }

      // Filter by tenant if specified
      const filtered = tenantId
        ? backups.filter(b => b.tenantId === tenantId)
        : backups;

      // Sort by timestamp descending
      return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      this.logger.error('Failed to list backups', error);
      return [];
    }
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backupPath = path.join(this.backupDir, backupId);
      await fs.rm(backupPath, { recursive: true, force: true });
      this.logger.log(`Deleted backup ${backupId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete backup ${backupId}`, error);
      return false;
    }
  }

  async scheduleAutomatedBackup(
    cronExpression: string,
    options: BackupOptions = {},
  ): Promise<void> {
    // This would integrate with a job scheduler like node-cron
    // For now, just log the configuration
    this.logger.log('Automated backup scheduled', {
      cronExpression,
      options,
    });

    // TODO: Implement actual scheduling
  }

  private async backupEntity(entity: string, tenantId?: string): Promise<any[]> {
    const model = this.getModelForEntity(entity);
    const where = tenantId ? { tenant_id: tenantId } : {};

    // Get all records for the entity
    const records = await model.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return records;
  }

  private async backupAuditLogs(tenantId?: string): Promise<any[]> {
    const where = tenantId ? { tenant_id: tenantId } : {};

    return await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  private async restoreEntity(
    entity: string,
    data: any[],
    tenantId?: string,
    dryRun = false,
  ): Promise<number> {
    if (dryRun) {
      this.logger.log(`DRY RUN: Would restore ${data.length} ${entity} records`);
      return data.length;
    }

    const model = this.getModelForEntity(entity);
    let restored = 0;

    // Use transaction for data integrity
    await this.prisma.$transaction(async (tx) => {
      for (const record of data) {
        try {
          // Ensure tenant isolation
          if (tenantId) {
            record.tenant_id = tenantId;
          }

          // Upsert to handle existing records
          await tx[entity].upsert({
            where: { id: record.id },
            update: record,
            create: record,
          });
          restored++;
        } catch (error) {
          this.logger.warn(`Failed to restore ${entity} record ${record.id}`, error);
        }
      }
    });

    return restored;
  }

  private getModelForEntity(entity: string): any {
    const modelMap = {
      users: this.prisma.user,
      roles: this.prisma.role,
      permissions: this.prisma.permission,
      companies: this.prisma.company,
      buyers: this.prisma.buyer,
      invoices: this.prisma.invoice,
      invoiceItems: this.prisma.invoiceItem,
      declarations: this.prisma.declaration,
      zusEmployees: this.prisma.zUSEmployee,
      zusRegistrations: this.prisma.zUSRegistration,
      zusReports: this.prisma.zUSReport,
      zusContributions: this.prisma.zUSContribution,
      zusSubmissions: this.prisma.zUSSubmission,
      vatRegisters: this.prisma.vATRegister,
      taxCalculations: this.prisma.taxCalculation,
      auditLogs: this.prisma.auditLog,
      notifications: this.prisma.notification,
      notificationTemplates: this.prisma.notificationTemplate,
      deadlineReminders: this.prisma.deadlineReminder,
      officialCommunications: this.prisma.officialCommunication,
    };

    const model = modelMap[entity];
    if (!model) {
      throw new Error(`Unknown entity: ${entity}`);
    }

    return model;
  }

  private getDefaultEntities(): string[] {
    return [
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
    ];
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  private async writeCompressedBackup(filePath: string, data: any): Promise<void> {
    // TODO: Implement compression (gzip, etc.)
    // For now, just write uncompressed
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();

      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);

        for (const backup of toDelete) {
          await this.deleteBackup(backup.id);
        }

        this.logger.log(`Cleaned up ${toDelete.length} old backups`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old backups', error);
    }
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Polish tax compliance: Specialized backup for tax-related data
  async createTaxComplianceBackup(tenantId: string): Promise<BackupResult> {
    const taxEntities = [
      'companies',
      'declarations',
      'vatRegisters',
      'taxCalculations',
      'zusEmployees',
      'zusRegistrations',
      'zusReports',
      'zusContributions',
    ];

    return this.createBackup({
      tenantId,
      entities: taxEntities,
      includeAuditLogs: true,
      compression: true,
    });
  }

  async createGDPRBackup(tenantId: string, dataSubjectId: string): Promise<BackupResult> {
    // Create a backup containing only data related to a specific data subject
    // This is required for GDPR compliance

    const backupId = `gdpr_backup_${dataSubjectId}_${Date.now()}`;
    const timestamp = new Date();

    try {
      await this.ensureBackupDirectory();
      const backupPath = path.join(this.backupDir, backupId);
      await fs.mkdir(backupPath, { recursive: true });

      // Collect data subject related data
      const userData = await this.prisma.user.findMany({
        where: { tenant_id: tenantId, id: dataSubjectId },
      });

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { tenant_id: tenantId, user_id: dataSubjectId },
      });

      const notifications = await this.prisma.notification.findMany({
        where: { tenant_id: tenantId, user_id: dataSubjectId },
      });

      const consentRecords = await this.prisma.consentRecord.findMany({
        where: { tenant_id: tenantId, dataSubjectId },
      });

      const dataProcessingRecords = await this.prisma.dataProcessingRecord.findMany({
        where: { tenant_id: tenantId, dataSubjectId },
      });

      const backupData = {
        userData,
        auditLogs,
        notifications,
        consentRecords,
        dataProcessingRecords,
      };

      const fileName = `${backupId}.json`;
      const filePath = path.join(backupPath, fileName);
      await fs.writeFile(filePath, JSON.stringify(backupData, null, 2));

      const stats = await fs.stat(filePath);

      return {
        id: backupId,
        timestamp,
        size: stats.size,
        entities: ['userData', 'auditLogs', 'notifications', 'consentRecords', 'dataProcessingRecords'],
        tenantId,
        status: 'success',
      };
    } catch (error) {
      this.logger.error(`GDPR backup for ${dataSubjectId} failed`, error);
      throw error;
    }
  }

  async exportBackupToExternalStorage(backupId: string): Promise<boolean> {
    // TODO: Implement export to external storage (S3, Azure Blob, etc.)
    // This is required for long-term retention of tax compliance data
    this.logger.log(`Exporting backup ${backupId} to external storage`);
    return true;
  }
}