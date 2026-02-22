import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiGatewayService } from './services/api-gateway.service';
import { ServiceMeshService } from './services/service-mesh.service';
import { RouteRequestDto, TaxRouteRequestDto } from './dto/api-gateway.dto';

interface AuthenticatedUser {
  userId: string;
  email: string;
  tenant_id: string;
}

@Controller('gateway')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class IntegrationServicesController {
  constructor(
    private readonly apiGatewayService: ApiGatewayService,
    private readonly serviceMeshService: ServiceMeshService,
  ) {}

  @Post('route')
  @Roles('admin')
  async routeRequest(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: RouteRequestDto,
  ) {
    try {
      const headers = {
        ...dto.headers,
        authorization: (req.headers as any).authorization,
        'x-tenant-id': req.user.tenant_id,
      };

      const result = await this.apiGatewayService.routeRequest(
        dto.method,
        dto.path,
        headers,
        dto.body,
      );

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        `Routing failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('route/tax')
  @Roles('admin')
  async routeTaxRequest(
    @Body() dto: TaxRouteRequestDto,
  ) {
    try {
      const headers = {
        ...dto.headers,
        'x-tenant-id': dto.tenantId,
        'x-user-id': dto.userId || '',
      };

      const result = await this.apiGatewayService.routeTaxRequest(
        dto.method,
        dto.path,
        headers,
        dto.body,
      );

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        `Tax routing failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('health')
  @Roles('admin')
  async getServiceHealth() {
    const health = this.apiGatewayService.getServiceHealth();
    return { success: true, data: health };
  }

  @Get('routes')
  @Roles('admin')
  async getRoutes() {
    const routes = this.apiGatewayService.getRoutes();
    return { success: true, data: routes };
  }

  @Delete('rate-limit-cache')
  @Roles('admin')
  async clearRateLimitCache() {
    this.apiGatewayService.clearRateLimitCache();
    return { success: true, message: 'Rate limit cache cleared' };
  }
}
