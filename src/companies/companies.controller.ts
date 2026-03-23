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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompaniesService } from './companies.service';
import { ApiCredentialsService } from './api-credentials.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';
import { CreateApiCredentialsDto } from './dto/api-credentials.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly apiCredentialsService: ApiCredentialsService,
  ) {}

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

  // API Credentials endpoints
  @Get(':companyId/api-credentials')
  async getApiCredentials(@Request() req, @Param('companyId') companyId: string) {
    return this.apiCredentialsService.getCredentials(req.user.tenant_id, companyId);
  }

  @Get(':companyId/api-credentials/:service')
  async getApiCredentialsByService(
    @Request() req,
    @Param('companyId') companyId: string,
    @Param('service') service: string,
  ) {
    return this.apiCredentialsService.getCredentialsByService(req.user.tenant_id, companyId, service);
  }

  @Put(':companyId/api-credentials')
  async upsertApiCredentials(
    @Request() req,
    @Param('companyId') companyId: string,
    @Body() dto: CreateApiCredentialsDto,
  ) {
    return this.apiCredentialsService.upsertCredentials(req.user.tenant_id, companyId, dto);
  }

  @Delete(':companyId/api-credentials/:service')
  async deleteApiCredentials(
    @Request() req,
    @Param('companyId') companyId: string,
    @Param('service') service: string,
  ) {
    return this.apiCredentialsService.deleteCredentials(req.user.tenant_id, companyId, service);
  }

  @Post(':companyId/api-credentials/:service/test')
  async testApiCredentials(
    @Request() req,
    @Param('companyId') companyId: string,
    @Param('service') service: string,
  ) {
    return this.apiCredentialsService.testCredentials(req.user.tenant_id, companyId, service);
  }
}