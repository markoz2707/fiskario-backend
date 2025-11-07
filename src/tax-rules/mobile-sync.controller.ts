import { Controller, Post, Body, UseGuards, Request, Get, Param, HttpException, HttpStatus, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { MobileTaxSyncDto } from './dto/mobile-tax-calculation.dto';
import { MobileErrorResponseDto, MobileSyncErrorDto } from './dto/mobile-error.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('mobile-sync')
@UseGuards(JwtAuthGuard)
export class MobileSyncController {
  constructor(private readonly taxRulesService: TaxRulesService) {}

  @Post('full-sync')
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async performFullSync(@Body() syncDto: MobileTaxSyncDto, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.performFullSync(tenant_id, syncDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        new MobileSyncErrorDto(
          'Full sync failed',
          'server_wins',
          error.message
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('incremental-sync')
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async performIncrementalSync(@Body() syncDto: MobileTaxSyncDto, @Request() req) {
    try {
      console.log('🔄 [MOBILE SYNC] Incremental sync request received:', {
        companyId: syncDto.companyId,
        deviceId: syncDto.deviceId,
        lastSyncTimestamp: syncDto.lastSyncTimestamp,
        hasPendingCalculations: !!(syncDto.pendingCalculations && syncDto.pendingCalculations.length > 0),
        pendingCalculationsCount: syncDto.pendingCalculations?.length || 0,
      });

      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.performIncrementalSync(tenant_id, syncDto);
    } catch (error) {
      console.error('❌ [MOBILE SYNC] Incremental sync error:', error);
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        new MobileSyncErrorDto(
          'Incremental sync failed',
          'client_wins',
          error.message
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:deviceId')
  async getSyncStatus(@Param('deviceId') deviceId: string, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.getSyncStatus(tenant_id, deviceId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'SYNC_STATUS_ERROR',
          message: 'Failed to get sync status',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('resolve-conflict')
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async resolveSyncConflict(
    @Body() conflictData: { deviceId: string; entityType: string; entityId: string; resolution: 'server_wins' | 'client_wins' | 'manual_merge' },
    @Request() req,
  ) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.resolveSyncConflict(tenant_id, conflictData);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        new MobileSyncErrorDto(
          'Conflict resolution failed',
          conflictData.resolution,
          error.message
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('pending-changes/:companyId')
  async getPendingChanges(
    @Param('companyId') companyId: string,
    @Request() req,
    @Query('since') since?: string,
  ) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.getPendingChanges(tenant_id, companyId, since);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          errorCode: 'PENDING_CHANGES_ERROR',
          message: 'Failed to get pending changes',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('force-sync')
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields for mobile client compatibility
    transform: true,
  }))
  async forceSync(@Body() syncDto: MobileTaxSyncDto, @Request() req) {
    try {
      const tenant_id = req.user?.tenant_id || 'default-tenant';
      return await this.taxRulesService.forceSync(tenant_id, syncDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        new MobileSyncErrorDto(
          'Force sync failed',
          'server_wins',
          error.message
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}