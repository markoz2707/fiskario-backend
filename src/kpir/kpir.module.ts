import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KPiRController } from './kpir.controller';
import { KPiRService } from './kpir.service';
import { KPiRBookingService } from './services/kpir-booking.service';
import { KPiRSummaryService } from './services/kpir-summary.service';
import { KPiRNumberingService } from './services/kpir-numbering.service';

@Module({
  imports: [PrismaModule],
  controllers: [KPiRController],
  providers: [
    KPiRService,
    KPiRBookingService,
    KPiRSummaryService,
    KPiRNumberingService,
  ],
  exports: [
    KPiRService,
    KPiRBookingService,
    KPiRSummaryService,
    KPiRNumberingService,
  ],
})
export class KPiRModule {}
