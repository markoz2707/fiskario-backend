import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FixedAssetsService } from './fixed-assets.service';
import { DepreciationService } from './services/depreciation.service';
import { DepreciationScheduleService } from './services/depreciation-schedule.service';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
  FixedAssetFiltersDto,
  DepreciationEntryFiltersDto,
} from './dto/create-fixed-asset.dto';

interface AuthenticatedUser {
  tenant_id: string;
  email: string;
}

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FixedAssetsController {
  constructor(
    private readonly fixedAssetsService: FixedAssetsService,
    private readonly depreciationService: DepreciationService,
    private readonly scheduleService: DepreciationScheduleService,
  ) {}

  // --- Asset CRUD ---

  @Post(':companyId/assets')
  @Roles('user', 'admin')
  async createAsset(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CreateFixedAssetDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.fixedAssetsService.createAsset(tenantId, companyId, dto);
  }

  @Get(':companyId/assets')
  @Roles('user', 'admin')
  async listAssets(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query() filters: FixedAssetFiltersDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.fixedAssetsService.listAssets(tenantId, companyId, filters);
  }

  @Get(':companyId/assets/:assetId')
  @Roles('user', 'admin')
  async getAsset(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.fixedAssetsService.getAsset(tenantId, companyId, assetId);
  }

  @Put(':companyId/assets/:assetId')
  @Roles('user', 'admin')
  async updateAsset(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.fixedAssetsService.updateAsset(tenantId, companyId, assetId, dto);
  }

  @Delete(':companyId/assets/:assetId')
  @Roles('user', 'admin')
  async deleteAsset(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
  ) {
    const tenantId = req.user.tenant_id;
    await this.fixedAssetsService.deleteAsset(tenantId, companyId, assetId);
    return { success: true, message: 'Srodek trwaly oznaczony jako zlikwidowany' };
  }

  // --- Depreciation Calculation ---

  @Post(':companyId/assets/:assetId/depreciate/:year/:month')
  @Roles('user', 'admin')
  async calculateMonthlyDepreciation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const tenantId = req.user.tenant_id;
    return this.depreciationService.calculateMonthlyDepreciation(
      tenantId,
      companyId,
      assetId,
      year,
      month,
    );
  }

  @Post(':companyId/assets/:assetId/depreciate-year/:year')
  @Roles('user', 'admin')
  async calculateYearlyDepreciation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
    @Param('year', ParseIntPipe) year: number,
  ) {
    const tenantId = req.user.tenant_id;
    return this.depreciationService.calculateYearlyDepreciation(
      tenantId,
      companyId,
      assetId,
      year,
    );
  }

  // --- Depreciation Schedule / Plan ---

  @Get(':companyId/assets/:assetId/depreciation-plan')
  @Roles('user', 'admin')
  async getDepreciationPlan(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.scheduleService.generateSchedule(tenantId, companyId, assetId);
  }

  // --- Depreciation Entries ---

  @Get(':companyId/assets/:assetId/depreciation-entries')
  @Roles('user', 'admin')
  async getDepreciationEntries(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('assetId') assetId: string,
    @Query() filters: DepreciationEntryFiltersDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.depreciationService.getDepreciationEntries(tenantId, companyId, assetId, filters);
  }

  // --- Summary ---

  @Get(':companyId/summary')
  @Roles('user', 'admin')
  async getAssetSummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.fixedAssetsService.getAssetSummary(tenantId, companyId);
  }

  // --- Batch Operations ---

  @Post(':companyId/generate-monthly/:year/:month')
  @Roles('user', 'admin')
  async generateMonthlyDepreciation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const tenantId = req.user.tenant_id;
    return this.depreciationService.generateMonthlyDepreciationForAll(
      tenantId,
      companyId,
      year,
      month,
    );
  }
}
