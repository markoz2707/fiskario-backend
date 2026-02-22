import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { DataManagementController } from './data-management.controller';
import { ConflictResolutionService } from './services/conflict-resolution.service';
import { DataValidationService } from './services/data-validation.service';
import { AuditTrailService } from './services/audit-trail.service';
import { BackupService } from './services/backup.service';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), PrismaModule],
  controllers: [DataManagementController],
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