import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConflictResolutionService } from './services/conflict-resolution.service';
import { DataValidationService } from './services/data-validation.service';
import { AuditTrailService } from './services/audit-trail.service';
import { BackupService } from './services/backup.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ConflictResolutionService,
    DataValidationService,
    AuditTrailService,
    BackupService,
  ],
  exports: [
    ConflictResolutionService,
    DataValidationService,
    AuditTrailService,
    BackupService,
  ],
})
export class DataManagementModule {}