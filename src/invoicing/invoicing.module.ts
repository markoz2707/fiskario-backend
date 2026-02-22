import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { InvoicesController } from './invoices.controller';
import { BuyersService } from './buyers.service';
import { BuyersController } from './buyers.controller';
import { InvoiceCorrectionService } from './services/invoice-correction.service';
import { PrismaModule } from '../prisma/prisma.module';
import { KsefModule } from '../ksef/ksef.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';

@Module({
  imports: [PrismaModule, KsefModule, TaxRulesModule],
  providers: [InvoicingService, BuyersService, InvoiceCorrectionService],
  controllers: [InvoicingController, InvoicesController, BuyersController],
  exports: [InvoiceCorrectionService],
})
export class InvoicingModule {}
