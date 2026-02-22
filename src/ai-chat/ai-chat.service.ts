import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiEngineService } from './services/ai-engine.service';
import { ContextBuilderService } from './services/context-builder.service';
import {
  ChatContext,
  ConversationStatus,
  SuggestedQuestion,
} from './dto/ai-chat.dto';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly contextBuilder: ContextBuilderService,
  ) {}

  // ============================================================
  // Conversation CRUD
  // ============================================================

  /**
   * Create a new chat conversation.
   */
  async createConversation(
    tenantId: string,
    companyId: string,
    userId: string,
    title?: string,
    context?: ChatContext,
  ) {
    this.logger.log(
      `Creating conversation for user ${userId}, company ${companyId}, context: ${context || 'GENERAL'}`,
    );

    const conversation = await this.prisma.chatConversation.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        title: title || this.generateDefaultTitle(context),
        context: context || 'GENERAL',
        status: 'ACTIVE',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return conversation;
  }

  /**
   * List conversations with pagination and optional status filter.
   * Returns conversations ordered by most recent update.
   */
  async getConversations(
    tenantId: string,
    companyId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: ConversationStatus,
  ) {
    const where: any = {
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
    };

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.chatConversation.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.chatConversation.count({ where }),
    ]);

    return {
      conversations: conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        context: conv.context,
        status: conv.status,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv._count.messages,
        lastMessage: conv.messages[0]
          ? {
              role: conv.messages[0].role,
              content:
                conv.messages[0].content.length > 100
                  ? conv.messages[0].content.substring(0, 100) + '...'
                  : conv.messages[0].content,
              createdAt: conv.messages[0].createdAt,
            }
          : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single conversation with all its messages.
   */
  async getConversation(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        tenant_id: tenantId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  /**
   * Archive a conversation (soft delete).
   */
  async archiveConversation(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        tenant_id: tenantId,
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.status === 'ARCHIVED') {
      throw new BadRequestException('Conversation is already archived');
    }

    return this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { status: 'ARCHIVED' },
    });
  }

  // ============================================================
  // Message handling
  // ============================================================

  /**
   * Send a user message, generate AI response, and save both to the conversation.
   * This is the core chat flow used by both REST and WebSocket interfaces.
   */
  async sendMessage(
    tenantId: string,
    conversationId: string,
    content: string,
  ) {
    // Validate conversation exists and is active
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        tenant_id: tenantId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot send messages to an archived conversation');
    }

    // 1. Save user message
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'USER',
        content,
      },
    });

    try {
      // 2. Build conversation context from company data
      const companyContext = await this.contextBuilder.buildCompanyContext(
        tenantId,
        conversation.company_id,
      );

      // 3. Prepare message history for AI (convert stored messages to AI format)
      const messageHistory = conversation.messages.map((msg) => ({
        role: this.mapRoleForAI(msg.role),
        content: msg.content,
      }));

      // Add the new user message
      messageHistory.push({
        role: 'user' as const,
        content,
      });

      // 4. Generate AI response
      const aiResponse = await this.aiEngine.generateResponse(
        messageHistory,
        companyContext,
      );

      // 5. Save assistant message
      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: aiResponse.content,
          metadata: {
            tokensUsed: aiResponse.tokensUsed,
            model: aiResponse.model,
            isMock: aiResponse.isMock,
          },
        },
      });

      // 6. Update conversation title if it's the first message
      if (conversation.messages.length === 0) {
        const autoTitle =
          content.length > 60 ? content.substring(0, 60) + '...' : content;
        await this.prisma.chatConversation.update({
          where: { id: conversationId },
          data: {
            title: conversation.title || autoTitle,
            updatedAt: new Date(),
          },
        });
      } else {
        await this.prisma.chatConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      }

      return {
        userMessage,
        assistantMessage,
        tokensUsed: aiResponse.tokensUsed,
        model: aiResponse.model,
        isMock: aiResponse.isMock,
      };
    } catch (error) {
      this.logger.error(`AI response generation failed: ${error}`);

      // Save error as system message
      const errorMessage = await this.prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'SYSTEM',
          content:
            'Przepraszam, wystapil blad podczas generowania odpowiedzi. Sprobuj ponownie.',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });

      return {
        userMessage,
        assistantMessage: errorMessage,
        tokensUsed: null,
        model: null,
        isMock: false,
      };
    }
  }

  // ============================================================
  // Suggested questions
  // ============================================================

  /**
   * Return context-aware suggested questions.
   * Questions are curated for common Polish tax/accounting scenarios.
   */
  getSuggestedQuestions(context?: ChatContext): SuggestedQuestion[] {
    const generalQuestions: SuggestedQuestion[] = [
      {
        question: 'Jakie sa terminy podatkowe w tym miesiacu?',
        context: 'GENERAL',
      },
      {
        question: 'Jaka forme opodatkowania wybrac dla mojej dzialalnosci?',
        context: 'GENERAL',
      },
      {
        question: 'Jak obliczyc zaliczke na podatek dochodowy?',
        context: 'GENERAL',
      },
    ];

    const taxQuestions: SuggestedQuestion[] = [
      {
        question: 'Jak rozliczyc PIT roczny z dzialalnosci i etatu?',
        context: 'TAX',
      },
      {
        question: 'Jakie ulgi podatkowe moge odliczyc?',
        context: 'TAX',
      },
      {
        question: 'Czym sie rozni skala podatkowa od podatku liniowego?',
        context: 'TAX',
      },
      {
        question: 'Jak przejsc z ryczaltu na zasady ogolne?',
        context: 'TAX',
      },
      {
        question: 'Kiedy oplaca sie podatek liniowy 19%?',
        context: 'TAX',
      },
    ];

    const zusQuestions: SuggestedQuestion[] = [
      {
        question: 'Ile wynosi skladka ZUS w tym miesiacu?',
        context: 'ZUS',
      },
      {
        question: 'Jak dziala ulga na start i preferencyjny ZUS?',
        context: 'ZUS',
      },
      {
        question: 'Jak obliczyc skladke zdrowotna przy podatku liniowym?',
        context: 'ZUS',
      },
      {
        question: 'Czy moge odliczyc skladki ZUS od dochodu?',
        context: 'ZUS',
      },
    ];

    const invoiceQuestions: SuggestedQuestion[] = [
      {
        question: 'Jakie elementy musi zawierac faktura VAT?',
        context: 'INVOICE',
      },
      {
        question: 'Jak wystawic fakture w KSeF?',
        context: 'INVOICE',
      },
      {
        question: 'Kiedy moge odliczyc VAT z faktury zakupowej?',
        context: 'INVOICE',
      },
      {
        question: 'Jak skorygowac bledna fakture?',
        context: 'INVOICE',
      },
    ];

    const kpirQuestions: SuggestedQuestion[] = [
      {
        question: 'Jak prawidlowo zaksiegowac fakture kosztowa w KPiR?',
        context: 'KPiR',
      },
      {
        question: 'Kiedy nalezy przeprowadzic remanent (spis z natury)?',
        context: 'KPiR',
      },
      {
        question: 'Jak zaksiegowac amortyzacje srodka trwalego?',
        context: 'KPiR',
      },
      {
        question: 'Jakie koszty moge wpisac do KPiR?',
        context: 'KPiR',
      },
    ];

    // Filter by context if provided
    if (context) {
      switch (context) {
        case 'TAX':
          return [...taxQuestions, ...generalQuestions.slice(0, 1)];
        case 'ZUS':
          return [...zusQuestions, ...generalQuestions.slice(0, 1)];
        case 'INVOICE':
          return [...invoiceQuestions, ...generalQuestions.slice(0, 1)];
        case 'KPiR':
          return [...kpirQuestions, ...generalQuestions.slice(0, 1)];
        case 'GENERAL':
        default:
          return [
            ...generalQuestions,
            taxQuestions[0],
            zusQuestions[0],
            invoiceQuestions[0],
            kpirQuestions[0],
          ];
      }
    }

    // Return a mixed set when no context specified
    return [
      ...generalQuestions,
      taxQuestions[0],
      zusQuestions[0],
      invoiceQuestions[0],
      kpirQuestions[0],
    ];
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Map database message roles to OpenAI API roles.
   */
  private mapRoleForAI(role: string): 'system' | 'user' | 'assistant' {
    switch (role) {
      case 'USER':
        return 'user';
      case 'ASSISTANT':
        return 'assistant';
      case 'SYSTEM':
        return 'system';
      default:
        return 'user';
    }
  }

  /**
   * Generate a default conversation title based on context.
   */
  private generateDefaultTitle(context?: ChatContext): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    switch (context) {
      case 'TAX':
        return `Podatki - ${dateStr}`;
      case 'ZUS':
        return `ZUS - ${dateStr}`;
      case 'INVOICE':
        return `Faktury - ${dateStr}`;
      case 'KPiR':
        return `KPiR - ${dateStr}`;
      case 'GENERAL':
      default:
        return `Rozmowa - ${dateStr}`;
    }
  }
}
