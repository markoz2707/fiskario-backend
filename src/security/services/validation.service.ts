import { Injectable, Logger } from '@nestjs/common';
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedValue?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  /**
   * Validates Polish NIP (Numer Identyfikacji Podatkowej)
   */
  validateNIP(nip: string): ValidationResult {
    try {
      // Remove any non-digit characters
      const cleanNIP = nip.replace(/\D/g, '');

      // Check length
      if (cleanNIP.length !== 10) {
        return {
          isValid: false,
          error: 'NIP must be exactly 10 digits',
        };
      }

      // Check if all digits are the same (invalid)
      if (/^(\d)\1+$/.test(cleanNIP)) {
        return {
          isValid: false,
          error: 'NIP cannot consist of identical digits',
        };
      }

      // Validate checksum
      const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
      let sum = 0;

      for (let i = 0; i < 9; i++) {
        sum += parseInt(cleanNIP[i]) * weights[i];
      }

      const checksum = sum % 11;
      const controlDigit = checksum === 10 ? 0 : checksum;

      if (parseInt(cleanNIP[9]) !== controlDigit) {
        return {
          isValid: false,
          error: 'Invalid NIP checksum',
        };
      }

      return {
        isValid: true,
        normalizedValue: cleanNIP,
        metadata: {
          type: 'NIP',
          country: 'PL',
        },
      };
    } catch (error) {
      this.logger.error(`NIP validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'NIP validation failed',
      };
    }
  }

  /**
   * Validates IBAN (International Bank Account Number)
   */
  validateIBAN(iban: string): ValidationResult {
    try {
      // Remove spaces and convert to uppercase
      const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();

      // Basic format check
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleanIBAN)) {
        return {
          isValid: false,
          error: 'Invalid IBAN format',
        };
      }

      // Check length for specific country
      const countryCode = cleanIBAN.substring(0, 2);
      const expectedLength = this.getIBANLength(countryCode);

      if (cleanIBAN.length !== expectedLength) {
        return {
          isValid: false,
          error: `IBAN for ${countryCode} must be ${expectedLength} characters long`,
        };
      }

      // Validate checksum
      const rearranged = cleanIBAN.substring(4) + cleanIBAN.substring(0, 4);
      const numericIBAN = this.lettersToNumbers(rearranged);

      if (!this.isValidIBANChecksum(numericIBAN)) {
        return {
          isValid: false,
          error: 'Invalid IBAN checksum',
        };
      }

      return {
        isValid: true,
        normalizedValue: cleanIBAN,
        metadata: {
          type: 'IBAN',
          countryCode,
          expectedLength,
        },
      };
    } catch (error) {
      this.logger.error(`IBAN validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'IBAN validation failed',
      };
    }
  }

  /**
   * Validates Polish PESEL number
   */
  validatePESEL(pesel: string): ValidationResult {
    try {
      // Remove any non-digit characters
      const cleanPESEL = pesel.replace(/\D/g, '');

      // Check length
      if (cleanPESEL.length !== 11) {
        return {
          isValid: false,
          error: 'PESEL must be exactly 11 digits',
        };
      }

      // Validate checksum
      const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
      let sum = 0;

      for (let i = 0; i < 10; i++) {
        sum += parseInt(cleanPESEL[i]) * weights[i];
      }

      const checksum = (10 - (sum % 10)) % 10;

      if (parseInt(cleanPESEL[10]) !== checksum) {
        return {
          isValid: false,
          error: 'Invalid PESEL checksum',
        };
      }

      // Validate birth date
      const year = parseInt(cleanPESEL.substring(0, 2));
      const month = parseInt(cleanPESEL.substring(2, 4));
      const day = parseInt(cleanPESEL.substring(4, 6));

      const actualMonth = month > 20 ? month - 20 : month;
      const actualYear = month > 20 ? 2000 + year : 1900 + year;

      const birthDate = new Date(actualYear, actualMonth - 1, day);

      if (birthDate.getFullYear() !== actualYear ||
          birthDate.getMonth() !== actualMonth - 1 ||
          birthDate.getDate() !== day) {
        return {
          isValid: false,
          error: 'Invalid birth date in PESEL',
        };
      }

      return {
        isValid: true,
        normalizedValue: cleanPESEL,
        metadata: {
          type: 'PESEL',
          birthDate: birthDate.toISOString().split('T')[0],
          gender: parseInt(cleanPESEL[9]) % 2 === 1 ? 'male' : 'female',
        },
      };
    } catch (error) {
      this.logger.error(`PESEL validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'PESEL validation failed',
      };
    }
  }

  /**
   * Validates Polish REGON number
   */
  validateREGON(regon: string): ValidationResult {
    try {
      // Remove any non-digit characters
      const cleanREGON = regon.replace(/\D/g, '');

      // Check length (9 or 14 digits)
      if (cleanREGON.length !== 9 && cleanREGON.length !== 14) {
        return {
          isValid: false,
          error: 'REGON must be 9 or 14 digits',
        };
      }

      if (cleanREGON.length === 9) {
        // Validate 9-digit REGON
        const weights = [8, 9, 2, 3, 4, 5, 6, 7];
        let sum = 0;

        for (let i = 0; i < 8; i++) {
          sum += parseInt(cleanREGON[i]) * weights[i];
        }

        const checksum = sum % 11;
        const controlDigit = checksum === 10 ? 0 : checksum;

        if (parseInt(cleanREGON[8]) !== controlDigit) {
          return {
            isValid: false,
            error: 'Invalid 9-digit REGON checksum',
          };
        }
      } else {
        // Validate 14-digit REGON
        const weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];
        let sum = 0;

        for (let i = 0; i < 13; i++) {
          sum += parseInt(cleanREGON[i]) * weights[i];
        }

        const checksum = sum % 11;
        const controlDigit = checksum === 10 ? 0 : checksum;

        if (parseInt(cleanREGON[13]) !== controlDigit) {
          return {
            isValid: false,
            error: 'Invalid 14-digit REGON checksum',
          };
        }
      }

      return {
        isValid: true,
        normalizedValue: cleanREGON,
        metadata: {
          type: 'REGON',
          length: cleanREGON.length,
        },
      };
    } catch (error) {
      this.logger.error(`REGON validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'REGON validation failed',
      };
    }
  }

  /**
   * Validates bank account number (Polish format)
   */
  validateBankAccount(accountNumber: string): ValidationResult {
    try {
      // Remove spaces and dashes
      const cleanAccount = accountNumber.replace(/[\s-]/g, '');

      // Check if it's a valid account number format
      if (!/^\d{8,26}$/.test(cleanAccount)) {
        return {
          isValid: false,
          error: 'Bank account number must contain 8-26 digits',
        };
      }

      // Basic checksum validation (simplified)
      // In a real implementation, you would use specific bank algorithms
      return {
        isValid: true,
        normalizedValue: cleanAccount,
        metadata: {
          type: 'BankAccount',
          length: cleanAccount.length,
        },
      };
    } catch (error) {
      this.logger.error(`Bank account validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Bank account validation failed',
      };
    }
  }

  /**
   * Validates email address
   */
  validateEmail(email: string): ValidationResult {
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return {
          isValid: false,
          error: 'Invalid email format',
        };
      }

      // Check length constraints
      if (email.length > 254) {
        return {
          isValid: false,
          error: 'Email address too long',
        };
      }

      return {
        isValid: true,
        normalizedValue: email.toLowerCase().trim(),
        metadata: {
          type: 'Email',
          domain: email.split('@')[1],
        },
      };
    } catch (error) {
      this.logger.error(`Email validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Email validation failed',
      };
    }
  }

  /**
   * Validates phone number (Polish format)
   */
  validatePhoneNumber(phoneNumber: string): ValidationResult {
    try {
      // Remove all non-digit characters except +
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');

      // Check for Polish mobile/international format
      const mobileRegex = /^\+?48\d{9}$/;
      const landlineRegex = /^\+?48\d{7,8}$/;

      if (!mobileRegex.test(cleanPhone) && !landlineRegex.test(cleanPhone)) {
        return {
          isValid: false,
          error: 'Invalid Polish phone number format',
        };
      }

      return {
        isValid: true,
        normalizedValue: cleanPhone,
        metadata: {
          type: 'Phone',
          country: 'PL',
          isMobile: mobileRegex.test(cleanPhone),
        },
      };
    } catch (error) {
      this.logger.error(`Phone validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Phone validation failed',
      };
    }
  }

  /**
   * Validates postal code (Polish format)
   */
  validatePostalCode(postalCode: string): ValidationResult {
    try {
      // Remove spaces and convert to uppercase
      const cleanCode = postalCode.replace(/\s/g, '').toUpperCase();

      // Polish postal code format: XX-XXX
      const postalRegex = /^\d{2}-\d{3}$/;

      if (!postalRegex.test(cleanCode)) {
        return {
          isValid: false,
          error: 'Invalid Polish postal code format (use XX-XXX)',
        };
      }

      return {
        isValid: true,
        normalizedValue: cleanCode,
        metadata: {
          type: 'PostalCode',
          country: 'PL',
        },
      };
    } catch (error) {
      this.logger.error(`Postal code validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Postal code validation failed',
      };
    }
  }

  /**
   * Validates tax identification number for different countries
   */
  validateTaxId(taxId: string, countryCode: string = 'PL'): ValidationResult {
    try {
      switch (countryCode.toUpperCase()) {
        case 'PL':
          return this.validateNIP(taxId);
        default:
          return {
            isValid: false,
            error: `Tax ID validation not supported for country: ${countryCode}`,
          };
      }
    } catch (error) {
      this.logger.error(`Tax ID validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Tax ID validation failed',
      };
    }
  }

  /**
   * Helper methods
   */
  private getIBANLength(countryCode: string): number {
    const ibanLengths: Record<string, number> = {
      'AL': 28, 'AD': 24, 'AT': 20, 'AZ': 28, 'BH': 22, 'BE': 16, 'BA': 20,
      'BG': 22, 'HR': 21, 'CY': 28, 'CZ': 24, 'DK': 18, 'EE': 20, 'FO': 18,
      'FI': 18, 'FR': 27, 'GE': 22, 'DE': 22, 'GI': 23, 'GR': 27, 'GL': 18,
      'HU': 28, 'IS': 26, 'IE': 22, 'IL': 23, 'IT': 27, 'KZ': 20, 'KW': 30,
      'LV': 21, 'LB': 28, 'LI': 21, 'LT': 20, 'LU': 20, 'MT': 31, 'MC': 27,
      'ME': 22, 'NL': 18, 'NO': 15, 'PL': 28, 'PT': 25, 'RO': 24, 'SM': 27,
      'SA': 24, 'RS': 22, 'SK': 24, 'SI': 19, 'ES': 24, 'SE': 24, 'CH': 21,
      'TN': 24, 'TR': 26, 'GB': 22,
    };

    return ibanLengths[countryCode] || 0;
  }

  private lettersToNumbers(iban: string): string {
    let result = '';

    for (let i = 0; i < iban.length; i++) {
      const char = iban[i];
      if (/[A-Z]/.test(char)) {
        result += (char.charCodeAt(0) - 55).toString();
      } else {
        result += char;
      }
    }

    return result;
  }

  private isValidIBANChecksum(numericIBAN: string): boolean {
    const bigNumber = BigInt(numericIBAN);
    return bigNumber % BigInt(97) === BigInt(1);
  }
}

/**
 * Class validator decorators
 */
export function IsValidNIP(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidNIP',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          const validationService = new ValidationService();
          return validationService.validateNIP(value).isValid;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid Polish NIP number`;
        },
      },
    });
  };
}

export function IsValidIBAN(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidIBAN',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          const validationService = new ValidationService();
          return validationService.validateIBAN(value).isValid;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid IBAN`;
        },
      },
    });
  };
}

export function IsValidPESEL(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidPESEL',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          const validationService = new ValidationService();
          return validationService.validatePESEL(value).isValid;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid Polish PESEL number`;
        },
      },
    });
  };
}

export function IsValidEmailCustom(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidEmailCustom',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          const validationService = new ValidationService();
          return validationService.validateEmail(value).isValid;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid email address`;
        },
      },
    });
  };
}