import { Module } from '@nestjs/common';
import { ZusController } from './zus.controller';
import { ZusService } from './zus.service';
import { ZusPueService } from './zus-pue.service';
import { ZusDeadlineService } from './zus-deadline.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ZusController],
  providers: [ZusService, ZusPueService, ZusDeadlineService],
  exports: [ZusService, ZusPueService, ZusDeadlineService],
})
export class ZusModule {}
