import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { KPiRService } from './kpir.service';
import { KPiRBookingService } from './services/kpir-booking.service';
import { KPiRSummaryService } from './services/kpir-summary.service';
import { KPiRNumberingService } from './services/kpir-numbering.service';
import { CreateKPiREntryDto, UpdateKPiREntryDto, CreateRemanentDto } from './dto/create-kpir-entry.dto';
import { KPiRFiltersDto } from './dto/kpir-filters.dto';

interface AuthenticatedUser {
  tenant_id: string;
  email: string;
}

@Controller('kpir')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KPiRController {
  constructor(
    private readonly kpirService: KPiRService,
    private readonly bookingService: KPiRBookingService,
    private readonly summaryService: KPiRSummaryService,
    private readonly numberingService: KPiRNumberingService,
  ) {}

  // --- CRUD Entries ---

  @Post(':companyId/entries')
  @Roles('user', 'admin')
  async createEntry(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CreateKPiREntryDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.kpirService.createEntry(tenantId, companyId, dto);
  }

  @Get(':companyId/entries')
  @Roles('user', 'admin')
  async listEntries(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query() filters: KPiRFiltersDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.kpirService.listEntries(tenantId, companyId, filters);
  }

  @Get(':companyId/entries/:entryId')
  @Roles('user', 'admin')
  async getEntry(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('entryId') entryId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.kpirService.getEntry(tenantId, companyId, entryId);
  }

  @Put(':companyId/entries/:entryId')
  @Roles('user', 'admin')
  async updateEntry(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateKPiREntryDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.kpirService.updateEntry(tenantId, companyId, entryId, dto);
  }

  @Delete(':companyId/entries/:entryId')
  @Roles('user', 'admin')
  async deleteEntry(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('entryId') entryId: string,
  ) {
    const tenantId = req.user.tenant_id;
    await this.kpirService.deleteEntry(tenantId, companyId, entryId);
    return { success: true };
  }

  // --- Auto-Booking ---

  @Post(':companyId/book/sales-invoice/:invoiceId')
  @Roles('user', 'admin')
  async bookSalesInvoice(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.bookingService.bookSalesInvoice(tenantId, companyId, invoiceId);
  }

  @Post(':companyId/book/purchase-invoice/:invoiceId')
  @Roles('user', 'admin')
  async bookPurchaseInvoice(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() body: { costColumn?: 'purchaseCost' | 'sideExpenses' | 'otherExpenses' },
  ) {
    const tenantId = req.user.tenant_id;
    return this.bookingService.bookPurchaseInvoice(tenantId, companyId, invoiceId, {
      costColumn: body.costColumn,
    });
  }

  @Post(':companyId/book/zus-contribution/:contributionId')
  @Roles('user', 'admin')
  async bookZUSContribution(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('contributionId') contributionId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.bookingService.bookZUSContribution(tenantId, companyId, contributionId);
  }

  @Post(':companyId/book/salary')
  @Roles('user', 'admin')
  async bookSalary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() body: {
      date: string;
      employeeName: string;
      period: string;
      grossAmount: number;
      documentNumber: string;
    },
  ) {
    const tenantId = req.user.tenant_id;
    return this.bookingService.bookSalary(tenantId, companyId, {
      date: new Date(body.date),
      employeeName: body.employeeName,
      period: body.period,
      grossAmount: body.grossAmount,
      documentNumber: body.documentNumber,
    });
  }

  // --- Summaries ---

  @Get(':companyId/summary/monthly')
  @Roles('user', 'admin')
  async getMonthlySummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const tenantId = req.user.tenant_id;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    return this.summaryService.getMonthlySummary(tenantId, companyId, y, m);
  }

  @Get(':companyId/summary/yearly')
  @Roles('user', 'admin')
  async getYearlySummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('year') year: string,
  ) {
    const tenantId = req.user.tenant_id;
    const y = parseInt(year) || new Date().getFullYear();
    return this.summaryService.getYearlySummary(tenantId, companyId, y);
  }

  @Get(':companyId/summary/cumulative')
  @Roles('user', 'admin')
  async getCumulativeSummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const tenantId = req.user.tenant_id;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    return this.summaryService.getCumulativeSummary(tenantId, companyId, y, m);
  }

  // --- Remanent ---

  @Post(':companyId/remanent')
  @Roles('user', 'admin')
  async createRemanent(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CreateRemanentDto,
  ) {
    const tenantId = req.user.tenant_id;
    const date = new Date(dto.date);
    return this.summaryService.createRemanent(tenantId, companyId, {
      date,
      type: dto.type,
      totalValue: dto.totalValue,
      items: dto.items,
      year: date.getFullYear(),
      notes: dto.notes,
    });
  }

  @Get(':companyId/remanent')
  @Roles('user', 'admin')
  async getRemanents(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('year') year: string,
  ) {
    const tenantId = req.user.tenant_id;
    const y = parseInt(year) || new Date().getFullYear();
    return this.summaryService.getRemanents(tenantId, companyId, y);
  }

  // --- Numbering ---

  @Post(':companyId/renumber/:year')
  @Roles('admin')
  async renumberEntries(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('year') year: string,
  ) {
    const tenantId = req.user.tenant_id;
    const count = await this.numberingService.renumberEntries(tenantId, companyId, parseInt(year));
    return { renumbered: count };
  }

  @Get(':companyId/numbering/validate/:year')
  @Roles('user', 'admin')
  async validateNumbering(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('year') year: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.numberingService.validateNumbering(tenantId, companyId, parseInt(year));
  }

  // --- Utility ---

  @Get(':companyId/check-booked/:invoiceId')
  @Roles('user', 'admin')
  async checkInvoiceBooked(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    const tenantId = req.user.tenant_id;
    const booked = await this.kpirService.isInvoiceBooked(tenantId, companyId, invoiceId);
    return { invoiceId, booked };
  }
}
