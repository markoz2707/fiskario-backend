import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FeatureFlag {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  conditions: FeatureCondition[];
  tenantOverrides?: Record<string, boolean>;
  userOverrides?: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureCondition {
  type: 'tenant' | 'user' | 'environment' | 'time' | 'custom';
  operator: 'equals' | 'in' | 'contains' | 'greater_than' | 'less_than';
  value: any;
}

export interface FeatureContext {
  tenantId?: string;
  userId?: string;
  environment?: string;
  timestamp?: Date;
  customData?: Record<string, any>;
}

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagService.name);
  private flags: Map<string, FeatureFlag> = new Map();
  private evaluationCache: Map<string, { result: boolean; expires: number }> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.initializeDefaultFlags();
    this.startCacheCleanup();
  }

  private initializeDefaultFlags(): void {
    const defaultFlags: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'new_invoice_ui',
        description: 'New invoice creation user interface',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'advanced_tax_calculations',
        description: 'Advanced tax calculation features',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'ksef_integration',
        description: 'KSEF integration for invoice submission',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'mobile_app_features',
        description: 'Mobile application features',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
      {
        name: 'ai_ocr_processing',
        description: 'AI-powered OCR processing for documents',
        enabled: false,
        rolloutPercentage: 0,
        conditions: [
          {
            type: 'environment',
            operator: 'equals',
            value: 'staging',
          },
        ],
      },
      {
        name: 'advanced_reporting',
        description: 'Advanced reporting and analytics features',
        enabled: false,
        rolloutPercentage: 25,
        conditions: [],
      },
      {
        name: 'zus_integration',
        description: 'ZUS integration for social insurance',
        enabled: true,
        rolloutPercentage: 100,
        conditions: [],
      },
    ];

    const now = new Date();
    defaultFlags.forEach(flag => {
      this.flags.set(flag.name, {
        ...flag,
        createdAt: now,
        updatedAt: now,
      });
    });

    this.logger.log(`Initialized ${defaultFlags.length} default feature flags`);
  }

  async isEnabled(flagName: string, context: FeatureContext = {}): Promise<boolean> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      this.logger.warn(`Feature flag '${flagName}' not found`);
      return false;
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(flagName, context);
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return cached.result;
    }

    // Evaluate flag
    const result = this.evaluateFlag(flag, context);

    // Cache result for 5 minutes
    this.evaluationCache.set(cacheKey, {
      result,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return result;
  }

  private evaluateFlag(flag: FeatureFlag, context: FeatureContext): boolean {
    // Check if flag is globally disabled
    if (!flag.enabled) {
      return false;
    }

    // Check tenant override
    if (context.tenantId && flag.tenantOverrides?.[context.tenantId] !== undefined) {
      return flag.tenantOverrides[context.tenantId];
    }

    // Check user override
    if (context.userId && flag.userOverrides?.[context.userId] !== undefined) {
      return flag.userOverrides[context.userId];
    }

    // Evaluate conditions
    if (flag.conditions.length > 0) {
      const conditionsMet = flag.conditions.every(condition =>
        this.evaluateCondition(condition, context)
      );

      if (!conditionsMet) {
        return false;
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const rolloutKey = context.userId || context.tenantId || 'anonymous';
      const hash = this.simpleHash(rolloutKey + flag.name);
      const percentage = (hash % 100) + 1;

      if (percentage > flag.rolloutPercentage) {
        return false;
      }
    }

    return true;
  }

  private evaluateCondition(condition: FeatureCondition, context: FeatureContext): boolean {
    const contextValue = this.getContextValue(condition.type, context);

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'contains':
        return typeof contextValue === 'string' &&
               typeof condition.value === 'string' &&
               contextValue.includes(condition.value);
      case 'greater_than':
        return typeof contextValue === 'number' &&
               typeof condition.value === 'number' &&
               contextValue > condition.value;
      case 'less_than':
        return typeof contextValue === 'number' &&
               typeof condition.value === 'number' &&
               contextValue < condition.value;
      default:
        return false;
    }
  }

  private getContextValue(type: string, context: FeatureContext): any {
    switch (type) {
      case 'tenant':
        return context.tenantId;
      case 'user':
        return context.userId;
      case 'environment':
        return context.environment;
      case 'time':
        return context.timestamp || new Date();
      case 'custom':
        return context.customData;
      default:
        return undefined;
    }
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private generateCacheKey(flagName: string, context: FeatureContext): string {
    const keyParts = [
      flagName,
      context.tenantId || '',
      context.userId || '',
      context.environment || '',
    ];
    return keyParts.join(':');
  }

  // Feature flag management
  async createFlag(flagData: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): Promise<FeatureFlag> {
    const flag: FeatureFlag = {
      ...flagData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.flags.set(flag.name, flag);
    this.clearFlagCache(flag.name);

    this.logger.log(`Feature flag '${flag.name}' created`);
    return flag;
  }

  async updateFlag(name: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag | null> {
    const flag = this.flags.get(name);
    if (!flag) {
      return null;
    }

    const updatedFlag = {
      ...flag,
      ...updates,
      updatedAt: new Date(),
    };

    this.flags.set(name, updatedFlag);
    this.clearFlagCache(name);

    this.logger.log(`Feature flag '${name}' updated`);
    return updatedFlag;
  }

  async deleteFlag(name: string): Promise<boolean> {
    const deleted = this.flags.delete(name);
    if (deleted) {
      this.clearFlagCache(name);
      this.logger.log(`Feature flag '${name}' deleted`);
    }
    return deleted;
  }

  getFlag(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  // Tenant and user overrides
  async setTenantOverride(flagName: string, tenantId: string, enabled: boolean): Promise<void> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Feature flag '${flagName}' not found`);
    }

    flag.tenantOverrides = flag.tenantOverrides || {};
    flag.tenantOverrides[tenantId] = enabled;
    flag.updatedAt = new Date();

    this.clearFlagCache(flagName);
    this.logger.log(`Tenant override set for flag '${flagName}': tenant ${tenantId} = ${enabled}`);
  }

  async setUserOverride(flagName: string, userId: string, enabled: boolean): Promise<void> {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Feature flag '${flagName}' not found`);
    }

    flag.userOverrides = flag.userOverrides || {};
    flag.userOverrides[userId] = enabled;
    flag.updatedAt = new Date();

    this.clearFlagCache(flagName);
    this.logger.log(`User override set for flag '${flagName}': user ${userId} = ${enabled}`);
  }

  // Batch evaluation
  async evaluateMultipleFlags(flagNames: string[], context: FeatureContext = {}): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.all(
      flagNames.map(async (flagName) => {
        results[flagName] = await this.isEnabled(flagName, context);
      })
    );

    return results;
  }

  // Analytics and reporting
  getFlagAnalytics(flagName: string): any {
    const flag = this.flags.get(flagName);
    if (!flag) {
      return null;
    }

    // Count cache hits for this flag
    let cacheHits = 0;
    for (const [key, value] of this.evaluationCache) {
      if (key.startsWith(flagName + ':')) {
        cacheHits++;
      }
    }

    return {
      name: flag.name,
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage,
      tenantOverrides: Object.keys(flag.tenantOverrides || {}).length,
      userOverrides: Object.keys(flag.userOverrides || {}).length,
      conditionsCount: flag.conditions.length,
      cacheHits,
      lastUpdated: flag.updatedAt,
    };
  }

  private clearFlagCache(flagName: string): void {
    // Remove all cache entries for this flag
    for (const [key] of this.evaluationCache) {
      if (key.startsWith(flagName + ':')) {
        this.evaluationCache.delete(key);
      }
    }
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every 10 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.evaluationCache) {
        if (now > value.expires) {
          this.evaluationCache.delete(key);
        }
      }
    }, 10 * 60 * 1000);
  }

  // Polish tax compliance: Feature flags for tax-related features
  async isTaxFeatureEnabled(feature: string, context: FeatureContext): Promise<boolean> {
    const taxFeatures = {
      'advanced_tax_calculations': 'advanced_tax_calculations',
      'ksef_integration': 'ksef_integration',
      'zus_integration': 'zus_integration',
      'tax_reporting': 'advanced_reporting',
      'tax_audit_trail': 'advanced_reporting',
    };

    const flagName = taxFeatures[feature];
    if (!flagName) {
      return false;
    }

    return this.isEnabled(flagName, context);
  }

  // Compliance-specific feature flags
  async enableComplianceFeature(featureName: string, tenantId: string): Promise<void> {
    await this.setTenantOverride(featureName, tenantId, true);
    this.logger.log(`Compliance feature '${featureName}' enabled for tenant ${tenantId}`);
  }

  async disableComplianceFeature(featureName: string, tenantId: string): Promise<void> {
    await this.setTenantOverride(featureName, tenantId, false);
    this.logger.log(`Compliance feature '${featureName}' disabled for tenant ${tenantId}`);
  }
}