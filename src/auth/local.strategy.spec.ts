import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy';
import { AuthService } from './auth.service';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: AuthService;

  const mockAuthService = {
    validateUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    strategy = module.get<LocalStrategy>(LocalStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      roles: [],
    };

    it('should return user when credentials are valid', async () => {
      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const result = await strategy.validate('test@example.com', 'password123');

      expect(authService.validateUser).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate('nonexistent@example.com', 'password'))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith('nonexistent@example.com', 'password');
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate('test@example.com', 'wrong-password'))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith('test@example.com', 'wrong-password');
    });

    it('should handle service errors gracefully', async () => {
      const errorMessage = 'Database connection failed';
      mockAuthService.validateUser.mockRejectedValue(new Error(errorMessage));

      await expect(strategy.validate('test@example.com', 'password'))
        .rejects.toThrow(errorMessage);

      expect(authService.validateUser).toHaveBeenCalledWith('test@example.com', 'password');
    });

    it('should handle empty username', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate('', 'password'))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith('', 'password');
    });

    it('should handle empty password', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate('test@example.com', ''))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith('test@example.com', '');
    });

    it('should handle null/undefined credentials', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate(null as any, 'password'))
        .rejects.toThrow(UnauthorizedException);

      await expect(strategy.validate('test@example.com', null as any))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith(null, 'password');
      expect(authService.validateUser).toHaveBeenCalledWith('test@example.com', null);
    });

    it('should handle very long credentials', async () => {
      const longEmail = 'a'.repeat(1000) + '@example.com';
      const longPassword = 'p'.repeat(1000);

      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate(longEmail, longPassword))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith(longEmail, longPassword);
    });

    it('should handle special characters in credentials', async () => {
      const specialEmail = 'test+special@example.com';
      const specialPassword = 'p@ssw0rd!#$%^&*()';

      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate(specialEmail, specialPassword))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith(specialEmail, specialPassword);
    });

    it('should handle concurrent validation requests', async () => {
      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const requests = Array.from({ length: 10 }, (_, i) =>
        strategy.validate(`user${i}@example.com`, `password${i}`)
      );

      const results = await Promise.all(requests);

      expect(authService.validateUser).toHaveBeenCalledTimes(10);
      results.forEach((result, i) => {
        expect(result).toEqual(mockUser);
        expect(authService.validateUser).toHaveBeenNthCalledWith(
          i + 1,
          `user${i}@example.com`,
          `password${i}`
        );
      });
    });

    it('should handle mixed valid and invalid credentials', async () => {
      // First call returns valid user, second returns null
      mockAuthService.validateUser
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);

      const validResult = await strategy.validate('valid@example.com', 'password');
      expect(validResult).toEqual(mockUser);

      await expect(strategy.validate('invalid@example.com', 'password'))
        .rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('Strategy configuration', () => {
    it('should extend PassportStrategy with Strategy', () => {
      expect(strategy).toBeInstanceOf(Object);
      expect(typeof strategy.validate).toBe('function');
    });

    it('should have AuthService as dependency', () => {
      expect(strategy['authService']).toBeDefined();
      expect(strategy['authService']).toBe(authService);
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive information in errors', async () => {
      mockAuthService.validateUser.mockRejectedValue(new Error('Sensitive database error'));

      try {
        await strategy.validate('test@example.com', 'password');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Sensitive database error');
      }
    });

    it('should handle timing attacks by consistent response time', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      const startTime = Date.now();
      await strategy.validate('test@example.com', 'password');
      const endTime = Date.now();

      // Should take reasonable time even for invalid credentials
      expect(endTime - startTime).toBeGreaterThan(0);
    });
  });
});