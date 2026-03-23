import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiCredentialsDto, UpdateApiCredentialsDto } from './dto/api-credentials.dto';

@Injectable()
export class ApiCredentialsService {
  private readonly logger = new Logger(ApiCredentialsService.name);

  constructor(private prisma: PrismaService) {}

  async getCredentials(tenantId: string, companyId: string) {
    return this.prisma.companyApiCredentials.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
      select: {
        id: true,
        service: true,
        clientId: true,
        environment: true,
        isActive: true,
        lastTestedAt: true,
        testResult: true,
        createdAt: true,
        updatedAt: true,
        // Intentionally exclude clientSecret and apiKey from list responses
      },
    });
  }

  async getCredentialsByService(tenantId: string, companyId: string, service: string) {
    const creds = await this.prisma.companyApiCredentials.findUnique({
      where: {
        tenant_id_company_id_service: {
          tenant_id: tenantId,
          company_id: companyId,
          service,
        },
      },
    });

    if (!creds) {
      return null;
    }

    // Mask secrets in response
    return {
      ...creds,
      clientSecret: creds.clientSecret ? '••••••••' : null,
      apiKey: creds.apiKey ? '••••••••' : null,
    };
  }

  async upsertCredentials(tenantId: string, companyId: string, dto: CreateApiCredentialsDto) {
    this.logger.log(`[API CREDENTIALS] Upserting ${dto.service} credentials for company ${companyId}`);

    return this.prisma.companyApiCredentials.upsert({
      where: {
        tenant_id_company_id_service: {
          tenant_id: tenantId,
          company_id: companyId,
          service: dto.service,
        },
      },
      create: {
        tenant_id: tenantId,
        company_id: companyId,
        service: dto.service,
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        apiKey: dto.apiKey,
        certificatePath: dto.certificatePath,
        environment: dto.environment || 'test',
        isActive: dto.isActive ?? true,
      },
      update: {
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        apiKey: dto.apiKey,
        certificatePath: dto.certificatePath,
        environment: dto.environment,
        isActive: dto.isActive,
      },
    });
  }

  async deleteCredentials(tenantId: string, companyId: string, service: string) {
    const creds = await this.prisma.companyApiCredentials.findUnique({
      where: {
        tenant_id_company_id_service: {
          tenant_id: tenantId,
          company_id: companyId,
          service,
        },
      },
    });

    if (!creds) {
      throw new NotFoundException(`Credentials for ${service} not found`);
    }

    return this.prisma.companyApiCredentials.delete({
      where: { id: creds.id },
    });
  }

  async testCredentials(tenantId: string, companyId: string, service: string) {
    const creds = await this.prisma.companyApiCredentials.findUnique({
      where: {
        tenant_id_company_id_service: {
          tenant_id: tenantId,
          company_id: companyId,
          service,
        },
      },
    });

    if (!creds) {
      throw new NotFoundException(`Credentials for ${service} not found`);
    }

    // TODO: Implement actual connection tests for each service
    let testResult = 'success';
    try {
      switch (service) {
        case 'ksef':
          this.logger.log(`[API CREDENTIALS] Testing KSeF connection for company ${companyId}`);
          // Would call KSeF test endpoint here
          break;
        case 'zus':
          this.logger.log(`[API CREDENTIALS] Testing ZUS connection for company ${companyId}`);
          // Would call PUE ZUS test endpoint here
          break;
        case 'epuap':
          this.logger.log(`[API CREDENTIALS] Testing ePUAP connection for company ${companyId}`);
          break;
      }
    } catch (error) {
      testResult = 'failure';
      this.logger.error(`[API CREDENTIALS] Test failed for ${service}: ${error.message}`);
    }

    await this.prisma.companyApiCredentials.update({
      where: { id: creds.id },
      data: {
        lastTestedAt: new Date(),
        testResult,
      },
    });

    return { service, testResult, testedAt: new Date() };
  }
}
