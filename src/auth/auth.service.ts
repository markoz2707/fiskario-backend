import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

interface AuthLogContext {
  email?: string;
  userId?: string;
  tenantId?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
  requestId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private generateRequestId(): string {
    return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logAuthEvent(level: 'log' | 'warn' | 'error', message: string, context?: AuthLogContext, extra?: any): void {
    const logMessage = `🔐 [${context?.requestId || this.generateRequestId()}] ${message}`;

    const logData = {
      context,
      extra,
      timestamp: new Date().toISOString()
    };

    switch (level) {
      case 'log':
        this.logger.log(logMessage);
        if (context || extra) console.log(logMessage, JSON.stringify(logData, null, 2));
        break;
      case 'warn':
        this.logger.warn(logMessage);
        if (context || extra) console.warn(logMessage, JSON.stringify(logData, null, 2));
        break;
      case 'error':
        this.logger.error(logMessage);
        if (context || extra) console.error(logMessage, JSON.stringify(logData, null, 2));
        break;
    }
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();

    this.logAuthEvent('log', `User validation attempt for email: ${email}`, {
      email,
      timestamp,
      requestId
    });

    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: { roles: { include: { permissions: true } } }
      });

      if (!user) {
        this.logAuthEvent('warn', `User validation failed: User not found`, {
          email,
          timestamp,
          requestId
        }, {
          reason: 'USER_NOT_FOUND',
          email: email
        });
        return null;
      }

      if (!user.password) {
        this.logAuthEvent('error', `User validation failed: No password set for user`, {
          email,
          userId: user.id,
          timestamp,
          requestId
        }, {
          reason: 'NO_PASSWORD',
          userId: user.id
        });
        return null;
      }

      const isPasswordValid = await bcrypt.compare(pass, user.password);

      if (isPasswordValid) {
        this.logAuthEvent('log', `User validation successful`, {
          email,
          userId: user.id,
          tenantId: user.tenant_id,
          timestamp,
          requestId
        }, {
          userId: user.id,
          tenantId: user.tenant_id,
          rolesCount: user.roles?.length || 0
        });

        const { password, ...result } = user;
        return result;
      } else {
        this.logAuthEvent('warn', `User validation failed: Invalid password`, {
          email,
          userId: user.id,
          timestamp,
          requestId
        }, {
          reason: 'INVALID_PASSWORD',
          userId: user.id
        });
        return null;
      }
    } catch (error) {
      this.logAuthEvent('error', `User validation error: ${error.message}`, {
        email,
        timestamp,
        requestId
      }, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async register(email: string, password: string, tenantId?: string) {
    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();

    this.logAuthEvent('log', `User registration attempt for email: ${email}`, {
      email,
      tenantId,
      timestamp,
      requestId
    });

    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        this.logAuthEvent('warn', `Registration failed: User already exists`, {
          email,
          timestamp,
          requestId
        }, {
          reason: 'USER_ALREADY_EXISTS',
          existingUserId: existingUser.id
        });
        throw new Error('User already exists');
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      this.logAuthEvent('log', `Creating new user account`, {
        email,
        tenantId,
        timestamp,
        requestId
      });

      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          tenant_id: tenantId || 'default-tenant',
        },
      });

      this.logAuthEvent('log', `User registration successful`, {
        email,
        userId: user.id,
        tenantId: user.tenant_id,
        timestamp,
        requestId
      }, {
        userId: user.id,
        tenantId: user.tenant_id
      });

      const { password: _, ...result } = user;
      return result;
    } catch (error) {
      this.logAuthEvent('error', `Registration error: ${error.message}`, {
        email,
        tenantId,
        timestamp,
        requestId
      }, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async login(user: any) {
    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();

    this.logAuthEvent('log', `Login attempt for user`, {
      email: user?.email,
      userId: user?.id,
      tenantId: user?.tenant_id,
      timestamp,
      requestId
    });

    try {
      if (!user || !user.id) {
        this.logAuthEvent('error', `Login failed: Invalid user object`, {
          timestamp,
          requestId
        }, {
          reason: 'INVALID_USER_OBJECT',
          hasUser: !!user,
          hasUserId: !!(user && user.id)
        });
        throw new Error('Invalid user object for login');
      }

      const payload = {
        email: user.email,
        sub: user.id,
        tenant_id: user.tenant_id,
        roles: user.roles?.map((r: any) => r.name) || []
      };

      this.logAuthEvent('log', `Creating JWT token for user`, {
        email: user.email,
        userId: user.id,
        tenantId: user.tenant_id,
        timestamp,
        requestId
      }, {
        payloadKeys: Object.keys(payload),
        rolesCount: payload.roles.length
      });

      const token = this.jwtService.sign(payload);

      // Log token details for debugging (without exposing the actual token)
      this.logAuthEvent('log', `JWT token created successfully`, {
        email: user.email,
        userId: user.id,
        tenantId: user.tenant_id,
        timestamp,
        requestId
      }, {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...',
        expiresIn: '24h', // Default JWT expiration
        payload: {
          email: payload.email,
          sub: payload.sub,
          tenant_id: payload.tenant_id,
          rolesCount: payload.roles.length
        }
      });

      const result = {
        access_token: token,
        user: {
          email: user.email,
          tenant_id: user.tenant_id,
          id: user.id,
          roles: user.roles
        },
      };

      this.logAuthEvent('log', `Login successful`, {
        email: user.email,
        userId: user.id,
        tenantId: user.tenant_id,
        timestamp,
        requestId
      });

      return result;
    } catch (error) {
      this.logAuthEvent('error', `Login error: ${error.message}`, {
        email: user?.email,
        userId: user?.id,
        timestamp,
        requestId
      }, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
