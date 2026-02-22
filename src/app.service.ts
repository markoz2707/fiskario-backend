import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Prisma } from '../generated/prisma';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: { status: 'ok' | 'error'; responseTime: number; error?: string };
    memory: { heapUsed: string; heapTotal: string; rss: string };
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor(process.uptime());
    const version = this.getVersion();

    const databaseCheck = await this.checkDatabase();
    const memoryCheck = this.checkMemory();

    const overallStatus =
      databaseCheck.status === 'ok' ? 'ok' : 'error';

    return {
      status: overallStatus,
      timestamp,
      uptime,
      version,
      checks: {
        database: databaseCheck,
        memory: memoryCheck,
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'ok' | 'error';
    responseTime: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      const responseTime = Date.now() - start;
      return { status: 'ok', responseTime };
    } catch (error) {
      const responseTime = Date.now() - start;
      const message =
        error instanceof Error ? error.message : 'Unknown database error';
      this.logger.error('Health check: database connectivity failed', message);
      return { status: 'error', responseTime, error: message };
    }
  }

  private checkMemory(): {
    heapUsed: string;
    heapTotal: string;
    rss: string;
  } {
    const mem = process.memoryUsage();
    return {
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
    };
  }

  private getVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('../package.json');
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
