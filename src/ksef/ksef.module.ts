import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KsefController } from './ksef.controller';
import { KsefService } from './ksef.service';
import { KsefReceiverService } from './ksef-receiver.service';
import { KsefPollingService } from './ksef-polling.service';
import { KsefBatchService } from './ksef-batch.service';
import { KsefRetryService } from './ksef-retry.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [KsefController],
  providers: [
    KsefService,
    KsefReceiverService,
    KsefPollingService,
    KsefBatchService,
    KsefRetryService,
  ],
  exports: [
    KsefService,
    KsefReceiverService,
    KsefPollingService,
    KsefBatchService,
    KsefRetryService,
  ],
})
export class KsefModule { }
