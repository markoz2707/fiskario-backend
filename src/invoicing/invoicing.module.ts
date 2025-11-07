import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { InvoicesController } from './invoices.controller';
import { BuyersService } from './buyers.service';
import { BuyersController } from './buyers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { KsefModule } from '../ksef/ksef.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';

@Module({
  imports: [PrismaModule, KsefModule, TaxRulesModule],
  providers: [InvoicingService, BuyersService],
  controllers: [InvoicingController, InvoicesController, BuyersController]
})
export class InvoicingModule {}
