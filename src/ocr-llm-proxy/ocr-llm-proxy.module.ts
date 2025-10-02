import { Module } from '@nestjs/common';
import { OcrLlmProxyController } from './ocr-llm-proxy.controller';
import { OcrService } from './services/ocr.service';
import { LlmService } from './services/llm.service';
import { DataMaskingService } from './services/data-masking.service';

@Module({
  controllers: [OcrLlmProxyController],
  providers: [OcrService, LlmService, DataMaskingService],
  exports: [OcrService, LlmService, DataMaskingService],
})
export class OcrLlmProxyModule {}
