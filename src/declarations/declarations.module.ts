import { Module } from '@nestjs/common';
import { DeclarationsController } from './declarations.controller';
import { TaxCalculationService } from './services/tax-calculation.service';
import { XMLGenerationService } from './services/xml-generation.service';
import { SignatureService } from './services/signature.service';
import { SubmissionService } from './services/submission.service';
import { DeadlineReminderService } from './services/deadline-reminder.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DeclarationsController],
  providers: [
    TaxCalculationService,
    XMLGenerationService,
    SignatureService,
    SubmissionService,
    DeadlineReminderService
  ],
  exports: [
    TaxCalculationService,
    XMLGenerationService,
    SignatureService,
    SubmissionService,
    DeadlineReminderService
  ],
})
export class DeclarationsModule {}
