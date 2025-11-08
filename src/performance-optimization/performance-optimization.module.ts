import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisCacheService } from './services/redis-cache.service';
import { PaginationService } from './services/pagination.service';
import { QueryOptimizationService } from './services/query-optimization.service';
import { LazyLoadingService } from './services/lazy-loading.service';

@Module({
  imports: [ConfigModule],
  providers: [
    RedisCacheService,
    PaginationService,
    QueryOptimizationService,
    LazyLoadingService,
  ],
  exports: [
    RedisCacheService,
    PaginationService,
    QueryOptimizationService,
    LazyLoadingService,
  ],
})
export class PerformanceOptimizationModule {}