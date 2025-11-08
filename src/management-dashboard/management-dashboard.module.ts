import { Module, forwardRef } from '@nestjs/common';
import { ManagementDashboardController } from './controllers/management-dashboard.controller';
import { ManagementDashboardService } from './services/management-dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicingModule } from '../invoicing/invoicing.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';
import { DeclarationsModule } from '../declarations/declarations.module';
import { KsefModule } from '../ksef/ksef.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => InvoicingModule),
    TaxRulesModule,
    DeclarationsModule,
    KsefModule,
  ],
  controllers: [ManagementDashboardController],
  providers: [ManagementDashboardService],
  exports: [ManagementDashboardService],
})
export class ManagementDashboardModule {}