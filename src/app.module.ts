import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { FirmsModule } from './firms/firms.module';
import { InvoicingModule } from './invoicing/invoicing.module';
import { KsefModule } from './ksef/ksef.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { ZusModule } from './zus/zus.module';
import { OcrLlmProxyModule } from './ocr-llm-proxy/ocr-llm-proxy.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [AuthModule, PrismaModule, FirmsModule, InvoicingModule, KsefModule, DeclarationsModule, ZusModule, OcrLlmProxyModule, ReportsModule, NotificationsModule, SecurityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
