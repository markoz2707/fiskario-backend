import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
  UseGuards,
  Request,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrProcessingRequestDto, OcrProcessingResponseDto, InvoiceOcrResultDto } from './dto/invoice-ocr.dto';
import { OcrService } from './services/ocr.service';
import { LlmService, LlmProcessingRequest } from './services/llm.service';
import { DataMaskingService } from './services/data-masking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('ocr-llm-proxy')
@UseGuards(JwtAuthGuard)
export class OcrLlmProxyController {
  private readonly logger = new Logger(OcrLlmProxyController.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly llmService: LlmService,
    private readonly dataMaskingService: DataMaskingService
  ) {}

  /**
   * Process invoice image with OCR and LLM
   */
  @Post('process-invoice')
  @UseInterceptors(FileInterceptor('invoiceImage'))
  async processInvoice(
    @UploadedFile() file: any,
    @Body() body: { userId?: string; companyId?: string },
    @Request() req: any
  ): Promise<OcrProcessingResponseDto> {
    try {
      if (!file) {
        throw new BadRequestException('Invoice image file is required');
      }

      // Validate file type
      if (!this.isValidImageFile(file)) {
        throw new BadRequestException('Invalid file type. Only image files are allowed');
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new BadRequestException('File size too large. Maximum 10MB allowed');
      }

      const requestId = this.generateRequestId();
      const userId = body.userId || req.user?.id;
      const companyId = body.companyId || req.user?.companyId;

      this.logger.log(`Processing invoice for user ${userId}, company ${companyId}, request ${requestId}`);

      // Create safe log entry for the request
      const safeLogEntry = this.dataMaskingService.createSafeLogEntry({
        requestId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        userId,
        companyId
      }, 'INVOICE_PROCESSING_STARTED');

      this.logger.log(`Safe log entry: ${JSON.stringify(safeLogEntry)}`);

      // Step 1: Process image with OCR
      const ocrResult = await this.ocrService.processInvoiceImage(file.buffer, file.mimetype);

      // Step 2: Enhance with LLM processing
      const llmRequest: LlmProcessingRequest = {
        ocrText: ocrResult.rawText || '',
        imageMetadata: {
          width: 0, // Could extract from image if needed
          height: 0,
          format: file.mimetype
        },
        userId,
        companyId
      };

      const llmResponse = await this.llmService.processInvoiceWithLlm(llmRequest);

      // Combine OCR and LLM results
      const finalResult: InvoiceOcrResultDto = {
        ...ocrResult,
        ...llmResponse.normalizedData,
        // Preserve the higher confidence score
        confidenceScore: Math.max(ocrResult.confidenceScore || 0, llmResponse.confidence || 0),
        overallConfidence: this.determineOverallConfidence(
          ocrResult.confidenceScore || 0,
          llmResponse.confidence || 0
        ),
        processingNotes: this.combineProcessingNotes(ocrResult, llmResponse),
        rawText: this.dataMaskingService.maskSensitiveData(ocrResult.rawText || ''),
      };

      // Create safe log entry for successful completion
      const completionLogEntry = this.dataMaskingService.createSafeLogEntry({
        requestId,
        status: 'COMPLETED',
        confidence: finalResult.confidenceScore,
        hasSellerInfo: !!finalResult.seller,
        hasBuyerInfo: !!finalResult.buyer,
        itemCount: finalResult.items?.length || 0,
        processingTime: llmResponse.processingTime
      }, 'INVOICE_PROCESSING_COMPLETED');

      this.logger.log(`Safe completion log: ${JSON.stringify(completionLogEntry)}`);

      const response: OcrProcessingResponseDto = {
        requestId,
        status: 'COMPLETED',
        result: finalResult,
        createdAt: new Date(),
        completedAt: new Date()
      };

      return response;

    } catch (error) {
      this.logger.error('Error processing invoice', error);

      // Create safe error log entry
      const errorLogEntry = this.dataMaskingService.createSafeLogEntry({
        error: error.message,
        stack: error.stack,
        fileName: file?.originalname
      }, 'INVOICE_PROCESSING_ERROR');

      this.logger.log(`Safe error log: ${JSON.stringify(errorLogEntry)}`);

      throw new HttpException(
        {
          status: 'ERROR',
          message: 'Invoice processing failed',
          requestId: this.generateRequestId(),
          error: this.dataMaskingService.maskSensitiveData(error.message)
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Process OCR text only (without image upload)
   */
  @Post('process-text')
  async processText(
    @Body() body: { ocrText: string; userId?: string; companyId?: string },
    @Request() req: any
  ): Promise<OcrProcessingResponseDto> {
    try {
      if (!body.ocrText) {
        throw new BadRequestException('OCR text is required');
      }

      const requestId = this.generateRequestId();
      const userId = body.userId || req.user?.id;
      const companyId = body.companyId || req.user?.companyId;

      this.logger.log(`Processing OCR text for user ${userId}, company ${companyId}, request ${requestId}`);

      // Process with LLM only (no OCR step)
      const llmRequest: LlmProcessingRequest = {
        ocrText: body.ocrText,
        userId,
        companyId
      };

      const llmResponse = await this.llmService.processInvoiceWithLlm(llmRequest);

      if (!llmResponse.success) {
        throw new Error(llmResponse.error || 'LLM processing failed');
      }

      const response: OcrProcessingResponseDto = {
        requestId,
        status: 'COMPLETED',
        result: llmResponse.normalizedData,
        createdAt: new Date(),
        completedAt: new Date()
      };

      return response;

    } catch (error) {
      this.logger.error('Error processing OCR text', error);

      throw new HttpException(
        {
          status: 'ERROR',
          message: 'Text processing failed',
          requestId: this.generateRequestId(),
          error: this.dataMaskingService.maskSensitiveData(error.message)
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get processing status (for async processing if implemented)
   */
  @Post('status')
  async getProcessingStatus(
    @Body() body: { requestId: string }
  ): Promise<OcrProcessingResponseDto> {
    // For now, return a mock response since we're doing synchronous processing
    return {
      requestId: body.requestId,
      status: 'COMPLETED',
      createdAt: new Date(),
      completedAt: new Date()
    };
  }

  /**
   * Validate uploaded file
   */
  private isValidImageFile(file: any): boolean {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff'
    ];

    return allowedMimeTypes.includes(file.mimetype);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine overall confidence based on OCR and LLM scores
   */
  private determineOverallConfidence(ocrScore: number, llmScore: number): any {
    const combinedScore = (ocrScore + llmScore) / 2;

    if (combinedScore >= 0.8) return 'HIGH';
    if (combinedScore >= 0.6) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Combine processing notes from OCR and LLM
   */
  private combineProcessingNotes(
    ocrResult: InvoiceOcrResultDto,
    llmResponse: any
  ): string {
    const notes: string[] = [];

    if (ocrResult.processingNotes) {
      notes.push(`OCR: ${ocrResult.processingNotes}`);
    }

    if (llmResponse.metadata) {
      notes.push(`LLM: Processed with ${llmResponse.metadata.model}`);
    }

    return notes.join('; ');
  }
}