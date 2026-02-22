import { Module } from '@nestjs/common';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { DepreciationService } from './services/depreciation.service';
import { DepreciationScheduleService } from './services/depreciation-schedule.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, DepreciationService, DepreciationScheduleService],
  exports: [FixedAssetsService, DepreciationService],
})
export class FixedAssetsModule {}
