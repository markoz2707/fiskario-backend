import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuyerDto, UpdateBuyerDto } from './dto/create-buyer.dto';

@Injectable()
export class BuyersService {
  private readonly logger = new Logger(BuyersService.name);

  constructor(private prisma: PrismaService) {}

  async createBuyer(tenantId: string, dto: CreateBuyerDto) {
    this.logger.log(`Creating buyer for tenant ${tenantId}`);

    // Check if NIP already exists (if provided)
    if (dto.nip) {
      const existingBuyer = await this.prisma.buyer.findFirst({
        where: {
          nip: dto.nip,
          tenant_id: tenantId,
        },
      });
      if (existingBuyer) {
        throw new ConflictException('Buyer with this NIP already exists');
      }
    }

    return this.prisma.buyer.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        nip: dto.nip,
        nipEncrypted: dto.nip, // In real app, encrypt this
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateBuyer(tenantId: string, buyerId: string, dto: UpdateBuyerDto) {
    this.logger.log(`Updating buyer ${buyerId} for tenant ${tenantId}`);

    const buyer = await this.prisma.buyer.findFirst({
      where: { id: buyerId, tenant_id: tenantId },
    });

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    // Check if NIP already exists (if provided and different from current)
    if (dto.nip && dto.nip !== buyer.nip) {
      const existingBuyer = await this.prisma.buyer.findFirst({
        where: {
          nip: dto.nip,
          tenant_id: tenantId,
          id: { not: buyerId },
        },
      });
      if (existingBuyer) {
        throw new ConflictException('Buyer with this NIP already exists');
      }
    }

    return this.prisma.buyer.update({
      where: { id: buyerId },
      data: {
        name: dto.name,
        nip: dto.nip,
        nipEncrypted: dto.nip,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });
  }

  async getBuyers(tenantId: string, includeInactive = false) {
    this.logger.log(`Getting buyers for tenant ${tenantId}`);

    const whereClause: any = {
      tenant_id: tenantId,
    };

    if (!includeInactive) {
      whereClause.isActive = true;
    }

    return this.prisma.buyer.findMany({
      where: whereClause,
      include: {
        invoices: {
          select: {
            id: true,
            number: true,
            date: true,
            totalGross: true,
            status: true,
          },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    });
  }

  async getBuyerById(tenantId: string, buyerId: string) {
    this.logger.log(`Getting buyer ${buyerId} for tenant ${tenantId}`);

    const buyer = await this.prisma.buyer.findFirst({
      where: { id: buyerId, tenant_id: tenantId },
      include: {
        invoices: {
          select: {
            id: true,
            number: true,
            date: true,
            totalGross: true,
            status: true,
          },
        },
      },
    });

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    return buyer;
  }

  async deleteBuyer(tenantId: string, buyerId: string) {
    this.logger.log(`Deleting buyer ${buyerId} for tenant ${tenantId}`);

    const buyer = await this.prisma.buyer.findFirst({
      where: { id: buyerId, tenant_id: tenantId },
    });

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    // Check if buyer has invoices
    const invoiceCount = await this.prisma.invoice.count({
      where: {
        buyer_id: buyerId,
        tenant_id: tenantId,
      },
    });

    if (invoiceCount > 0) {
      throw new ConflictException(
        `Cannot delete buyer with ${invoiceCount} associated invoices. Please reassign or delete invoices first.`
      );
    }

    return this.prisma.buyer.delete({
      where: { id: buyerId },
    });
  }

  async findBuyersByNip(tenantId: string, nip: string) {
    this.logger.log(`Finding buyers by NIP ${nip} for tenant ${tenantId}`);

    return this.prisma.buyer.findMany({
      where: {
        nip,
        tenant_id: tenantId,
        isActive: true,
      },
    });
  }

  async getBuyerStats(tenantId: string) {
    this.logger.log(`Getting buyer statistics for tenant ${tenantId}`);

    const totalBuyers = await this.prisma.buyer.count({
      where: { tenant_id: tenantId },
    });

    const activeBuyers = await this.prisma.buyer.count({
      where: {
        tenant_id: tenantId,
        isActive: true,
      },
    });

    const buyersWithInvoices = await this.prisma.buyer.count({
      where: {
        tenant_id: tenantId,
        invoices: {
          some: {},
        },
      },
    });

    return {
      totalBuyers,
      activeBuyers,
      inactiveBuyers: totalBuyers - activeBuyers,
      buyersWithInvoices,
    };
  }
}