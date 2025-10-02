import { Injectable, Logger } from '@nestjs/common';
import { InvoiceOcrResultDto, ConfidenceLevel } from '../dto/invoice-ocr.dto';
import { DataMaskingService } from './data-masking.service';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly dataMaskingService: DataMaskingService) {}

  /**
   * Process invoice image using OCR
   */
  async processInvoiceImage(imageBuffer: Buffer, mimeType: string): Promise<InvoiceOcrResultDto> {
    try {
      this.logger.log('Starting OCR processing for invoice image');

      // Convert buffer to base64 for Tesseract.js
      const imageBase64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      // Perform OCR using Tesseract.js
      const ocrResult = await this.performOcr(imageBase64);

      // Extract and structure invoice data
      const structuredData = await this.extractInvoiceData(ocrResult.text);

      this.logger.log('OCR processing completed successfully');
      return structuredData;

    } catch (error) {
      this.logger.error('Error during OCR processing', error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Perform OCR using Tesseract.js
   */
  private async performOcr(imageData: string): Promise<{ text: string; confidence: number }> {
    try {
      // For now, return mock OCR result since Tesseract.js requires additional setup
      // In production, this would use actual Tesseract.js worker
      this.logger.warn('Using mock OCR result - Tesseract.js integration needed');

      return {
        text: 'Mock OCR text extraction - Tesseract.js integration required',
        confidence: 0.8
      };
    } catch (error) {
      this.logger.error('Tesseract OCR failed', error);
      throw error;
    }
  }

  /**
   * Extract structured invoice data from OCR text
   */
  private async extractInvoiceData(ocrText: string): Promise<InvoiceOcrResultDto> {
    const maskedText = this.dataMaskingService.maskSensitiveData(ocrText);

    // Basic text preprocessing
    const cleanText = this.preprocessText(maskedText);

    // Extract invoice components using regex patterns
    const extractedData = {
      invoiceNumber: this.extractInvoiceNumber(cleanText),
      issueDate: this.extractDate(cleanText, ['data wystawienia', 'wystawiono dnia', 'invoice date']),
      saleDate: this.extractDate(cleanText, ['data sprzedaży', 'sprzedaży dnia', 'sale date']),
      dueDate: this.extractDate(cleanText, ['termin płatności', 'zapłaty do', 'due date']),
      seller: this.extractSellerInfo(cleanText),
      buyer: this.extractBuyerInfo(cleanText),
      items: this.extractInvoiceItems(cleanText),
      amounts: this.extractAmounts(cleanText),
      currency: this.extractCurrency(cleanText),
      paymentMethod: this.extractPaymentMethod(cleanText),
      rawText: maskedText,
    };

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(extractedData, cleanText);

    // Determine overall confidence level
    const overallConfidence = this.determineConfidenceLevel(confidenceScore);

    return {
      ...extractedData,
      overallConfidence,
      confidenceScore,
      processingNotes: this.generateProcessingNotes(extractedData, confidenceScore),
    } as InvoiceOcrResultDto;
  }

  /**
   * Preprocess OCR text for better extraction
   */
  private preprocessText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\x20-\x7E\s]/g, '') // Remove non-printable characters
      .trim();
  }

  /**
   * Extract invoice number using regex patterns
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
   * Extract date information from text
   */
  private extractDate(text: string, keywords: string[]): Date | undefined {
    const datePattern = /(\d{1,2})[.-/](\d{1,2})[.-/](\d{4})/g;
    let match;

    while ((match = datePattern.exec(text)) !== null) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);

      // Check if date is preceded by relevant keywords
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
      // Look for lines that might be items (contain numbers and reasonable length)
      if (line.length > 10 && line.length < 100) {
        const numbers = line.match(/(\d+[,.]\d+|\d+)/g);
        if (numbers && numbers.length >= 2) {
          items.push({
            name: line.trim(),
            quantity: 1, // Default quantity
            unitPrice: parseFloat(numbers[numbers.length - 1].replace(',', '.')),
            totalPrice: parseFloat(numbers[numbers.length - 1].replace(',', '.'))
          });
        }
      }
    }

    return items.slice(0, 20); // Limit to reasonable number of items
  }

  /**
   * Extract amounts (net, VAT, gross)
   */
  private extractAmounts(text: string): any {
    const amounts: any = {};

    // Net amount patterns
    const netPatterns = [
      /(?:netto|net)\s*:?\s*(\d+[,.]\d+)/i,
      /(?:wartość|value)\s*:?\s*(\d+[,.]\d+)/i,
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
      /(?:vat|podatek)\s*:?\s*(\d+[,.]\d+)/i,
      /(?:tax|vat\s*amount)\s*:?\s*(\d+[,.]\d+)/i,
    ];

    for (const pattern of vatPatterns) {
      const match = text.match(pattern);
      if (match) {
        amounts.vatAmount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Gross amount patterns
    const grossPatterns = [
      /(?:brutto|gross)\s*:?\s*(\d+[,.]\d+)/i,
      /(?:razem|total)\s*:?\s*(\d+[,.]\d+)/i,
      /(?:do\s+zapłaty|to\s+pay)\s*:?\s*(\d+[,.]\d+)/i,
    ];

    for (const pattern of grossPatterns) {
      const match = text.match(pattern);
      if (match) {
        amounts.grossAmount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    return Object.keys(amounts).length > 0 ? amounts : undefined;
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

    return 'PLN'; // Default to Polish Złoty
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
   * Calculate confidence score based on extracted data quality
   */
  private calculateConfidenceScore(extractedData: any, originalText: string): number {
    let score = 0;
    let factors = 0;

    // Invoice number factor
    if (extractedData.invoiceNumber) {
      score += 0.2;
      factors += 0.2;
    }

    // Date factors
    if (extractedData.issueDate) {
      score += 0.15;
      factors += 0.15;
    }

    // Amount factors
    if (extractedData.amounts) {
      if (extractedData.amounts.grossAmount) score += 0.2;
      if (extractedData.amounts.netAmount) score += 0.15;
      if (extractedData.amounts.vatAmount) score += 0.1;
      factors += 0.45;
    }

    // Party information factors
    if (extractedData.seller) {
      if (extractedData.seller.nip) score += 0.15;
      if (extractedData.seller.name) score += 0.1;
      factors += 0.25;
    }

    // Items factor
    if (extractedData.items && extractedData.items.length > 0) {
      score += 0.1;
      factors += 0.1;
    }

    // Text quality factor (based on length and structure)
    if (originalText.length > 100) {
      score += 0.05;
      factors += 0.05;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Determine overall confidence level
   */
  private determineConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.8) return ConfidenceLevel.HIGH;
    if (score >= 0.6) return ConfidenceLevel.MEDIUM;
    return ConfidenceLevel.LOW;
  }

  /**
   * Generate processing notes
   */
  private generateProcessingNotes(extractedData: any, confidenceScore: number): string {
    const notes: string[] = [];

    if (confidenceScore < 0.6) {
      notes.push('Low confidence - manual verification recommended');
    }

    if (!extractedData.invoiceNumber) {
      notes.push('Invoice number not found');
    }

    if (!extractedData.amounts?.grossAmount) {
      notes.push('Total amount not found');
    }

    if (!extractedData.seller?.nip) {
      notes.push('Seller NIP not found');
    }

    if (notes.length === 0) {
      notes.push('Processing completed successfully');
    }

    return notes.join('; ');
  }
}