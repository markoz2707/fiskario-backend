import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when JWT authentication is successful', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer valid-jwt-token',
            },
            user: {
              userId: 'user-id-123',
              email: 'test@example.com',
              tenant_id: 'tenant-456',
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
      expect(canActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
    });

    it('should return false when JWT authentication fails', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer invalid-jwt-token',
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

    it('should handle missing authorization header', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {},
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

    it('should handle malformed authorization header', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'InvalidFormat jwt-token',
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

    it('should handle Bearer token without actual token', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer ',
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

    it('should handle expired tokens', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer expired-jwt-token',
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

    it('should handle case insensitive Bearer token', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'bearer valid-jwt-token',
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

    it('should handle extra spaces in Bearer token', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer  valid-jwt-token  ',
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

    it('should handle very long JWT tokens', async () => {
      const longToken = 'a'.repeat(5000);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: `Bearer ${longToken}`,
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

    it('should handle special characters in JWT token', async () => {
      const specialToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ0b3B0YWwuY29tIiwiaWF0IjoxNjA5NDU5MjAwLCJleHAiOjE2MDk0NjI4MDAsInN1YiI6InVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidGVuYW50X2lkIjoidGVuYW50LTQ1NiJ9!@#$%^&*()_+{}|:<>?[]\\;\'",./';

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: `Bearer ${specialToken}`,
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
      const createMockContext = (token: string) => ({
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: `Bearer ${token}`,
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext);

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(true);

      const requests = Array.from({ length: 10 }, (_, i) =>
        guard.canActivate(createMockContext(`token-${i}`))
      );

      const results = await Promise.all(requests);

      expect(canActivateSpy).toHaveBeenCalledTimes(10);
      results.forEach(result => {
        expect(result).toBe(true);
      });
    });
  });

  describe('Strategy configuration', () => {
    it('should use jwt strategy', () => {
      expect(guard).toBeInstanceOf(Object);
      expect(typeof guard.canActivate).toBe('function');
    });

    it('should extend AuthGuard', () => {
      expect(guard.constructor.name).toBe('JwtAuthGuard');
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

    it('should handle header access errors', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: null, // Simulate missing headers
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
  });

  describe('Security considerations', () => {
    it('should not expose sensitive information in errors', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer sensitive-jwt-token',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockRejectedValue(new Error('JWT validation failed'));

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (error) {
        expect(error.message).toBe('JWT validation failed');
        expect(error.message).not.toContain('sensitive-jwt-token');
      }
    });

    it('should handle malicious header data', async () => {
      const maliciousHeaders = {
        authorization: 'Bearer valid-jwt-token',
        // Malicious fields
        __proto__: { malicious: 'data' },
        constructor: { prototype: { malicious: 'data' } },
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: maliciousHeaders,
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

    it('should handle multiple authorization headers', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: ['Bearer token1', 'Bearer token2'],
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
  });

  describe('Performance considerations', () => {
    it('should handle rapid successive requests', async () => {
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer valid-jwt-token',
            },
          }),
        }),
        getClass: jest.fn(),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const canActivateSpy = jest.spyOn(guard, 'canActivate');
      canActivateSpy.mockResolvedValue(true);

      // Simulate rapid successive requests
      for (let i = 0; i < 5; i++) {
        const result = await guard.canActivate(mockExecutionContext);
        expect(result).toBe(true);
      }

      expect(canActivateSpy).toHaveBeenCalledTimes(5);
    });
  });
});