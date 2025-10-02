import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { PLReportService } from './services/pl-report.service';
import { VATRegisterReportService } from './services/vat-register-report.service';
import { CashflowReportService } from './services/cashflow-report.service';
import { ReceivablesPayablesReportService } from './services/receivables-payables-report.service';
import { ExportService } from './services/export.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [
    PLReportService,
    VATRegisterReportService,
    CashflowReportService,
    ReceivablesPayablesReportService,
    ExportService,
  ],
  exports: [
    PLReportService,
    VATRegisterReportService,
    CashflowReportService,
    ReceivablesPayablesReportService,
    ExportService,
  ],
})
export class ReportsModule {}
