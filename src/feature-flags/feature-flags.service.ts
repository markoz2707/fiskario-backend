import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../performance-optimization/services/redis-cache.service';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  conditions: FeatureFlagCondition[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagCondition {
  type: 'user' | 'company' | 'tenant' | 'platform';
  key: string;
  value: string | number | boolean;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
}

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cacheService: RedisCacheService,
  ) {}

  // Check if a feature is enabled for a user/context
  async isFeatureEnabled(
    featureName: string,
    context: {
      userId?: string;
      companyId?: string;
      tenantId?: string;
      platform?: string;
    } = {}
  ): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = `feature_flag:${featureName}`;
      const cached = await this.cacheService.get<FeatureFlag>(cacheKey, { tenantId: context.tenantId });

      let featureFlag: FeatureFlag | null = cached;

      if (!featureFlag) {
        // Fetch from database
        const dbFlag = await this.prisma.featureFlag.findUnique({
          where: { name: featureName },
        });

        if (!dbFlag) {
          return false; // Feature doesn't exist, default to disabled
        }

        featureFlag = {
          id: dbFlag.id,
          name: dbFlag.name,
          description: dbFlag.description,
          enabled: dbFlag.enabled,
          rolloutPercentage: dbFlag.rolloutPercentage,
          conditions: dbFlag.conditions as FeatureFlagCondition[],
          createdAt: dbFlag.createdAt,
          updatedAt: dbFlag.updatedAt,
        };

        // Cache the feature flag
        await this.cacheService.set(cacheKey, featureFlag, { tenantId: context.tenantId, ttl: 300 }); // 5 minutes
      }

      // If feature is globally disabled, return false
      if (!featureFlag.enabled) {
        return false;
      }

      // Check rollout percentage
      if (featureFlag.rolloutPercentage < 100) {
        const userHash = this.generateUserHash(context.userId || context.companyId || 'anonymous');
        const rolloutValue = (userHash % 100) + 1;
        if (rolloutValue > featureFlag.rolloutPercentage) {
          return false;
        }
      }

      // Check conditions
      if (featureFlag.conditions && featureFlag.conditions.length > 0) {
        return this.evaluateConditions(featureFlag.conditions, context);
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking feature flag ${featureName}`, error);
      return false; // Fail-safe: disable feature on error
    }
  }

  // Create or update a feature flag
  async setFeatureFlag(flagData: Partial<FeatureFlag>): Promise<FeatureFlag> {
    try {
      const flag = await this.prisma.featureFlag.upsert({
        where: { name: flagData.name! },
        update: {
          description: flagData.description,
          enabled: flagData.enabled,
          rolloutPercentage: flagData.rolloutPercentage,
          conditions: flagData.conditions,
          updatedAt: new Date(),
        },
        create: {
          name: flagData.name!,
          description: flagData.description || '',
          enabled: flagData.enabled || false,
          rolloutPercentage: flagData.rolloutPercentage || 100,
          conditions: flagData.conditions || [],
        },
      });

      // Clear cache
      await this.cacheService.delete(`feature_flag:${flag.name}`);

      return {
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
        conditions: flag.conditions as FeatureFlagCondition[],
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      };
    } catch (error) {
      this.logger.error('Error setting feature flag', error);
      throw error;
    }
  }

  // Get all feature flags
  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    try {
      const flags = await this.prisma.featureFlag.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      return flags.map(flag => ({
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
        conditions: flag.conditions as FeatureFlagCondition[],
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      }));
    } catch (error) {
      this.logger.error('Error getting all feature flags', error);
      throw error;
    }
  }

  // Delete a feature flag
  async deleteFeatureFlag(featureName: string): Promise<void> {
    try {
      await this.prisma.featureFlag.delete({
        where: { name: featureName },
      });

      // Clear cache
      await this.cacheService.delete(`feature_flag:${featureName}`);
    } catch (error) {
      this.logger.error(`Error deleting feature flag ${featureName}`, error);
      throw error;
    }
  }

  // Evaluate conditions for feature flag
  private evaluateConditions(conditions: FeatureFlagCondition[], context: any): boolean {
    for (const condition of conditions) {
      const contextValue = context[condition.key];

      if (contextValue === undefined) {
        return false; // Required condition key not present
      }

      switch (condition.operator) {
        case 'equals':
          if (contextValue !== condition.value) return false;
          break;
        case 'contains':
          if (typeof contextValue === 'string' && typeof condition.value === 'string') {
            if (!contextValue.includes(condition.value)) return false;
          } else {
            return false;
          }
          break;
        case 'greater_than':
          if (typeof contextValue === 'number' && typeof condition.value === 'number') {
            if (contextValue <= condition.value) return false;
          } else {
            return false;
          }
          break;
        case 'less_than':
          if (typeof contextValue === 'number' && typeof condition.value === 'number') {
            if (contextValue >= condition.value) return false;
          } else {
            return false;
          }
          break;
        case 'in':
          if (Array.isArray(condition.value)) {
            if (!condition.value.includes(contextValue)) return false;
          } else {
            return false;
          }
          break;
        default:
          return false;
      }
    }

    return true; // All conditions passed
  }

  // Generate consistent hash for user/company for rollout percentage
  private generateUserHash(identifier: string): number {
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      const char = identifier.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Initialize default feature flags for new features
  async initializeDefaultFeatureFlags(): Promise<void> {
    const defaultFlags = [
      {
        name: 'management-dashboard',
        description: 'Management dashboard with real-time metrics',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'workflow-automation',
        description: 'Automated workflow processing',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'performance-optimization',
        description: 'Performance optimizations and caching',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'mobile-sync',
        description: 'Mobile synchronization features',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
    ];

    for (const flag of defaultFlags) {
      try {
        await this.setFeatureFlag(flag);
      } catch (error) {
        this.logger.warn(`Could not initialize feature flag ${flag.name}`, error);
      }
    }
  }
}