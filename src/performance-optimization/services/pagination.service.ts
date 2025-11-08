import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  tenantId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class PaginationService {
  private readonly logger = new Logger(PaginationService.name);
  private readonly defaultLimit = 20;
  private readonly maxLimit = 100;

  constructor(private prisma: PrismaService) {}

  async paginate<T>(
    model: any,
    options: PaginationOptions,
    where?: any,
    include?: any,
    select?: any,
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(
      Math.max(1, options.limit || this.defaultLimit),
      this.maxLimit
    );
    const offset = (page - 1) * limit;

    // Build where clause with tenant isolation
    const tenantWhere = options.tenantId
      ? { ...where, tenant_id: options.tenantId }
      : where;

    try {
      // Get total count
      const total = await model.count({
        where: tenantWhere,
      });

      // Get paginated data
      const data = await model.findMany({
        where: tenantWhere,
        skip: offset,
        take: limit,
        orderBy: options.sortBy
          ? { [options.sortBy]: options.sortOrder || 'asc' }
          : { createdAt: 'desc' },
        include,
        select,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error('Pagination error', error);
      throw error;
    }
  }

  async paginateWithCursor<T>(
    model: any,
    options: PaginationOptions & { cursor?: string; direction?: 'forward' | 'backward' },
    where?: any,
    include?: any,
    select?: any,
  ): Promise<PaginatedResult<T> & { nextCursor?: string; prevCursor?: string }> {
    const limit = Math.min(
      Math.max(1, options.limit || this.defaultLimit),
      this.maxLimit
    );

    // Build where clause with tenant isolation
    const tenantWhere = options.tenantId
      ? { ...where, tenant_id: options.tenantId }
      : where;

    try {
      let cursorCondition = {};
      if (options.cursor) {
        const cursorId = options.cursor;
        cursorCondition = options.direction === 'backward'
          ? { id: { lt: cursorId } }
          : { id: { gt: cursorId } };
      }

      const fullWhere = {
        ...tenantWhere,
        ...cursorCondition,
      };

      // Get data with cursor
      const data = await model.findMany({
        where: fullWhere,
        take: options.direction === 'backward' ? -limit : limit,
        orderBy: { id: 'asc' },
        include,
        select,
      });

      // Determine cursors
      const hasMore = data.length === limit;
      const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;
      const prevCursor = options.cursor && data.length > 0 ? data[0]?.id : undefined;

      // Get total count (approximate for cursor pagination)
      const total = await model.count({
        where: tenantWhere,
      });

      return {
        data,
        meta: {
          page: 1, // Not applicable for cursor pagination
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: hasMore,
          hasPrev: !!options.cursor,
        },
        nextCursor,
        prevCursor,
      };
    } catch (error) {
      this.logger.error('Cursor pagination error', error);
      throw error;
    }
  }

  // Optimized pagination for large datasets with indexes
  async paginateOptimized<T>(
    model: any,
    options: PaginationOptions,
    where?: any,
    include?: any,
    select?: any,
  ): Promise<PaginatedResult<T>> {
    // For now, use regular pagination - raw SQL optimization can be added later
    return this.paginate(model, options, where, include, select);
  }

  // Polish tax compliance: Paginate tax-related data efficiently
  async paginateTaxCalculations(
    tenantId: string,
    options: PaginationOptions,
    period?: string,
  ): Promise<PaginatedResult<any>> {
    return this.paginate(
      this.prisma.taxCalculation,
      { ...options, tenantId },
      period ? { period } : undefined,
      { company: true },
    );
  }

  async paginateVATRegisters(
    tenantId: string,
    options: PaginationOptions,
    period?: string,
    type?: string,
  ): Promise<PaginatedResult<any>> {
    return this.paginate(
      this.prisma.vATRegister,
      { ...options, tenantId },
      period || type ? {
        ...(period && { period }),
        ...(type && { type }),
      } : undefined,
      { company: true },
    );
  }
}