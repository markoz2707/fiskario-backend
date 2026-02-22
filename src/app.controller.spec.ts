import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health check with status ok when database is reachable', async () => {
      const result = await appController.getHealth();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.version).toBeDefined();
      expect(result.checks.database.status).toBe('ok');
      expect(typeof result.checks.database.responseTime).toBe('number');
      expect(result.checks.memory.heapUsed).toMatch(/^\d+MB$/);
      expect(result.checks.memory.heapTotal).toMatch(/^\d+MB$/);
      expect(result.checks.memory.rss).toMatch(/^\d+MB$/);
    });

    it('should return health check with status error when database is unreachable', async () => {
      mockPrismaService.$queryRaw.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const result = await appController.getHealth();

      expect(result.status).toBe('error');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.error).toBe('Connection refused');
    });
  });
});
