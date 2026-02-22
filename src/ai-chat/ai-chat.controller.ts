import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiChatService } from './ai-chat.service';
import {
  CreateConversationDto,
  SendMessageDto,
  ListConversationsDto,
} from './dto/ai-chat.dto';

interface AuthenticatedUser {
  id: string;
  userId?: string;
  email: string;
  tenant_id: string;
  company_id?: string;
}

@Controller('ai-chat')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  // ============================================================
  // Conversations
  // ============================================================

  /**
   * POST /ai-chat/:companyId/conversations
   * Create a new chat conversation.
   */
  @Post(':companyId/conversations')
  async createConversation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Body() dto: CreateConversationDto,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.userId || req.user.id;
    return this.aiChatService.createConversation(
      tenantId,
      companyId,
      userId,
      dto.title,
      dto.context,
    );
  }

  /**
   * GET /ai-chat/:companyId/conversations
   * List conversations with pagination and optional status filter.
   */
  @Get(':companyId/conversations')
  async listConversations(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query() query: ListConversationsDto,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.userId || req.user.id;
    return this.aiChatService.getConversations(
      tenantId,
      companyId,
      userId,
      query.page || 1,
      query.limit || 20,
      query.status,
    );
  }

  /**
   * GET /ai-chat/:companyId/conversations/:conversationId
   * Get a conversation with all its messages.
   */
  @Get(':companyId/conversations/:conversationId')
  async getConversation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('conversationId') conversationId: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.aiChatService.getConversation(tenantId, conversationId);
  }

  /**
   * DELETE /ai-chat/:companyId/conversations/:conversationId
   * Archive a conversation (soft delete, sets status to ARCHIVED).
   */
  @Delete(':companyId/conversations/:conversationId')
  async archiveConversation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('conversationId') conversationId: string,
  ) {
    const tenantId = req.user.tenant_id;
    await this.aiChatService.archiveConversation(tenantId, conversationId);
    return { success: true, message: 'Conversation archived' };
  }

  // ============================================================
  // Messages (HTTP fallback)
  // ============================================================

  /**
   * POST /ai-chat/:companyId/conversations/:conversationId/messages
   * Send a message and receive an AI response (HTTP fallback for non-WebSocket clients).
   */
  @Post(':companyId/conversations/:conversationId/messages')
  async sendMessage(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const tenantId = req.user.tenant_id;
    return this.aiChatService.sendMessage(tenantId, conversationId, dto.content);
  }

  // ============================================================
  // Suggested Questions
  // ============================================================

  /**
   * GET /ai-chat/:companyId/suggested-questions?context=TAX
   * Get context-aware suggested questions for the chat UI.
   */
  @Get(':companyId/suggested-questions')
  async getSuggestedQuestions(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('companyId') companyId: string,
    @Query('context') context?: string,
  ) {
    return {
      questions: this.aiChatService.getSuggestedQuestions(context as any),
    };
  }
}
