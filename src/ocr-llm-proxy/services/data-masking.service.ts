import { Injectable } from '@nestjs/common';

@Injectable()
export class DataMaskingService {
  private readonly sensitivePatterns = {
    // Polish NIP (tax identification number) - 10 digits
    nip: /\b\d{10}\b/g,
    // Polish PESEL (personal identification number) - 11 digits
    pesel: /\b\d{11}\b/g,
    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers (Polish format)
    phone: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
    // Bank account numbers (26 digits for IBAN PL format)
    bankAccount: /\bPL\d{24}\b/g,
    // Credit card numbers
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // Personal names (basic pattern)
    personalName: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
    // Addresses with street numbers
    address: /\b[A-Za-z\s]+\s+\d+[A-Za-z]?(\/\d+)?\b/g,
  };

  private readonly maskPatterns = {
    nip: '***-***-**',
    pesel: '***-***-***',
    email: (match: string) => {
      const [local, domain] = match.split('@');
      return `${local.charAt(0)}***@${domain}`;
    },
    phone: '***-***-***',
    bankAccount: 'PL*******************',
    creditCard: '****-****-****-****',
    personalName: (match: string) => {
      const parts = match.split(' ');
      return parts.map(part => part.charAt(0) + '*'.repeat(part.length - 1)).join(' ');
    },
    address: (match: string) => {
      return match.replace(/\d+[A-Za-z]?(\/\d+)?/g, '***');
    },
  };

  /**
   * Mask sensitive data in a text string
   */
  maskSensitiveData(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let maskedText = text;

    // Apply each masking pattern
    Object.entries(this.sensitivePatterns).forEach(([key, pattern]) => {
      maskedText = maskedText.replace(pattern, (match) => {
        const maskFn = this.maskPatterns[key as keyof typeof this.maskPatterns];
        if (typeof maskFn === 'function') {
          return maskFn(match);
        }
        return maskFn;
      });
    });

    return maskedText;
  }

  /**
   * Mask sensitive data in an object recursively
   */
  maskObjectSensitiveData(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.maskSensitiveData(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskObjectSensitiveData(item));
    }

    if (typeof obj === 'object') {
      const maskedObj: any = {};

      Object.keys(obj).forEach(key => {
        // Skip masking certain fields that are needed for processing
        if (this.shouldSkipMasking(key)) {
          maskedObj[key] = obj[key];
        } else {
          maskedObj[key] = this.maskObjectSensitiveData(obj[key]);
        }
      });

      return maskedObj;
    }

    return obj;
  }

  /**
   * Check if a field should be skipped during masking
   */
  private shouldSkipMasking(fieldName: string): boolean {
    const skipFields = [
      'id',
      'requestId',
      'status',
      'createdAt',
      'updatedAt',
      'confidenceScore',
      'overallConfidence',
      'invoiceNumber',
      'issueDate',
      'saleDate',
      'dueDate',
      'netAmount',
      'vatAmount',
      'grossAmount',
      'currency',
      'vatRate',
      'quantity',
      'unitPrice',
      'totalPrice',
      'type',
      'paymentMethod',
      'description',
      'processingNotes',
      'mimeType',
      'userId',
      'companyId'
    ];

    return skipFields.includes(fieldName.toLowerCase());
  }

  /**
   * Create a safe log entry by masking sensitive data
   */
  createSafeLogEntry(data: any, operation: string): any {
    const timestamp = new Date().toISOString();
    const maskedData = this.maskObjectSensitiveData(data);

    return {
      timestamp,
      operation,
      data: maskedData,
      // Include metadata for debugging without sensitive info
      metadata: {
        hasSensitiveData: this.containsSensitiveData(JSON.stringify(data)),
        dataSize: JSON.stringify(data).length,
        operationType: operation
      }
    };
  }

  /**
   * Check if text contains sensitive data patterns
   */
  private containsSensitiveData(text: string): boolean {
    return Object.values(this.sensitivePatterns).some(pattern =>
      pattern.test(text)
    );
  }

  /**
   * Anonymize invoice data for storage/logging
   */
  anonymizeInvoiceData(invoiceData: any): any {
    const anonymized = { ...invoiceData };

    // Anonymize seller information
    if (anonymized.seller) {
      anonymized.seller = {
        ...anonymized.seller,
        nip: this.maskSensitiveData(anonymized.seller.nip || ''),
        phone: this.maskSensitiveData(anonymized.seller.phone || ''),
        email: this.maskSensitiveData(anonymized.seller.email || ''),
        name: this.maskSensitiveData(anonymized.seller.name || ''),
        address: this.maskSensitiveData(anonymized.seller.address || '')
      };
    }

    // Anonymize buyer information
    if (anonymized.buyer) {
      anonymized.buyer = {
        ...anonymized.buyer,
        nip: this.maskSensitiveData(anonymized.buyer.nip || ''),
        phone: this.maskSensitiveData(anonymized.buyer.phone || ''),
        email: this.maskSensitiveData(anonymized.buyer.email || ''),
        name: this.maskSensitiveData(anonymized.buyer.name || ''),
        address: this.maskSensitiveData(anonymized.buyer.address || '')
      };
    }

    // Anonymize raw text if present
    if (anonymized.rawText) {
      anonymized.rawText = this.maskSensitiveData(anonymized.rawText);
    }

    return anonymized;
  }
}