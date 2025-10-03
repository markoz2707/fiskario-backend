import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async createCompany(tenantId: string, dto: CreateCompanyDto) {
    // Check if NIP already exists (if provided)
    if (dto.nip) {
      const existingCompany = await this.prisma.company.findFirst({
        where: { nip: dto.nip }
      });
      if (existingCompany) {
        throw new ConflictException('Company with this NIP already exists');
      }
    }

    return this.prisma.company.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        nip: dto.nip,
        nipEncrypted: dto.nip, // In real app, encrypt this
        address: dto.address,
        taxForm: dto.taxForm,
        vatPayer: dto.vatPayer || false,
      },
    });
  }

  async updateCompany(tenantId: string, companyId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenant_id: tenantId }
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        nip: dto.nip,
        nipEncrypted: dto.nip,
        address: dto.address,
        taxForm: dto.taxForm,
        vatPayer: dto.vatPayer,
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