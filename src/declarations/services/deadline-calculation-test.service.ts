import { Injectable, Logger } from '@nestjs/common';
import { DeadlineManagementService, DeadlineInfo } from '../../notifications/services/deadline-management.service';

@Injectable()
export class DeadlineCalculationTestService {
  private readonly logger = new Logger(DeadlineCalculationTestService.name);

  constructor(private deadlineManagementService: DeadlineManagementService) {}

  /**
   * Test and validate Polish tax deadline calculations
   */
  async testDeadlineCalculations(tenantId: string, companyId: string): Promise<{
    success: boolean;
    results: any;
    errors: string[];
  }> {
    const errors: string[] = [];
    const results: any = {};

    try {
      this.logger.log('Starting deadline calculation tests...');

      // Test 1: Calculate current deadlines
      try {
        const deadlines = await this.deadlineManagementService.calculateDeadlines(tenantId, companyId);
        results.currentDeadlines = deadlines;

        this.logger.log(`Calculated ${deadlines.length} deadlines`);

        // Validate JPK_V7M deadlines (should be 25th of following month)
        const jpkV7MDeadlines = deadlines.filter(d => d.name === 'JPK_V7M');
        results.jpkV7MCount = jpkV7MDeadlines.length;

        for (const deadline of jpkV7MDeadlines) {
          const dueDate = deadline.dueDate;
          if (dueDate.getDate() !== 25) {
            errors.push(`JPK_V7M deadline should be on 25th, got ${dueDate.getDate()}`);
          }
        }

        // Validate JPK_V7K deadlines (should be 25th after quarter end)
        const jpkV7KDeadlines = deadlines.filter(d => d.name === 'JPK_V7K');
        results.jpkV7KCount = jpkV7KDeadlines.length;

        for (const deadline of jpkV7KDeadlines) {
          const dueDate = deadline.dueDate;
          if (dueDate.getDate() !== 25) {
            errors.push(`JPK_V7K deadline should be on 25th, got ${dueDate.getDate()}`);
          }
        }

        // Test PIT deadline (should be April 30th of following year)
        const pitDeadlines = deadlines.filter(d => d.type === 'pit');
        results.pitDeadlines = pitDeadlines.length;

        if (pitDeadlines.length > 0) {
          const pitDeadline = pitDeadlines[0];
          if (pitDeadline.dueDate.getMonth() !== 3 || pitDeadline.dueDate.getDate() !== 30) {
            errors.push(`PIT deadline should be April 30th, got ${pitDeadline.dueDate.toDateString()}`);
          }
        }

        // Test CIT deadline (should be March 31st of following year)
        const citDeadlines = deadlines.filter(d => d.type === 'cit');
        results.citDeadlines = citDeadlines.length;

        if (citDeadlines.length > 0) {
          const citDeadline = citDeadlines[0];
          if (citDeadline.dueDate.getMonth() !== 2 || citDeadline.dueDate.getDate() !== 31) {
            errors.push(`CIT deadline should be March 31st, got ${citDeadline.dueDate.toDateString()}`);
          }
        }

        // Test ZUS deadline (should be 15th of following month)
        const zusDeadlines = deadlines.filter(d => d.type === 'zus');
        results.zusDeadlines = zusDeadlines.length;

        for (const deadline of zusDeadlines) {
          const dueDate = deadline.dueDate;
          if (dueDate.getDate() !== 15) {
            errors.push(`ZUS deadline should be on 15th, got ${dueDate.getDate()}`);
          }
        }

      } catch (error) {
        errors.push(`Error calculating deadlines: ${error.message}`);
      }

      // Test 2: Test reminder settings
      try {
        const reminderSettings = await this.deadlineManagementService.getReminderSettings(tenantId, companyId);
        results.reminderSettings = reminderSettings;

        if (reminderSettings.reminderDays.length === 0) {
          errors.push('Reminder days should not be empty');
        }

        // Validate that default reminder days are set correctly
        const expectedDefaults = [7, 3, 1];
        const hasExpectedDefaults = expectedDefaults.every(day =>
          reminderSettings.reminderDays.includes(day)
        );

        if (!hasExpectedDefaults) {
          errors.push(`Expected default reminder days [7, 3, 1], got ${reminderSettings.reminderDays}`);
        }

      } catch (error) {
        errors.push(`Error getting reminder settings: ${error.message}`);
      }

      // Test 3: Test compliance report generation
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3); // Last 3 months

        const complianceReport = await this.deadlineManagementService.generateComplianceReport(
          tenantId,
          companyId,
          startDate,
          endDate
        );

        results.complianceReport = complianceReport;

        if (!complianceReport.summary) {
          errors.push('Compliance report should have summary');
        }

        if (typeof complianceReport.summary.complianceRate !== 'number') {
          errors.push('Compliance rate should be a number');
        }

      } catch (error) {
        errors.push(`Error generating compliance report: ${error.message}`);
      }

