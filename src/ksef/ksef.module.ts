import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KsefController } from './ksef.controller';
import { KsefService } from './ksef.service';
import { KsefRetryService } from './ksef-retry.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [KsefController],
  providers: [KsefService, KsefRetryService],
  exports: [KsefService, KsefRetryService],
})
export class KsefModule {}
