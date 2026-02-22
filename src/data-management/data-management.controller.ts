import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BackupService } from './services/backup.service';
import { AuditTrailService } from './services/audit-trail.service';
import { CreateBackupDto, RestoreBackupDto, ScheduleBackupDto, GDPRExportDto } from './dto/backup.dto';

interface AuthenticatedUser {
  userId: string;
  email: string;
  tenant_id: string;
}

@Controller('data-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DataManagementController {
  constructor(
    private readonly backupService: BackupService,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  @Post('backups')
  @Roles('admin')
  async createBackup(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateBackupDto,
  ) {
    try {
      const tenantId = dto.tenantId || req.user.tenant_id;
      const result = await this.backupService.createBackup({
        tenantId,
        entities: dto.entities,
        includeAuditLogs: dto.includeAuditLogs,
        compression: dto.compression,
        encryption: dto.encryption,
      });

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        `Backup creation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('backups/restore')
  @Roles('admin')
  async restoreBackup(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: RestoreBackupDto,
  ) {
    try {
      const tenantId = dto.tenantId || req.user.tenant_id;
      const result = await this.backupService.restoreBackup({
        backupId: dto.backupId,
        tenantId,
        entities: dto.entities,
        dryRun: dto.dryRun,
      });

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        `Backup restore failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('backups')
  @Roles('admin')
  async listBackups(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query('tenantId') tenantId?: string,
  ) {
    try {
      const tid = tenantId || req.user.tenant_id;
      const backups = await this.backupService.listBackups(tid);

      return { success: true, data: backups };
    } catch (error) {
      throw new HttpException(
        `Failed to list backups: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('backups/:backupId')
  @Roles('admin')
  async deleteBackup(@Param('backupId') backupId: string) {
    try {
      const deleted = await this.backupService.deleteBackup(backupId);
      return { success: deleted };
    } catch (error) {
      throw new HttpException(
        `Failed to delete backup: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('backups/schedule')
  @Roles('admin')
  async scheduleBackup(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: ScheduleBackupDto,
  ) {
    try {
      const tenantId = dto.tenantId || req.user.tenant_id;
      await this.backupService.scheduleAutomatedBackup(dto.cronExpression, {
        tenantId,
        entities: dto.entities,
        includeAuditLogs: dto.includeAuditLogs,
        compression: dto.compression,
      });

      return { success: true, message: 'Backup scheduled successfully' };
    } catch (error) {
      throw new HttpException(
        `Failed to schedule backup: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('backups/tax-compliance')
  @Roles('admin')
  async createTaxComplianceBackup(
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    try {
      const tenantId = req.user.tenant_id;
      const result = await this.backupService.createTaxComplianceBackup(tenantId);

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        `Tax compliance backup failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('backups/gdpr-export')
  @Roles('admin')
  async createGDPRExport(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: GDPRExportDto,
  ) {
    try {
      const result = await this.backupService.createGDPRBackup(dto.tenantId, dto.dataSubjectId);

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        `GDPR export failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('backups/:backupId/export-s3')
  @Roles('admin')
  async exportToS3(@Param('backupId') backupId: string) {
    try {
      const exported = await this.backupService.exportBackupToExternalStorage(backupId);

      return { success: exported, message: exported ? 'Exported to S3' : 'S3 export unavailable' };
    } catch (error) {
      throw new HttpException(
        `S3 export failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
