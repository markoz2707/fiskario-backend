import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KPiRNumberingService {
  private readonly logger = new Logger(KPiRNumberingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get next sequential number for KPiR entry.
   * KPiR uses continuous numbering per year per company.
   * Numbers reset to 1 at the beginning of each year.
   */
  async getNextNumber(tenantId: string, companyId: string, year: number): Promise<number> {
    const lastEntry = await this.prisma.kPiREntry.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
      },
      orderBy: { lp: 'desc' },
      select: { lp: true },
    });

    return (lastEntry?.lp ?? 0) + 1;
  }

  /**
   * Renumber all entries for a given year.
   * Used after deletion or reordering to maintain continuous numbering.
   */
  async renumberEntries(tenantId: string, companyId: string, year: number): Promise<number> {
    const entries = await this.prisma.kPiREntry.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
      },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, lp: true },
    });

    let updated = 0;
    for (let i = 0; i < entries.length; i++) {
      const expectedLp = i + 1;
      if (entries[i].lp !== expectedLp) {
        await this.prisma.kPiREntry.update({
          where: { id: entries[i].id },
          data: { lp: expectedLp },
        });
        updated++;
      }
    }

    this.logger.log(`Renumbered ${updated} KPiR entries for year ${year}`);
    return updated;
  }

  /**
   * Validate that numbering is continuous (no gaps).
   */
  async validateNumbering(tenantId: string, companyId: string, year: number): Promise<{
    isValid: boolean;
    gaps: number[];
    duplicates: number[];
  }> {
    const entries = await this.prisma.kPiREntry.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        year,
      },
      orderBy: { lp: 'asc' },
      select: { lp: true },
    });

    const gaps: number[] = [];
    const duplicates: number[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < entries.length; i++) {
      const expectedLp = i + 1;
      const actualLp = entries[i].lp;

      if (actualLp !== expectedLp) {
        gaps.push(expectedLp);
      }
      if (seen.has(actualLp)) {
        duplicates.push(actualLp);
      }
      seen.add(actualLp);
    }

    return {
      isValid: gaps.length === 0 && duplicates.length === 0,
      gaps,
      duplicates,
    };
  }
}
