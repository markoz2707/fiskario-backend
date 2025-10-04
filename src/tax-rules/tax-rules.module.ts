import { Module } from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { TaxRulesController } from './tax-rules.controller';
import { MobileSyncController } from './mobile-sync.controller';
import { TaxRulesSeedService } from './tax-rules-seed.service';
import { TaxRateManagerService } from './tax-rate-manager.service';
import { MobileErrorHandlerService } from './mobile-error-handler.service';
import { MobileResponseFormatterService } from './mobile-response-formatter.service';
import { MobileValidationService } from './mobile-validation.service';
import { MobileIntegrationService } from './mobile-integration.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TaxRulesController, MobileSyncController],
  providers: [
    TaxRulesService,
    TaxRulesSeedService,
    TaxRateManagerService,
    MobileErrorHandlerService,
    MobileResponseFormatterService,
    MobileValidationService,
    MobileIntegrationService,
  ],
  exports: [
    TaxRulesService,
    TaxRateManagerService,
    MobileErrorHandlerService,
    MobileResponseFormatterService,
    MobileValidationService,
    MobileIntegrationService,
  ],
})
export class TaxRulesModule {}