import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    validationErrors?: ValidationError[];
  };
  timestamp: string;
}

export interface TaxCalculationError extends Error {
  code: string;
  statusCode: number;
  details?: any;
}

@Injectable()
export class ErrorHandlingService {
  private readonly logger = new Logger(ErrorHandlingService.name);

  /**
   * Handle tax calculation errors
   */
  handleTaxCalculationError(error: any, context?: string): TaxCalculationError {
    this.logger.error(`Tax calculation error${context ? ` in ${context}` : ''}:`, error);

    if (error instanceof HttpException) {
      throw error;
    }

    // Database errors
    if (error.code === 'P2002') {
      const taxError = Object.assign(new Error('Duplikacja danych podatkowych'), {
        code: 'DUPLICATE_TAX_DATA',
        statusCode: HttpStatus.CONFLICT,
        details: { originalError: error }
      }) as TaxCalculationError;
      return taxError;
    }

    if (error.code === 'P2025') {
      const taxError = Object.assign(new Error('Nie znaleziono danych do obliczeń'), {
        code: 'TAX_DATA_NOT_FOUND',
        statusCode: HttpStatus.NOT_FOUND,
        details: { originalError: error }
      }) as TaxCalculationError;
      return taxError;
    }

    // Validation errors
    if (error.name === 'ValidationError') {
      const taxError = Object.assign(new Error('Nieprawidłowe dane podatkowe'), {
        code: 'INVALID_TAX_DATA',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { validationErrors: error.details }
      }) as TaxCalculationError;
      return taxError;
    }

    // Network/API errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const taxError = Object.assign(new Error('Brak połączenia z usługą podatkową'), {
        code: 'TAX_SERVICE_UNAVAILABLE',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        details: { originalError: error }
      }) as TaxCalculationError;
      return taxError;
    }

    // Default error
    const taxError = Object.assign(new Error('Wystąpił błąd podczas obliczeń podatkowych'), {
      code: 'TAX_CALCULATION_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      details: { originalError: error }
    }) as TaxCalculationError;
    return taxError;
  }

  /**
   * Handle VAT register errors
   */
  handleVATRegisterError(error: any, context?: string): TaxCalculationError {
    this.logger.error(`VAT register error${context ? ` in ${context}` : ''}:`, error);

    if (error instanceof HttpException) {
      throw error;
    }

    // Invalid VAT rate
    if (error.message?.includes('VAT rate')) {
      const taxError = Object.assign(new Error('Nieprawidłowa stawka VAT'), {
        code: 'INVALID_VAT_RATE',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { allowedRates: [0, 5, 8, 23] }
      }) as TaxCalculationError;
      return taxError;
    }

    // Invalid period format
    if (error.message?.includes('Period must be in YYYY-MM format')) {
      const taxError = Object.assign(new Error('Nieprawidłowy format okresu rozliczeniowego'), {
        code: 'INVALID_PERIOD_FORMAT',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { expectedFormat: 'YYYY-MM', example: '2024-10' }
      }) as TaxCalculationError;
      return taxError;
    }

    // Default VAT register error
    const taxError = Object.assign(new Error('Wystąpił błąd w rejestrze VAT'), {
      code: 'VAT_REGISTER_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      details: { originalError: error }
    }) as TaxCalculationError;
    return taxError;
  }

  /**
   * Handle XML generation errors
   */
  handleXMLGenerationError(error: any, context?: string): TaxCalculationError {
    this.logger.error(`XML generation error${context ? ` in ${context}` : ''}:`, error);

    if (error instanceof HttpException) {
      throw error;
    }

    // Missing calculation data
    if (error.message?.includes('No calculation data')) {
      const taxError = Object.assign(new Error('Brak danych do generowania XML'), {
        code: 'NO_CALCULATION_DATA',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { requiredData: ['totalSalesVAT', 'totalPurchasesVAT'] }
      }) as TaxCalculationError;
      return taxError;
    }

    // Invalid company data
    if (error.message?.includes('Company information')) {
      const taxError = Object.assign(new Error('Brak wymaganych danych firmy'), {
        code: 'INVALID_COMPANY_DATA',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { requiredFields: ['nip', 'name'] }
      }) as TaxCalculationError;
      return taxError;
    }

    // Default XML error
    const taxError = Object.assign(new Error('Wystąpił błąd podczas generowania XML'), {
      code: 'XML_GENERATION_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      details: { originalError: error }
    }) as TaxCalculationError;
    return taxError;
  }

  /**
   * Handle signature errors
   */
  handleSignatureError(error: any, context?: string): TaxCalculationError {
    this.logger.error(`Signature error${context ? ` in ${context}` : ''}:`, error);

    if (error instanceof HttpException) {
      throw error;
    }

    // Missing credentials
    if (error.message?.includes('credentials required')) {
      const taxError = Object.assign(new Error('Brak wymaganych danych do podpisu'), {
        code: 'SIGNATURE_CREDENTIALS_MISSING',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { requiredCredentials: ['login', 'password'] }
      }) as TaxCalculationError;
      return taxError;
    }

    // Certificate errors
    if (error.message?.includes('certificate')) {
      const taxError = Object.assign(new Error('Błąd certyfikatu podpisu'), {
        code: 'SIGNATURE_CERTIFICATE_ERROR',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { certificateError: error.message }
      }) as TaxCalculationError;
      return taxError;
    }

    // Default signature error
    const taxError = Object.assign(new Error('Wystąpił błąd podczas podpisywania'), {
      code: 'SIGNATURE_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      details: { originalError: error }
    }) as TaxCalculationError;
    return taxError;
  }

  /**
   * Handle submission errors
   */
  handleSubmissionError(error: any, context?: string): TaxCalculationError {
    this.logger.error(`Submission error${context ? ` in ${context}` : ''}:`, error);

    if (error instanceof HttpException) {
      throw error;
    }

    // US API errors
    if (error.message?.includes('US API')) {
      const taxError = Object.assign(new Error('Błąd komunikacji z urzędem skarbowym'), {
        code: 'US_API_ERROR',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        details: { apiError: error.message }
      }) as TaxCalculationError;
      return taxError;
    }

    // Authentication errors
    if (error.message?.includes('Unauthorized') || error.status === 401) {
      const taxError = Object.assign(new Error('Brak uprawnień do wysyłania deklaracji'), {
        code: 'SUBMISSION_UNAUTHORIZED',
        statusCode: HttpStatus.UNAUTHORIZED,
        details: { authError: error.message }
      }) as TaxCalculationError;
      return taxError;
    }

    // Rate limiting
    if (error.status === 429) {
      const taxError = Object.assign(new Error('Przekroczono limit wysyłania deklaracji'), {
        code: 'SUBMISSION_RATE_LIMITED',
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        details: { retryAfter: error.headers?.['retry-after'] }
      }) as TaxCalculationError;
      return taxError;
    }

    // Default submission error
    const taxError = Object.assign(new Error('Wystąpił błąd podczas wysyłania deklaracji'), {
      code: 'SUBMISSION_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      details: { originalError: error }
    }) as TaxCalculationError;
    return taxError;
  }

  /**
   * Create standardized error response
   */
  createErrorResponse(error: TaxCalculationError): ErrorResponse {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate tax calculation input data
   */
  validateTaxCalculationData(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate period format
    if (!data.period || !/^\d{4}-\d{2}$/.test(data.period)) {
      errors.push({
        field: 'period',
        message: 'Okres musi być w formacie YYYY-MM',
        code: 'INVALID_PERIOD_FORMAT',
      });
    }

    // Validate declaration type
    const validTypes = ['VAT-7', 'JPK_V7M', 'JPK_V7K', 'PIT-36', 'CIT-8'];
    if (!data.declarationType || !validTypes.includes(data.declarationType)) {
      errors.push({
        field: 'declarationType',
        message: 'Nieprawidłowy typ deklaracji',
        code: 'INVALID_DECLARATION_TYPE',
      });
    }

    // Validate amounts
    if (data.totalRevenue !== undefined && (typeof data.totalRevenue !== 'number' || data.totalRevenue < 0)) {
      errors.push({
        field: 'totalRevenue',
        message: 'Przychody muszą być liczbą nieujemną',
        code: 'INVALID_REVENUE_AMOUNT',
      });
    }

    if (data.vatCollectedSales !== undefined && (typeof data.vatCollectedSales !== 'number' || data.vatCollectedSales < 0)) {
      errors.push({
        field: 'vatCollectedSales',
        message: 'VAT należny musi być liczbą nieujemną',
        code: 'INVALID_VAT_COLLECTED',
      });
    }

    if (data.vatPaidPurchases !== undefined && (typeof data.vatPaidPurchases !== 'number' || data.vatPaidPurchases < 0)) {
      errors.push({
        field: 'vatPaidPurchases',
        message: 'VAT naliczony musi być liczbą nieujemną',
        code: 'INVALID_VAT_PAID',
      });
    }

    return errors;
  }

  /**
   * Validate VAT register entry
   */
  validateVATRegisterEntry(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.type || !['sprzedaz', 'zakup'].includes(data.type)) {
      errors.push({
        field: 'type',
        message: 'Typ musi być "sprzedaz" lub "zakup"',
        code: 'INVALID_VAT_REGISTER_TYPE',
      });
    }

    if (!data.period || !/^\d{4}-\d{2}$/.test(data.period)) {
      errors.push({
        field: 'period',
        message: 'Okres musi być w formacie YYYY-MM',
        code: 'INVALID_PERIOD_FORMAT',
      });
    }

    if (!data.counterpartyName || data.counterpartyName.trim().length === 0) {
      errors.push({
        field: 'counterpartyName',
        message: 'Nazwa kontrahenta jest wymagana',
        code: 'MISSING_COUNTERPARTY_NAME',
      });
    }

    if (!data.invoiceNumber || data.invoiceNumber.trim().length === 0) {
      errors.push({
        field: 'invoiceNumber',
        message: 'Numer faktury jest wymagany',
        code: 'MISSING_INVOICE_NUMBER',
      });
    }

    // Amount validations
    if (data.netAmount === undefined || typeof data.netAmount !== 'number' || data.netAmount < 0) {
      errors.push({
        field: 'netAmount',
        message: 'Kwota netto musi być liczbą nieujemną',
        code: 'INVALID_NET_AMOUNT',
      });
    }

    if (data.vatAmount === undefined || typeof data.vatAmount !== 'number' || data.vatAmount < 0) {
      errors.push({
        field: 'vatAmount',
        message: 'Kwota VAT musi być liczbą nieujemną',
        code: 'INVALID_VAT_AMOUNT',
      });
    }

    // VAT rate validation
    const validVATRates = [0, 5, 8, 23];
    if (data.vatRate !== undefined && !validVATRates.includes(data.vatRate)) {
      errors.push({
        field: 'vatRate',
        message: 'Stawka VAT musi być jedną z: 0%, 5%, 8%, 23%',
        code: 'INVALID_VAT_RATE',
      });
    }

    // Date validation
    if (data.invoiceDate) {
      const date = new Date(data.invoiceDate);
      if (isNaN(date.getTime())) {
        errors.push({
          field: 'invoiceDate',
          message: 'Nieprawidłowa data faktury',
          code: 'INVALID_INVOICE_DATE',
        });
      }
    }

    return errors;
  }

  /**
   * Validate declaration submission data
   */
  validateDeclarationSubmission(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.type || !['VAT-7', 'JPK_V7M', 'JPK_V7K', 'PIT-36', 'CIT-8'].includes(data.type)) {
      errors.push({
        field: 'type',
        message: 'Nieprawidłowy typ deklaracji',
        code: 'INVALID_DECLARATION_TYPE',
      });
    }

    if (!data.period || !/^\d{4}-\d{2}$/.test(data.period)) {
      errors.push({
        field: 'period',
        message: 'Okres musi być w formacie YYYY-MM',
        code: 'INVALID_PERIOD_FORMAT',
      });
    }

    // XML content validation
    if (!data.xmlContent || typeof data.xmlContent !== 'string' || data.xmlContent.trim().length === 0) {
      errors.push({
        field: 'xmlContent',
        message: 'Zawartość XML jest wymagana',
        code: 'MISSING_XML_CONTENT',
      });
    }

    // Signature validation
    if (data.signatureType && !['profil_zaufany', 'qes', 'none'].includes(data.signatureType)) {
      errors.push({
        field: 'signatureType',
        message: 'Nieprawidłowy typ podpisu',
        code: 'INVALID_SIGNATURE_TYPE',
      });
    }

    return errors;
  }

  /**
   * Log error with context
   */
  logError(error: any, context: string, additionalData?: any): void {
    this.logger.error(`Error in ${context}:`, {
      error: error.message || error,
      stack: error.stack,
      additionalData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: TaxCalculationError): boolean {
    const retryableCodes = [
      'TAX_SERVICE_UNAVAILABLE',
      'US_API_ERROR',
      'SUBMISSION_RATE_LIMITED',
      'NETWORK_ERROR',
    ];

    return retryableCodes.includes(error.code);
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error: TaxCalculationError): string {
    const friendlyMessages: Record<string, string> = {
      'DUPLICATE_TAX_DATA': 'Taka deklaracja już istnieje dla tego okresu',
      'TAX_DATA_NOT_FOUND': 'Nie znaleziono danych podatkowych dla tego okresu',
      'INVALID_TAX_DATA': 'Wprowadzono nieprawidłowe dane podatkowe',
      'TAX_SERVICE_UNAVAILABLE': 'Usługa podatkowa jest chwilowo niedostępna',
      'INVALID_VAT_RATE': 'Wybrano nieprawidłową stawkę VAT',
      'INVALID_PERIOD_FORMAT': 'Nieprawidłowy format okresu rozliczeniowego',
      'NO_CALCULATION_DATA': 'Brak danych do obliczeń - najpierw wykonaj kalkulację',
      'INVALID_COMPANY_DATA': 'Brak wymaganych danych firmy',
      'SIGNATURE_CREDENTIALS_MISSING': 'Skonfiguruj podpis elektroniczny',
      'SIGNATURE_CERTIFICATE_ERROR': 'Błąd certyfikatu podpisu',
      'US_API_ERROR': 'Błąd komunikacji z urzędem skarbowym',
      'SUBMISSION_UNAUTHORIZED': 'Brak uprawnień do wysyłania deklaracji',
      'SUBMISSION_RATE_LIMITED': 'Przekroczono limit wysyłania - spróbuj ponownie za chwilę',
      'XML_GENERATION_ERROR': 'Błąd podczas generowania pliku XML',
      'VAT_REGISTER_ERROR': 'Błąd w rejestrze VAT',
      'SUBMISSION_ERROR': 'Błąd podczas wysyłania deklaracji',
    };

    return friendlyMessages[error.code] || error.message || 'Wystąpił nieoczekiwany błąd';
  }
}