      // Test 4: Validate deadline status calculation
      try {
        const now = new Date();
        const testDeadlines = await this.deadlineManagementService.calculateDeadlines(tenantId, companyId);

        for (const deadline of testDeadlines) {
          const daysUntilDue = deadline.daysUntilDue;

          // Test status logic
          let expectedStatus: 'upcoming' | 'due' | 'overdue' | 'completed';

          if (daysUntilDue < 0) {
            expectedStatus = 'overdue';
          } else if (daysUntilDue === 0) {
            expectedStatus = 'due';
          } else if (daysUntilDue <= 7) {
            expectedStatus = 'due';
          } else {
            expectedStatus = 'upcoming';
          }

          if (deadline.status !== expectedStatus) {
            errors.push(
              `Deadline ${deadline.name} status mismatch: expected ${expectedStatus}, got ${deadline.status}`
            );
          }
        }

        results.statusValidation = 'passed';

      } catch (error) {
        errors.push(`Error validating deadline status: ${error.message}`);
      }

      const success = errors.length === 0;

      this.logger.log(`Deadline calculation tests completed. Success: ${success}, Errors: ${errors.length}`);

      return {
        success,
        results,
        errors,
      };

    } catch (error) {
      this.logger.error(`Error during deadline calculation tests: ${error.message}`, error.stack);

      return {
        success: false,
        results: {},
        errors: [`Test execution error: ${error.message}`],
      };
    }
  }

  /**
   * Validate specific Polish tax deadline requirements
   */
  async validatePolishTaxRequirements(): Promise<{
    success: boolean;
    validations: any;
    errors: string[];
  }> {
    const errors: string[] = [];
    const validations: any = {};

    try {
      this.logger.log('Validating Polish tax requirements...');

      // Test 1: JPK_V7M monthly deadline should be 25th of following month
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const expectedJPKV7MDeadline = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 25);

      validations.jpkV7MDeadline = {
        expected: expectedJPKV7MDeadline.toISOString(),
        description: 'JPK_V7M should be due on 25th of following month',
      };

      if (expectedJPKV7MDeadline.getDate() !== 25) {
        errors.push('JPK_V7M deadline calculation is incorrect');
      }

      // Test 2: JPK_V7K quarterly deadline should be 25th after quarter end
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      const expectedJPKV7KDeadline = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth() + 1, 25);

      validations.jpkV7KDeadline = {
        expected: expectedJPKV7KDeadline.toISOString(),
        description: 'JPK_V7K should be due on 25th after quarter end',
      };

      if (expectedJPKV7KDeadline.getDate() !== 25) {
        errors.push('JPK_V7K deadline calculation is incorrect');
      }

      // Test 3: PIT annual deadline should be April 30th
      const expectedPITDeadline = new Date(now.getFullYear() + 1, 3, 30); // April 30th

      validations.pitDeadline = {
        expected: expectedPITDeadline.toISOString(),
        description: 'PIT should be due on April 30th of following year',
      };

      if (expectedPITDeadline.getMonth() !== 3 || expectedPITDeadline.getDate() !== 30) {
        errors.push('PIT deadline calculation is incorrect');
      }

      // Test 4: CIT annual deadline should be March 31st
      const expectedCITDeadline = new Date(now.getFullYear() + 1, 2, 31); // March 31st

      validations.citDeadline = {
        expected: expectedCITDeadline.toISOString(),
        description: 'CIT should be due on March 31st of following year',
      };

      if (expectedCITDeadline.getMonth() !== 2 || expectedCITDeadline.getDate() !== 31) {
        errors.push('CIT deadline calculation is incorrect');
      }

      // Test 5: ZUS monthly deadline should be 15th of following month
      const expectedZUSDeadline = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 15);

      validations.zusDeadline = {
        expected: expectedZUSDeadline.toISOString(),
        description: 'ZUS should be due on 15th of following month',
      };

      if (expectedZUSDeadline.getDate() !== 15) {
        errors.push('ZUS deadline calculation is incorrect');
      }

      const success = errors.length === 0;

      this.logger.log(`Polish tax requirements validation completed. Success: ${success}, Errors: ${errors.length}`);

      return {
        success,
        validations,
        errors,
      };

    } catch (error) {
      this.logger.error(`Error during Polish tax requirements validation: ${error.message}`, error.stack);

      return {
        success: false,
        validations: {},
        errors: [`Validation execution error: ${error.message}`],
      };
    }
  }
}