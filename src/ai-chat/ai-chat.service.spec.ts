import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiChatService } from './ai-chat.service';
import { AiEngineService } from './services/ai-engine.service';
import { ContextBuilderService } from './services/context-builder.service';

describe('AiChatService', () => {
  let service: AiChatService;
  let prisma: PrismaService;
  let aiEngine: AiEngineService;
  let contextBuilder: ContextBuilderService;

  const mockPrisma = {
    chatConversation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
    },
  };

  const mockAiEngine = {
    generateResponse: jest.fn(),
  };

  const mockContextBuilder = {
    buildCompanyContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiChatService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: AiEngineService,
          useValue: mockAiEngine,
        },
        {
          provide: ContextBuilderService,
          useValue: mockContextBuilder,
        },
      ],
    }).compile();

    service = module.get<AiChatService>(AiChatService);
    prisma = module.get<PrismaService>(PrismaService);
    aiEngine = module.get<AiEngineService>(AiEngineService);
    contextBuilder = module.get<ContextBuilderService>(ContextBuilderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =============================================================
  // createConversation
  // =============================================================
  describe('createConversation', () => {
    it('should create a conversation with a custom title and context', async () => {
      const created = {
        id: 'conv-1',
        tenant_id: 't1',
        company_id: 'c1',
        user_id: 'u1',
        title: 'Moje pytanie o VAT',
        context: 'TAX',
        status: 'ACTIVE',
        messages: [],
      };
      mockPrisma.chatConversation.create.mockResolvedValue(created);

      const result = await service.createConversation(
        't1',
        'c1',
        'u1',
        'Moje pytanie o VAT',
        'TAX',
      );

      expect(result).toEqual(created);
      expect(mockPrisma.chatConversation.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          company_id: 'c1',
          user_id: 'u1',
          title: 'Moje pytanie o VAT',
          context: 'TAX',
          status: 'ACTIVE',
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    it('should generate a default title when none is provided', async () => {
      const created = {
        id: 'conv-2',
        tenant_id: 't1',
        company_id: 'c1',
        user_id: 'u1',
        title: expect.stringContaining('Rozmowa'),
        context: 'GENERAL',
        status: 'ACTIVE',
        messages: [],
      };
      mockPrisma.chatConversation.create.mockResolvedValue(created);

      await service.createConversation('t1', 'c1', 'u1');

      // The data.title should be a generated default (contains date)
      const callData = mockPrisma.chatConversation.create.mock.calls[0][0].data;
      expect(callData.title).toContain('Rozmowa');
      expect(callData.context).toBe('GENERAL');
    });

    it('should generate context-specific default titles for ZUS context', async () => {
      mockPrisma.chatConversation.create.mockResolvedValue({
        id: 'conv-3',
        messages: [],
      });

      await service.createConversation('t1', 'c1', 'u1', undefined, 'ZUS');

      const callData = mockPrisma.chatConversation.create.mock.calls[0][0].data;
      expect(callData.title).toContain('ZUS');
    });
  });

  // =============================================================
  // getConversations (pagination)
  // =============================================================
  describe('getConversations', () => {
    it('should return paginated conversations with metadata', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Test conversation',
          context: 'GENERAL',
          status: 'ACTIVE',
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-02'),
          messages: [
            {
              role: 'USER',
              content: 'Hello there',
              createdAt: new Date('2025-01-02'),
            },
          ],
          _count: { messages: 5 },
        },
      ];

      mockPrisma.chatConversation.findMany.mockResolvedValue(mockConversations);
      mockPrisma.chatConversation.count.mockResolvedValue(1);

      const result = await service.getConversations('t1', 'c1', 'u1', 1, 20);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].messageCount).toBe(5);
      expect(result.conversations[0].lastMessage).toBeDefined();
      expect(result.conversations[0].lastMessage!.content).toBe('Hello there');
    });

    it('should truncate long last message content to 100 characters', async () => {
      const longContent = 'A'.repeat(150);
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Long message',
          context: 'GENERAL',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [
            {
              role: 'USER',
              content: longContent,
              createdAt: new Date(),
            },
          ],
          _count: { messages: 1 },
        },
      ];

      mockPrisma.chatConversation.findMany.mockResolvedValue(mockConversations);
      mockPrisma.chatConversation.count.mockResolvedValue(1);

      const result = await service.getConversations('t1', 'c1', 'u1');

      expect(result.conversations[0].lastMessage!.content.length).toBe(103); // 100 + '...'
      expect(result.conversations[0].lastMessage!.content.endsWith('...')).toBe(true);
    });

    it('should filter by status when provided', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);
      mockPrisma.chatConversation.count.mockResolvedValue(0);

      await service.getConversations('t1', 'c1', 'u1', 1, 20, 'ARCHIVED');

      const findManyCall = mockPrisma.chatConversation.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe('ARCHIVED');
    });

    it('should calculate correct skip offset for page 3', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);
      mockPrisma.chatConversation.count.mockResolvedValue(50);

      const result = await service.getConversations('t1', 'c1', 'u1', 3, 10);

      const findManyCall = mockPrisma.chatConversation.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(20); // (3-1) * 10
      expect(findManyCall.take).toBe(10);
      expect(result.totalPages).toBe(5); // Math.ceil(50/10)
    });
  });

  // =============================================================
  // getConversation (single)
  // =============================================================
  describe('getConversation', () => {
    it('should return a conversation with all messages', async () => {
      const mockConv = {
        id: 'conv-1',
        tenant_id: 't1',
        title: 'Test',
        messages: [
          { id: 'msg-1', role: 'USER', content: 'Hello' },
          { id: 'msg-2', role: 'ASSISTANT', content: 'Hi!' },
        ],
      };
      mockPrisma.chatConversation.findFirst.mockResolvedValue(mockConv);

      const result = await service.getConversation('t1', 'conv-1');

      expect(result).toEqual(mockConv);
      expect(mockPrisma.chatConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', tenant_id: 't1' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversation('t1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =============================================================
  // archiveConversation
  // =============================================================
  describe('archiveConversation', () => {
    it('should archive an active conversation', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        status: 'ACTIVE',
      });
      mockPrisma.chatConversation.update.mockResolvedValue({
        id: 'conv-1',
        status: 'ARCHIVED',
      });

      const result = await service.archiveConversation('t1', 'conv-1');

      expect(result.status).toBe('ARCHIVED');
      expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'ARCHIVED' },
      });
    });

    it('should throw NotFoundException for non-existent conversation', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.archiveConversation('t1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when conversation is already archived', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        status: 'ARCHIVED',
      });

      await expect(
        service.archiveConversation('t1', 'conv-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================================
  // sendMessage
  // =============================================================
  describe('sendMessage', () => {
    it('should save user message, call AI engine, and return both messages', async () => {
      // Conversation with no previous messages (first message)
      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        tenant_id: 't1',
        company_id: 'c1',
        status: 'ACTIVE',
        title: null,
        messages: [],
      });

      const userMsg = { id: 'msg-1', role: 'USER', content: 'Jak obliczyc VAT?' };
      const assistantMsg = {
        id: 'msg-2',
        role: 'ASSISTANT',
        content: '[MOCK] Informacje o VAT...',
      };

      mockPrisma.chatMessage.create
        .mockResolvedValueOnce(userMsg)
        .mockResolvedValueOnce(assistantMsg);

      mockContextBuilder.buildCompanyContext.mockResolvedValue('Company context data');
      mockAiEngine.generateResponse.mockResolvedValue({
        content: '[MOCK] Informacje o VAT...',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        model: 'mock',
        isMock: true,
      });

      mockPrisma.chatConversation.update.mockResolvedValue({});

      const result = await service.sendMessage('t1', 'conv-1', 'Jak obliczyc VAT?');

      expect(result.userMessage).toEqual(userMsg);
      expect(result.assistantMessage).toEqual(assistantMsg);
      expect(result.tokensUsed).toEqual({ prompt: 100, completion: 50, total: 150 });
      expect(result.model).toBe('mock');
      expect(result.isMock).toBe(true);

      // Verify context builder and AI engine were called
      expect(mockContextBuilder.buildCompanyContext).toHaveBeenCalledWith('t1', 'c1');
      expect(mockAiEngine.generateResponse).toHaveBeenCalled();
    });

    it('should auto-generate conversation title on first message', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        tenant_id: 't1',
        company_id: 'c1',
        status: 'ACTIVE',
        title: null,
        messages: [], // Empty - this is the first message
      });

      mockPrisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'msg-1' })
        .mockResolvedValueOnce({ id: 'msg-2' });
      mockContextBuilder.buildCompanyContext.mockResolvedValue('');
      mockAiEngine.generateResponse.mockResolvedValue({
        content: 'Response',
        tokensUsed: null,
        model: 'mock',
        isMock: true,
      });
      mockPrisma.chatConversation.update.mockResolvedValue({});

      await service.sendMessage('t1', 'conv-1', 'Short question');

      // Because messages.length === 0, title should be auto-generated
      const updateCall = mockPrisma.chatConversation.update.mock.calls[0][0];
      expect(updateCall.data.title).toBe('Short question');
    });

    it('should truncate auto-generated title to 60 characters with ellipsis', async () => {
      const longMessage = 'A'.repeat(80);

      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        tenant_id: 't1',
        company_id: 'c1',
        status: 'ACTIVE',
        title: null,
        messages: [],
      });

      mockPrisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'msg-1' })
        .mockResolvedValueOnce({ id: 'msg-2' });
      mockContextBuilder.buildCompanyContext.mockResolvedValue('');
      mockAiEngine.generateResponse.mockResolvedValue({
        content: 'Response',
        tokensUsed: null,
        model: 'mock',
        isMock: true,
      });
      mockPrisma.chatConversation.update.mockResolvedValue({});

      await service.sendMessage('t1', 'conv-1', longMessage);

      const updateCall = mockPrisma.chatConversation.update.mock.calls[0][0];
      expect(updateCall.data.title.length).toBe(63); // 60 + '...'
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage('t1', 'nonexistent', 'Hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when sending to an archived conversation', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        status: 'ARCHIVED',
        messages: [],
      });

      await expect(
        service.sendMessage('t1', 'conv-1', 'Hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle AI engine failure gracefully by saving an error system message', async () => {
      mockPrisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        tenant_id: 't1',
        company_id: 'c1',
        status: 'ACTIVE',
        title: 'Existing title',
        messages: [{ id: 'prev-msg', role: 'USER', content: 'Previous' }],
      });

      const userMsg = { id: 'msg-1', role: 'USER', content: 'New question' };
      const errorMsg = {
        id: 'msg-err',
        role: 'SYSTEM',
        content: 'Przepraszam, wystapil blad podczas generowania odpowiedzi. Sprobuj ponownie.',
      };

      mockPrisma.chatMessage.create
        .mockResolvedValueOnce(userMsg)
        .mockResolvedValueOnce(errorMsg);
      mockContextBuilder.buildCompanyContext.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const result = await service.sendMessage('t1', 'conv-1', 'New question');

      expect(result.userMessage).toEqual(userMsg);
      expect(result.assistantMessage).toEqual(errorMsg);
      expect(result.tokensUsed).toBeNull();
      expect(result.model).toBeNull();
      expect(result.isMock).toBe(false);
    });
  });

  // =============================================================
  // getSuggestedQuestions
  // =============================================================
  describe('getSuggestedQuestions', () => {
    it('should return TAX-specific questions when context is TAX', () => {
      const questions = service.getSuggestedQuestions('TAX');

      expect(questions.length).toBeGreaterThan(0);
      // All questions except the last one (general) should have TAX context
      const taxQuestions = questions.filter((q) => q.context === 'TAX');
      expect(taxQuestions.length).toBeGreaterThanOrEqual(4);
    });

    it('should return ZUS-specific questions when context is ZUS', () => {
      const questions = service.getSuggestedQuestions('ZUS');

      const zusQuestions = questions.filter((q) => q.context === 'ZUS');
      expect(zusQuestions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return INVOICE-specific questions when context is INVOICE', () => {
      const questions = service.getSuggestedQuestions('INVOICE');

      const invoiceQuestions = questions.filter((q) => q.context === 'INVOICE');
      expect(invoiceQuestions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return KPiR-specific questions when context is KPiR', () => {
      const questions = service.getSuggestedQuestions('KPiR');

      const kpirQuestions = questions.filter((q) => q.context === 'KPiR');
      expect(kpirQuestions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return a mixed set of questions for GENERAL context', () => {
      const questions = service.getSuggestedQuestions('GENERAL');

      const contexts = new Set(questions.map((q) => q.context));
      // GENERAL context should include questions from multiple contexts
      expect(contexts.size).toBeGreaterThanOrEqual(3);
    });

    it('should return a mixed set when no context is provided', () => {
      const questions = service.getSuggestedQuestions();

      expect(questions.length).toBeGreaterThan(0);
      const contexts = new Set(questions.map((q) => q.context));
      expect(contexts.size).toBeGreaterThanOrEqual(3);
    });

    it('should always include at least one GENERAL question in context-specific results', () => {
      for (const ctx of ['TAX', 'ZUS', 'INVOICE', 'KPiR'] as const) {
        const questions = service.getSuggestedQuestions(ctx);
        const generalQuestions = questions.filter((q) => q.context === 'GENERAL');
        expect(generalQuestions.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
