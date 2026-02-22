import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TaxOptimizationController } from './tax-optimization.controller';
import { FormComparisonService } from './services/form-comparison.service';
import { SimulationService } from './services/simulation.service';
import { ThresholdMonitorService } from './services/threshold-monitor.service';
import { RecommendationService } from './services/recommendation.service';

@Module({
  imports: [PrismaModule],
  controllers: [TaxOptimizationController],
  providers: [
    FormComparisonService,
    SimulationService,
    ThresholdMonitorService,
    RecommendationService,
  ],
  exports: [
    FormComparisonService,
    SimulationService,
    ThresholdMonitorService,
    RecommendationService,
  ],
})
export class TaxOptimizationModule {}
