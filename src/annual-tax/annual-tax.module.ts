import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnnualTaxController } from './annual-tax.controller';
import { AnnualTaxService } from './annual-tax.service';
import { PIT36CalculationService } from './services/pit36-calculation.service';
import { PIT36LCalculationService } from './services/pit36l-calculation.service';
import { PIT28CalculationService } from './services/pit28-calculation.service';
import { EmploymentIncomeService } from './services/employment-income.service';
import { DeductionsService } from './services/deductions.service';
import { XMLExportService } from './services/xml-export.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnnualTaxController],
  providers: [
    AnnualTaxService,
    PIT36CalculationService,
    PIT36LCalculationService,
    PIT28CalculationService,
    EmploymentIncomeService,
    DeductionsService,
    XMLExportService,
  ],
  exports: [
    AnnualTaxService,
    PIT36CalculationService,
    PIT36LCalculationService,
    PIT28CalculationService,
    EmploymentIncomeService,
    DeductionsService,
    XMLExportService,
  ],
})
export class AnnualTaxModule {}
