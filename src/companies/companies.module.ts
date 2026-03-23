import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { ApiCredentialsService } from './api-credentials.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, ApiCredentialsService],
  exports: [CompaniesService, ApiCredentialsService],
})
export class CompaniesModule {}