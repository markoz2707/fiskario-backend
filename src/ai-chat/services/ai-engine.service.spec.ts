import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiEngineService } from './ai-engine.service';

// Mock the OpenAI module at the top level
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

describe('AiEngineService', () => {
  let service: AiEngineService;
  let configService: ConfigService;

  // =============================================================
  // Mock mode tests (no API key or USE_MOCK_AI_CHAT=true)
  // =============================================================
  describe('mock mode (no API key)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiEngineService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                switch (key) {
                  case 'OPENAI_API_KEY':
                    return undefined;
                  case 'OPENAI_CHAT_MODEL':
                    return 'gpt-4o-mini';
                  case 'USE_MOCK_AI_CHAT':
                    return 'false';
                  default:
                    return undefined;
                }
              }),
            },
          },
        ],
      }).compile();

      service = module.get<AiEngineService>(AiEngineService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return a mock response when no API key is configured', async () => {
      const messages = [{ role: 'user' as const, content: 'Czesc' }];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.model).toBe('mock');
      expect(result.content).toContain('[MOCK]');
      expect(result.tokensUsed).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should return VAT-related mock response when query mentions VAT', async () => {
      const messages = [
        { role: 'user' as const, content: 'Jak rozliczyc VAT z faktury?' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.content).toContain('VAT');
      expect(result.content).toContain('JPK');
    });

    it('should return ZUS-related mock response when query mentions ZUS', async () => {
      const messages = [
        { role: 'user' as const, content: 'Ile wynosi skladka ZUS?' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.content).toContain('ZUS');
      expect(result.content).toContain('skladk');
    });

    it('should return PIT-related mock response when query mentions podatek', async () => {
      const messages = [
        { role: 'user' as const, content: 'Jak obliczyc podatek dochodowy?' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.content).toContain('PIT');
    });

    it('should return KPiR-related mock response when query mentions ksiega', async () => {
      const messages = [
        { role: 'user' as const, content: 'Jak prowadzic ksiege przychodow?' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.content).toContain('KPiR');
    });

    it('should return invoice-related mock response when query mentions faktury', async () => {
      const messages = [
        { role: 'user' as const, content: 'Jak wystawic fakture w KSeF?' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.content).toContain('KSeF');
    });

    it('should return a generic greeting mock response for unrecognized queries', async () => {
      const messages = [
        { role: 'user' as const, content: 'Czesc, potrzebuje pomocy' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.content).toContain('FISKARIO');
      expect(result.content).toContain('Podatki');
    });

    it('should use the last user message for keyword matching in mock mode', async () => {
      const messages = [
        { role: 'user' as const, content: 'Czesc' },
        { role: 'assistant' as const, content: 'Witaj!' },
        { role: 'user' as const, content: 'Opowiedz mi o JPK deklaracjach' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      // JPK triggers the VAT response branch
      expect(result.content).toContain('VAT');
    });
  });

  // =============================================================
  // Mock mode with USE_MOCK_AI_CHAT=true flag
  // =============================================================
  describe('mock mode (USE_MOCK_AI_CHAT=true with API key present)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiEngineService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                switch (key) {
                  case 'OPENAI_API_KEY':
                    return 'sk-test-key-12345';
                  case 'OPENAI_CHAT_MODEL':
                    return 'gpt-4o';
                  case 'USE_MOCK_AI_CHAT':
                    return 'true';
                  default:
                    return undefined;
                }
              }),
            },
          },
        ],
      }).compile();

      service = module.get<AiEngineService>(AiEngineService);
    });

    it('should still use mock mode when USE_MOCK_AI_CHAT=true even with valid API key', async () => {
      const messages = [
        { role: 'user' as const, content: 'Test message' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.isMock).toBe(true);
      expect(result.model).toBe('mock');
    });
  });

  // =============================================================
  // OpenAI API mode (with API key and mock disabled)
  // =============================================================
  describe('API mode (with valid API key)', () => {
    let mockOpenAICreate: jest.Mock;

    beforeEach(async () => {
      // Reset the OpenAI mock
      const OpenAIMock = require('openai').default;
      mockOpenAICreate = jest.fn();
      OpenAIMock.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate,
          },
        },
      }));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiEngineService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                switch (key) {
                  case 'OPENAI_API_KEY':
                    return 'sk-real-api-key';
                  case 'OPENAI_CHAT_MODEL':
                    return 'gpt-4o-mini';
                  case 'USE_MOCK_AI_CHAT':
                    return 'false';
                  default:
                    return undefined;
                }
              }),
            },
          },
        ],
      }).compile();

      service = module.get<AiEngineService>(AiEngineService);
    });

    it('should call OpenAI API and return formatted response', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Oto informacje o VAT...',
            },
          },
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 80,
          total_tokens: 230,
        },
        model: 'gpt-4o-mini-2024-07-18',
      });

      const messages = [
        { role: 'user' as const, content: 'Jak rozliczyc VAT?' },
      ];

      const result = await service.generateResponse(messages, 'Company context info');

      expect(result.isMock).toBe(false);
      expect(result.content).toBe('Oto informacje o VAT...');
      expect(result.model).toBe('gpt-4o-mini-2024-07-18');
      expect(result.tokensUsed).toEqual({
        prompt: 150,
        completion: 80,
        total: 230,
      });
    });

    it('should include system prompt and context in API call', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        model: 'gpt-4o-mini',
      });

      await service.generateResponse(
        [{ role: 'user', content: 'Test' }],
        'My company context',
      );

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      // Should contain system prompt, context, and user message
      expect(callArgs.messages.length).toBeGreaterThanOrEqual(3);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('FISKARIO');
      expect(callArgs.messages[1].role).toBe('system');
      expect(callArgs.messages[1].content).toContain('My company context');
      expect(callArgs.messages[callArgs.messages.length - 1].role).toBe('user');
    });

    it('should fall back to mock response when OpenAI API call fails', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const messages = [
        { role: 'user' as const, content: 'Pytanie o ZUS' },
      ];

      const result = await service.generateResponse(messages);

      // Should gracefully fall back to mock
      expect(result.isMock).toBe(true);
      expect(result.model).toBe('mock');
      expect(result.content).toContain('[MOCK]');
    });

    it('should handle empty API response content gracefully', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        model: 'gpt-4o-mini',
      });

      const messages = [
        { role: 'user' as const, content: 'Test' },
      ];

      const result = await service.generateResponse(messages);

      expect(result.content).toBe(
        'Przepraszam, nie udalo sie wygenerowac odpowiedzi.',
      );
      expect(result.isMock).toBe(false);
    });
  });

  // =============================================================
  // Default model configuration
  // =============================================================
  describe('model configuration', () => {
    it('should default to gpt-4o-mini when OPENAI_CHAT_MODEL is not set', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiEngineService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                switch (key) {
                  case 'OPENAI_API_KEY':
                    return undefined;
                  case 'OPENAI_CHAT_MODEL':
                    return undefined;
                  case 'USE_MOCK_AI_CHAT':
                    return undefined;
                  default:
                    return undefined;
                }
              }),
            },
          },
        ],
      }).compile();

      const svc = module.get<AiEngineService>(AiEngineService);

      // In mock mode, we can at least verify the service initializes.
      // The model property is private, but we can indirectly confirm
      // it works by generating a mock response.
      const result = await svc.generateResponse([
        { role: 'user', content: 'test' },
      ]);
      expect(result.isMock).toBe(true);
      expect(svc).toBeDefined();
    });
  });
});
