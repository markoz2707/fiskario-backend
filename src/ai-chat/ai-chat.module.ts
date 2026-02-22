import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatGateway } from './ai-chat.gateway';
import { AiChatService } from './ai-chat.service';
import { AiEngineService } from './services/ai-engine.service';
import { ContextBuilderService } from './services/context-builder.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: '60m' },
    }),
  ],
  controllers: [AiChatController],
  providers: [
    AiChatService,
    AiEngineService,
    ContextBuilderService,
    AiChatGateway,
  ],
  exports: [AiChatService],
})
export class AiChatModule {}
