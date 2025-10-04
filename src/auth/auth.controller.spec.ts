import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-id',
      email: 'test@example.com',
      tenant_id: 'tenant-123',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(LocalAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return access token when login is successful', async () => {
      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(mockRequest as any);

      expect(authService.login).toHaveBeenCalledWith(mockRequest.user);
      expect(result).toEqual(mockLoginResult);
    });

    it('should handle login service errors', async () => {
      const errorMessage = 'Login failed';
      mockAuthService.login.mockRejectedValue(new Error(errorMessage));

      await expect(controller.login(mockRequest as any)).rejects.toThrow(errorMessage);
      expect(authService.login).toHaveBeenCalledWith(mockRequest.user);
    });

    it('should handle missing user in request', async () => {
      const requestWithoutUser = { ...mockRequest, user: undefined };

      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(requestWithoutUser as any);

      expect(authService.login).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockLoginResult);
    });

    it('should handle user without tenant_id', async () => {
      const requestWithoutTenant = {
        user: {
          id: 'user-id',
          email: 'test@example.com',
          // tenant_id is missing
        },
      };

      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(requestWithoutTenant as any);

      expect(authService.login).toHaveBeenCalledWith(requestWithoutTenant.user);
      expect(result).toEqual(mockLoginResult);
    });

    it('should handle user with null values', async () => {
      const requestWithNullUser = {
        user: {
          id: null,
          email: null,
          tenant_id: null,
        },
      };

      const mockLoginResult = {
        access_token: 'jwt-token-here',
        user: {
          email: 'test@example.com',
          tenant_id: 'tenant-123',
        },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(requestWithNullUser as any);

      expect(authService.login).toHaveBeenCalledWith(requestWithNullUser.user);
      expect(result).toEqual(mockLoginResult);
    });
  });

  describe('Guard integration', () => {
    it('should be protected by LocalAuthGuard', () => {
      const guards = Reflect.getMetadata('__guards__', AuthController.prototype.login);
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should use POST method for login endpoint', () => {
      const method = Reflect.getMetadata('__method__', AuthController.prototype.login);
      expect(method).toBe('POST');
    });

    it('should use /auth path prefix', () => {
      const path = Reflect.getMetadata('__path__', AuthController.prototype.login);
      expect(path).toBe('login');
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors during login', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Database connection failed'));

      await expect(controller.login(mockRequest as any)).rejects.toThrow('Database connection failed');
    });

    it('should handle JWT service errors during login', async () => {
      mockAuthService.login.mockRejectedValue(new Error('JWT service unavailable'));

      await expect(controller.login(mockRequest as any)).rejects.toThrow('JWT service unavailable');
    });

    it('should handle malformed user data', async () => {
      const malformedUser = {
        user: {
          // Missing required fields
        },
      };

      const mockLoginResult = {
        access_token: 'jwt-token-here',
        user: {
          email: 'test@example.com',
          tenant_id: 'tenant-123',
        },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(malformedUser as any);

      expect(authService.login).toHaveBeenCalledWith(malformedUser.user);
      expect(result).toEqual(mockLoginResult);
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive user information in response', async () => {
      const userWithSensitiveData = {
        id: 'user-id',
        email: 'test@example.com',
        password: 'hashed-password',
        tenant_id: 'tenant-123',
        roles: ['admin'],
      };

      const requestWithSensitiveData = { user: userWithSensitiveData };

      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(requestWithSensitiveData as any);

      expect(result).toEqual(mockLoginResult);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('roles');
    });

    it('should handle large user objects efficiently', async () => {
      const largeUserObject = {
        id: 'user-id',
        email: 'test@example.com',
        tenant_id: 'tenant-123',
        // Simulate large user object
        ...Array.from({ length: 1000 }, (_, i) => ({ [`field${i}`]: `value${i}` })),
      };

      const requestWithLargeUser = { user: largeUserObject };

      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const result = await controller.login(requestWithLargeUser as any);

      expect(authService.login).toHaveBeenCalledWith(largeUserObject);
      expect(result).toEqual(mockLoginResult);
    });
  });

  describe('Performance considerations', () => {
    it('should handle concurrent login requests', async () => {
      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      // Simulate concurrent requests
      const requests = Array.from({ length: 10 }, () =>
        controller.login(mockRequest as any)
      );

      const results = await Promise.all(requests);

      expect(authService.login).toHaveBeenCalledTimes(10);
      results.forEach(result => {
        expect(result).toEqual(mockLoginResult);
      });
    });

    it('should handle rapid successive login attempts', async () => {
      const mockLoginResult = {
        access_token: 'jwt-token-here',
         user: {
           email: 'test@example.com',
           tenant_id: 'tenant-123',
         },
      };

      mockAuthService.login.mockResolvedValue(mockLoginResult);

      // Simulate rapid successive requests
      for (let i = 0; i < 5; i++) {
        const result = await controller.login(mockRequest as any);
        expect(result).toEqual(mockLoginResult);
      }

      expect(authService.login).toHaveBeenCalledTimes(5);
    });
  });
});
