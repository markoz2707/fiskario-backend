import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BuyersService } from './buyers.service';
import { CreateBuyerDto, UpdateBuyerDto } from './dto/create-buyer.dto';

@Controller('buyers')
@UseGuards(JwtAuthGuard)
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBuyer(@Request() req, @Body() dto: CreateBuyerDto) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    return this.buyersService.createBuyer(tenantId, dto);
  }

  @Put(':buyerId')
  async updateBuyer(
    @Request() req,
    @Param('buyerId') buyerId: string,
    @Body() dto: UpdateBuyerDto,
  ) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    return this.buyersService.updateBuyer(tenantId, buyerId, dto);
  }

  @Get()
  async getBuyers(
    @Request() req,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    const includeInactiveBool = includeInactive === 'true';
    return this.buyersService.getBuyers(tenantId, includeInactiveBool);
  }

  @Get(':buyerId')
  async getBuyerById(@Request() req, @Param('buyerId') buyerId: string) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    return this.buyersService.getBuyerById(tenantId, buyerId);
  }

  @Delete(':buyerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBuyer(@Request() req, @Param('buyerId') buyerId: string) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    await this.buyersService.deleteBuyer(tenantId, buyerId);
  }

  @Get('search/by-nip/:nip')
  async findBuyersByNip(@Request() req, @Param('nip') nip: string) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    return this.buyersService.findBuyersByNip(tenantId, nip);
  }

  @Get('stats/overview')
  async getBuyerStats(@Request() req) {
    const tenantId = req.user?.tenant_id || 'default-tenant';
    return this.buyersService.getBuyerStats(tenantId);
  }
}