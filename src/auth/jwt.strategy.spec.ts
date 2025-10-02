import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('constructor', () => {
    it('should configure JWT extraction from Authorization header', () => {
      const strategyConfig = (strategy as any).strategyConfig;
      expect(strategyConfig.jwtFromRequest).toBeDefined();
      expect(typeof strategyConfig.jwtFromRequest).toBe('function');
    });

    it('should not ignore expiration', () => {
      const strategyConfig = (strategy as any).strategyConfig;
      expect(strategyConfig.ignoreExpiration).toBe(false);
    });

    it('should use secret key for verification', () => {
      const strategyConfig = (strategy as any).strategyConfig;
      expect(strategyConfig.secretOrKey).toBe('secret');
    });

    it('should use Bearer token extraction', () => {
      const jwtFromRequest = (strategy as any).strategyConfig.jwtFromRequest;
      const mockRequest = {
        headers: {
          authorization: 'Bearer jwt-token-here',
        },
      };

      const token = jwtFromRequest(mockRequest);
      expect(token).toBe('jwt-token-here');
    });
  });

  describe('validate', () => {
    it('should return user data from valid payload', async () => {
      const payload = {
        sub: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
      });
    });

    it('should handle payload without tenant_id', async () => {
      const payload = {
        sub: 'user-id-123',
        email: 'test@example.com',
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        tenant_id: undefined,
      });
    });

    it('should handle payload with null values', async () => {
      const payload = {
        sub: null,
        email: null,
        tenant_id: null,
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: null,
        email: null,
        tenant_id: null,
      });
    });

    it('should handle empty payload', async () => {
      const payload = {};

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: undefined,
        email: undefined,
        tenant_id: undefined,
      });
    });

    it('should handle payload with additional fields', async () => {
      const payload = {
        sub: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
        role: 'admin',
        permissions: ['read', 'write'],
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
      });

      // Should not include additional fields
      expect(result).not.toHaveProperty('role');
      expect(result).not.toHaveProperty('permissions');
    });

    it('should handle very large payloads', async () => {
      const largePayload = {
        sub: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
        iat: 1609459200,
        exp: 1609462800,
        // Add many fields to simulate large payload
        ...Array.from({ length: 1000 }, (_, i) => ({ [`field${i}`]: `value${i}` })),
      };

      const result = await strategy.validate(largePayload);

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
      });
    });

    it('should handle special characters in payload', async () => {
      const payload = {
        sub: 'user-id-123',
        email: 'test+special@example.com',
        tenant_id: 'tenant-456',
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test+special@example.com',
        tenant_id: 'tenant-456',
      });
    });

    it('should handle numeric user IDs', async () => {
      const payload = {
        sub: 12345,
        email: 'test@example.com',
        tenant_id: 'tenant-456',
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 12345,
        email: 'test@example.com',
        tenant_id: 'tenant-456',
      });
    });
  });

  describe('Bearer token extraction', () => {
    const jwtFromRequest = (strategy as any).strategyConfig.jwtFromRequest;

    it('should extract token from valid Bearer header', () => {
      const request = {
        headers: {
          authorization: 'Bearer jwt-token-here',
        },
      };

      const token = jwtFromRequest(request);
      expect(token).toBe('jwt-token-here');
    });

    it('should return undefined for missing authorization header', () => {
      const request = {
        headers: {},
      };

      const token = jwtFromRequest(request);
      expect(token).toBeUndefined();
    });

    it('should return undefined for malformed authorization header', () => {
      const request = {
        headers: {
          authorization: 'InvalidFormat jwt-token-here',
        },
      };

      const token = jwtFromRequest(request);
      expect(token).toBeUndefined();
    });

    it('should return undefined for Bearer header without token', () => {
      const request = {
        headers: {
          authorization: 'Bearer ',
        },
      };

      const token = jwtFromRequest(request);
      expect(token).toBeUndefined();
    });

    it('should handle case insensitive Bearer', () => {
      const request = {
        headers: {
          authorization: 'bearer jwt-token-here',
        },
      };

      const token = jwtFromRequest(request);
      expect(token).toBe('jwt-token-here');
    });

    it('should handle extra spaces in Bearer header', () => {
      const request = {
        headers: {
          authorization: 'Bearer  jwt-token-here  ',
        },
      };

      const token = jwtFromRequest(request);
      expect(token).toBe('jwt-token-here');
    });

    it('should handle multiple authorization headers', () => {
      const request = {
        headers: {
          authorization: ['Bearer jwt-token-here', 'Bearer another-token'],
        },
      };

      const token = jwtFromRequest(request);
      expect(token).toBe('jwt-token-here');
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive payload data', async () => {
      const sensitivePayload = {
        sub: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
        password: 'hashed-password',
        secret: 'api-secret',
        iat: 1609459200,
        exp: 1609462800,
      };

      const result = await strategy.validate(sensitivePayload);

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('secret');
      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
      });
    });

    it('should handle malicious payload data', async () => {
      const maliciousPayload = {
        sub: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
        iat: 1609459200,
        exp: 1609462800,
        // Malicious fields
        __proto__: { malicious: 'data' },
        constructor: { prototype: { malicious: 'data' } },
      };

      const result = await strategy.validate(maliciousPayload);

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        tenant_id: 'tenant-456',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle null payload', async () => {
      const result = await strategy.validate(null as any);

      expect(result).toEqual({
        userId: undefined,
        email: undefined,
        tenant_id: undefined,
      });
    });

    it('should handle undefined payload', async () => {
      const result = await strategy.validate(undefined as any);

      expect(result).toEqual({
        userId: undefined,
        email: undefined,
        tenant_id: undefined,
      });
    });

    it('should handle payload with invalid data types', async () => {
      const invalidPayload = {
        sub: { nested: 'object' },
        email: ['array', 'email'],
        tenant_id: 123,
        iat: 'invalid-date',
        exp: true,
      };

      const result = await strategy.validate(invalidPayload);

      expect(result).toEqual({
        userId: { nested: 'object' },
        email: ['array', 'email'],
        tenant_id: 123,
      });
    });
  });
});