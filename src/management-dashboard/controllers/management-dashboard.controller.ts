import { Controller, Get, Query, UseGuards, Request, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ManagementDashboardService } from '../services/management-dashboard.service';
import { DashboardSummaryDto, DashboardFiltersDto, RealTimeStatusDto } from '../dto/dashboard-summary.dto';

@ApiTags('Management Dashboard')
@Controller('management-dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ManagementDashboardController {
  constructor(private readonly dashboardService: ManagementDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get dashboard summary with aggregated data' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard summary retrieved successfully',
    type: DashboardSummaryDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getDashboardSummary(
    @Request() req,
    @Query() filters: DashboardFiltersDto,
  ): Promise<DashboardSummaryDto> {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.dashboardService.getDashboardSummary(tenant_id, filters);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          errorCode: 'DASHBOARD_SUMMARY_ERROR',
          message: 'Failed to retrieve dashboard summary',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('real-time-status')
  @ApiOperation({ summary: 'Get real-time system status and active processes' })
  @ApiResponse({
    status: 200,
    description: 'Real-time status retrieved successfully',
    type: RealTimeStatusDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getRealTimeStatus(@Request() req): Promise<RealTimeStatusDto> {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.dashboardService.getRealTimeStatus(tenant_id);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          errorCode: 'REAL_TIME_STATUS_ERROR',
          message: 'Failed to retrieve real-time status',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get recent activities with priority filtering' })
  @ApiResponse({
    status: 200,
    description: 'Recent activities retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getRecentActivities(
    @Request() req,
    @Query() filters: DashboardFiltersDto,
  ): Promise<any[]> {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.dashboardService.getRecentActivities(tenant_id, filters);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          errorCode: 'RECENT_ACTIVITIES_ERROR',
          message: 'Failed to retrieve recent activities',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('deadlines')
  @ApiOperation({ summary: 'Get upcoming deadlines with priority-based filtering' })
  @ApiResponse({
    status: 200,
    description: 'Upcoming deadlines retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUpcomingDeadlines(
    @Request() req,
    @Query() filters: DashboardFiltersDto,
  ): Promise<any[]> {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.dashboardService.getUpcomingDeadlines(tenant_id, filters);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          errorCode: 'UPCOMING_DEADLINES_ERROR',
          message: 'Failed to retrieve upcoming deadlines',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get detailed metrics for dashboard widgets' })
  @ApiResponse({
    status: 200,
    description: 'Metrics retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getMetrics(
    @Request() req,
    @Query() filters: DashboardFiltersDto,
  ): Promise<any> {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.dashboardService.getDetailedMetrics(tenant_id, filters);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          errorCode: 'METRICS_ERROR',
          message: 'Failed to retrieve metrics',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}