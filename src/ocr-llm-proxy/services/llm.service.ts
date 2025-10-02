import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceOcrResultDto, ConfidenceLevel, InvoiceType } from '../dto/invoice-ocr.dto';
import { DataMaskingService } from './data-masking.service';

export interface LlmProcessingRequest {
  ocrText: string;
  imageMetadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
  userId?: string;
  companyId?: string;
}

export interface LlmProcessingResponse {
  success: boolean;
  normalizedData?: InvoiceOcrResultDto;
  confidence?: number;
  processingTime?: number;
  error?: string;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    cost?: number;
  };
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly openaiApiKey: string;
  private readonly useMockLlm: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataMaskingService: DataMaskingService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.useMockLlm = this.configService.get<boolean>('USE_MOCK_LLM', true);
  }

  /**
   * Process OCR text using LLM for invoice classification and normalization
   */
  async processInvoiceWithLlm(request: LlmProcessingRequest): Promise<LlmProcessingResponse> {
    const startTime = Date.now();

    try {
      this.logger.log('Starting LLM processing for invoice data');

      // Mask sensitive data before sending to LLM
      const maskedOcrText = this.dataMaskingService.maskSensitiveData(request.ocrText);

      let normalizedData: InvoiceOcrResultDto;

      if (this.useMockLlm) {
        // Use mock LLM for development/testing
        normalizedData = await this.processWithMockLlm(maskedOcrText);
      } else {
        // Use actual OpenAI API
        normalizedData = await this.processWithOpenAI(maskedOcrText);
      }

      const processingTime = Date.now() - startTime;

      this.logger.log(`LLM processing completed in ${processingTime}ms`);

      return {
        success: true,
        normalizedData,
        confidence: normalizedData.confidenceScore,
        processingTime,
        metadata: {
          model: this.useMockLlm ? 'mock-llm' : 'gpt-4',
          tokensUsed: this.estimateTokens(maskedOcrText),
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Error during LLM processing', error);

      return {
        success: false,
        processingTime,
        error: error.message || 'LLM processing failed'
      };
    }
  }

  /**
   * Process with mock LLM for development/testing
   */
  private async processWithMockLlm(ocrText: string): Promise<InvoiceOcrResultDto> {
    this.logger.warn('Using mock LLM processing');

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract basic information using regex patterns
    const mockResult = this.extractWithRegex(ocrText);

    return {
      ...mockResult,
      overallConfidence: (mockResult.confidenceScore ?? 0) >= 0.8 ? ConfidenceLevel.HIGH :
                        (mockResult.confidenceScore ?? 0) >= 0.6 ? ConfidenceLevel.MEDIUM :
                        ConfidenceLevel.LOW,
      processingNotes: 'Mock LLM processing - manual verification recommended',
      rawText: ocrText,
    };
  }

  /**
   * Process with OpenAI API
   */
  private async processWithOpenAI(ocrText: string): Promise<InvoiceOcrResultDto> {
    // This would integrate with actual OpenAI API
    // For now, return mock result
    this.logger.warn('OpenAI integration not implemented - using mock processing');

    return this.processWithMockLlm(ocrText);
  }

  /**
   * Extract invoice data using regex patterns (fallback method)
   */
  private extractWithRegex(ocrText: string): Partial<InvoiceOcrResultDto> {
    const cleanText = this.preprocessText(ocrText);

    const amounts = this.extractAmounts(cleanText);

    return {
      invoiceNumber: this.extractInvoiceNumber(cleanText),
      issueDate: this.extractDate(cleanText, ['data wystawienia', 'wystawiono dnia', 'date of issue']),
      saleDate: this.extractDate(cleanText, ['data sprzedaży', 'sprzedaży dnia', 'date of sale']),
      dueDate: this.extractDate(cleanText, ['termin płatności', 'zapłaty do', 'due date']),
      type: this.extractInvoiceType(cleanText),
      seller: this.extractSellerInfo(cleanText),
      buyer: this.extractBuyerInfo(cleanText),
      items: this.extractInvoiceItems(cleanText),
      ...amounts,
      currency: this.extractCurrency(cleanText),
      paymentMethod: this.extractPaymentMethod(cleanText),
      confidenceScore: this.calculateMockConfidence(cleanText),
    };
  }

  /**
   * Preprocess text for better extraction
   */
  private preprocessText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\s]/g, '')
      .trim();
  }

  /**
   * Extract invoice number
   */
  private extractInvoiceNumber(text: string): string | undefined {
    const patterns = [
      /(?:numer|nr|n°|no\.?|invoice\s*#?|faktura\s*#?)\s*:?\s*([A-Za-z0-9/-]+)/i,
      /(?:FV|FA|FS)\s*[:/-]?\s*(\d+(?:\/\d+)?)/i,
      /(?:faktura|invoice)\s+v\s*:?\s*([A-Za-z0-9/-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  /**
   * Extract date information
   */
  private extractDate(text: string, keywords: string[]): Date | undefined {
    const datePattern = /(\d{1,2})[.-/](\d{1,2})[.-/](\d{4})/g;
    let match;

    while ((match = datePattern.exec(text)) !== null) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);

      const beforeMatch = text.substring(0, match.index);
      const hasKeyword = keywords.some(keyword =>
        beforeMatch.toLowerCase().includes(keyword.toLowerCase())
      );

      if (hasKeyword && day > 0 && day <= 31 && month > 0 && month <= 12) {
        return new Date(year, month - 1, day);
      }
    }

    return undefined;
  }

  /**
   * Extract invoice type
   */
  private extractInvoiceType(text: string): InvoiceType | undefined {
    if (text.toLowerCase().includes('faktura vat') || text.toLowerCase().includes('vat invoice')) {
      return InvoiceType.VAT;
    }
    if (text.toLowerCase().includes('proforma') || text.toLowerCase().includes('pro-forma')) {
      return InvoiceType.PROFORMA;
    }
    if (text.toLowerCase().includes('korekta') || text.toLowerCase().includes('corrective')) {
      return InvoiceType.CORRECTIVE;
    }
    if (text.toLowerCase().includes('paragon') || text.toLowerCase().includes('receipt')) {
      return InvoiceType.RECEIPT;
    }
    return InvoiceType.VAT; // Default
  }

  /**
   * Extract seller information
   */
  private extractSellerInfo(text: string): any {
    const sellerKeywords = ['sprzedawca', 'wystawca', 'seller', 'od'];
    return this.extractPartyInfo(text, sellerKeywords);
  }

  /**
   * Extract buyer information
   */
  private extractBuyerInfo(text: string): any {
    const buyerKeywords = ['kupujący', 'nabywca', 'buyer', 'do'];
    return this.extractPartyInfo(text, buyerKeywords);
  }

  /**
   * Extract party information (seller/buyer)
   */
  private extractPartyInfo(text: string, keywords: string[]): any {
    const lines = text.split('\n');
    let partyInfo: any = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const hasKeyword = keywords.some(keyword =>
        line.toLowerCase().includes(keyword.toLowerCase())
      );

      if (hasKeyword) {
        // Look for NIP pattern
        const nipMatch = line.match(/(\d{10})/);
        if (nipMatch) {
          partyInfo.nip = nipMatch[1];
        }

        // Look for email pattern
        const emailMatch = line.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/);
        if (emailMatch) {
          partyInfo.email = emailMatch[1];
        }

        // Look for phone pattern
        const phoneMatch = line.match(/(\d{3}[-\s]?\d{3}[-\s]?\d{3})/);
        if (phoneMatch) {
          partyInfo.phone = phoneMatch[1];
        }

        // Extract name (basic pattern)
        const nameMatch = line.match(/([A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+)/);
        if (nameMatch && !nameMatch[1].match(/\d{3,}/)) {
          partyInfo.name = nameMatch[1].trim();
        }

        // Look for address in next few lines
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const addressLine = lines[j].trim();
          if (addressLine && !addressLine.match(/^\d/) && addressLine.length > 10) {
            partyInfo.address = addressLine;
            break;
          }
        }

        break;
      }
    }

    return Object.keys(partyInfo).length > 0 ? partyInfo : undefined;
  }

  /**
   * Extract invoice items
   */
  private extractInvoiceItems(text: string): any[] {
    const items: any[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.length > 10 && line.length < 100) {
        const numbers = line.match(/(\d+[,.]\d+|\d+)/g);
        if (numbers && numbers.length >= 2) {
          const price = parseFloat(numbers[numbers.length - 1].replace(',', '.'));
          items.push({
            name: line.trim(),
            quantity: 1,
            unitPrice: price,
            totalPrice: price
          });
        }
      }
    }

    return items.slice(0, 20);
  }

  /**
   * Extract amounts (net, VAT, gross)
   */
  private extractAmounts(text: string): { netAmount?: number; vatAmount?: number; grossAmount?: number } {
    const amounts: { netAmount?: number; vatAmount?: number; grossAmount?: number } = {};

    // Gross amount patterns (most reliable)
    const grossPatterns = [
      /(?:brutto|gross|razem|total|do\s+zapłaty|to\s+pay)\s*:?\s*(\d+[,.]\d+)/i,
    ];

    for (const pattern of grossPatterns) {
      const match = text.match(pattern);
      if (match) {
        amounts.grossAmount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Net amount patterns
    const netPatterns = [
      /(?:netto|net)\s*:?\s*(\d+[,.]\d+)/i,
    ];

    for (const pattern of netPatterns) {
      const match = text.match(pattern);
      if (match) {
        amounts.netAmount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // VAT amount patterns
    const vatPatterns = [
      /(?:vat|podatek|tax)\s*:?\s*(\d+[,.]\d+)/i,
    ];

    for (const pattern of vatPatterns) {
      const match = text.match(pattern);
      if (match) {
        amounts.vatAmount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    return Object.keys(amounts).length > 0 ? amounts : {};
  }

  /**
   * Extract currency information
   */
  private extractCurrency(text: string): string | undefined {
    const currencyPatterns = [
      /(?:waluta|currency)\s*:?\s*([A-Z]{3})/i,
      /(\bPLN\b|\bEUR\b|\bUSD\b|\bGBP\b)/i,
    ];

    for (const pattern of currencyPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return 'PLN';
  }

  /**
   * Extract payment method
   */
  private extractPaymentMethod(text: string): string | undefined {
    const paymentPatterns = [
      /(?:sposób\s+płatności|payment\s+method)\s*:?\s*([^,\n]+)/i,
      /(\bprzelew\b|\bgotówka\b|\bkarta\b|\bcash\b|\btransfer\b)/i,
    ];

    for (const pattern of paymentPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return undefined;
  }

  /**
   * Calculate mock confidence score
   */
  private calculateMockConfidence(text: string): number {
    let score = 0.5; // Base score

    // Increase score based on text quality indicators
    if (text.length > 200) score += 0.1;
    if (text.includes('PLN') || text.includes('zł')) score += 0.1;
    if (/\d{10}/.test(text)) score += 0.1; // NIP pattern
    if (/faktura|invoice/i.test(text)) score += 0.1;
    if (/sprzedawca|seller|kupujący|buyer/i.test(text)) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Estimate token count for cost calculation
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get standardized prompt for invoice processing
   */
  getStandardizedPrompt(): string {
    return `
You are an expert invoice processing assistant specializing in Polish invoices (faktury).

Your task is to extract and normalize invoice data from OCR text according to the following JSON schema:

{
  "type": "object",
  "properties": {
    "invoiceNumber": {"type": "string"},
    "issueDate": {"type": "string", "format": "date"},
    "saleDate": {"type": "string", "format": "date"},
    "dueDate": {"type": "string", "format": "date"},
    "type": {"type": "string", "enum": ["VAT", "PROFORMA", "CORRECTIVE", "RECEIPT"]},
    "seller": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "address": {"type": "string"},
        "nip": {"type": "string"},
        "phone": {"type": "string"},
        "email": {"type": "string"}
      }
    },
    "buyer": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "address": {"type": "string"},
        "nip": {"type": "string"},
        "phone": {"type": "string"},
        "email": {"type": "string"}
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "quantity": {"type": "number"},
          "unitPrice": {"type": "number"},
          "vatRate": {"type": "number"},
          "totalPrice": {"type": "number"}
        },
        "required": ["name", "quantity", "unitPrice", "totalPrice"]
      }
    },
    "netAmount": {"type": "number"},
    "vatAmount": {"type": "number"},
    "grossAmount": {"type": "number"},
    "currency": {"type": "string"},
    "paymentMethod": {"type": "string"}
  },
  "required": ["invoiceNumber", "grossAmount", "currency"]
}

IMPORTANT INSTRUCTIONS:
1. Extract ONLY the information that is clearly present in the text
2. Use null for missing information, do not guess or fabricate data
3. Normalize dates to ISO format (YYYY-MM-DD)
4. Normalize amounts to numbers (remove currency symbols)
5. Identify invoice type based on document content
6. Extract both seller (sprzedawca/wystawca) and buyer (kupujący/nabywca) information
7. For items, focus on clear product/service descriptions with quantities and prices
8. Default currency to "PLN" if not specified
9. Return valid JSON only, no additional text or explanations

OCR TEXT TO PROCESS:
`;
  }
}