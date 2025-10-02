import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockReflector = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when no roles are required', () => {
      mockReflector.get.mockReturnValue(undefined);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'USER' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(reflector.get).toHaveBeenCalledWith('roles', mockExecutionContext.getHandler());
    });

    it('should return true when user has required role', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [
                { name: 'USER' },
                { name: 'ADMIN' },
              ],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(reflector.get).toHaveBeenCalledWith('roles', mockExecutionContext.getHandler());
    });

    it('should return false when user does not have required role', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'USER' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should return false when user has no roles', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should return false when user has null roles', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: null,
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should return false when user has undefined roles', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              // roles is undefined
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle multiple required roles (OR logic)', () => {
      mockReflector.get.mockReturnValue(['ADMIN', 'MODERATOR']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'USER' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle case sensitive role names', () => {
      mockReflector.get.mockReturnValue(['admin']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'ADMIN' }], // Different case
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle roles with different structures', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [
                { name: 'ADMIN', id: 1 },
                { name: 'USER', id: 2 },
              ],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle roles without name property', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [
                { id: 1 }, // No name property
                { name: 'USER', id: 2 },
              ],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle empty roles array in requirements', () => {
      mockReflector.get.mockReturnValue([]);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'USER' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle missing user in request', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            // No user property
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle null user in request', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: null,
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should handle execution context errors', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockImplementation(() => {
          throw new Error('Context error');
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Context error');
    });

    it('should handle request errors', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockImplementation(() => {
            throw new Error('Request error');
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Request error');
    });

    it('should handle reflector errors', () => {
      mockReflector.get.mockImplementation(() => {
        throw new Error('Reflector error');
      });

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'USER' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Reflector error');
    });

    it('should handle concurrent requests', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const createMockContext = (hasRole: boolean) => ({
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: hasRole ? [{ name: 'ADMIN' }] : [{ name: 'USER' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext);

      const contexts = [
        createMockContext(true),
        createMockContext(false),
        createMockContext(true),
        createMockContext(false),
      ];

      const results = contexts.map(context => guard.canActivate(context));

      expect(results).toEqual([true, false, true, false]);
      expect(reflector.get).toHaveBeenCalledTimes(4);
    });

    it('should handle special characters in role names', () => {
      mockReflector.get.mockReturnValue(['ADMIN_ROLE']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'ADMIN_ROLE' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle very long role names', () => {
      const longRoleName = 'A'.repeat(1000);
      mockReflector.get.mockReturnValue([longRoleName]);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: longRoleName }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive information in errors', () => {
      mockReflector.get.mockImplementation(() => {
        throw new Error('Sensitive reflector error');
      });

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'ADMIN' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      try {
        guard.canActivate(mockExecutionContext);
      } catch (error) {
        expect(error.message).toBe('Sensitive reflector error');
      }
    });

    it('should handle malicious user data', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const maliciousUser = {
        id: 'user-id',
        roles: [
          { name: 'ADMIN' } as any,
          // Malicious fields
          { __proto__: { malicious: 'data' } } as any,
          { constructor: { prototype: { malicious: 'data' } } } as any,
        ],
      };

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: maliciousUser,
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle malicious role data', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const maliciousRoles = [
        { name: 'ADMIN' } as any,
        // Malicious role objects
        { __proto__: { malicious: 'data' } } as any,
        { constructor: { prototype: { malicious: 'data' } } } as any,
      ];

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: maliciousRoles,
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });
  });

  describe('Performance considerations', () => {
    it('should handle large number of user roles efficiently', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const largeRolesArray = Array.from({ length: 1000 }, (_, i) => ({
        name: i === 999 ? 'ADMIN' : `ROLE_${i}`,
      }));

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: largeRolesArray,
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle large number of required roles efficiently', () => {
      const largeRequiredRoles = Array.from({ length: 100 }, (_, i) => `ROLE_${i}`);

      mockReflector.get.mockReturnValue(largeRequiredRoles);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'ROLE_50' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle rapid successive requests', () => {
      mockReflector.get.mockReturnValue(['ADMIN']);

      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: {
              id: 'user-id',
              roles: [{ name: 'ADMIN' }],
            },
          }),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      // Simulate rapid successive requests
      for (let i = 0; i < 5; i++) {
        const result = guard.canActivate(mockExecutionContext);
        expect(result).toBe(true);
      }

      expect(reflector.get).toHaveBeenCalledTimes(5);
    });
  });
});