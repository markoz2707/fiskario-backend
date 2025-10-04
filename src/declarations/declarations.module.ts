import { Module } from '@nestjs/common';
import { DeclarationsController } from './declarations.controller';
import { JPKV7Controller } from './jpk-v7.controller';
import { EDeklaracjeController } from './e-deklaracje.controller';
import { TaxCalculationService } from './services/tax-calculation.service';
import { XMLGenerationService } from './services/xml-generation.service';
import { SignatureService } from './services/signature.service';
import { SubmissionService } from './services/submission.service';
import { DeadlineReminderService } from './services/deadline-reminder.service';
import { JPKV7Service } from './services/jpk-v7.service';
import { JPKV7CalculationService } from './services/jpk-v7-calculation.service';
import { GTUAssignmentService } from './services/gtu-assignment.service';
import { ProcedureCodeService } from './services/procedure-code.service';
import { XMLValidationService } from './services/xml-validation.service';
import { XMLSigningService } from './services/xml-signing.service';
import { EDeklaracjeService } from './services/e-deklaracje.service';
import { EDeklaracjeAuthService } from './services/e-deklaracje-auth.service';
import { UPOProcessingService } from './services/upo-processing.service';
import { DeclarationStatusService } from './services/declaration-status.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ReportsModule, AuthModule, ConfigModule],
  controllers: [DeclarationsController, JPKV7Controller, EDeklaracjeController],
  providers: [
    TaxCalculationService,
    XMLGenerationService,
    SignatureService,
    SubmissionService,
    DeadlineReminderService,
    JPKV7Service,
    JPKV7CalculationService,
    GTUAssignmentService,
    ProcedureCodeService,
    XMLValidationService,
    XMLSigningService,
    EDeklaracjeService,
    EDeklaracjeAuthService,
    UPOProcessingService,
    DeclarationStatusService,
    ErrorHandlingService
  ],
  exports: [
    TaxCalculationService,
    XMLGenerationService,
    SignatureService,
    SubmissionService,
    DeadlineReminderService,
    JPKV7Service,
    JPKV7CalculationService,
    GTUAssignmentService,
    ProcedureCodeService,
    XMLValidationService,
    XMLSigningService,
    EDeklaracjeService,
    EDeklaracjeAuthService,
    UPOProcessingService,
    DeclarationStatusService,
    ErrorHandlingService
  ],
})
export class DeclarationsModule {}
