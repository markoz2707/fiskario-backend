import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './companies/companies.module';
import { InvoicingModule } from './invoicing/invoicing.module';
import { KsefModule } from './ksef/ksef.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { ZusModule } from './zus/zus.module';
import { OcrLlmProxyModule } from './ocr-llm-proxy/ocr-llm-proxy.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SecurityModule } from './security/security.module';
import { TaxRulesModule } from './tax-rules/tax-rules.module';
import { DigitalSignatureModule } from './digital-signature/digital-signature.module';
import { ApiLoggerMiddleware } from './common/middleware/api-logger.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, PrismaModule, CompaniesModule, InvoicingModule, KsefModule, DeclarationsModule, ZusModule, OcrLlmProxyModule, ReportsModule, NotificationsModule, SecurityModule, TaxRulesModule, DigitalSignatureModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiLoggerMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
}
