import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      password: 'hashed-password',
      roles: [
        {
          permissions: [
            { id: 'perm-1', name: 'READ' },
            { id: 'perm-2', name: 'WRITE' },
          ],
        },
      ],
    };

    it('should return user data without password when credentials are valid', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: hashedPassword,
      });

      const result = await service.validateUser('test@example.com', plainPassword);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: { roles: { include: { permissions: true } } },
      });

      expect(result).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        roles: mockUser.roles,
      });
      expect(result).not.toHaveProperty('password');
    });

    it('should return null when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('nonexistent@example.com', 'password');

      expect(result).toBeNull();
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'nonexistent@example.com' },
        include: { roles: { include: { permissions: true } } },
      });
    });

    it('should return null when password is incorrect', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 10);

      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: hashedPassword,
      });

      const result = await service.validateUser('test@example.com', 'wrong-password');

      expect(result).toBeNull();
    });

    it('should return null when user has no password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: null,
      });

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should handle bcrypt comparison errors gracefully', async () => {
      const hashedPassword = await bcrypt.hash('password', 10);

      // Mock bcrypt.compare to return false (simulating error condition)
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => {
        throw new Error('bcrypt error');
      });

      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: hashedPassword,
      });

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access token with correct payload', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        tenant_id: 'tenant-123',
      };

      const expectedPayload = {
        email: 'test@example.com',
        sub: 'user-id',
        tenant_id: 'tenant-123',
      };

      const mockToken = 'jwt-token';
      mockJwtService.sign.mockReturnValue(mockToken);

      const result = await service.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual({
        access_token: mockToken,
        user: {
          email: 'test@example.com',
          tenant_id: 'tenant-123',
        },
      });
    });

    it('should handle missing tenant_id in user object', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        // tenant_id is missing
      };

      const expectedPayload = {
        email: 'test@example.com',
        sub: 'user-id',
        tenant_id: undefined,
      };

      const mockToken = 'jwt-token';
      mockJwtService.sign.mockReturnValue(mockToken);

      const result = await service.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual({
        access_token: mockToken,
        user: {
          email: 'test@example.com',
          tenant_id: undefined,
        },
      });
    });

    it('should handle JWT service errors', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        tenant_id: 'tenant-123',
      };

      mockJwtService.sign.mockImplementation(() => {
        throw new Error('JWT service error');
      });

      await expect(service.login(mockUser)).rejects.toThrow('JWT service error');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete login flow', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        password: hashedPassword,
        tenant_id: 'tenant-123',
        roles: [],
      };

      // First validate the user
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const validatedUser = await service.validateUser('test@example.com', plainPassword);
      expect(validatedUser).toBeDefined();
      expect(validatedUser).not.toHaveProperty('password');

      // Then login
      const mockToken = 'jwt-token';
      mockJwtService.sign.mockReturnValue(mockToken);

      const loginResult = await service.login(validatedUser!);

      expect(loginResult).toEqual({
        access_token: mockToken,
        user: {
          email: 'test@example.com',
          tenant_id: 'tenant-123',
        },
      });

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: 'test@example.com',
        sub: 'user-id',
        tenant_id: 'tenant-123',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty email in validateUser', async () => {
      const result = await service.validateUser('', 'password');

      expect(result).toBeNull();
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: '' },
        include: { roles: { include: { permissions: true } } },
      });
    });

    it('should handle empty password in validateUser', async () => {
      const result = await service.validateUser('test@example.com', '');

      expect(result).toBeNull();
    });

    it('should handle null/undefined user in login', async () => {
      const mockToken = 'jwt-token';
      mockJwtService.sign.mockReturnValue(mockToken);

      const result = await service.login(null as any);

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: undefined,
        sub: undefined,
        tenant_id: undefined,
      });
      expect(result).toEqual({
        access_token: mockToken,
        user: {
          email: undefined,
          tenant_id: undefined,
        },
      });
    });
  });
});
