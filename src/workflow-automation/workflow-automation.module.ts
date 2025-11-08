import { Module, forwardRef } from '@nestjs/common';
import { WorkflowAutomationController } from './controllers/workflow-automation.controller';
import { WorkflowEngineService } from './services/workflow-engine.service';
import { TemplateManagementService } from './services/template-management.service';
import { SmartDefaultsEngineService } from './services/smart-defaults-engine.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicingModule } from '../invoicing/invoicing.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';
import { KsefModule } from '../ksef/ksef.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => InvoicingModule),
    forwardRef(() => TaxRulesModule),
    forwardRef(() => KsefModule),
  ],
  controllers: [WorkflowAutomationController],
  providers: [
    WorkflowEngineService,
    TemplateManagementService,
    SmartDefaultsEngineService,
  ],
  exports: [
    WorkflowEngineService,
    TemplateManagementService,
    SmartDefaultsEngineService,
  ],
})
export class WorkflowAutomationModule {}