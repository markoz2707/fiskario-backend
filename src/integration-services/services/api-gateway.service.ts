import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApiGatewayConfig {
  enabled: boolean;
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    origins: string[];
    methods: string[];
    headers: string[];
  };
}

export interface RouteConfig {
  path: string;
  method: string;
  service: string;
  timeout?: number;
  rateLimit?: number;
  authRequired: boolean;
  tenantRequired: boolean;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime: number;
  lastChecked: Date;
  error?: string;
}

@Injectable()
export class ApiGatewayService implements OnModuleInit {
  private readonly logger = new Logger(ApiGatewayService.name);
  private config: ApiGatewayConfig;
  private routes: Map<string, RouteConfig> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private rateLimitCache: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.initializeConfig();
    this.registerRoutes();
    this.startHealthChecks();
  }

  private initializeConfig(): void {
    this.config = {
      enabled: this.configService.get<boolean>('API_GATEWAY_ENABLED', true),
      baseUrl: this.configService.get<string>('API_GATEWAY_BASE_URL', 'http://localhost:3000'),
      timeout: this.configService.get<number>('API_GATEWAY_TIMEOUT', 30000),
      retryAttempts: this.configService.get<number>('API_GATEWAY_RETRY_ATTEMPTS', 3),
      rateLimit: {
        windowMs: this.configService.get<number>('API_GATEWAY_RATE_LIMIT_WINDOW', 60000),
        maxRequests: this.configService.get<number>('API_GATEWAY_RATE_LIMIT_MAX', 100),
      },
      cors: {
        origins: this.configService.get<string>('API_GATEWAY_CORS_ORIGINS', '*').split(','),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key'],
      },
    };
  }

  private registerRoutes(): void {
    // Register core service routes
    const coreRoutes: RouteConfig[] = [
      // Auth routes
      { path: '/auth/login', method: 'POST', service: 'auth', authRequired: false, tenantRequired: false },
      { path: '/auth/register', method: 'POST', service: 'auth', authRequired: false, tenantRequired: false },
      { path: '/auth/refresh', method: 'POST', service: 'auth', authRequired: true, tenantRequired: false },

      // Company routes
      { path: '/companies', method: 'GET', service: 'companies', authRequired: true, tenantRequired: true },
      { path: '/companies', method: 'POST', service: 'companies', authRequired: true, tenantRequired: true },
      { path: '/companies/:id', method: 'GET', service: 'companies', authRequired: true, tenantRequired: true },
      { path: '/companies/:id', method: 'PUT', service: 'companies', authRequired: true, tenantRequired: true },

      // Invoice routes
      { path: '/invoices', method: 'GET', service: 'invoicing', authRequired: true, tenantRequired: true },
      { path: '/invoices', method: 'POST', service: 'invoicing', authRequired: true, tenantRequired: true },
      { path: '/invoices/:id', method: 'GET', service: 'invoicing', authRequired: true, tenantRequired: true },
      { path: '/invoices/:id', method: 'PUT', service: 'invoicing', authRequired: true, tenantRequired: true },

      // KSEF routes
      { path: '/ksef/submit', method: 'POST', service: 'ksef', authRequired: true, tenantRequired: true },
      { path: '/ksef/status/:id', method: 'GET', service: 'ksef', authRequired: true, tenantRequired: true },

      // Tax rules routes
      { path: '/tax-rules', method: 'GET', service: 'tax-rules', authRequired: true, tenantRequired: true },
      { path: '/tax-rules/calculate', method: 'POST', service: 'tax-rules', authRequired: true, tenantRequired: true },

      // Reports routes
      { path: '/reports', method: 'GET', service: 'reports', authRequired: true, tenantRequired: true },
      { path: '/reports/:type', method: 'GET', service: 'reports', authRequired: true, tenantRequired: true },

      // Mobile API routes
      { path: '/mobile/*', method: 'ALL', service: 'tax-rules', authRequired: true, tenantRequired: true },
    ];

    coreRoutes.forEach(route => {
      this.routes.set(`${route.method}:${route.path}`, route);
    });

    this.logger.log(`Registered ${coreRoutes.length} API gateway routes`);
  }

  async routeRequest(
    method: string,
    path: string,
    headers: any,
    body?: any,
  ): Promise<any> {
    try {
      // Check rate limiting
      if (!this.checkRateLimit(headers['x-forwarded-for'] || headers['x-real-ip'])) {
        throw new Error('Rate limit exceeded');
      }

      // Find matching route
      const route = this.findRoute(method, path);
      if (!route) {
        throw new Error(`No route found for ${method} ${path}`);
      }

      // Validate authentication and tenant
      await this.validateRequest(route, headers);

      // Check service health
      if (!this.isServiceHealthy(route.service)) {
        throw new Error(`Service ${route.service} is currently unhealthy`);
      }

      // Route to appropriate service
      return await this.forwardRequest(route, headers, body);
    } catch (error) {
      this.logger.error(`API Gateway routing error for ${method} ${path}`, error);
      throw error;
    }
  }

  private findRoute(method: string, path: string): RouteConfig | undefined {
    // Direct match
    const directMatch = this.routes.get(`${method}:${path}`);
    if (directMatch) return directMatch;

    // Pattern matching for parameterized routes
    for (const [routeKey, route] of this.routes) {
      const [routeMethod, routePath] = routeKey.split(':');

      if (routeMethod !== method) continue;

      // Convert route path to regex pattern
      const pattern = routePath
        .replace(/:\w+/g, '[^/]+') // Replace :param with [^/]+
        .replace(/\*/g, '.*'); // Replace * with .*

      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(path)) {
        return route;
      }
    }

    return undefined;
  }

  private async validateRequest(route: RouteConfig, headers: any): Promise<void> {
    // Check authentication
    if (route.authRequired) {
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Authentication required');
      }
      // TODO: Validate JWT token
    }

    // Check tenant
    if (route.tenantRequired) {
      const tenantId = headers['x-tenant-id'];
      if (!tenantId) {
        throw new Error('Tenant ID required');
      }
      // TODO: Validate tenant exists and user has access
    }
  }

  private checkRateLimit(clientIp: string): boolean {
    const now = Date.now();
    const key = clientIp;
    const limit = this.rateLimitCache.get(key);

    if (!limit || now > limit.resetTime) {
      // Reset or initialize limit
      this.rateLimitCache.set(key, {
        count: 1,
        resetTime: now + this.config.rateLimit.windowMs,
      });
      return true;
    }

    if (limit.count >= this.config.rateLimit.maxRequests) {
      return false;
    }

    limit.count++;
    return true;
  }

  private isServiceHealthy(serviceName: string): boolean {
    const health = this.serviceHealth.get(serviceName);
    return health?.status === 'healthy';
  }

  private async forwardRequest(route: RouteConfig, headers: any, body?: any): Promise<any> {
    // This is a simplified implementation
    // In a real scenario, this would use HTTP client to forward to actual services
    const startTime = Date.now();

    try {
      // Simulate service call based on route
      const response = await this.callService(route, headers, body);
      const responseTime = Date.now() - startTime;

      // Update service health
      this.updateServiceHealth(route.service, 'healthy', responseTime);

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceHealth(route.service, 'unhealthy', responseTime, error.message);
      throw error;
    }
  }

  private async callService(route: RouteConfig, headers: any, body?: any): Promise<any> {
    // This would be replaced with actual HTTP calls to microservices
    // For now, return mock responses based on route

    switch (route.service) {
      case 'auth':
        return { message: 'Auth service response' };
      case 'companies':
        return { message: 'Companies service response' };
      case 'invoicing':
        return { message: 'Invoicing service response' };
      case 'ksef':
        return { message: 'KSEF service response' };
      case 'tax-rules':
        return { message: 'Tax rules service response' };
      case 'reports':
        return { message: 'Reports service response' };
      default:
        throw new Error(`Unknown service: ${route.service}`);
    }
  }

  private updateServiceHealth(
    serviceName: string,
    status: 'healthy' | 'unhealthy',
    responseTime: number,
    error?: string,
  ): void {
    this.serviceHealth.set(serviceName, {
      name: serviceName,
      status,
      responseTime,
      lastChecked: new Date(),
      error,
    });
  }

  private startHealthChecks(): void {
    // Periodic health checks for all services
    setInterval(async () => {
      for (const serviceName of ['auth', 'companies', 'invoicing', 'ksef', 'tax-rules', 'reports']) {
        try {
          const startTime = Date.now();
          await this.healthCheckService(serviceName);
          const responseTime = Date.now() - startTime;
          this.updateServiceHealth(serviceName, 'healthy', responseTime);
        } catch (error) {
          this.updateServiceHealth(serviceName, 'unhealthy', 0, error.message);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async healthCheckService(serviceName: string): Promise<void> {
    // Implement actual health check logic
    // This could ping service endpoints or check database connectivity
    return Promise.resolve();
  }

  // Polish tax compliance: Enhanced API gateway for tax services
  async routeTaxRequest(
    method: string,
    path: string,
    headers: any,
    body?: any,
  ): Promise<any> {
    // Enhanced routing for tax-related requests with compliance logging
    this.logger.log(`Tax API request: ${method} ${path}`, {
      tenantId: headers['x-tenant-id'],
      userId: headers['x-user-id'],
      timestamp: new Date().toISOString(),
    });

    // Add compliance headers
    headers['x-compliance-required'] = 'true';
    headers['x-data-retention'] = '7-years'; // Polish tax law requirement

    return this.routeRequest(method, path, headers, body);
  }

  getServiceHealth(): ServiceHealth[] {
    return Array.from(this.serviceHealth.values());
  }

  getRoutes(): RouteConfig[] {
    return Array.from(this.routes.values());
  }

  clearRateLimitCache(): void {
    this.rateLimitCache.clear();
  }
}