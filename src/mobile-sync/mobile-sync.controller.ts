import { Controller, Post, Body, UseGuards, Request, Get, Param, HttpException, HttpStatus, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MobileSyncService } from './mobile-sync.service';
import { WorkflowAutomationService } from '../workflow-automation/services/workflow-engine.service';
import { ManagementDashboardService } from '../management-dashboard/services/management-dashboard.service';

@ApiTags('Mobile Sync')
@Controller('mobile-sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MobileSyncController {
  constructor(
    private readonly mobileSyncService: MobileSyncService,
    private readonly workflowService: WorkflowAutomationService,
    private readonly dashboardService: ManagementDashboardService,
  ) {}

  @Post('full-sync')
  @ApiOperation({ summary: 'Perform full synchronization between mobile and backend' })
  @ApiResponse({
    status: 200,
    description: 'Full sync completed successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async performFullSync(@Body() syncData: any, @Request() req) {
    try {
      const tenantId = req.user?.tenant_id || 'default-tenant';

      // Sync workflow states
      const workflowSync = await this.workflowService.syncWorkflowStates(tenantId, syncData.workflowStates);

      // Sync dashboard data
      const dashboardSync = await this.dashboardService.syncDashboardData(tenantId, syncData.dashboardData);

      // Sync cached information
      const cacheSync = await this.mobileSyncService.syncCachedData(tenantId, syncData.cachedData);

      return {
        success: true,
        data: {
          workflowSync,
          dashboardSync,
          cacheSync,
        },
        message: 'Full sync completed successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Full sync failed',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('incremental-sync')
  @ApiOperation({ summary: 'Perform incremental synchronization' })
  @ApiResponse({
    status: 200,
    description: 'Incremental sync completed successfully',
  })
  async performIncrementalSync(@Body() syncData: any, @Request() req) {
    try {
      const tenantId = req.user?.tenant_id || 'default-tenant';

      // Incremental sync for workflows
      const workflowSync = await this.workflowService.syncIncrementalWorkflows(tenantId, syncData.workflowChanges);

      // Incremental sync for dashboard
      const dashboardSync = await this.dashboardService.syncIncrementalDashboard(tenantId, syncData.dashboardChanges);

      return {
        success: true,
        data: {
          workflowSync,
          dashboardSync,
        },
        message: 'Incremental sync completed successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Incremental sync failed',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:deviceId')
  @ApiOperation({ summary: 'Get synchronization status for device' })
  @ApiResponse({
    status: 200,
    description: 'Sync status retrieved successfully',
  })
  async getSyncStatus(@Param('deviceId') deviceId: string, @Request() req) {
    try {
      const tenantId = req.user?.tenant_id || 'default-tenant';
      return await this.mobileSyncService.getSyncStatus(tenantId, deviceId);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get sync status',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('resolve-conflict')
  @ApiOperation({ summary: 'Resolve synchronization conflicts' })
  @ApiResponse({
    status: 200,
    description: 'Conflict resolved successfully',
  })
  async resolveSyncConflict(@Body() conflictData: any, @Request() req) {
    try {
      const tenantId = req.user?.tenant_id || 'default-tenant';
      return await this.mobileSyncService.resolveSyncConflict(tenantId, conflictData);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to resolve sync conflict',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('pending-changes/:companyId')
  @ApiOperation({ summary: 'Get pending changes for company' })
  @ApiResponse({
    status: 200,
    description: 'Pending changes retrieved successfully',
  })
  async getPendingChanges(
    @Param('companyId') companyId: string,
    @Request() req,
    @Query('since') since?: string,
  ) {
    try {
      const tenantId = req.user?.tenant_id || 'default-tenant';
      return await this.mobileSyncService.getPendingChanges(tenantId, companyId, since);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get pending changes',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('force-sync')
  @ApiOperation({ summary: 'Force synchronization ignoring conflicts' })
  @ApiResponse({
    status: 200,
    description: 'Force sync completed successfully',
  })
  async forceSync(@Body() syncData: any, @Request() req) {
    try {
      const tenantId = req.user?.tenant_id || 'default-tenant';

      // Force sync all components
      const workflowSync = await this.workflowService.forceSyncWorkflows(tenantId, syncData.workflowData);
      const dashboardSync = await this.dashboardService.forceSyncDashboard(tenantId, syncData.dashboardData);

      return {
        success: true,
        data: {
          workflowSync,
          dashboardSync,
        },
        message: 'Force sync completed successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Force sync failed',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}