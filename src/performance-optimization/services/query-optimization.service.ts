import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface QueryOptimizationOptions {
  tenantId?: string;
  useIndexes?: boolean;
  batchSize?: number;
  timeout?: number;
}

export interface OptimizedQueryResult<T> {
  data: T[];
  executionTime: number;
  queryPlan?: any;
  optimizationHints: string[];
}

@Injectable()
export class QueryOptimizationService {
  private readonly logger = new Logger(QueryOptimizationService.name);
  private readonly defaultBatchSize = 1000;
  private readonly defaultTimeout = 30000; // 30 seconds

  constructor(private prisma: PrismaService) {}

  async executeOptimizedQuery<T>(
    model: any,
    operation: 'findMany' | 'findFirst' | 'count' | 'aggregate',
    params: any,
    options: QueryOptimizationOptions = {},
  ): Promise<OptimizedQueryResult<T>> {
    const startTime = Date.now();
    const optimizationHints: string[] = [];

    try {
      // Add tenant isolation
      if (options.tenantId && params.where) {
        params.where = { ...params.where, tenant_id: options.tenantId };
      } else if (options.tenantId) {
        params.where = { tenant_id: options.tenantId };
      }

      // Optimize query parameters
      const optimizedParams = this.optimizeQueryParams(params, operation, optimizationHints);

      // Execute query with timeout
      const timeout = options.timeout || this.defaultTimeout;
      const queryPromise = this.executeQuery(model, operation, optimizedParams);

      const data = await this.withTimeout(queryPromise, timeout);

      const executionTime = Date.now() - startTime;

      // Log slow queries
      if (executionTime > 1000) {
        this.logger.warn(`Slow query detected: ${executionTime}ms`, {
          operation,
          model: model.name,
          tenantId: options.tenantId,
          hints: optimizationHints,
        });
      }

      return {
        data: Array.isArray(data) ? data : [data],
        executionTime,
        optimizationHints,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Query optimization error: ${error.message}`, {
        operation,
        model: model.name,
        tenantId: options.tenantId,
        executionTime,
        hints: optimizationHints,
      });
      throw error;
    }
  }

  private optimizeQueryParams(params: any, operation: string, hints: string[]): any {
    const optimized = { ...params };

    // Optimize WHERE clauses
    if (optimized.where) {
      optimized.where = this.optimizeWhereClause(optimized.where, hints);
    }

    // Optimize ORDER BY
    if (optimized.orderBy) {
      optimized.orderBy = this.optimizeOrderBy(optimized.orderBy, hints);
    }

    // Optimize SELECT
    if (optimized.select) {
      optimized.select = this.optimizeSelect(optimized.select, hints);
    }

    // Optimize INCLUDE
    if (optimized.include) {
      optimized.include = this.optimizeInclude(optimized.include, hints);
    }

    // Add pagination optimizations
    if (operation === 'findMany' && !optimized.take) {
      optimized.take = 100; // Default limit
      hints.push('Added default limit of 100 to prevent large result sets');
    }

    return optimized;
  }

  private optimizeWhereClause(where: any, hints: string[]): any {
    const optimized = { ...where };

    // Check for non-indexed fields and suggest optimizations
    const nonIndexedFields = this.detectNonIndexedFields(optimized);
    if (nonIndexedFields.length > 0) {
      hints.push(`Consider adding indexes for fields: ${nonIndexedFields.join(', ')}`);
    }

    // Optimize complex conditions
    if (optimized.OR || optimized.AND) {
      hints.push('Complex OR/AND conditions detected - ensure proper indexing');
    }

    // Optimize LIKE queries
    this.optimizeLikeQueries(optimized, hints);

    return optimized;
  }

  private optimizeOrderBy(orderBy: any, hints: string[]): any {
    // Ensure orderBy uses indexed fields when possible
    if (Array.isArray(orderBy)) {
      for (const order of orderBy) {
        const field = Object.keys(order)[0];
        if (!this.isIndexedField(field)) {
          hints.push(`ORDER BY on non-indexed field '${field}' may impact performance`);
        }
      }
    } else if (orderBy && typeof orderBy === 'object') {
      const field = Object.keys(orderBy)[0];
      if (!this.isIndexedField(field)) {
        hints.push(`ORDER BY on non-indexed field '${field}' may impact performance`);
      }
    }

    return orderBy;
  }

  private optimizeSelect(select: any, hints: string[]): any {
    // Suggest selecting only needed fields
    const fieldCount = Object.keys(select).length;
    if (fieldCount > 20) {
      hints.push(`Selecting ${fieldCount} fields - consider selecting only required fields`);
    }

    return select;
  }

  private optimizeInclude(include: any, hints: string[]): any {
    // Detect N+1 query patterns
    const includeCount = Object.keys(include).length;
    if (includeCount > 3) {
      hints.push('Multiple includes detected - consider using joins or separate queries');
    }

    return include;
  }

  private detectNonIndexedFields(where: any): string[] {
    const nonIndexed: string[] = [];
    const indexedFields = [
      'id', 'tenant_id', 'company_id', 'createdAt', 'updatedAt',
      'nip', 'regon', 'email', 'number', 'date', 'status',
      'type', 'period', 'buyer_id', 'invoice_id'
    ];

    const checkField = (obj: any, path: string = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          checkField(value, fullPath);
        } else if (!indexedFields.includes(key) && !key.includes('_id')) {
          nonIndexed.push(fullPath);
        }
      }
    };

    checkField(where);
    return [...new Set(nonIndexed)]; // Remove duplicates
  }

  private optimizeLikeQueries(where: any, hints: string[]): void {
    const checkForLike = (obj: any) => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          if ('contains' in value || 'startsWith' in value || 'endsWith' in value) {
            hints.push(`LIKE query on '${key}' - consider full-text search for better performance`);
          }
          checkForLike(value);
        }
      }
    };

    checkForLike(where);
  }

  private isIndexedField(field: string): boolean {
    const indexedFields = [
      'id', 'tenant_id', 'company_id', 'createdAt', 'updatedAt',
      'nip', 'email', 'number', 'date', 'status', 'type', 'period'
    ];
    return indexedFields.includes(field) || field.endsWith('_id');
  }

  private async executeQuery(model: any, operation: string, params: any): Promise<any> {
    switch (operation) {
      case 'findMany':
        return model.findMany(params);
      case 'findFirst':
        return model.findFirst(params);
      case 'count':
        return model.count(params);
      case 'aggregate':
        return model.aggregate(params);
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }

  // Batch processing for large datasets
  async processInBatches<T>(
    items: T[],
    batchProcessor: (batch: T[]) => Promise<any>,
    options: { batchSize?: number; concurrency?: number } = {},
  ): Promise<any[]> {
    const batchSize = options.batchSize || this.defaultBatchSize;
    const concurrency = options.concurrency || 3;
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises: Promise<any>[] = [];

      for (let j = 0; j < batch.length; j += Math.ceil(batch.length / concurrency)) {
        const concurrentBatch = batch.slice(j, j + Math.ceil(batch.length / concurrency));
        batchPromises.push(batchProcessor(concurrentBatch));
      }

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
    }

    return results;
  }

  // Polish tax compliance: Optimize tax-related queries
  async optimizeTaxCalculationQuery(
    tenantId: string,
    period?: string,
    options: QueryOptimizationOptions = {},
  ): Promise<OptimizedQueryResult<any>> {
    const params = {
      where: {
        tenant_id: tenantId,
        ...(period && { period }),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            nip: true,
            vatPayer: true,
          },
        },
      },
      orderBy: {
        period: 'desc',
      },
    };

    return this.executeOptimizedQuery(
      this.prisma.taxCalculation,
      'findMany',
      params,
      { ...options, tenantId },
    );
  }

  async optimizeVATRegisterQuery(
    tenantId: string,
    period?: string,
    type?: string,
    options: QueryOptimizationOptions = {},
  ): Promise<OptimizedQueryResult<any>> {
    const params = {
      where: {
        tenant_id: tenantId,
        ...(period && { period }),
        ...(type && { type }),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            nip: true,
          },
        },
      },
      orderBy: {
        invoiceDate: 'desc',
      },
    };

    return this.executeOptimizedQuery(
      this.prisma.vATRegister,
      'findMany',
      params,
      { ...options, tenantId },
    );
  }
}