import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureFlagsService, FeatureFlag } from './feature-flags.service';

@ApiTags('Feature Flags')
@Controller('feature-flags')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all feature flags' })
  @ApiResponse({
    status: 200,
    description: 'Feature flags retrieved successfully',
  })
  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    try {
      return await this.featureFlagsService.getAllFeatureFlags();
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve feature flags',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('check/:featureName')
  @ApiOperation({ summary: 'Check if a feature is enabled for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Feature status checked successfully',
  })
  async checkFeatureEnabled(
    @Param('featureName') featureName: string,
    @Request() req,
    @Query('userId') userId?: string,
    @Query('companyId') companyId?: string,
  ): Promise<{ enabled: boolean; featureName: string }> {
    try {
      const context = {
        userId: userId || req.user?.userId,
        companyId: companyId || req.user?.tenant_id,
        tenantId: req.user?.tenant_id,
        platform: req.headers['user-agent'],
      };

      const enabled = await this.featureFlagsService.isFeatureEnabled(featureName, context);

      return {
        enabled,
        featureName,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: `Failed to check feature ${featureName}`,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a feature flag' })
  @ApiResponse({
    status: 201,
    description: 'Feature flag created/updated successfully',
  })
  async setFeatureFlag(@Body() flagData: Partial<FeatureFlag>): Promise<FeatureFlag> {
    try {
      return await this.featureFlagsService.setFeatureFlag(flagData);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to set feature flag',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Put(':featureName')
  @ApiOperation({ summary: 'Update a specific feature flag' })
  @ApiResponse({
    status: 200,
    description: 'Feature flag updated successfully',
  })
  async updateFeatureFlag(
    @Param('featureName') featureName: string,
    @Body() updateData: Partial<FeatureFlag>,
  ): Promise<FeatureFlag> {
    try {
      const flagData = { ...updateData, name: featureName };
      return await this.featureFlagsService.setFeatureFlag(flagData);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: `Failed to update feature flag ${featureName}`,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':featureName')
  @ApiOperation({ summary: 'Delete a feature flag' })
  @ApiResponse({
    status: 200,
    description: 'Feature flag deleted successfully',
  })
  async deleteFeatureFlag(@Param('featureName') featureName: string): Promise<{ success: boolean }> {
    try {
      await this.featureFlagsService.deleteFeatureFlag(featureName);
      return { success: true };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: `Failed to delete feature flag ${featureName}`,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('initialize-defaults')
  @ApiOperation({ summary: 'Initialize default feature flags' })
  @ApiResponse({
    status: 200,
    description: 'Default feature flags initialized successfully',
  })
  async initializeDefaults(): Promise<{ success: boolean; message: string }> {
    try {
      await this.featureFlagsService.initializeDefaultFeatureFlags();
      return {
        success: true,
        message: 'Default feature flags initialized successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to initialize default feature flags',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}