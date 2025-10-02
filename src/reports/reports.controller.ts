import { Controller, Get, Post, Query, Param, UseGuards, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PLReportService } from './services/pl-report.service';
import { VATRegisterReportService } from './services/vat-register-report.service';
import { CashflowReportService } from './services/cashflow-report.service';
import { ReceivablesPayablesReportService } from './services/receivables-payables-report.service';
import { ExportService } from './services/export.service';
import { PLReportFiltersDto } from './dto/pl-report.dto';
import { VATRegisterFiltersDto } from './dto/vat-register-report.dto';
import { CashflowFiltersDto } from './dto/cashflow-report.dto';
import { ReceivablesPayablesFiltersDto } from './dto/receivables-payables-report.dto';
import { Request, Response } from 'express';
import * as path from 'path';

interface AuthenticatedUser {
  userId: string;
  email: string;
  tenant_id: string;
  company_id?: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly plReportService: PLReportService,
    private readonly vatRegisterReportService: VATRegisterReportService,
    private readonly cashflowReportService: CashflowReportService,
    private readonly receivablesPayablesReportService: ReceivablesPayablesReportService,
    private readonly exportService: ExportService,
  ) {}

  private getUserInfo(req: Request & { user: AuthenticatedUser }) {
    const tenantId = req.user?.tenant_id;
    const companyId = req.user?.company_id || 'default-company';

    if (!tenantId) {
      throw new HttpException('Tenant ID is required', HttpStatus.BAD_REQUEST);
    }

    return { tenantId, companyId };
  }

  @Get('pl')
  @Roles('user', 'admin')
  async getPLReport(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() filters: PLReportFiltersDto,
  ) {
    try {
      const { tenantId, companyId } = this.getUserInfo(req);

      const report = await this.plReportService.generateReport(tenantId, companyId, filters);

      return {
        success: true,
        data: report,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate P&L report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('vat-register')
  @Roles('user', 'admin')
  async getVATRegisterReport(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() filters: VATRegisterFiltersDto,
  ) {
    try {
      const { tenantId, companyId } = this.getUserInfo(req);

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.vatRegisterReportService.generateReport(tenantId, companyId, filters);

      return {
        success: true,
        data: report,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate VAT register report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('vat-register/detailed')
  @Roles('user', 'admin')
  async getDetailedVATRegisterReport(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() filters: VATRegisterFiltersDto,
  ) {
    try {
      const { tenantId, companyId } = this.getUserInfo(req);

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.vatRegisterReportService.getDetailedReport(tenantId, companyId, filters);

      return {
        success: true,
        data: report,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate detailed VAT register report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('cashflow')
  @Roles('user', 'admin')
  async getCashflowReport(
    @Req() req: Request,
    @Query() filters: CashflowFiltersDto,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const companyId = req.user?.company_id;

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.cashflowReportService.generateReport(tenantId, companyId, filters);

      return {
        success: true,
        data: report,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate cashflow report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('receivables-payables')
  @Roles('user', 'admin')
  async getReceivablesPayablesReport(
    @Req() req: Request,
    @Query() filters: ReceivablesPayablesFiltersDto,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const companyId = req.user?.company_id;

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.receivablesPayablesReportService.generateReport(tenantId, companyId, filters);

      return {
        success: true,
        data: report,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate receivables/payables report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('pl/export/:format')
  @Roles('user', 'admin')
  async exportPLReport(
    @Req() req: Request,
    @Param('format') format: 'csv' | 'xlsx' | 'pdf',
    @Query() filters: PLReportFiltersDto,
    @Res() res: Response,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const companyId = req.user?.company_id;

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.plReportService.generateReport(tenantId, companyId, filters);

      // Prepare data for export
      const exportData = this.preparePLReportForExport(report);

      // Get company info for compliance headers
      const company = await this.getCompanyInfo(tenantId, companyId);

      const complianceHeaders = {
        companyName: company.name,
        companyNIP: company.nip || '',
        reportType: 'Rachunek Zysków i Strat (P&L)',
        period: report.period,
        generatedAt: new Date(),
        generatedBy: req.user?.email || 'System',
      };

      // Generate filename
      const filename = `pl_report_${report.period}_${Date.now()}`;

      // Export based on format
      let filePath: string;
      if (format === 'csv') {
        filePath = await this.exportService.exportToCSV(
          exportData,
          filename,
          { format: 'csv', delimiter: ';' },
          complianceHeaders,
        );
      } else if (format === 'xlsx') {
        filePath = await this.exportService.exportToXLSX(
          exportData,
          filename,
          { format: 'xlsx' },
          complianceHeaders,
        );
      } else if (format === 'pdf') {
        filePath = await this.exportService.exportToPDF(
          exportData,
          filename,
          { format: 'pdf' },
          complianceHeaders,
          'Rachunek Zysków i Strat',
        );
      } else {
        throw new HttpException('Unsupported export format', HttpStatus.BAD_REQUEST);
      }

      // Return file URL for download
      const fileUrl = this.exportService.getExportFileUrl(filePath);

      res.json({
        success: true,
        downloadUrl: fileUrl,
        filename: path.basename(filePath),
        expiresIn: '24 hours',
      });
    } catch (error) {
      throw new HttpException(
        `Failed to export P&L report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('vat-register/export/:format')
  @Roles('user', 'admin')
  async exportVATRegisterReport(
    @Req() req: Request,
    @Param('format') format: 'csv' | 'xlsx' | 'pdf',
    @Query() filters: VATRegisterFiltersDto,
    @Res() res: Response,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const companyId = req.user?.company_id;

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.vatRegisterReportService.generateReport(tenantId, companyId, filters);

      // Prepare data for export
      const exportData = this.prepareVATRegisterReportForExport(report);

      // Get company info for compliance headers
      const company = await this.getCompanyInfo(tenantId, companyId);

      const complianceHeaders = {
        companyName: company.name,
        companyNIP: company.nip || '',
        reportType: 'Rejestr VAT',
        period: report.period,
        generatedAt: new Date(),
        generatedBy: req.user?.email || 'System',
      };

      const filename = `vat_register_${report.period}_${Date.now()}`;

      let filePath: string;
      if (format === 'csv') {
        filePath = await this.exportService.exportToCSV(
          exportData,
          filename,
          { format: 'csv', delimiter: ';' },
          complianceHeaders,
        );
      } else if (format === 'xlsx') {
        filePath = await this.exportService.exportToXLSX(
          exportData,
          filename,
          { format: 'xlsx' },
          complianceHeaders,
        );
      } else if (format === 'pdf') {
        filePath = await this.exportService.exportToPDF(
          exportData,
          filename,
          { format: 'pdf' },
          complianceHeaders,
          'Rejestr VAT',
        );
      } else {
        throw new HttpException('Unsupported export format', HttpStatus.BAD_REQUEST);
      }

      const fileUrl = this.exportService.getExportFileUrl(filePath);

      res.json({
        success: true,
        downloadUrl: fileUrl,
        filename: path.basename(filePath),
        expiresIn: '24 hours',
      });
    } catch (error) {
      throw new HttpException(
        `Failed to export VAT register report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('cashflow/export/:format')
  @Roles('user', 'admin')
  async exportCashflowReport(
    @Req() req: Request,
    @Param('format') format: 'csv' | 'xlsx' | 'pdf',
    @Query() filters: CashflowFiltersDto,
    @Res() res: Response,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const companyId = req.user?.company_id;

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.cashflowReportService.generateReport(tenantId, companyId, filters);

      // Prepare data for export
      const exportData = this.prepareCashflowReportForExport(report);

      // Get company info for compliance headers
      const company = await this.getCompanyInfo(tenantId, companyId);

      const complianceHeaders = {
        companyName: company.name,
        companyNIP: company.nip || '',
        reportType: 'Raport Przepływów Pieniężnych',
        period: report.period,
        generatedAt: new Date(),
        generatedBy: req.user?.email || 'System',
      };

      const filename = `cashflow_${report.period}_${Date.now()}`;

      let filePath: string;
      if (format === 'csv') {
        filePath = await this.exportService.exportToCSV(
          exportData,
          filename,
          { format: 'csv', delimiter: ';' },
          complianceHeaders,
        );
      } else if (format === 'xlsx') {
        filePath = await this.exportService.exportToXLSX(
          exportData,
          filename,
          { format: 'xlsx' },
          complianceHeaders,
        );
      } else if (format === 'pdf') {
        filePath = await this.exportService.exportToPDF(
          exportData,
          filename,
          { format: 'pdf' },
          complianceHeaders,
          'Raport Przepływów Pieniężnych',
        );
      } else {
        throw new HttpException('Unsupported export format', HttpStatus.BAD_REQUEST);
      }

      const fileUrl = this.exportService.getExportFileUrl(filePath);

      res.json({
        success: true,
        downloadUrl: fileUrl,
        filename: path.basename(filePath),
        expiresIn: '24 hours',
      });
    } catch (error) {
      throw new HttpException(
        `Failed to export cashflow report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('receivables-payables/export/:format')
  @Roles('user', 'admin')
  async exportReceivablesPayablesReport(
    @Req() req: Request,
    @Param('format') format: 'csv' | 'xlsx' | 'pdf',
    @Query() filters: ReceivablesPayablesFiltersDto,
    @Res() res: Response,
  ) {
    try {
      const tenantId = req.user?.tenant_id;
      const companyId = req.user?.company_id;

      if (!tenantId || !companyId) {
        throw new HttpException('Tenant ID and Company ID are required', HttpStatus.BAD_REQUEST);
      }

      const report = await this.receivablesPayablesReportService.generateReport(tenantId, companyId, filters);

      // Prepare data for export
      const exportData = this.prepareReceivablesPayablesReportForExport(report);

      // Get company info for compliance headers
      const company = await this.getCompanyInfo(tenantId, companyId);

      const complianceHeaders = {
        companyName: company.name,
        companyNIP: company.nip || '',
        reportType: 'Należności i Zobowiązania',
        period: report.asOfDate.toISOString().slice(0, 10),
        generatedAt: new Date(),
        generatedBy: req.user?.email || 'System',
      };

      const filename = `receivables_payables_${report.asOfDate.toISOString().slice(0, 10)}_${Date.now()}`;

      let filePath: string;
      if (format === 'csv') {
        filePath = await this.exportService.exportToCSV(
          exportData,
          filename,
          { format: 'csv', delimiter: ';' },
          complianceHeaders,
        );
      } else if (format === 'xlsx') {
        filePath = await this.exportService.exportToXLSX(
          exportData,
          filename,
          { format: 'xlsx' },
          complianceHeaders,
        );
      } else if (format === 'pdf') {
        filePath = await this.exportService.exportToPDF(
          exportData,
          filename,
          { format: 'pdf' },
          complianceHeaders,
          'Należności i Zobowiązania',
        );
      } else {
        throw new HttpException('Unsupported export format', HttpStatus.BAD_REQUEST);
      }

      const fileUrl = this.exportService.getExportFileUrl(filePath);

      res.json({
        success: true,
        downloadUrl: fileUrl,
        filename: path.basename(filePath),
        expiresIn: '24 hours',
      });
    } catch (error) {
      throw new HttpException(
        `Failed to export receivables/payables report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private preparePLReportForExport(report: any): any[] {
    return [
      { metric: 'Przychody ze sprzedaży', amount: report.revenue.sales },
      { metric: 'Pozostałe przychody', amount: report.revenue.other },
      { metric: 'SUMA PRZYCHODÓW', amount: report.revenue.total },
      { metric: 'Materiały i towary', amount: report.costs.materials },
      { metric: 'Usługi obce', amount: report.costs.services },
      { metric: 'Wynagrodzenia i składki ZUS', amount: report.costs.salaries },
      { metric: 'Pozostałe koszty', amount: report.costs.other },
      { metric: 'SUMA KOSZTÓW', amount: report.costs.total },
      { metric: 'ZYSK BRUTTO', amount: report.grossProfit },
      { metric: 'ZYSK OPERACYJNY', amount: report.operatingProfit },
      { metric: 'VAT naliczony (sprzedaż)', amount: report.vat.collected },
      { metric: 'VAT należny (zakup)', amount: report.vat.paid },
      { metric: 'VAT DO ZAPŁATY', amount: report.vat.due },
      { metric: 'ZYSK NETTO', amount: report.netProfit },
    ];
  }

  private prepareVATRegisterReportForExport(report: any): any[] {
    return report.entries.map((entry: any) => ({
      'Typ': entry.type === 'sprzedaz' ? 'Sprzedaż' : 'Zakup',
      'Kontrahent': entry.counterpartyName,
      'NIP': entry.counterpartyNIP || '',
      'Numer faktury': entry.invoiceNumber,
      'Data faktury': entry.invoiceDate.toISOString().slice(0, 10),
      'Netto': entry.netAmount,
      'VAT': entry.vatAmount,
      'Stawka VAT': `${entry.vatRate}%`,
      'Brutto': entry.netAmount + entry.vatAmount,
      'Kod GTU': entry.gtuCode || '',
    }));
  }

  private prepareCashflowReportForExport(report: any): any[] {
    return report.entries.map((entry: any) => ({
      'Data': entry.date.toISOString().slice(0, 10),
      'Termin płatności': entry.dueDate ? entry.dueDate.toISOString().slice(0, 10) : '',
      'Typ': entry.type === 'income' ? 'Przychód' : 'Wydatek',
      'Kwota': entry.amount,
      'Opis': entry.description,
      'Kontrahent': entry.counterpartyName,
      'Status': this.getStatusText(entry.status),
      'Dni do terminu': entry.daysUntilDue || '',
      'Kategoria': this.getCategoryText(entry.category),
    }));
  }

  private prepareReceivablesPayablesReportForExport(report: any): any[] {
    const allEntries = [
      ...report.receivables.map((entry: any) => ({
        'Typ': 'Należność',
        'Numer faktury': entry.invoiceNumber,
        'Kontrahent': entry.counterpartyName,
        'NIP': entry.counterpartyNIP || '',
        'Kwota': entry.amount,
        'Termin płatności': entry.dueDate.toISOString().slice(0, 10),
        'Dni przeterminowania': entry.daysOverdue,
        'Kategoria wiekowa': this.getAgingCategoryText(entry.agingCategory),
        'Status': this.getStatusText(entry.status),
      })),
      ...report.payables.map((entry: any) => ({
        'Typ': 'Zobowiązanie',
        'Numer faktury': entry.invoiceNumber,
        'Kontrahent': entry.counterpartyName,
        'NIP': entry.counterpartyNIP || '',
        'Kwota': entry.amount,
        'Termin płatności': entry.dueDate.toISOString().slice(0, 10),
        'Dni przeterminowania': entry.daysOverdue,
        'Kategoria wiekowa': this.getAgingCategoryText(entry.agingCategory),
        'Status': this.getStatusText(entry.status),
      })),
    ];

    return allEntries;
  }

  private async getCompanyInfo(tenantId: string, companyId: string) {
    // This would typically use a companies service
    // For now, return a basic structure
    return {
      name: 'Company Name', // Would be fetched from database
      nip: '1234567890', // Would be fetched from database
    };
  }

  private getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'Oczekujące',
      'paid': 'Zapłacone',
      'overdue': 'Przeterminowane',
      'cancelled': 'Anulowane',
    };
    return statusMap[status] || status;
  }

  private getCategoryText(category: string): string {
    const categoryMap: Record<string, string> = {
      'invoice': 'Faktura',
      'zus': 'ZUS',
      'tax': 'Podatek',
      'other': 'Inne',
    };
    return categoryMap[category] || category;
  }

  private getAgingCategoryText(category: string): string {
    const categoryMap: Record<string, string> = {
      'current': 'Bieżące',
      '1-30': '1-30 dni',
      '31-60': '31-60 dni',
      '61-90': '61-90 dni',
      '90+': '90+ dni',
    };
    return categoryMap[category] || category;
  }
}