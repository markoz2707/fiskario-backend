import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

interface LogContext {
  requestId: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  timestamp: string;
  userContext?: {
    userId?: string;
    tenantId?: string;
    roles?: string[];
  };
  executionTime: number;
  statusCode?: number;
  error?: {
    message: string;
    stack?: string;
    status: number;
    response?: {
      data?: any;
      status?: number;
    };
    code?: string;
  };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const debugApiCalls = this.configService.get<string>('DEBUG_API_CALLS') === 'true';

    if (!debugApiCalls) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();

    // Extract request context
    const logContext: LogContext = {
      requestId,
      method: request.method,
      url: request.url,
      ip: this.getClientIP(request),
      userAgent: request.get('user-agent'),
      timestamp,
      userContext: this.extractUserContext(request),
      executionTime: 0,
    };

    // Log request start
    console.log(`🚀 [${requestId}] ${request.method} ${request.url} - Started`);

    // Log request details if body exists
    if (request.body && Object.keys(request.body).length > 0) {
      console.log(`📝 [${requestId}] Request Body:`, JSON.stringify(this.sanitizeData(request.body), null, 2));
    }

    // Log query parameters if they exist
    if (request.query && Object.keys(request.query).length > 0) {
      console.log(`🔍 [${requestId}] Query Params:`, JSON.stringify(request.query, null, 2));
    }

    return next.handle().pipe(
      timeout(30000), // 30 second timeout
      tap((data) => {
        logContext.executionTime = Date.now() - startTime;
        logContext.statusCode = response.statusCode;

        this.logSuccess(logContext, data);
      }),
      catchError((error) => {
        logContext.executionTime = Date.now() - startTime;

        if (error instanceof HttpException) {
          logContext.statusCode = error.getStatus();
          logContext.error = {
            message: error.message,
            status: error.getStatus(),
          };
        } else {
          logContext.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          logContext.error = {
            message: error.message || 'Internal server error',
            stack: error.stack,
            status: HttpStatus.INTERNAL_SERVER_ERROR,
          };
        }

        this.logError(logContext);
        return throwError(() => error);
      })
    );
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientIP(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }

  private extractUserContext(request: any): LogContext['userContext'] {
    const context: LogContext['userContext'] = {};

    // Enhanced user context extraction for debugging
    if (request.user) {
      const user = request.user;
      context.userId = user.id || user.userId || user.sub;
      context.tenantId = user.tenantId || user.companyId || user.tenant_id;

      // Extract roles if available
      if (user.roles) {
        context.roles = Array.isArray(user.roles) ? user.roles : [user.roles];
      }

      // Log detailed user context for debugging
      console.log(`👤 [${this.generateRequestId()}] User Context Debug:`, {
        hasUser: true,
        userId: context.userId,
        tenantId: context.tenantId,
        rolesCount: context.roles?.length || 0,
        userObjectKeys: Object.keys(user),
        authTime: user.iat ? new Date(user.iat * 1000).toISOString() : 'unknown',
        expTime: user.exp ? new Date(user.exp * 1000).toISOString() : 'unknown'
      });
    } else {
      console.warn(`⚠️ [${this.generateRequestId()}] No user object found in request`);
    }

    // Log authentication status
    const authHeader = request.headers?.authorization;
    if (authHeader) {
      console.log(`🔐 [${this.generateRequestId()}] Auth Status: Bearer token present (${authHeader.length} chars)`);
    } else {
      console.log(`🚫 [${this.generateRequestId()}] Auth Status: No authorization header`);
    }

    return context;
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
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
      'authorization',
      'cookie',
    ];

