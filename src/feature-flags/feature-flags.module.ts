import { Module } from '@nestjs/common';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PerformanceOptimizationModule } from '../performance-optimization/performance-optimization.module';

@Module({
  imports: [PrismaModule, PerformanceOptimizationModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}