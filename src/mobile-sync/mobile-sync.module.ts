import { Module } from '@nestjs/common';
import { MobileSyncController } from './mobile-sync.controller';
import { MobileSyncService } from './mobile-sync.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PerformanceOptimizationModule } from '../performance-optimization/performance-optimization.module';
import { WorkflowAutomationModule } from '../workflow-automation/workflow-automation.module';
import { ManagementDashboardModule } from '../management-dashboard/management-dashboard.module';

@Module({
  imports: [
    PrismaModule,
    PerformanceOptimizationModule,
    WorkflowAutomationModule,
    ManagementDashboardModule,
  ],
  controllers: [MobileSyncController],
  providers: [MobileSyncService],
  exports: [MobileSyncService],
})
export class MobileSyncModule {}