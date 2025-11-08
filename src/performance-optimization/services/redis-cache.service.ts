import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'redis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tenantId?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis.RedisClientType;
  private readonly logger = new Logger(RedisCacheService.name);
  private stats: CacheStats = { hits: 0, misses: 0, sets: 0, deletes: 0, hitRate: 0 };

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.client = Redis.createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 60000,
      },
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    try {
      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.logger.log('Disconnected from Redis');
    }
  }

  private getKey(key: string, tenantId?: string): string {
    return tenantId ? `${tenantId}:${key}` : key;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      const cacheKey = this.getKey(key, options?.tenantId);
      const value = await this.client.get(cacheKey);

      if (value) {
        this.stats.hits++;
        this.updateHitRate();
        return JSON.parse(value);
      } else {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }
    } catch (error) {
      this.logger.error(`Error getting cache key ${key}`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const cacheKey = this.getKey(key, options?.tenantId);
      const serializedValue = JSON.stringify(value);

      if (options?.ttl) {
        await this.client.setEx(cacheKey, options.ttl, serializedValue);
      } else {
        await this.client.set(cacheKey, serializedValue);
      }

      this.stats.sets++;
    } catch (error) {
      this.logger.error(`Error setting cache key ${key}`, error);
    }
  }

  async delete(key: string, tenantId?: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, tenantId);
      const result = await this.client.del(cacheKey);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.logger.error(`Error deleting cache key ${key}`, error);
      return false;
    }
  }

  async deleteByPattern(pattern: string, tenantId?: string): Promise<number> {
    try {
      const searchPattern = this.getKey(pattern, tenantId);
      const keys = await this.client.keys(searchPattern);

      if (keys.length > 0) {
        const result = await this.client.del(keys);
        this.stats.deletes += result;
        return result;
      }

      return 0;
    } catch (error) {
      this.logger.error(`Error deleting keys by pattern ${pattern}`, error);
      return 0;
    }
  }

  async exists(key: string, tenantId?: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, tenantId);
      const result = await this.client.exists(cacheKey);
      return result > 0;
    } catch (error) {
      this.logger.error(`Error checking existence of cache key ${key}`, error);
      return false;
    }
  }

  async clearTenantCache(tenantId: string): Promise<number> {
    try {
      const pattern = `${tenantId}:*`;
      return await this.deleteByPattern(pattern);
    } catch (error) {
      this.logger.error(`Error clearing tenant cache for ${tenantId}`, error);
      return 0;
    }
  }

  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  async resetStats(): Promise<void> {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, hitRate: 0 };
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  // Polish tax compliance: Cache frequently accessed tax rules and calculations
  async getTaxRule(ruleId: string, tenantId: string): Promise<any> {
    return this.get(`tax_rule:${ruleId}`, { tenantId, ttl: 3600 }); // 1 hour TTL
  }

  async setTaxRule(ruleId: string, rule: any, tenantId: string): Promise<void> {
    await this.set(`tax_rule:${ruleId}`, rule, { tenantId, ttl: 3600 });
  }

  async getTaxCalculation(calcId: string, tenantId: string): Promise<any> {
    return this.get(`tax_calc:${calcId}`, { tenantId, ttl: 1800 }); // 30 min TTL
  }

  async setTaxCalculation(calcId: string, calculation: any, tenantId: string): Promise<void> {
    await this.set(`tax_calc:${calcId}`, calculation, { tenantId, ttl: 1800 });
  }
}