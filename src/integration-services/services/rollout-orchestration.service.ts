import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RolloutPlan {
  id: string;
  name: string;
  description: string;
  feature: string;
  strategy: 'percentage' | 'tenant' | 'user' | 'gradual' | 'blue_green';
  status: 'planned' | 'in_progress' | 'completed' | 'rolled_back' | 'failed';
  stages: RolloutStage[];
  currentStage: number;
  startTime?: Date;
  endTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RolloutStage {
  id: string;
  name: string;
  percentage: number;
  tenantIds?: string[];
  userIds?: string[];
  conditions: RolloutCondition[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  metrics: RolloutMetrics;
}

export interface RolloutCondition {
  type: 'success_rate' | 'error_rate' | 'performance' | 'custom';
  operator: 'greater_than' | 'less_than' | 'equals';
  value: number;
  metric: string;
}

export interface RolloutMetrics {
  successRate: number;
  errorRate: number;
  averageResponseTime: number;
  throughput: number;
  customMetrics: Record<string, number>;
}

export interface RolloutContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  timestamp: Date;
}

@Injectable()
export class RolloutOrchestrationService implements OnModuleInit {
  private readonly logger = new Logger(RolloutOrchestrationService.name);
  private rolloutPlans: Map<string, RolloutPlan> = new Map();
  private activeRollouts: Map<string, RolloutContext[]> = new Map();
  private metricsBuffer: Map<string, RolloutMetrics[]> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.initializeDefaultPlans();
    this.startMetricsCollection();
  }

  private initializeDefaultPlans(): void {
    const defaultPlans: Omit<RolloutPlan, 'createdAt' | 'updatedAt'>[] = [
      {
        id: 'ksef_integration_rollout',
        name: 'KSEF Integration Rollout',
        description: 'Gradual rollout of KSEF integration feature',
        feature: 'ksef_integration',
        strategy: 'percentage',
        status: 'completed',
        currentStage: 3,
        stages: [
          {
            id: 'stage_1',
            name: 'Initial Testing',
            percentage: 5,
            conditions: [
              {
                type: 'success_rate',
                operator: 'greater_than',
                value: 95,
                metric: 'api_success_rate',
              },
            ],
            status: 'completed',
            metrics: { successRate: 98, errorRate: 2, averageResponseTime: 250, throughput: 100, customMetrics: {} },
          },
          {
            id: 'stage_2',
            name: 'Beta Release',
            percentage: 25,
            conditions: [
              {
                type: 'success_rate',
                operator: 'greater_than',
                value: 97,
                metric: 'api_success_rate',
              },
            ],
            status: 'completed',
            metrics: { successRate: 97.5, errorRate: 2.5, averageResponseTime: 300, throughput: 150, customMetrics: {} },
          },
          {
            id: 'stage_3',
            name: 'Full Release',
            percentage: 100,
            conditions: [],
            status: 'completed',
            metrics: { successRate: 96.8, errorRate: 3.2, averageResponseTime: 350, throughput: 200, customMetrics: {} },
          },
        ],
      },
      {
        id: 'mobile_app_rollout',
        name: 'Mobile App Features Rollout',
        description: 'Rollout of mobile application features',
        feature: 'mobile_app_features',
        strategy: 'gradual',
        status: 'in_progress',
        currentStage: 1,
        stages: [
          {
            id: 'mobile_stage_1',
            name: 'Core Features',
            percentage: 50,
            conditions: [
              {
                type: 'success_rate',
                operator: 'greater_than',
                value: 95,
                metric: 'mobile_api_success_rate',
              },
            ],
            status: 'in_progress',
            metrics: { successRate: 94, errorRate: 6, averageResponseTime: 400, throughput: 50, customMetrics: {} },
          },
        ],
      },
    ];

    const now = new Date();
    defaultPlans.forEach(plan => {
      this.rolloutPlans.set(plan.id, {
        ...plan,
        createdAt: now,
        updatedAt: now,
      });
    });

    this.logger.log(`Initialized ${defaultPlans.length} default rollout plans`);
  }

  async createRolloutPlan(planData: Omit<RolloutPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<RolloutPlan> {
    const plan: RolloutPlan = {
      ...planData,
      id: `rollout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rolloutPlans.set(plan.id, plan);
    this.logger.log(`Rollout plan '${plan.name}' created`);
    return plan;
  }

  async startRollout(planId: string): Promise<boolean> {
    const plan = this.rolloutPlans.get(planId);
    if (!plan) {
      throw new Error(`Rollout plan ${planId} not found`);
    }

    if (plan.status !== 'planned') {
      throw new Error(`Rollout plan ${planId} is not in planned status`);
    }

    plan.status = 'in_progress';
    plan.startTime = new Date();
    plan.currentStage = 0;
    plan.updatedAt = new Date();

    this.activeRollouts.set(planId, []);

    this.logger.log(`Rollout '${plan.name}' started`);
    return true;
  }

  async advanceRollout(planId: string): Promise<boolean> {
    const plan = this.rolloutPlans.get(planId);
    if (!plan) {
      throw new Error(`Rollout plan ${planId} not found`);
    }

    if (plan.status !== 'in_progress') {
      throw new Error(`Rollout plan ${planId} is not in progress`);
    }

    const currentStage = plan.stages[plan.currentStage];
    if (!currentStage) {
      // Rollout completed
      plan.status = 'completed';
      plan.endTime = new Date();
      plan.updatedAt = new Date();
      this.activeRollouts.delete(planId);
      this.logger.log(`Rollout '${plan.name}' completed`);
      return true;
    }

    // Check if current stage conditions are met
    const conditionsMet = await this.checkStageConditions(planId, currentStage);
    if (!conditionsMet) {
      this.logger.warn(`Stage conditions not met for rollout '${plan.name}' stage ${plan.currentStage}`);
      return false;
    }

    // Advance to next stage
    currentStage.status = 'completed';
    plan.currentStage++;
    plan.updatedAt = new Date();

    const nextStage = plan.stages[plan.currentStage];
    if (nextStage) {
      nextStage.status = 'in_progress';
    }

    this.logger.log(`Rollout '${plan.name}' advanced to stage ${plan.currentStage}`);
    return true;
  }

  async rollbackRollout(planId: string, reason: string): Promise<boolean> {
    const plan = this.rolloutPlans.get(planId);
    if (!plan) {
      throw new Error(`Rollout plan ${planId} not found`);
    }

    plan.status = 'rolled_back';
    plan.endTime = new Date();
    plan.updatedAt = new Date();

    this.activeRollouts.delete(planId);

    this.logger.warn(`Rollout '${plan.name}' rolled back: ${reason}`);
    return true;
  }

  async recordRolloutMetrics(planId: string, context: RolloutContext, metrics: Partial<RolloutMetrics>): Promise<void> {
    const plan = this.rolloutPlans.get(planId);
    if (!plan) return;

    const contexts = this.activeRollouts.get(planId) || [];
    contexts.push(context);
    this.activeRollouts.set(planId, contexts.slice(-100)); // Keep last 100 contexts

    // Buffer metrics
    const buffer = this.metricsBuffer.get(planId) || [];
    buffer.push({
      successRate: metrics.successRate || 0,
      errorRate: metrics.errorRate || 0,
      averageResponseTime: metrics.averageResponseTime || 0,
      throughput: metrics.throughput || 0,
      customMetrics: metrics.customMetrics || {},
    });

    // Keep last 100 metrics
    this.metricsBuffer.set(planId, buffer.slice(-100));

    // Update current stage metrics
    const currentStage = plan.stages[plan.currentStage];
    if (currentStage) {
      currentStage.metrics = this.calculateAverageMetrics(buffer);
    }
  }

  private calculateAverageMetrics(metrics: RolloutMetrics[]): RolloutMetrics {
    if (metrics.length === 0) {
      return { successRate: 0, errorRate: 0, averageResponseTime: 0, throughput: 0, customMetrics: {} };
    }

    const sum = metrics.reduce(
      (acc, m) => ({
        successRate: acc.successRate + m.successRate,
        errorRate: acc.errorRate + m.errorRate,
        averageResponseTime: acc.averageResponseTime + m.averageResponseTime,
        throughput: acc.throughput + m.throughput,
        customMetrics: { ...acc.customMetrics },
      }),
      { successRate: 0, errorRate: 0, averageResponseTime: 0, throughput: 0, customMetrics: {} }
    );

    const count = metrics.length;
    return {
      successRate: sum.successRate / count,
      errorRate: sum.errorRate / count,
      averageResponseTime: sum.averageResponseTime / count,
      throughput: sum.throughput / count,
      customMetrics: sum.customMetrics,
    };
  }

  private async checkStageConditions(planId: string, stage: RolloutStage): Promise<boolean> {
    const metrics = this.metricsBuffer.get(planId) || [];
    if (metrics.length === 0) return false;

    const avgMetrics = this.calculateAverageMetrics(metrics);

    for (const condition of stage.conditions) {
      const metricValue = this.getMetricValue(avgMetrics, condition.metric);

      switch (condition.operator) {
        case 'greater_than':
          if (metricValue <= condition.value) return false;
          break;
        case 'less_than':
          if (metricValue >= condition.value) return false;
          break;
        case 'equals':
          if (metricValue !== condition.value) return false;
          break;
      }
    }

    return true;
  }

  private getMetricValue(metrics: RolloutMetrics, metric: string): number {
    switch (metric) {
      case 'success_rate':
        return metrics.successRate;
      case 'error_rate':
        return metrics.errorRate;
      case 'response_time':
        return metrics.averageResponseTime;
      case 'throughput':
        return metrics.throughput;
      default:
        return metrics.customMetrics[metric] || 0;
    }
  }

  getRolloutPlan(planId: string): RolloutPlan | undefined {
    return this.rolloutPlans.get(planId);
  }

  getAllRolloutPlans(): RolloutPlan[] {
    return Array.from(this.rolloutPlans.values());
  }

  getActiveRollouts(): RolloutPlan[] {
    return Array.from(this.rolloutPlans.values()).filter(
      plan => plan.status === 'in_progress'
    );
  }

  private startMetricsCollection(): void {
    // Periodic metrics analysis and auto-advancement
    setInterval(async () => {
      for (const plan of this.getActiveRollouts()) {
        try {
          await this.advanceRollout(plan.id);
        } catch (error) {
          this.logger.error(`Auto-advance failed for rollout ${plan.name}`, error);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  // Polish tax compliance: Rollout orchestration for tax features
  async createTaxFeatureRollout(
    featureName: string,
    description: string,
    stages: Omit<RolloutStage, 'id' | 'status' | 'metrics'>[],
  ): Promise<RolloutPlan> {
    const planData: Omit<RolloutPlan, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `${featureName} Rollout`,
      description,
      feature: featureName,
      strategy: 'gradual',
      status: 'planned',
      currentStage: 0,
      stages: stages.map((stage, index) => ({
        ...stage,
        id: `stage_${index + 1}`,
        status: 'pending',
        metrics: { successRate: 0, errorRate: 0, averageResponseTime: 0, throughput: 0, customMetrics: {} },
      })),
    };

    return this.createRolloutPlan(planData);
  }

  async monitorTaxComplianceRollout(planId: string): Promise<any> {
    const plan = this.rolloutPlans.get(planId);
    if (!plan) {
      throw new Error(`Rollout plan ${planId} not found`);
    }

    const metrics = this.metricsBuffer.get(planId) || [];
    const contexts = this.activeRollouts.get(planId) || [];

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        feature: plan.feature,
        status: plan.status,
        currentStage: plan.currentStage,
      },
      currentMetrics: metrics.length > 0 ? this.calculateAverageMetrics(metrics) : null,
      activeContexts: contexts.length,
      complianceStatus: this.assessComplianceStatus(plan, metrics),
    };
  }

  private assessComplianceStatus(plan: RolloutPlan, metrics: RolloutMetrics[]): 'compliant' | 'warning' | 'critical' {
    if (metrics.length === 0) return 'warning';

    const avgMetrics = this.calculateAverageMetrics(metrics);

    // Tax compliance requires high success rates and low error rates
    if (avgMetrics.successRate < 95 || avgMetrics.errorRate > 5) {
      return 'critical';
    }

    if (avgMetrics.successRate < 97 || avgMetrics.errorRate > 3) {
      return 'warning';
    }

    return 'compliant';
  }

  // Emergency rollback for tax features
  async emergencyRollback(planId: string, reason: string): Promise<boolean> {
    this.logger.error(`Emergency rollback initiated for rollout ${planId}: ${reason}`);
    return this.rollbackRollout(planId, `EMERGENCY: ${reason}`);
  }

  // Compliance reporting
  generateComplianceReport(planId: string): any {
    const plan = this.rolloutPlans.get(planId);
    if (!plan) return null;

    const metrics = this.metricsBuffer.get(planId) || [];
    const contexts = this.activeRollouts.get(planId) || [];

    return {
      rolloutId: plan.id,
      feature: plan.feature,
      status: plan.status,
      complianceStatus: this.assessComplianceStatus(plan, metrics),
      metrics: metrics.length > 0 ? this.calculateAverageMetrics(metrics) : null,
      activeUsers: contexts.length,
      stages: plan.stages.map(stage => ({
        name: stage.name,
        status: stage.status,
        percentage: stage.percentage,
        metrics: stage.metrics,
      })),
      generatedAt: new Date(),
    };
  }
}