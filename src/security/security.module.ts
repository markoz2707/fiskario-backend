import { Module } from '@nestjs/common';
import { KmsService } from './services/kms.service';
import { S3Service } from './services/s3.service';
import { DatabaseEncryptionService } from './services/database-encryption.service';
import { PermissionsService } from './services/permissions.service';
import { AuditLogService } from './services/audit-log.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { ValidationService } from './services/validation.service';
import { PrivacyByDesignService } from './services/privacy-by-design.service';
import { DataMinimizationService } from './services/data-minimization.service';
import { ConsentManagementService } from './services/consent-management.service';
import { DPIADocumentationService } from './services/dpia-documentation.service';
import { PrivacyNoticeService } from './services/privacy-notice.service';
import { EnhancedPermissionsGuard } from './guards/enhanced-permissions.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    KmsService,
    S3Service,
    DatabaseEncryptionService,
    PermissionsService,
    AuditLogService,
    AnomalyDetectionService,
    ValidationService,
    PrivacyByDesignService,
    DataMinimizationService,
    ConsentManagementService,
    DPIADocumentationService,
    PrivacyNoticeService,
    EnhancedPermissionsGuard
  ],
  exports: [
    KmsService,
    S3Service,
    DatabaseEncryptionService,
    PermissionsService,
    AuditLogService,
    AnomalyDetectionService,
    ValidationService,
    PrivacyByDesignService,
    DataMinimizationService,
    ConsentManagementService,
    DPIADocumentationService,
    PrivacyNoticeService,
    EnhancedPermissionsGuard
  ],
})
export class SecurityModule {}