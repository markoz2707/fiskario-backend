import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ServiceEndpoint {
  name: string;
  url: string;
  health: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  metadata: {
    version: string;
    environment: string;
    region: string;
  };
}

export interface ServiceCall {
  from: string;
  to: string;
  method: string;
  path: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'success' | 'error';
  error?: string;
  duration?: number;
  tenantId?: string;
}

export interface CircuitBreakerState {
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: Date;
  nextRetryTime: Date;
}

@Injectable()
export class ServiceMeshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServiceMeshService.name);
  private services: Map<string, ServiceEndpoint> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private activeCalls: ServiceCall[] = [];
  private healthCheckInterval: NodeJS.Timeout;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.registerServices();
    this.initializeCircuitBreakers();
    this.startHealthChecks();
  }

  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  private registerServices(): void {
    // Register all known services in the mesh
    const serviceConfigs = [
      {
        name: 'auth-service',
        url: this.configService.get<string>('AUTH_SERVICE_URL', 'http://localhost:3001'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
      {
        name: 'company-service',
        url: this.configService.get<string>('COMPANY_SERVICE_URL', 'http://localhost:3002'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
      {
        name: 'invoice-service',
        url: this.configService.get<string>('INVOICE_SERVICE_URL', 'http://localhost:3003'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
      {
        name: 'ksef-service',
        url: this.configService.get<string>('KSEF_SERVICE_URL', 'http://localhost:3004'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
      {
        name: 'tax-rules-service',
        url: this.configService.get<string>('TAX_RULES_SERVICE_URL', 'http://localhost:3005'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
      {
        name: 'report-service',
        url: this.configService.get<string>('REPORT_SERVICE_URL', 'http://localhost:3006'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
      {
        name: 'notification-service',
        url: this.configService.get<string>('NOTIFICATION_SERVICE_URL', 'http://localhost:3007'),
        metadata: { version: '1.0.0', environment: 'production', region: 'eu-central' },
      },
    ];

    serviceConfigs.forEach(config => {
      this.services.set(config.name, {
        ...config,
        health: 'unknown',
        lastHealthCheck: new Date(),
      });
    });

    this.logger.log(`Registered ${serviceConfigs.length} services in service mesh`);
  }

  private initializeCircuitBreakers(): void {
    for (const serviceName of this.services.keys()) {
      this.circuitBreakers.set(serviceName, {
        service: serviceName,
        state: 'closed',
        failureCount: 0,
        lastFailureTime: new Date(0),
        nextRetryTime: new Date(),
      });
    }
  }

  async callService(
    fromService: string,
    toService: string,
    method: string,
    path: string,
    options: {
      headers?: any;
      body?: any;
      timeout?: number;
      tenantId?: string;
    } = {},
  ): Promise<any> {
    const callId = this.generateCallId();
    const call: ServiceCall = {
      from: fromService,
      to: toService,
      method,
      path,
      startTime: new Date(),
      status: 'pending',
      tenantId: options.tenantId,
    };

    this.activeCalls.push(call);

    try {
      // Check circuit breaker
      if (!this.canCallService(toService)) {
        throw new Error(`Circuit breaker is open for service ${toService}`);
      }

      const service = this.services.get(toService);
      if (!service) {
        throw new Error(`Service ${toService} not found in mesh`);
      }

      // Make the actual service call
      const result = await this.makeHttpCall(service, method, path, options);

      // Update call status
      call.status = 'success';
      call.endTime = new Date();
      call.duration = call.endTime.getTime() - call.startTime.getTime();

      // Reset circuit breaker on success
      this.resetCircuitBreaker(toService);

      this.logger.log(`Service call successful: ${fromService} -> ${toService}`, {
        method,
        path,
        duration: call.duration,
        tenantId: options.tenantId,
      });

      return result;
    } catch (error) {
      // Update call status
      call.status = 'error';
      call.endTime = new Date();
      call.duration = call.endTime.getTime() - call.startTime.getTime();
      call.error = error.message;

      // Update circuit breaker on failure
      this.recordFailure(toService);

      this.logger.error(`Service call failed: ${fromService} -> ${toService}`, {
        method,
        path,
        error: error.message,
        duration: call.duration,
        tenantId: options.tenantId,
      });

      throw error;
    } finally {
      // Clean up old calls (keep last 1000)
      if (this.activeCalls.length > 1000) {
        this.activeCalls = this.activeCalls.slice(-500);
      }
    }
  }

  private canCallService(serviceName: string): boolean {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) return true;

    switch (breaker.state) {
      case 'closed':
        return true;
      case 'open':
        return Date.now() > breaker.nextRetryTime.getTime();
      case 'half-open':
        return true;
      default:
        return true;
    }
  }

  private recordFailure(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) return;

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    // Open circuit breaker after 5 failures
    if (breaker.failureCount >= 5) {
      breaker.state = 'open';
      breaker.nextRetryTime = new Date(Date.now() + 60000); // Retry after 1 minute
      this.logger.warn(`Circuit breaker opened for service ${serviceName}`);
    }
  }

  private resetCircuitBreaker(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) return;

    breaker.failureCount = 0;
    breaker.state = 'closed';
    breaker.nextRetryTime = new Date();
  }

  private async makeHttpCall(
    service: ServiceEndpoint,
    method: string,
    path: string,
    options: any,
  ): Promise<any> {
    // This is a simplified implementation
    // In a real service mesh, this would use proper HTTP client with load balancing,
    // service discovery, etc.

    const url = `${service.url}${path}`;
    const timeout = options.timeout || 30000;

    // Simulate HTTP call
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (service.health === 'healthy') {
          resolve({ message: `Response from ${service.name}`, data: options.body });
        } else {
          reject(new Error(`Service ${service.name} is unhealthy`));
        }
      }, Math.random() * 100); // Simulate variable response time
    });
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [serviceName, service] of this.services) {
        try {
          await this.checkServiceHealth(service);
          service.health = 'healthy';
        } catch (error) {
          service.health = 'unhealthy';
          this.logger.warn(`Service ${serviceName} health check failed`, error);
        }
        service.lastHealthCheck = new Date();
      }
    }, 30000); // Check every 30 seconds
  }

  private async checkServiceHealth(service: ServiceEndpoint): Promise<void> {
    // Implement actual health check (ping /health endpoint)
    // For now, simulate random health
    if (Math.random() > 0.9) { // 10% chance of failure
      throw new Error('Health check failed');
    }
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Service discovery and registration
  registerService(serviceConfig: Omit<ServiceEndpoint, 'health' | 'lastHealthCheck'>): void {
    this.services.set(serviceConfig.name, {
      ...serviceConfig,
      health: 'unknown',
      lastHealthCheck: new Date(),
    });

    this.circuitBreakers.set(serviceConfig.name, {
      service: serviceConfig.name,
      state: 'closed',
      failureCount: 0,
      lastFailureTime: new Date(0),
      nextRetryTime: new Date(),
    });

    this.logger.log(`Service ${serviceConfig.name} registered in mesh`);
  }

  unregisterService(serviceName: string): void {
    this.services.delete(serviceName);
    this.circuitBreakers.delete(serviceName);
    this.logger.log(`Service ${serviceName} unregistered from mesh`);
  }

  // Monitoring and observability
  getServiceMetrics(): any {
    const services = Array.from(this.services.values());
    const circuitBreakers = Array.from(this.circuitBreakers.values());
    const activeCalls = this.activeCalls.filter(call => call.status === 'pending');

    return {
      totalServices: services.length,
      healthyServices: services.filter(s => s.health === 'healthy').length,
      unhealthyServices: services.filter(s => s.health === 'unhealthy').length,
      circuitBreakers: circuitBreakers.map(cb => ({
        service: cb.service,
        state: cb.state,
        failureCount: cb.failureCount,
      })),
      activeCalls: activeCalls.length,
      recentCalls: this.activeCalls.slice(-10),
    };
  }

  getServiceTopology(): any {
    // Return service dependency graph
    return {
      services: Array.from(this.services.keys()),
      dependencies: {
        'api-gateway': ['auth-service', 'company-service', 'invoice-service'],
        'company-service': ['tax-rules-service'],
        'invoice-service': ['ksef-service', 'tax-rules-service'],
        'ksef-service': ['notification-service'],
        'tax-rules-service': ['report-service'],
      },
    };
  }

  // Load balancing (simplified)
  getServiceEndpoint(serviceName: string): ServiceEndpoint | undefined {
    return this.services.get(serviceName);
  }

  // Polish tax compliance: Enhanced service mesh for tax services
  async callTaxService(
    fromService: string,
    toService: string,
    method: string,
    path: string,
    options: any = {},
  ): Promise<any> {
    // Enhanced call for tax services with compliance tracking
    const enhancedOptions = {
      ...options,
      headers: {
        ...options.headers,
        'x-compliance-required': 'true',
        'x-data-classification': 'tax-sensitive',
        'x-audit-required': 'true',
      },
    };

    this.logger.log(`Tax service call: ${fromService} -> ${toService}`, {
      method,
      path,
      tenantId: options.tenantId,
      compliance: true,
    });

    return this.callService(fromService, toService, method, path, enhancedOptions);
  }

  // Service mesh configuration for tax compliance
  configureTaxCompliance(): void {
    // Configure enhanced monitoring for tax services
    const taxServices = ['tax-rules-service', 'ksef-service', 'report-service'];

    taxServices.forEach(serviceName => {
      const breaker = this.circuitBreakers.get(serviceName);
      if (breaker) {
        // More aggressive circuit breaker for tax services
        breaker.failureCount = 0; // Reset
        // Additional compliance monitoring would be configured here
      }
    });

    this.logger.log('Tax compliance configuration applied to service mesh');
  }
}