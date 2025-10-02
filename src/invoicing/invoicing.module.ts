import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { KsefModule } from '../ksef/ksef.module';

@Module({
  imports: [PrismaModule, KsefModule],
  providers: [InvoicingService],
  controllers: [InvoicingController]
})
export class InvoicingModule {}
