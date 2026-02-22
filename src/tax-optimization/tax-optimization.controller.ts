import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FormComparisonService } from './services/form-comparison.service';
import { SimulationService } from './services/simulation.service';
import { ThresholdMonitorService } from './services/threshold-monitor.service';
import { RecommendationService } from './services/recommendation.service';
import {
  CompareFormsDto,
  SimulationDto,
  ZusType,
} from './dto/tax-optimization.dto';

interface AuthenticatedUser {
  tenant_id: string;
  email: string;
}

@Controller('tax-optimization')
@UseGuards(JwtAuthGuard)
export class TaxOptimizationController {
  constructor(
    private readonly formComparisonService: FormComparisonService,
    private readonly simulationService: SimulationService,
    private readonly thresholdMonitorService: ThresholdMonitorService,
    private readonly recommendationService: RecommendationService,
  ) {}

  /**
   * POST /tax-optimization/:companyId/compare-forms
   * Compare all 3 tax forms (skala, liniowy, ryczalt) for given scenario.
   */
  @Post(':companyId/compare-forms')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async compareForms(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CompareFormsDto,
  ) {
    try {
      const result = this.formComparisonService.compareForms(dto);

      return {
        success: true,
        data: result,
        message: `Porownanie 3 form opodatkowania dla przychodu ${dto.annualRevenue} PLN i kosztow ${dto.annualCosts} PLN`,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Blad porownania form opodatkowania',
          error: error.name,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /tax-optimization/:companyId/simulate
   * Run "what if" simulation with multiple scenarios.
   */
  @Post(':companyId/simulate')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async simulate(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: SimulationDto,
  ) {
    try {
      if (!dto.scenarios || dto.scenarios.length === 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Wymagany co najmniej 1 scenariusz symulacji',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (dto.scenarios.length > 10) {
        throw new HttpException(
          {
            success: false,
            message: 'Maksymalnie 10 scenariuszy w jednej symulacji',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = this.simulationService.runSimulation(dto);

      return {
        success: true,
        data: result,
        message: `Symulacja ${dto.scenarios.length} scenariuszy zakonczona`,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Blad symulacji podatkowej',
          error: error.name,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * GET /tax-optimization/:companyId/thresholds
   * Get current threshold monitoring status.
   */
  @Get(':companyId/thresholds')
  async getThresholds(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('year') year?: string,
  ) {
    try {
      const tenantId = req.user.tenant_id;
      const targetYear = year ? parseInt(year) : new Date().getFullYear();

      const result = await this.thresholdMonitorService.monitorThresholds(
        tenantId,
        companyId,
        targetYear,
      );

      return {
        success: true,
        data: result,
        message: `Monitoring progow podatkowych za rok ${targetYear}`,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message:
            error.message || 'Blad monitorowania progow podatkowych',
          error: error.name,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /tax-optimization/:companyId/recommendations
   * Get personalized tax optimization recommendations.
   */
  @Get(':companyId/recommendations')
  async getRecommendations(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('year') year?: string,
  ) {
    try {
      const tenantId = req.user.tenant_id;
      const targetYear = year ? parseInt(year) : new Date().getFullYear();

      const result = await this.recommendationService.getRecommendations(
        tenantId,
        companyId,
        targetYear,
      );

      return {
        success: true,
        data: result,
        message: `Rekomendacje optymalizacji podatkowej za rok ${targetYear}`,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Blad generowania rekomendacji',
          error: error.name,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /tax-optimization/:companyId/annual-summary/:year
   * Get full year summary with optimization suggestions.
   */
  @Get(':companyId/annual-summary/:year')
  async getAnnualSummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('year') year: string,
  ) {
    try {
      const tenantId = req.user.tenant_id;
      const targetYear = parseInt(year);

      if (isNaN(targetYear) || targetYear < 2020 || targetYear > 2030) {
        throw new HttpException(
          {
            success: false,
            message: 'Nieprawidlowy rok. Podaj rok z zakresu 2020-2030.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.recommendationService.getAnnualSummary(
        tenantId,
        companyId,
        targetYear,
      );

      return {
        success: true,
        data: result,
        message: `Podsumowanie roczne za ${targetYear} z sugestiami optymalizacji`,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message:
            error.message || 'Blad generowania podsumowania rocznego',
          error: error.name,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /tax-optimization/:companyId/breakeven
   * Find breakeven points between tax forms.
   */
  @Post(':companyId/breakeven')
  async findBreakevenPoints(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body()
    body: {
      costRatio?: number;
      zusType?: ZusType;
      ryczaltRate?: number;
      year?: number;
    },
  ) {
    try {
      const costRatio = body.costRatio ?? 0.3;
      const zusType = body.zusType ?? ZusType.DUZY;
      const ryczaltRate = body.ryczaltRate ?? 8.5;

      if (costRatio < 0 || costRatio > 1) {
        throw new HttpException(
          {
            success: false,
            message: 'costRatio musi byc z zakresu 0-1 (np. 0.3 = 30% kosztow)',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = this.simulationService.findBreakevenPoints(
        costRatio,
        zusType,
        ryczaltRate,
        body.year,
      );

      return {
        success: true,
        data: result,
        message: `Analiza progow oplacalnosci przy wskazniku kosztow ${(costRatio * 100).toFixed(0)}%`,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message:
            error.message || 'Blad analizy progow oplacalnosci',
          error: error.name,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
