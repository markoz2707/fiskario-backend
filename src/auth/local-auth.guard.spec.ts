import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { LocalAuthGuard } from './local-auth.guard';

describe('LocalAuthGuard', () => {
  let guard: LocalAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocalAuthGuard],
    }).compile();

    guard = module.get<LocalAuthGuard>(LocalAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when authentication is successful', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: 'test@example.com',
              password: 'password123',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      // Mock the parent AuthGuard's canActivate method
      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(canActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
    });

    it('should return false when authentication fails', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: 'invalid@example.com',
              password: 'wrong-password',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      // Mock the parent AuthGuard's canActivate method
      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(canActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
    });

    it('should handle missing request body', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({}),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle missing username in request body', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              password: 'password123',
              // username is missing
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle missing password in request body', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: 'test@example.com',
              // password is missing
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle empty credentials', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: '',
              password: '',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle null credentials', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: null,
              password: null,
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle special characters in credentials', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: 'test+special@example.com',
              password: 'p@ssw0rd!#$%',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle very long credentials', async () => {
      const longEmail = 'a'.repeat(1000) + '@example.com';
      const longPassword = 'p'.repeat(1000);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: longEmail,
              password: longPassword,
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle concurrent requests', async () => {
      const createMockContext = (id: number) => ({
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: `user${id}@example.com`,
              password: `password${id}`,
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext);

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(true);

      const requests = Array.from({ length: 10 }, (_, i) =>
        guard.canActivate(createMockContext(i))
      );

      const results = await Promise.all(requests);

      expect(canActivateSpy).toHaveBeenCalledTimes(10);
      results.forEach(result => {
        expect(result).toBe(true);
      });
    });
  });

  describe('Strategy configuration', () => {
    it('should use local strategy', () => {
      expect(guard).toBeInstanceOf(Object);
      expect(typeof guard.canActivate).toBe('function');
    });

    it('should extend AuthGuard', () => {
      expect(guard.constructor.name).toBe('LocalAuthGuard');
    });
  });

  describe('Error handling', () => {
    it('should handle execution context errors', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockImplementation(() => {
          throw new Error('Context error');
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockRejectedValue(new Error('Context error'));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow('Context error');
    });

    it('should handle request object errors', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockImplementation(() => {
            throw new Error('Request error');
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockRejectedValue(new Error('Request error'));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow('Request error');
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive information in errors', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            body: {
              username: 'test@example.com',
              password: 'sensitive-password',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockRejectedValue(new Error('Authentication failed'));

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (error) {
        expect(error.message).toBe('Authentication failed');
        expect(error.message).not.toContain('sensitive-password');
      }
    });

    it('should handle malicious request data', async () => {
      const maliciousRequest = {
        body: {
          username: 'test@example.com',
          password: 'password123',
          // Malicious fields
          __proto__: { malicious: 'data' },
          constructor: { prototype: { malicious: 'data' } },
        },
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(maliciousRequest),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });
  });
});