import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PrivacyNotice {
  id: string;
  title: string;
  version: string;
  content: string;
  summary: string;
  language: string;
  effectiveDate: Date;
  isActive: boolean;
  noticeType: 'website' | 'app' | 'service' | 'cookies' | 'marketing';
  targetAudience: 'all' | 'customers' | 'employees' | 'partners';
  jurisdictions: string[]; // ISO country codes
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  sections: PrivacyNoticeSection[];
}

export interface PrivacyNoticeSection {
  id: string;
  noticeId: string;
  title: string;
  content: string;
  order: number;
  sectionType: 'data_collection' | 'data_usage' | 'data_sharing' | 'data_retention' | 'user_rights' | 'contact' | 'cookies' | 'legal_basis';
}

export interface PrivacyNoticeView {
  id: string;
  noticeId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  viewedAt: Date;
  acceptedAt?: Date;
  acceptanceToken?: string;
}

@Injectable()
export class PrivacyNoticeService {
  private readonly logger = new Logger(PrivacyNoticeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new privacy notice
   */
  async createPrivacyNotice(
    notice: Omit<PrivacyNotice, 'id' | 'createdAt' | 'updatedAt' | 'sections'>,
    sections?: Omit<PrivacyNoticeSection, 'id' | 'noticeId'>[]
  ): Promise<string> {
    try {
      const privacyNotice = await this.prisma.privacyNotice.create({
        data: {
          title: notice.title,
          version: notice.version,
          content: notice.content,
          summary: notice.summary,
          language: notice.language,
          effectiveDate: notice.effectiveDate,
          isActive: notice.isActive,
          noticeType: notice.noticeType,
          targetAudience: notice.targetAudience,
          jurisdictions: notice.jurisdictions,
          createdBy: notice.createdBy,
        }
      });

      // Create default sections if not provided
      if (!sections || sections.length === 0) {
        await this.createDefaultPrivacyNoticeSections(privacyNotice.id);
      } else {
        await this.createCustomPrivacyNoticeSections(privacyNotice.id, sections);
      }

      this.logger.log(`Privacy notice created: ${notice.title} v${notice.version}`);

      return privacyNotice.id;
    } catch (error) {
      this.logger.error(`Failed to create privacy notice: ${error.message}`, error.stack);
      throw new Error(`Privacy notice creation failed: ${error.message}`);
    }
  }

  /**
   * Gets active privacy notice for specific context
   */
  async getActivePrivacyNotice(
    noticeType: PrivacyNotice['noticeType'],
    language: string = 'pl',
    jurisdiction?: string
  ): Promise<PrivacyNotice | null> {
    try {
      const notices = await this.prisma.privacyNotice.findMany({
        where: {
          isActive: true,
          noticeType,
          language,
          ...(jurisdiction && {
            jurisdictions: {
              has: jurisdiction
            }
          }),
        },
        include: {
          sections: {
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { effectiveDate: 'desc' }
      });

      // Return the most recent notice
      return notices.length > 0 ? notices[0] : null;
    } catch (error) {
      this.logger.error(`Failed to get active privacy notice: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Records privacy notice view/acceptance
   */
  async recordPrivacyNoticeView(
    noticeId: string,
    viewData: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      accepted?: boolean;
    }
  ): Promise<string> {
    try {
      const acceptanceToken = viewData.accepted ?
        this.generateAcceptanceToken(noticeId, viewData.userId) : undefined;

      const view = await this.prisma.privacyNoticeView.create({
        data: {
          noticeId,
          userId: viewData.userId,
          ipAddress: viewData.ipAddress,
          userAgent: viewData.userAgent,
          viewedAt: new Date(),
          acceptedAt: viewData.accepted ? new Date() : null,
          acceptanceToken,
        }
      });

      this.logger.log(`Privacy notice view recorded: ${noticeId}`);

      return view.id;
    } catch (error) {
      this.logger.error(`Failed to record privacy notice view: ${error.message}`, error.stack);
      throw new Error(`Privacy notice view recording failed: ${error.message}`);
    }
  }

  /**
   * Verifies privacy notice acceptance
   */
  async verifyAcceptance(
    noticeId: string,
    acceptanceToken: string,
    userId?: string
  ): Promise<boolean> {
    try {
      const expectedToken = this.generateAcceptanceToken(noticeId, userId);

      const view = await this.prisma.privacyNoticeView.findFirst({
        where: {
          noticeId,
          acceptanceToken: expectedToken,
          acceptedAt: { not: null }
        }
      });

      return !!view;
    } catch (error) {
      this.logger.error(`Acceptance verification failed: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generates privacy notice comparison report
   */
  async generatePrivacyNoticeReport(
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      const views = await this.prisma.privacyNoticeView.findMany({
        where: {
          viewedAt: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          notice: true
        }
      });

      // Group by notice
      const noticeStats = views.reduce((acc, view) => {
        const noticeId = view.noticeId;
        if (!acc[noticeId]) {
          acc[noticeId] = {
            notice: view.notice,
            totalViews: 0,
            acceptedViews: 0,
            uniqueUsers: new Set(),
          };
        }

        acc[noticeId].totalViews++;
        if (view.acceptedAt) {
          acc[noticeId].acceptedViews++;
        }
        if (view.userId) {
          acc[noticeId].uniqueUsers.add(view.userId);
        }

        return acc;
      }, {} as Record<string, any>);

      const report = {
        period: { startDate, endDate },
        summary: {
          totalViews: views.length,
          totalAcceptances: views.filter(v => v.acceptedAt).length,
          uniqueNotices: Object.keys(noticeStats).length,
          averageAcceptanceRate: views.length > 0 ?
            (views.filter(v => v.acceptedAt).length / views.length * 100).toFixed(2) + '%' : '0%',
        },
        byNotice: Object.values(noticeStats).map((stats: any) => ({
          noticeId: stats.notice.id,
          title: stats.notice.title,
          version: stats.notice.version,
          totalViews: stats.totalViews,
          acceptedViews: stats.acceptedViews,
          uniqueUsers: stats.uniqueUsers.size,
          acceptanceRate: stats.totalViews > 0 ?
            (stats.acceptedViews / stats.totalViews * 100).toFixed(2) + '%' : '0%',
        })),
        trends: {
          dailyViews: await this.getDailyViewTrends(startDate, endDate),
          acceptanceTrends: await this.getAcceptanceTrends(startDate, endDate),
        },
      };

      return report;
    } catch (error) {
      this.logger.error(`Privacy notice report generation failed: ${error.message}`, error.stack);
      throw new Error(`Privacy notice report generation failed: ${error.message}`);
    }
  }

  /**
   * Creates default privacy notice sections
   */
  private async createDefaultPrivacyNoticeSections(noticeId: string): Promise<void> {
    const defaultSections = [
      {
        title: 'Information We Collect',
        content: 'We collect information you provide directly to us, such as when you create an account, make a purchase, or contact us for support.',
        order: 1,
        sectionType: 'data_collection',
      },
      {
        title: 'How We Use Your Information',
        content: 'We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.',
        order: 2,
        sectionType: 'data_usage',
      },
      {
        title: 'Information Sharing',
        content: 'We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this notice.',
        order: 3,
        sectionType: 'data_sharing',
      },
      {
        title: 'Data Retention',
        content: 'We retain your personal information for as long as necessary to provide our services and fulfill the purposes outlined in this notice.',
        order: 4,
        sectionType: 'data_retention',
      },
      {
        title: 'Your Rights',
        content: 'You have the right to access, correct, delete, or restrict the processing of your personal data, as well as the right to data portability.',
        order: 5,
        sectionType: 'user_rights',
      },
      {
        title: 'Contact Us',
        content: 'If you have any questions about this Privacy Notice or our data practices, please contact us at privacy@fiskario.com.',
        order: 6,
        sectionType: 'contact',
      },
    ];

    for (const section of defaultSections) {
      await this.prisma.privacyNoticeSection.create({
        data: {
          noticeId,
          title: section.title,
          content: section.content,
          order: section.order,
          sectionType: section.sectionType,
        }
      });
    }
  }

  /**
   * Creates custom privacy notice sections
   */
  private async createCustomPrivacyNoticeSections(
    noticeId: string,
    sections: Omit<PrivacyNoticeSection, 'id' | 'noticeId'>[]
  ): Promise<void> {
    for (const [index, section] of sections.entries()) {
      await this.prisma.privacyNoticeSection.create({
        data: {
          noticeId,
          title: section.title,
          content: section.content,
          order: section.order || index + 1,
          sectionType: section.sectionType,
        }
      });
    }
  }

  /**
   * Generates acceptance token for verification
   */
  private generateAcceptanceToken(noticeId: string, userId?: string): string {
    const data = `${noticeId}:${userId || 'anonymous'}:${Date.now()}`;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Gets daily view trends
   */
  private async getDailyViewTrends(startDate: Date, endDate: Date): Promise<Array<{ date: string; views: number; acceptances: number }>> {
    // Implementation would aggregate views by day
    // This is a simplified version
    return [];
  }

  /**
   * Gets acceptance trends
   */
  private async getAcceptanceTrends(startDate: Date, endDate: Date): Promise<Array<{ date: string; acceptanceRate: string }>> {
    // Implementation would calculate daily acceptance rates
    // This is a simplified version
    return [];
  }
}