import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async createCompany(tenantId: string, dto: CreateCompanyDto) {
    console.log(`🔍 [COMPANY CREATION] Attempting to create company for tenant: ${tenantId}`);
    console.log(`📋 [COMPANY CREATION] Company data:`, {
      name: dto.name,
      nip: dto.nip,
      regon: dto.regon,
      vatStatus: dto.vatStatus,
      taxOffice: dto.taxOffice,
      isActive: dto.isActive
    });

    try {
      // Check if NIP already exists (if provided)
      if (dto.nip) {
        const existingCompany = await this.prisma.company.findFirst({
          where: { nip: dto.nip }
        });
        if (existingCompany) {
          console.error(`❌ [COMPANY CREATION] NIP already exists: ${dto.nip}`);
          throw new ConflictException('Company with this NIP already exists');
        }
      }

      // Convert address object to string if provided
      const addressString = dto.address
        ? `${dto.address.street}, ${dto.address.postalCode} ${dto.address.city}, ${dto.address.country}`
        : undefined;

      console.log(`✅ [COMPANY CREATION] Creating company in database...`);
      const company = await this.prisma.company.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          nip: dto.nip,
          nipEncrypted: dto.nip, // In real app, encrypt this
          regon: dto.regon,
          address: addressString,
          vatStatus: dto.vatStatus,
          taxOffice: dto.taxOffice,
          isActive: dto.isActive ?? true,
        },
      });

      console.log(`🎉 [COMPANY CREATION] Company created successfully: ${company.id}`);
      return company;

    } catch (error) {
      console.error(`💥 [COMPANY CREATION] Error creating company:`, error.message);
      console.error(`🔍 [COMPANY CREATION] Error details:`, {
        tenantId,
        companyName: dto.name,
        nip: dto.nip,
        errorCode: error.code,
        errorMeta: error.meta
      });
      throw error;
    }
  }

  async updateCompany(tenantId: string, companyId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenant_id: tenantId }
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Convert address object to string if provided
    const addressString = dto.address && typeof dto.address === 'object'
      ? `${dto.address.street}, ${dto.address.postalCode} ${dto.address.city}, ${dto.address.country}`
      : dto.address;

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        nip: dto.nip,
        nipEncrypted: dto.nip,
        regon: dto.regon,
        address: addressString,
        vatStatus: dto.vatStatus,
        taxOffice: dto.taxOffice,
        isActive: dto.isActive,
      },
    });
  }

  async getCompanies(tenantId: string) {
    return this.prisma.company.findMany({
      where: { tenant_id: tenantId },
      include: {
        invoices: true,
        declarations: true,
        zusEmployees: true,
      },
    });
  }
}