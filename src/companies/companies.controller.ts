import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCompany(@Request() req, @Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(req.user.tenant_id, dto);
  }

  @Put(':companyId')
  async updateCompany(
    @Request() req,
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.updateCompany(req.user.tenant_id, companyId, dto);
  }

  @Get()
  async getCompanies(@Request() req) {
    return this.companiesService.getCompanies(req.user.tenant_id);
  }
}