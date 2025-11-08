import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface LazyLoadOptions {
  batchSize?: number;
  delay?: number;
  tenantId?: string;
  preloadRelated?: boolean;
}

export interface LazyLoadResult<T> {
  data: T;
  loadedFields: string[];
  executionTime: number;
}

@Injectable()
export class LazyLoadingService {
  private readonly logger = new Logger(LazyLoadingService.name);
  private readonly defaultBatchSize = 10;
  private readonly defaultDelay = 100; // ms

  constructor(private prisma: PrismaService) {}

  // Decorator for lazy loading properties
  lazyLoad(target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
    if (!descriptor) return;

    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();

      try {
        const result = await method.apply(this, args);
        const executionTime = Date.now() - startTime;

        // Log lazy loading performance
        if (executionTime > 500) {
          console.warn(`Slow lazy load for ${propertyKey}: ${executionTime}ms`);
        }

        return result;
      } catch (error) {
        console.error(`Lazy load error for ${propertyKey}:`, error);
        throw error;
      }
    };

    return descriptor;
  }

  async lazyLoadEntity<T>(
    entityId: string,
    entityType: string,
    fields: string[],
    options: LazyLoadOptions = {},
  ): Promise<LazyLoadResult<T>> {
    const startTime = Date.now();
    const loadedFields: string[] = [];
    const batchSize = options.batchSize || this.defaultBatchSize;
    const delay = options.delay || this.defaultDelay;

    try {
      const entity = await this.loadEntityByType(entityId, entityType, options.tenantId);

      if (!entity) {
        throw new Error(`Entity ${entityType} with id ${entityId} not found`);
      }

      // Lazy load fields in batches
      for (let i = 0; i < fields.length; i += batchSize) {
        const batch = fields.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (field) => {
            if (!(field in entity)) {
              const loadedData = await this.loadField(entityId, entityType, field, options.tenantId);
              if (loadedData !== undefined) {
                (entity as any)[field] = loadedData;
                loadedFields.push(field);
              }
            }
          })
        );

        // Add delay between batches to prevent overwhelming the database
        if (i + batchSize < fields.length) {
          await this.delayExecution(delay);
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        data: entity as T,
        loadedFields,
        executionTime,
      };
    } catch (error) {
      this.logger.error(`Lazy loading error for ${entityType}:${entityId}`, error);
      throw error;
    }
  }

  async lazyLoadRelated<T>(
    entityId: string,
    entityType: string,
    relation: string,
    options: LazyLoadOptions = {},
  ): Promise<LazyLoadResult<T[]>> {
    const startTime = Date.now();

    try {
      const relatedData = await this.loadRelatedEntities(entityId, entityType, relation, options.tenantId);
      const executionTime = Date.now() - startTime;

      return {
        data: relatedData,
        loadedFields: [relation],
        executionTime,
      };
    } catch (error) {
      this.logger.error(`Lazy loading related error for ${entityType}:${entityId}.${relation}`, error);
      throw error;
    }
  }

  private async loadEntityByType(entityId: string, entityType: string, tenantId?: string): Promise<any> {
    const whereClause = tenantId ? { id: entityId, tenant_id: tenantId } : { id: entityId };

    switch (entityType) {
      case 'company':
        return this.prisma.company.findUnique({ where: whereClause });
      case 'invoice':
        return this.prisma.invoice.findUnique({ where: whereClause });
      case 'buyer':
        return this.prisma.buyer.findUnique({ where: whereClause });
      case 'declaration':
        return this.prisma.declaration.findUnique({ where: whereClause });
      case 'zusEmployee':
        return this.prisma.zUSEmployee.findUnique({ where: whereClause });
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  private async loadField(entityId: string, entityType: string, field: string, tenantId?: string): Promise<any> {
    const whereClause = tenantId ? { id: entityId, tenant_id: tenantId } : { id: entityId };

    switch (`${entityType}.${field}`) {
      case 'company.invoices':
        return this.prisma.invoice.findMany({
          where: { company_id: entityId, ...(tenantId && { tenant_id: tenantId }) },
          take: 50, // Limit to prevent large loads
        });

      case 'company.declarations':
        return this.prisma.declaration.findMany({
          where: { company_id: entityId, ...(tenantId && { tenant_id: tenantId }) },
          take: 50,
        });

      case 'invoice.items':
        return this.prisma.invoiceItem.findMany({
          where: { invoice_id: entityId },
        });

      case 'buyer.invoices':
        return this.prisma.invoice.findMany({
          where: { buyer_id: entityId, ...(tenantId && { tenant_id: tenantId }) },
          take: 50,
        });

      case 'zusEmployee.contributions':
        return this.prisma.zUSContribution.findMany({
          where: { employee_id: entityId, ...(tenantId && { tenant_id: tenantId }) },
          take: 50,
        });

      default:
        // Try to load as a direct field
        const entity = await this.loadEntityByType(entityId, entityType, tenantId);
        return entity ? entity[field] : undefined;
    }
  }

  private async loadRelatedEntities(entityId: string, entityType: string, relation: string, tenantId?: string): Promise<any[]> {
    const whereClause = tenantId ? { tenant_id: tenantId } : {};

    switch (`${entityType}.${relation}`) {
      case 'company.taxCalculations':
        return this.prisma.taxCalculation.findMany({
          where: { company_id: entityId, ...whereClause },
          orderBy: { period: 'desc' },
          take: 24, // Last 2 years
        });

      case 'company.vatRegisters':
        return this.prisma.vATRegister.findMany({
          where: { company_id: entityId, ...whereClause },
          orderBy: { invoiceDate: 'desc' },
          take: 100,
        });

      case 'company.auditLogs':
        return this.prisma.auditLog.findMany({
          where: { company_id: entityId, ...whereClause },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

      default:
        return [];
    }
  }

  private delayExecution(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Preload strategy for frequently accessed data
  async preloadFrequentlyAccessed(tenantId: string): Promise<void> {
    try {
      // Preload active companies
      const activeCompanies = await this.prisma.company.findMany({
        where: { tenant_id: tenantId, isActive: true },
        select: { id: true, name: true, nip: true },
        take: 100,
      });

      // Preload recent invoices
      const recentInvoices = await this.prisma.invoice.findMany({
        where: { tenant_id: tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          buyer: {
            select: { id: true, name: true, nip: true },
          },
        },
      });

      this.logger.log(`Preloaded ${activeCompanies.length} companies and ${recentInvoices.length} invoices for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error('Error preloading frequently accessed data', error);
    }
  }

  // Polish tax compliance: Lazy load tax-related data
  async lazyLoadTaxData(companyId: string, tenantId: string, period?: string): Promise<LazyLoadResult<any>> {
    const fields = ['taxCalculations', 'vatRegisters', 'declarations'];

    if (period) {
      // Filter by period for better performance
      const taxData = await this.lazyLoadEntity(
        companyId,
        'company',
        fields,
        { tenantId, batchSize: 2 },
      );

      // Filter loaded data by period
      const data = taxData.data as any;
      if (data.taxCalculations) {
        data.taxCalculations = data.taxCalculations.filter(
          (calc: any) => calc.period.startsWith(period)
        );
      }

      if (data.vatRegisters) {
        data.vatRegisters = data.vatRegisters.filter(
          (reg: any) => reg.period === period
        );
      }

      if (data.declarations) {
        data.declarations = data.declarations.filter(
          (decl: any) => decl.period === period
        );
      }

      return taxData;
    }

    return this.lazyLoadEntity(companyId, 'company', fields, { tenantId });
  }

  async lazyLoadZUSData(employeeId: string, tenantId: string, year?: string): Promise<LazyLoadResult<any>> {
    const fields = ['contributions', 'registrations', 'reports'];

    const zusData = await this.lazyLoadEntity(
      employeeId,
      'zusEmployee',
      fields,
      { tenantId, batchSize: 1 },
    );

    if (year) {
      const data = zusData.data as any;
      if (data.contributions) {
        data.contributions = data.contributions.filter(
          (contrib: any) => contrib.period.startsWith(year)
        );
      }
    }

    return zusData;
  }
}