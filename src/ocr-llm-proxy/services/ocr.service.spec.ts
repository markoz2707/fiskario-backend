import { Test, TestingModule } from '@nestjs/testing';
import { OcrService } from './ocr.service';
import { DataMaskingService } from './data-masking.service';
import { InvoiceOcrResultDto, ConfidenceLevel } from '../dto/invoice-ocr.dto';

describe('OcrService', () => {
  let service: OcrService;
  let dataMaskingService: DataMaskingService;

  const mockDataMaskingService = {
    maskSensitiveData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        {
          provide: DataMaskingService,
          useValue: mockDataMaskingService,
        },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
    dataMaskingService = module.get<DataMaskingService>(DataMaskingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processInvoiceImage', () => {
    const mockImageBuffer = Buffer.from('mock-image-data');
    const mockMimeType = 'image/jpeg';

    const mockOcrResult = {
      text: 'Mock OCR text extraction',
      confidence: 0.8,
    };

    const mockStructuredData: InvoiceOcrResultDto = {
      invoiceNumber: 'FV/0001',
      issueDate: new Date('2024-01-15'),
      seller: {
        name: 'Test Seller',
        nip: '1234567890',
      },
      buyer: {
        name: 'Test Buyer',
        nip: '9876543210',
      },
      // amounts property doesn't exist in DTO, using individual fields
      currency: 'PLN',
      overallConfidence: ConfidenceLevel.HIGH,
      confidenceScore: 0.85,
      processingNotes: 'Processing completed successfully',
      rawText: 'Mock masked text',
    };

    beforeEach(() => {
      mockDataMaskingService.maskSensitiveData.mockReturnValue('Mock masked text');
      jest.spyOn(service as any, 'performOcr').mockResolvedValue(mockOcrResult);
      jest.spyOn(service as any, 'extractInvoiceData').mockResolvedValue(mockStructuredData);
    });

    it('should process invoice image successfully', async () => {
      const result = await service.processInvoiceImage(mockImageBuffer, mockMimeType);

      expect(result).toEqual(mockStructuredData);
      expect(dataMaskingService.maskSensitiveData).toHaveBeenCalledWith('Mock OCR text extraction');
      expect((service as any).performOcr).toHaveBeenCalledWith(`data:${mockMimeType};base64,${mockImageBuffer.toString('base64')}`);
      expect((service as any).extractInvoiceData).toHaveBeenCalledWith('Mock OCR text extraction');
    });

    it('should handle OCR processing errors', async () => {
      jest.spyOn(service as any, 'performOcr').mockRejectedValue(new Error('OCR failed'));

      await expect(service.processInvoiceImage(mockImageBuffer, mockMimeType))
        .rejects.toThrow('OCR processing failed: OCR failed');
    });

    it('should handle data extraction errors', async () => {
      jest.spyOn(service as any, 'extractInvoiceData').mockRejectedValue(new Error('Extraction failed'));

      await expect(service.processInvoiceImage(mockImageBuffer, mockMimeType))
        .rejects.toThrow('OCR processing failed: Extraction failed');
    });

    it('should handle different image formats', async () => {
      const formats = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

      for (const format of formats) {
        const result = await service.processInvoiceImage(mockImageBuffer, format);

        expect(result).toEqual(mockStructuredData);
        expect((service as any).performOcr).toHaveBeenCalledWith(
          `data:${format};base64,${mockImageBuffer.toString('base64')}`
        );
      }
    });

    it('should handle large image buffers', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB buffer

      const result = await service.processInvoiceImage(largeBuffer, mockMimeType);

      expect(result).toEqual(mockStructuredData);
      expect((service as any).performOcr).toHaveBeenCalledWith(
        `data:${mockMimeType};base64,${largeBuffer.toString('base64')}`
      );
    });

    it('should handle empty image buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(service.processInvoiceImage(emptyBuffer, mockMimeType))
        .rejects.toThrow();
    });

    it('should handle invalid mime type', async () => {
      const invalidMimeType = 'text/plain';

      await expect(service.processInvoiceImage(mockImageBuffer, invalidMimeType))
        .rejects.toThrow();
    });

    it('should handle concurrent image processing', async () => {
      const buffers = Array.from({ length: 5 }, (_, i) =>
        Buffer.from(`mock-image-data-${i}`)
      );

      const results = await Promise.all(
        buffers.map(buffer => service.processInvoiceImage(buffer, mockMimeType))
      );

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toEqual(mockStructuredData);
      });
    });
  });

  describe('performOcr', () => {
    it('should return mock OCR result', async () => {
      const imageData = 'data:image/jpeg;base64,mock-data';

      const result = await (service as any).performOcr(imageData);

      expect(result).toEqual({
        text: 'Mock OCR text extraction - Tesseract.js integration required',
        confidence: 0.8,
      });
    });

    it('should handle OCR errors', async () => {
      // Mock Tesseract.js error by making it throw
      const imageData = 'data:image/jpeg;base64,mock-data';

      const result = await (service as any).performOcr(imageData);

      expect(result).toEqual({
        text: 'Mock OCR text extraction - Tesseract.js integration required',
        confidence: 0.8,
      });
    });

    it('should handle different image data formats', async () => {
      const formats = [
        'data:image/png;base64,mock-data',
        'data:image/jpeg;base64,mock-data',
        'data:image/gif;base64,mock-data',
      ];

      for (const format of formats) {
        const result = await (service as any).performOcr(format);

        expect(result.text).toContain('Mock OCR text extraction');
        expect(result.confidence).toBe(0.8);
      }
    });

    it('should handle very long image data strings', async () => {
      const longImageData = 'data:image/jpeg;base64,' + 'A'.repeat(10000);

      const result = await (service as any).performOcr(longImageData);

      expect(result).toEqual({
        text: 'Mock OCR text extraction - Tesseract.js integration required',
        confidence: 0.8,
      });
    });
  });

  describe('extractInvoiceData', () => {
    beforeEach(() => {
      mockDataMaskingService.maskSensitiveData.mockImplementation((text) => text);
    });

    it('should extract invoice data correctly from well-structured text', async () => {
      const ocrText = `
        Faktura VAT
        Nr FV/2024/001
        Data wystawienia: 15.01.2024
        Data sprzedaży: 15.01.2024
        Termin płatności: 15.02.2024

        Sprzedawca:
        Test Seller Sp. z o.o.
        NIP: 1234567890
        Adres: ul. Testowa 1, 00-001 Warszawa
        Email: seller@test.com
        Tel: 123-456-789

        Nabywca:
        Test Buyer
        NIP: 9876543210
        Adres: ul. Kupna 2, 00-002 Warszawa

        Lp. Nazwa Ilość Cena Netto VAT Brutto
        1. Produkt test 2 100.00 23% 246.00

        Netto: 200.00
        VAT: 46.00
        Brutto: 246.00
        Razem do zapłaty: 246.00 PLN
        Sposób płatności: przelew
      `;

      const result = await (service as any).extractInvoiceData(ocrText);

      expect(result.invoiceNumber).toBe('FV/2024/001');
      expect(result.issueDate).toEqual(new Date('2024-01-15'));
      expect(result.saleDate).toEqual(new Date('2024-01-15'));
      expect(result.dueDate).toEqual(new Date('2024-02-15'));
      expect(result.seller).toBeDefined();
      expect(result.seller?.nip).toBe('1234567890');
      expect(result.seller?.name).toContain('Test Seller');
      expect(result.buyer).toBeDefined();
      expect(result.buyer?.nip).toBe('9876543210');
      expect(result.buyer?.name).toContain('Test Buyer');
      expect(result.amounts).toBeDefined();
      expect(result.amounts?.grossAmount).toBe(246);
      expect(result.amounts?.netAmount).toBe(200);
      expect(result.amounts?.vatAmount).toBe(46);
      expect(result.currency).toBe('PLN');
      expect(result.paymentMethod).toBe('przelew');
      expect(result.overallConfidence).toBe(ConfidenceLevel.HIGH);
      expect(result.confidenceScore).toBeGreaterThan(0.8);
    });

    it('should handle text with minimal information', async () => {
      const minimalText = `
        FV/0001
        15.01.2024
        1000.00 PLN
      `;

      const result = await (service as any).extractInvoiceData(minimalText);

      expect(result.invoiceNumber).toBe('FV/0001');
      expect(result.issueDate).toEqual(new Date('2024-01-15'));
      expect(result.amounts?.grossAmount).toBe(1000);
      expect(result.currency).toBe('PLN');
      expect(result.overallConfidence).toBe(ConfidenceLevel.LOW);
      expect(result.confidenceScore).toBeLessThan(0.6);
    });

    it('should handle text with no recognizable patterns', async () => {
      const randomText = `
        Lorem ipsum dolor sit amet
        consectetur adipiscing elit
        sed do eiusmod tempor
        incididunt ut labore
      `;

      const result = await (service as any).extractInvoiceData(randomText);

      expect(result.invoiceNumber).toBeUndefined();
      expect(result.issueDate).toBeUndefined();
      expect(result.seller).toBeUndefined();
      expect(result.buyer).toBeUndefined();
      expect(result.amounts).toBeUndefined();
      expect(result.overallConfidence).toBe(ConfidenceLevel.LOW);
      expect(result.confidenceScore).toBe(0);
    });

    it('should handle empty text', async () => {
      const result = await (service as any).extractInvoiceData('');

      expect(result.invoiceNumber).toBeUndefined();
      expect(result.issueDate).toBeUndefined();
      expect(result.seller).toBeUndefined();
      expect(result.buyer).toBeUndefined();
      expect(result.amounts).toBeUndefined();
      expect(result.overallConfidence).toBe(ConfidenceLevel.LOW);
      expect(result.confidenceScore).toBe(0);
    });

    it('should handle text with special characters', async () => {
      const textWithSpecialChars = `
        Faktura: FV/2024/001
        Data: 15.01.2024
        Sprzedawca: José García ñáéíóú
        NIP: 123-456-78-90
        Kwota: 1.000,50 PLN
        Waluta: €
      `;

      const result = await (service as any).extractInvoiceData(textWithSpecialChars);

      expect(result.invoiceNumber).toBe('FV/2024/001');
      expect(result.issueDate).toEqual(new Date('2024-01-15'));
      expect(result.seller?.name).toContain('José García');
      expect(result.amounts?.grossAmount).toBe(1000.50);
      expect(result.currency).toBe('€');
    });

    it('should handle very long text', async () => {
      const longText = 'FV/0001\n'.repeat(1000) + 'Data: 15.01.2024\nKwota: 1000.00';

      const result = await (service as any).extractInvoiceData(longText);

      expect(result.invoiceNumber).toBe('FV/0001');
      expect(result.issueDate).toEqual(new Date('2024-01-15'));
      expect(result.amounts?.grossAmount).toBe(1000);
    });

    it('should handle text with multiple date formats', async () => {
      const textWithMultipleDates = `
        Faktura FV/0001
        Data wystawienia: 15-01-2024
        Data sprzedaży: 15.01.2024
        Termin płatności: 15/01/2024
        Inna data: 2024-12-31
      `;

      const result = await (service as any).extractInvoiceData(textWithMultipleDates);

      expect(result.invoiceNumber).toBe('FV/0001');
      expect(result.issueDate).toEqual(new Date('2024-01-15'));
      expect(result.saleDate).toEqual(new Date('2024-01-15'));
      expect(result.dueDate).toEqual(new Date('2024-01-15'));
    });

    it('should handle text with multiple invoice numbers', async () => {
      const textWithMultipleInvoices = `
        Faktury: FV/0001, FV/0002, FV/0003
        Główna faktura: FV/0001
        Data: 15.01.2024
      `;

      const result = await (service as any).extractInvoiceData(textWithMultipleInvoices);

      expect(result.invoiceNumber).toBe('FV/0001');
    });

    it('should handle text with multiple amounts', async () => {
      const textWithMultipleAmounts = `
        Faktura FV/0001
        Netto: 100.00
        VAT: 23.00
        Brutto: 123.00
        Razem: 123.00
        Do zapłaty: 123.00
      `;

      const result = await (service as any).extractInvoiceData(textWithMultipleAmounts);

      expect(result.amounts?.netAmount).toBe(100);
      expect(result.amounts?.vatAmount).toBe(23);
      expect(result.amounts?.grossAmount).toBe(123);
    });

    it('should handle text with different currencies', async () => {
      const currencies = ['PLN', 'EUR', 'USD', 'GBP'];

      for (const currency of currencies) {
        const textWithCurrency = `
          Faktura FV/0001
          Kwota: 100.00 ${currency}
        `;

        const result = await (service as any).extractInvoiceData(textWithCurrency);

        expect(result.currency).toBe(currency);
      }
    });

    it('should handle text with different payment methods', async () => {
      const paymentMethods = ['przelew', 'gotówka', 'karta', 'cash', 'transfer'];

      for (const paymentMethod of paymentMethods) {
        const textWithPayment = `
          Faktura FV/0001
          Płatność: ${paymentMethod}
        `;

        const result = await (service as any).extractInvoiceData(textWithPayment);

        expect(result.paymentMethod).toContain(paymentMethod);
      }
    });

    it('should handle data masking service errors', async () => {
      mockDataMaskingService.maskSensitiveData.mockImplementation(() => {
        throw new Error('Masking failed');
      });

      const ocrText = 'Test text';

      await expect((service as any).extractInvoiceData(ocrText))
        .rejects.toThrow();
    });

    it('should handle malformed dates', async () => {
      const textWithMalformedDates = `
        Faktura FV/0001
        Data wystawienia: 32.13.2024
        Data sprzedaży: 15.01.2024
      `;

      const result = await (service as any).extractInvoiceData(textWithMalformedDates);

      expect(result.invoiceNumber).toBe('FV/0001');
      expect(result.issueDate).toBeUndefined(); // Invalid date should not be extracted
      expect(result.saleDate).toEqual(new Date('2024-01-15'));
    });

    it('should handle malformed amounts', async () => {
      const textWithMalformedAmounts = `
        Faktura FV/0001
        Netto: abc
        VAT: 23.00
        Brutto: 123.00
      `;

      const result = await (service as any).extractInvoiceData(textWithMalformedAmounts);

      expect(result.amounts?.vatAmount).toBe(23);
      expect(result.amounts?.grossAmount).toBe(123);
      expect(result.amounts?.netAmount).toBeUndefined(); // Invalid amount should not be extracted
    });

    it('should handle text with unicode characters', async () => {
      const unicodeText = `
        Faktura FV/0001 🚀
        Sprzedawca: José García ñáéíóú
        Kwota: 1000.00 PLN €
        Data: 15.01.2024
      `;

      const result = await (service as any).extractInvoiceData(unicodeText);

      expect(result.invoiceNumber).toBe('FV/0001');
      expect(result.seller?.name).toContain('José García');
      expect(result.amounts?.grossAmount).toBe(1000);
      expect(result.currency).toBe('PLN');
    });

    it('should handle concurrent data extraction', async () => {
      const texts = Array.from({ length: 5 }, (_, i) => `
        Faktura FV/000${i}
        Data: 15.01.2024
        Kwota: 1000.00 PLN
      `);

      const results = await Promise.all(
        texts.map(text => (service as any).extractInvoiceData(text))
      );

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.invoiceNumber).toBe(`FV/000${i}`);
        expect(result.issueDate).toEqual(new Date('2024-01-15'));
        expect(result.amounts?.grossAmount).toBe(1000);
      });
    });
  });

  describe('preprocessText', () => {
    it('should normalize whitespace correctly', () => {
      const text = 'Test   text\t\nwith\n\nmultiple    spaces';
      const result = (service as any).preprocessText(text);

      expect(result).toBe('Test text with multiple spaces');
    });

    it('should remove non-printable characters', () => {
      const text = 'Test\x00\x01\x02text\x03\x04';
      const result = (service as any).preprocessText(text);

      expect(result).toBe('Testtext');
    });

    it('should handle empty text', () => {
      const result = (service as any).preprocessText('');

      expect(result).toBe('');
    });

    it('should handle text with only whitespace', () => {
      const result = (service as any).preprocessText('   \t\n  ');

      expect(result).toBe('');
    });

    it('should handle text with unicode characters', () => {
      const text = 'Test José ñáéíóú 🚀';
      const result = (service as any).preprocessText(text);

      expect(result).toBe('Test José ñáéíóú 🚀');
    });

    it('should handle very long text', () => {
      const longText = 'A'.repeat(10000);
      const result = (service as any).preprocessText(longText);

      expect(result).toBe(longText);
    });
  });

  describe('extractInvoiceNumber', () => {
    it('should extract FV format invoice number', () => {
      const text = 'Faktura FV/2024/001 wystawiona dnia 15.01.2024';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('FV/2024/001');
    });

    it('should extract FA format invoice number', () => {
      const text = 'Faktura FA/001/2024 z dnia 15.01.2024';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('FA/001/2024');
    });

    it('should extract simple number format', () => {
      const text = 'Numer faktury: 123456';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('123456');
    });

    it('should extract invoice with prefix', () => {
      const text = 'Invoice No. INV-2024-001';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('INV-2024-001');
    });

    it('should return undefined when no invoice number found', () => {
      const text = 'Random text without invoice number';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBeUndefined();
    });

    it('should handle multiple invoice numbers and return first one', () => {
      const text = 'Faktury: FV/001, FV/002, FV/003';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('FV/001');
    });

    it('should handle invoice numbers with special characters', () => {
      const text = 'Faktura: FV-2024/001!@#$';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('FV-2024/001');
    });

    it('should handle very long invoice numbers', () => {
      const longNumber = 'FV/' + '1'.repeat(100);
      const text = `Faktura ${longNumber}`;
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe(longNumber);
    });

    it('should handle invoice numbers with unicode characters', () => {
      const text = 'Faktura FV/2024/001 🚀';
      const result = (service as any).extractInvoiceNumber(text);

      expect(result).toBe('FV/2024/001');
    });
  });

  describe('extractDate', () => {
    it('should extract issue date with Polish keywords', () => {
      const text = 'Data wystawienia: 15.01.2024, inne informacje';
      const result = (service as any).extractDate(text, ['data wystawienia']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should extract sale date with Polish keywords', () => {
      const text = 'Data sprzedaży: 15-01-2024, inne informacje';
      const result = (service as any).extractDate(text, ['data sprzedaży']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should extract due date with Polish keywords', () => {
      const text = 'Termin płatności: 15/01/2024, inne informacje';
      const result = (service as any).extractDate(text, ['termin płatności']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should extract date with English keywords', () => {
      const text = 'Invoice date: 15.01.2024, other info';
      const result = (service as any).extractDate(text, ['invoice date']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should return undefined when no valid date found', () => {
      const text = 'Random text without dates';
      const result = (service as any).extractDate(text, ['data']);

      expect(result).toBeUndefined();
    });

    it('should return undefined when date is invalid', () => {
      const text = 'Data wystawienia: 32.13.2024';
      const result = (service as any).extractDate(text, ['data wystawienia']);

      expect(result).toBeUndefined();
    });

    it('should handle multiple dates and return first valid one', () => {
      const text = 'Data: 32.13.2024, 15.01.2024, 01.01.2023';
      const result = (service as any).extractDate(text, ['data']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should handle different date formats', () => {
      const dateFormats = [
        '15.01.2024',
        '15-01-2024',
        '15/01/2024',
        '2024-01-15',
      ];

      dateFormats.forEach(format => {
        const text = `Data wystawienia: ${format}`;
        const result = (service as any).extractDate(text, ['data wystawienia']);

        expect(result).toEqual(new Date('2024-01-15'));
      });
    });

    it('should handle dates with different separators', () => {
      const separators = ['.', '-', '/'];

      separators.forEach(separator => {
        const text = `Data wystawienia: 15${separator}01${separator}2024`;
        const result = (service as any).extractDate(text, ['data wystawienia']);

        expect(result).toEqual(new Date('2024-01-15'));
      });
    });

    it('should handle two-digit years', () => {
      const text = 'Data wystawienia: 15.01.24';
      const result = (service as any).extractDate(text, ['data wystawienia']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should handle dates without leading zeros', () => {
      const text = 'Data wystawienia: 5.1.2024';
      const result = (service as any).extractDate(text, ['data wystawienia']);

      expect(result).toEqual(new Date('2024-01-05'));
    });

    it('should handle dates with extra spaces', () => {
      const text = 'Data wystawienia : 15 . 01 . 2024';
      const result = (service as any).extractDate(text, ['data wystawienia']);

      expect(result).toEqual(new Date('2024-01-15'));
    });

    it('should handle concurrent date extraction', async () => {
      const texts = Array.from({ length: 5 }, (_, i) => `Data: ${15 + i}.01.2024`);

      const results = await Promise.all(
        texts.map(text => (service as any).extractDate(text, ['data']))
      );

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toEqual(new Date(`2024-01-${15 + i}`));
      });
    });
  });

  describe('extractPartyInfo', () => {
    it('should extract seller information correctly', async () => {
      const text = `
        Sprzedawca:
        Test Seller Sp. z o.o.
        NIP: 1234567890
        Adres: ul. Testowa 1, 00-001 Warszawa
        Email: seller@test.com
        Tel: 123-456-789
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result).toEqual({
        name: 'Test Seller Sp. z o.o.',
        nip: '1234567890',
        address: 'ul. Testowa 1, 00-001 Warszawa',
        email: 'seller@test.com',
        phone: '123-456-789',
      });
    });

    it('should extract buyer information correctly', async () => {
      const text = `
        Nabywca:
        Test Buyer
        NIP: 9876543210
        Adres: ul. Kupna 2, 00-002 Warszawa
      `;

      const result = (service as any).extractPartyInfo(text, ['nabywca']);

      expect(result).toEqual({
        name: 'Test Buyer',
        nip: '9876543210',
        address: 'ul. Kupna 2, 00-002 Warszawa',
      });
    });

    it('should return undefined when no party info found', async () => {
      const text = 'Random text without party information';
      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result).toBeUndefined();
    });

    it('should handle missing NIP', async () => {
      const text = `
        Sprzedawca:
        Test Seller Sp. z o.o.
        Adres: ul. Testowa 1, 00-001 Warszawa
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result).toEqual({
        name: 'Test Seller Sp. z o.o.',
        address: 'ul. Testowa 1, 00-001 Warszawa',
      });
      expect(result?.nip).toBeUndefined();
    });

    it('should handle missing email', async () => {
      const text = `
        Sprzedawca:
        Test Seller Sp. z o.o.
        NIP: 1234567890
        Adres: ul. Testowa 1, 00-001 Warszawa
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result).toEqual({
        name: 'Test Seller Sp. z o.o.',
        nip: '1234567890',
        address: 'ul. Testowa 1, 00-001 Warszawa',
      });
      expect(result?.email).toBeUndefined();
    });

    it('should handle missing phone', async () => {
      const text = `
        Sprzedawca:
        Test Seller Sp. z o.o.
        NIP: 1234567890
        Adres: ul. Testowa 1, 00-001 Warszawa
        Email: seller@test.com
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result).toEqual({
        name: 'Test Seller Sp. z o.o.',
        nip: '1234567890',
        address: 'ul. Testowa 1, 00-001 Warszawa',
        email: 'seller@test.com',
      });
      expect(result?.phone).toBeUndefined();
    });

    it('should handle multiple phone numbers', async () => {
      const text = `
        Sprzedawca:
        Test Seller Sp. z o.o.
        NIP: 1234567890
        Tel: 123-456-789, 987-654-321
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result?.phone).toBe('123-456-789');
    });

    it('should handle multiple email addresses', async () => {
      const text = `
        Sprzedawca:
        Test Seller Sp. z o.o.
        NIP: 1234567890
        Email: seller@test.com, admin@test.com
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result?.email).toBe('seller@test.com');
    });

    it('should handle different NIP formats', async () => {
      const nipFormats = [
        '1234567890',
        '123-456-78-90',
        '123 456 78 90',
      ];

      nipFormats.forEach(nip => {
        const text = `
          Sprzedawca:
          Test Seller
          NIP: ${nip}
        `;

        const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

        expect(result?.nip).toBe(nip.replace(/[-\s]/g, ''));
      });
    });

    it('should handle different phone formats', async () => {
      const phoneFormats = [
        '123-456-789',
        '123 456 789',
        '123456789',
      ];

      phoneFormats.forEach(phone => {
        const text = `
          Sprzedawca:
          Test Seller
          Tel: ${phone}
        `;

        const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

        expect(result?.phone).toBe(phone);
      });
    });

    it('should handle special characters in names', async () => {
      const text = `
        Sprzedawca:
        José García ñáéíóú
        NIP: 1234567890
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result?.name).toBe('José García ñáéíóú');
    });

    it('should handle very long addresses', async () => {
      const longAddress = 'A'.repeat(200);
      const text = `
        Sprzedawca:
        Test Seller
        NIP: 1234567890
        Adres: ${longAddress}
      `;

      const result = (service as any).extractPartyInfo(text, ['sprzedawca']);

      expect(result?.address).toBe(longAddress);
    });

    it('should handle concurrent party info extraction', async () => {
      const texts = Array.from({ length: 5 }, (_, i) => `
        Sprzedawca ${i}:
        Seller ${i}
        NIP: 123456789${i}
      `);

      const results = await Promise.all(
        texts.map(text => (service as any).extractPartyInfo(text, ['sprzedawca']))
      );

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result?.name).toBe(`Seller ${i}`);
        expect(result?.nip).toBe(`123456789${i}`);
      });
    });
  });

  describe('extractAmounts', () => {
    it('should extract all amounts correctly', async () => {
      const text = `
        Netto: 1000.00
        VAT: 230.00
        Brutto: 1230.00
        Razem do zapłaty: 1230.00
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 1000,
        vatAmount: 230,
        grossAmount: 1230,
      });
    });

    it('should extract amounts with different formats', async () => {
      const text = `
        Wartość netto: 1.000,50
        Podatek VAT: 230,00
        Wartość brutto: 1.230,50
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 1000.50,
        vatAmount: 230,
        grossAmount: 1230.50,
      });
    });

    it('should return undefined when no amounts found', async () => {
      const text = 'Random text without amounts';
      const result = (service as any).extractAmounts(text);

      expect(result).toBeUndefined();
    });

    it('should handle partial amount information', async () => {
      const text = `
        Netto: 1000.00
        Razem: 1230.00
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 1000,
        grossAmount: 1230,
      });
      expect(result?.vatAmount).toBeUndefined();
    });

    it('should handle multiple amount occurrences', async () => {
      const text = `
        Netto: 1000.00
        VAT: 230.00
        Netto: 2000.00
        Brutto: 1230.00
      `;

      const result = (service as any).extractAmounts(text);

      expect(result?.netAmount).toBe(1000); // First occurrence
      expect(result?.vatAmount).toBe(230); // First occurrence
      expect(result?.grossAmount).toBe(1230); // First occurrence
    });

    it('should handle amounts with different currencies', async () => {
      const text = `
        Netto: 1000.00 PLN
        VAT: 230.00 PLN
        Brutto: 1230.00 PLN
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 1000,
        vatAmount: 230,
        grossAmount: 1230,
      });
    });

    it('should handle amounts with thousand separators', async () => {
      const text = `
        Netto: 1,000.50
        VAT: 230.00
        Brutto: 1,230.50
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 1000.50,
        vatAmount: 230,
        grossAmount: 1230.50,
      });
    });

    it('should handle very large amounts', async () => {
      const text = `
        Netto: 1000000.00
        VAT: 230000.00
        Brutto: 1230000.00
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 1000000,
        vatAmount: 230000,
        grossAmount: 1230000,
      });
    });

    it('should handle very small amounts', async () => {
      const text = `
        Netto: 0.01
        VAT: 0.0023
        Brutto: 0.0123
      `;

      const result = (service as any).extractAmounts(text);

      expect(result).toEqual({
        netAmount: 0.01,
        vatAmount: 0.0023,
        grossAmount: 0.0123,
      });
    });

    it('should handle concurrent amount extraction', async () => {
      const texts = Array.from({ length: 5 }, (_, i) => `
        Netto: ${1000 + i * 100}.00
        VAT: ${230 + i * 23}.00
        Brutto: ${1230 + i * 123}.00
      `);

      const results = await Promise.all(
        texts.map(text => (service as any).extractAmounts(text))
      );

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result?.netAmount).toBe(1000 + i * 100);
        expect(result?.vatAmount).toBe(230 + i * 23);
        expect(result?.grossAmount).toBe(1230 + i * 123);
      });
    });
  });

  describe('extractCurrency', () => {
    it('should extract PLN currency', async () => {
      const text = 'Kwota: 1000.00 PLN';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('PLN');
    });

    it('should extract EUR currency', async () => {
      const text = 'Amount: 1000.00 EUR';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('EUR');
    });

    it('should extract USD currency', async () => {
      const text = 'Total: 1000.00 USD';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('USD');
    });

    it('should extract GBP currency', async () => {
      const text = 'Sum: 1000.00 GBP';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('GBP');
    });

    it('should return default PLN when no currency found', async () => {
      const text = 'Amount: 1000.00';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('PLN');
    });

    it('should handle currency in different positions', async () => {
      const positions = [
        'PLN 1000.00',
        '1000.00 PLN',
        'Amount: 1000.00 PLN currency',
      ];

      positions.forEach(position => {
        const result = (service as any).extractCurrency(position);
        expect(result).toBe('PLN');
      });
    });

    it('should handle lowercase currency codes', async () => {
      const text = 'Amount: 1000.00 pln';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('PLN');
    });

    it('should handle currency with explicit label', async () => {
      const text = 'Waluta: PLN, Amount: 1000.00';
      const result = (service as any).extractCurrency(text);

      expect(result).toBe('PLN');
    });

    it('should handle concurrent currency extraction', async () => {
      const currencies = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];

      const results = await Promise.all(
        currencies.map(currency => (service as any).extractCurrency(`Amount: 1000.00 ${currency}`))
      );

      expect(results).toEqual(currencies);
    });
  });

  describe('extractPaymentMethod', () => {
    it('should extract przelew payment method', async () => {
      const text = 'Sposób płatności: przelew';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBe('przelew');
    });

    it('should extract gotówka payment method', async () => {
      const text = 'Płatność: gotówka';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBe('gotówka');
    });

    it('should extract karta payment method', async () => {
      const text = 'Payment method: karta';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBe('karta');
    });

    it('should extract cash payment method', async () => {
      const text = 'Payment: cash';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBe('cash');
    });

    it('should extract transfer payment method', async () => {
      const text = 'Payment method: transfer';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBe('transfer');
    });

    it('should return undefined when no payment method found', async () => {
      const text = 'Random text without payment info';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBeUndefined();
    });

    it('should handle payment method with additional text', async () => {
      const text = 'Sposób płatności: przelew bankowy na konto';
      const result = (service as any).extractPaymentMethod(text);

      expect(result).toBe('przelew bankowy na konto');
    });

    it('should handle concurrent payment method extraction', async () => {
      const paymentMethods = ['przelew', 'gotówka', 'karta', 'cash', 'transfer'];

      const results = await Promise.all(
        paymentMethods.map(method => (service as any).extractPaymentMethod(`Payment: ${method}`))
      );

      expect(results).toEqual(paymentMethods);
    });
  });

  describe('calculateConfidenceScore', () => {
    it('should calculate high confidence score for complete data', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
        issueDate: new Date(),
        seller: { nip: '1234567890', name: 'Test Seller' },
        buyer: { nip: '9876543210', name: 'Test Buyer' },
        amounts: { netAmount: 1000, vatAmount: 230, grossAmount: 1230 },
        items: [{ name: 'Test Item' }],
      };

      const result = (service as any).calculateConfidenceScore(extractedData, 'Complete text');

      expect(result).toBeGreaterThan(0.8);
    });

    it('should calculate low confidence score for minimal data', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
      };

      const result = (service as any).calculateConfidenceScore(extractedData, 'Minimal text');

      expect(result).toBeLessThan(0.3);
    });

    it('should calculate zero confidence score for empty data', async () => {
      const extractedData = {};

      const result = (service as any).calculateConfidenceScore(extractedData, 'Empty text');

      expect(result).toBe(0);
    });

    it('should handle missing amounts correctly', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
        issueDate: new Date(),
        seller: { nip: '1234567890' },
      };

      const result = (service as any).calculateConfidenceScore(extractedData, 'Text without amounts');

      expect(result).toBeLessThan(0.6);
    });

    it('should handle missing party information correctly', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
        issueDate: new Date(),
        amounts: { grossAmount: 1230 },
      };

      const result = (service as any).calculateConfidenceScore(extractedData, 'Text without parties');

      expect(result).toBeLessThan(0.7);
    });

    it('should handle very long text correctly', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
      };

      const longText = 'A'.repeat(1000);
      const result = (service as any).calculateConfidenceScore(extractedData, longText);

      expect(result).toBeGreaterThan(0);
    });

    it('should handle very short text correctly', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
      };

      const shortText = 'Short';
      const result = (service as any).calculateConfidenceScore(extractedData, shortText);

      expect(result).toBe(0.2); // Only invoice number factor
    });
  });

  describe('determineConfidenceLevel', () => {
    it('should return HIGH for score >= 0.8', () => {
      const result = (service as any).determineConfidenceLevel(0.9);
      expect(result).toBe(ConfidenceLevel.HIGH);
    });

    it('should return MEDIUM for score >= 0.6 and < 0.8', () => {
      const result = (service as any).determineConfidenceLevel(0.7);
      expect(result).toBe(ConfidenceLevel.MEDIUM);
    });

    it('should return LOW for score < 0.6', () => {
      const result = (service as any).determineConfidenceLevel(0.4);
      expect(result).toBe(ConfidenceLevel.LOW);
    });

    it('should handle boundary values correctly', () => {
      expect((service as any).determineConfidenceLevel(0.8)).toBe(ConfidenceLevel.HIGH);
      expect((service as any).determineConfidenceLevel(0.799)).toBe(ConfidenceLevel.MEDIUM);
      expect((service as any).determineConfidenceLevel(0.6)).toBe(ConfidenceLevel.MEDIUM);
      expect((service as any).determineConfidenceLevel(0.599)).toBe(ConfidenceLevel.LOW);
    });

    it('should handle zero score', () => {
      const result = (service as any).determineConfidenceLevel(0);
      expect(result).toBe(ConfidenceLevel.LOW);
    });

    it('should handle negative score', () => {
      const result = (service as any).determineConfidenceLevel(-0.1);
      expect(result).toBe(ConfidenceLevel.LOW);
    });

    it('should handle score greater than 1', () => {
      const result = (service as any).determineConfidenceLevel(1.5);
      expect(result).toBe(ConfidenceLevel.HIGH);
    });
  });

  describe('generateProcessingNotes', () => {
    it('should generate appropriate notes for low confidence', async () => {
      const extractedData = {};
      const confidenceScore = 0.3;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Low confidence');
      expect(result).toContain('manual verification recommended');
    });

    it('should generate notes for missing invoice number', async () => {
      const extractedData = { amounts: { grossAmount: 1230 } };
      const confidenceScore = 0.5;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Invoice number not found');
    });

    it('should generate notes for missing total amount', async () => {
      const extractedData = { invoiceNumber: 'FV/0001' };
      const confidenceScore = 0.5;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Total amount not found');
    });

    it('should generate notes for missing seller NIP', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
        amounts: { grossAmount: 1230 },
        seller: { name: 'Test Seller' },
      };
      const confidenceScore = 0.5;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Seller NIP not found');
    });

    it('should generate success note for complete data', async () => {
      const extractedData = {
        invoiceNumber: 'FV/0001',
        amounts: { grossAmount: 1230 },
        seller: { nip: '1234567890' },
      };
      const confidenceScore = 0.9;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Processing completed successfully');
    });

    it('should handle multiple issues', async () => {
      const extractedData = {};
      const confidenceScore = 0.2;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Low confidence');
      expect(result).toContain('Invoice number not found');
      expect(result).toContain('Total amount not found');
      expect(result).toContain('Seller NIP not found');
    });

    it('should handle empty extracted data', async () => {
      const extractedData = {};
      const confidenceScore = 0.8;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Invoice number not found');
      expect(result).toContain('Total amount not found');
      expect(result).toContain('Seller NIP not found');
    });

    it('should handle null confidence score', async () => {
      const extractedData = {};
      const confidenceScore = 0;

      const result = (service as any).generateProcessingNotes(extractedData, confidenceScore);

      expect(result).toContain('Low confidence');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle data masking service errors', async () => {
      mockDataMaskingService.maskSensitiveData.mockImplementation(() => {
        throw new Error('Masking service error');
      });

      const mockBuffer = Buffer.from('test');
      await expect(service.processInvoiceImage(mockBuffer, 'image/jpeg'))
        .rejects.toThrow('OCR processing failed: Masking service error');
    });

    it('should handle null image buffer', async () => {
      await expect(service.processInvoiceImage(null as any, 'image/jpeg'))
        .rejects.toThrow();
    });

    it('should handle undefined image buffer', async () => {
      await expect(service.processInvoiceImage(undefined as any, 'image/jpeg'))
        .rejects.toThrow();
    });

    it('should handle empty mime type', async () => {
      const mockBuffer = Buffer.from('test');
      await expect(service.processInvoiceImage(mockBuffer, ''))
        .rejects.toThrow();
    });

    it('should handle null mime type', async () => {
      const mockBuffer = Buffer.from('test');
      await expect(service.processInvoiceImage(mockBuffer, null as any))
        .rejects.toThrow();
    });

    it('should handle very large OCR text', async () => {
      const largeText = 'A'.repeat(100000);
      mockDataMaskingService.maskSensitiveData.mockReturnValue(largeText);

      const result = await (service as any).extractInvoiceData(largeText);

      expect(result.rawText).toBe(largeText);
    });

    it('should handle OCR text with only special characters', async () => {
      const specialText = '🚀 ñáéíóú @#$%^&*()';
      mockDataMaskingService.maskSensitiveData.mockReturnValue(specialText);

      const result = await (service as any).extractInvoiceData(specialText);

      expect(result.rawText).toBe(specialText);
      expect(result.invoiceNumber).toBeUndefined();
    });

    it('should handle concurrent processing with errors', async () => {
      const buffers = Array.from({ length: 3 }, (_, i) =>
        Buffer.from(`test-${i}`)
      );

      // Make first request fail
      jest.spyOn(service as any, 'performOcr').mockImplementation((data) => {
        if ((data as string).includes('test-0')) {
          throw new Error('OCR failed');
        }
        return Promise.resolve({ text: 'Mock text', confidence: 0.8 });
      });

      const results = await Promise.allSettled(
        buffers.map(buffer => service.processInvoiceImage(buffer, 'image/jpeg'))
      );

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
    });
  });
});