import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

interface ApiLogData {
  method: string;
  url: string;
  userAgent?: string;
  ip: string;
  timestamp: string;
  requestId: string;
  userContext?: {
    userId?: string;
    tenantId?: string;
    sessionId?: string;
  };
  request: {
    headers: Record<string, string>;
    body?: any;
    query?: any;
    params?: any;
  };
  response: {
    statusCode: number;
    responseTime: number;
    size?: number;
    headers?: Record<string, string>;
  };
  error?: {
    message: string;
    stack?: string;
  };
}

interface RequestWithSession extends Request {
  sessionID?: string;
}

@Injectable()
export class ApiLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiLoggerMiddleware.name);

  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const debugApiCalls = this.configService.get<string>('DEBUG_API_CALLS') === 'true';

    if (!debugApiCalls) {
      return next();
    }

    const startTime = Date.now();
    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();

    // Extract user context from request
    const userContext = this.extractUserContext(req);

    // Log incoming request
    const requestLog: ApiLogData = {
      method: req.method,
      url: req.url,
      ip: this.getClientIP(req),
      timestamp,
      requestId,
      userContext,
      request: {
        headers: this.sanitizeHeaders(req.headers as Record<string, string>),
        body: this.sanitizeBody(req.body),
        query: req.query,
        params: req.params,
      },
      response: {
        statusCode: 0,
        responseTime: 0,
      },
    };

    this.logger.log(`[${requestId}] ${req.method} ${req.url} - Started`);
    if (Object.keys(req.body || {}).length > 0) {
      this.logger.log(`[${requestId}] Request Body: ${JSON.stringify(requestLog.request.body, null, 2)}`);
    }

    // Capture response data
    const originalSend = res.send.bind(res);
    let responseBody: any = null;

    res.send = (data: any) => {
      responseBody = data;
      return originalSend(data);
    };

    // Listen for response finish
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;

      const responseLog: ApiLogData = {
        ...requestLog,
        response: {
          statusCode: res.statusCode,
          responseTime,
          size: this.getResponseSize(responseBody),
          headers: this.sanitizeHeaders(res.getHeaders() as Record<string, string>),
        },
      };

      this.logApiCall(responseLog);
    });

    // Listen for errors
    res.on('error', (error) => {
      const responseTime = Date.now() - startTime;

      const errorLog: ApiLogData = {
        ...requestLog,
        response: {
          statusCode: res.statusCode || 500,
          responseTime,
        },
        error: {
          message: error.message,
          stack: error.stack,
        },
      };

      this.logger.error(`[${requestId}] ${req.method} ${req.url} - Error: ${JSON.stringify(errorLog)}`);
    });

    next();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           'unknown';
  }

  private extractUserContext(req: Request): ApiLogData['userContext'] {
    const context: ApiLogData['userContext'] = {};

    // Enhanced JWT token logging for debugging
    const authHeader = req.headers.authorization;
    if (authHeader) {
      this.logger.log(`Auth Header Present: ${authHeader.startsWith('Bearer ')}`);
      this.logger.log(`Auth Header Length: ${authHeader.length}`);

      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        this.logger.log(`Token Prefix: ${token.substring(0, 20)}...`);
        this.logger.log(`Token Valid JWT Format: ${this.isValidJWTFormat(token)}`);

        try {
          // In a real implementation, you might decode the JWT to get user info
          // For now, we'll extract basic info from request object if available
          if ((req as any).user) {
            const user = (req as any).user;
            context.userId = user.id || user.userId || user.sub;
            context.tenantId = user.tenantId || user.companyId;
            this.logger.log(`User Context Extracted: userId=${context.userId}, tenantId=${context.tenantId}, hasRoles=${!!user.roles}`);
          } else {
            this.logger.warn('Bearer token present but no user object found');
          }
        } catch (error) {
          this.logger.error(`JWT parsing error: ${error.message}`, error.stack);
        }
      } else {
        this.logger.warn(`Invalid auth header format: ${authHeader.substring(0, 50)}...`);
      }
    } else {
      this.logger.log('No authorization header present');
    }

    // Extract session ID if available
    if ((req as RequestWithSession).sessionID) {
      context.sessionId = (req as RequestWithSession).sessionID;
      this.logger.log(`Session ID: ${context.sessionId}`);
    }

    return context;
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'proxy-authorization',
      'www-authenticate',
    ];

    const sanitized = { ...headers };

    Object.keys(sanitized).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '***REDACTED***';
      }
    });

    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = [
      'password',
      'passwordConfirmation',
      'currentPassword',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'privateKey',
      'creditCard',
      'ssn',
      'socialSecurity',
      'personalId',
      'taxId',
    ];

    const sanitized = { ...body };

    const sanitizeObject = (obj: any) => {
      Object.keys(obj).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      });
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  private getResponseSize(responseBody: any): number {
    if (!responseBody) return 0;

    if (typeof responseBody === 'string') {
      return Buffer.byteLength(responseBody, 'utf8');
    }

    if (Buffer.isBuffer(responseBody)) {
      return responseBody.length;
    }

    if (typeof responseBody === 'object') {
      return Buffer.byteLength(JSON.stringify(responseBody), 'utf8');
    }

    return 0;
  }

  private logApiCall(logData: ApiLogData): void {
    const { method, url, requestId, response } = logData;
    const statusEmoji = this.getStatusEmoji(response.statusCode);
    const responseTime = `${response.responseTime}ms`;

    this.logger.log(`${statusEmoji} [${requestId}] ${method} ${url} - ${response.statusCode} - ${responseTime}`);

    // Log user context if available
    if (logData.userContext && (logData.userContext.userId || logData.userContext.tenantId)) {
      this.logger.log(`[${requestId}] User Context: ${JSON.stringify(logData.userContext)}`);
    }

    // Log response size if significant
    if (response.size && response.size > 1024) {
      this.logger.log(`[${requestId}] Response Size: ${(response.size / 1024).toFixed(2)}KB`);
    }

    // Log performance warning for slow requests
    if (response.responseTime > 1000) {
      this.logger.warn(`[${requestId}] Slow Request: ${responseTime}`);
    }

    // Log errors if any
    if (logData.error) {
      this.logger.error(`[${requestId}] Error: ${logData.error.message}`);
    }
  }

  private getStatusEmoji(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '✅';
    if (statusCode >= 300 && statusCode < 400) return '🔄';
    if (statusCode >= 400 && statusCode < 500) return '⚠️';
    if (statusCode >= 500) return '❌';
    return '📝';
  }

  private isValidJWTFormat(token: string): boolean {
    // Basic JWT format validation (header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Check if all parts are non-empty and base64url encoded
    try {
      for (const part of parts) {
        if (!part || part.length === 0) {
          return false;
        }
        // Basic check for base64url characters
        if (!/^[A-Za-z0-9_-]+$/.test(part)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      return false;
    }
  }
}