    const sanitizeObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => (typeof item === 'object' && item !== null ? sanitizeObject(item) : item));
      }

      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        Object.keys(obj).forEach(key => {
          const lowerKey = key.toLowerCase();
          if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
            sanitized[key] = '***REDACTED***';
          } else {
            sanitized[key] = typeof obj[key] === 'object' && obj[key] !== null ? sanitizeObject(obj[key]) : obj[key];
          }
        });
        return sanitized;
      }

      return obj;
    };

    return sanitizeObject(data);
  }

  private logSuccess(logContext: LogContext, responseData: any): void {
    const { requestId, method, url, executionTime, statusCode, userContext } = logContext;
    const statusEmoji = this.getStatusEmoji(statusCode || 200);

    console.log(`${statusEmoji} [${requestId}] ${method} ${url} - ${statusCode} - ${executionTime}ms`);

    // Log user context if available
    if (userContext && (userContext.userId || userContext.tenantId)) {
      console.log(`👤 [${requestId}] User Context:`, JSON.stringify(userContext, null, 2));
    }

    // Log response data size for large responses
    if (responseData) {
      const responseSize = this.getDataSize(responseData);
      if (responseSize > 1024) {
        console.log(`📊 [${requestId}] Response Size: ${(responseSize / 1024).toFixed(2)}KB`);
      }
    }

    // Performance monitoring
    if (executionTime > 1000) {
      console.warn(`⚠️  [${requestId}] Slow Request: ${executionTime}ms`);
    }

    if (executionTime > 5000) {
      console.error(`🚨 [${requestId}] Very Slow Request: ${executionTime}ms`);
    }
  }

  private logError(logContext: LogContext): void {
    const { requestId, method, url, executionTime, error } = logContext;
    const statusEmoji = this.getStatusEmoji(error?.status || 500);

    console.error(`${statusEmoji} [${requestId}] ${method} ${url} - ${error?.status} - ${executionTime}ms`);

    if (error) {
      console.error(`❌ [${requestId}] Error Message: ${error.message}`);
      console.error(`❌ [${requestId}] Error Type: ${error.constructor?.name || 'Unknown'}`);

      // Enhanced stack trace logging
      if (error.stack) {
        console.error(`🔍 [${requestId}] Full Stack Trace:`);
        console.error(error.stack);

        // Log stack trace analysis for common auth issues
        if (error.message?.includes('jwt') || error.message?.includes('token') || error.message?.includes('auth')) {
          console.error(`🔐 [${requestId}] Authentication Error Analysis:`);
          console.error(`🔐 [${requestId}] - Check JWT token format and expiration`);
          console.error(`🔐 [${requestId}] - Verify token signing secret`);
          console.error(`🔐 [${requestId}] - Confirm user exists in database`);
        }
      }

      // Log error context
      if (error.response?.data) {
        console.error(`📄 [${requestId}] Error Response Data:`, JSON.stringify(error.response.data, null, 2));
      }

      if (error.response?.status) {
        console.error(`📊 [${requestId}] Error Response Status: ${error.response.status}`);
      }

      if (error.code) {
        console.error(`🔢 [${requestId}] Error Code: ${error.code}`);
      }
    }

    // Enhanced user context logging for errors
    if (logContext.userContext && (logContext.userContext.userId || logContext.userContext.tenantId)) {
      console.error(`👤 [${requestId}] Error User Context:`, JSON.stringify(logContext.userContext, null, 2));

      // Additional auth debugging info
      if (error?.status === 401 || error?.status === 403) {
        console.error(`🚫 [${requestId}] Authentication/Authorization Error:`);
        console.error(`🚫 [${requestId}] - User ID: ${logContext.userContext.userId}`);
        console.error(`🚫 [${requestId}] - Tenant ID: ${logContext.userContext.tenantId}`);
        console.error(`🚫 [${requestId}] - User Roles: ${JSON.stringify(logContext.userContext.roles)}`);
        console.error(`🚫 [${requestId}] - Check if user has required permissions`);
        console.error(`🚫 [${requestId}] - Verify JWT token is not expired`);
      }
    } else {
      console.error(`🚫 [${requestId}] No user context available for error analysis`);
    }
  }

  private getStatusEmoji(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '✅';
    if (statusCode >= 300 && statusCode < 400) return '🔄';
    if (statusCode >= 400 && statusCode < 500) return '⚠️';
    if (statusCode >= 500) return '❌';
    return '📝';
  }

  private getDataSize(data: any): number {
    if (!data) return 0;

    try {
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      return Buffer.byteLength(dataString, 'utf8');
    } catch (error) {
      return 0;
    }
  }
}