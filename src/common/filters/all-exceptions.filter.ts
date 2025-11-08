import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.message : 'Internal server error';

    // Enhanced error logging for debugging
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    console.error(`🚨 [${requestId}] Unhandled Exception at ${timestamp}`);
    console.error(`🚨 [${requestId}] ${request.method} ${request.url}`);
    console.error(`🚨 [${requestId}] Status: ${status}`);
    console.error(`🚨 [${requestId}] Message: ${message}`);

    // Enhanced error categorization for new features
    if (request.url.includes('/management-dashboard') ||
        request.url.includes('/workflow-automation') ||
        request.url.includes('/performance-optimization') ||
        request.url.includes('/mobile-sync') ||
        request.url.includes('/feature-flags')) {
      console.error(`⚠️  [${requestId}] New Feature Error: ${request.method} ${request.url}`);
    }

    // Log request details for debugging
    if (request.headers.authorization) {
      console.error(`🔐 [${requestId}] Auth Header Present: ${request.headers.authorization.startsWith('Bearer ')}`);
    } else {
      console.error(`🚫 [${requestId}] No Authorization Header`);
    }

    if (request.user) {
      console.error(`👤 [${requestId}] User Context:`, {
        userId: (request.user as any).id || (request.user as any).userId || (request.user as any).sub,
        tenantId: (request.user as any).tenantId || (request.user as any).companyId,
        roles: (request.user as any).roles
      });
    }

    // Enhanced error details
    if (exception instanceof Error) {
      console.error(`❌ [${requestId}] Exception Type: ${exception.constructor.name}`);
      console.error(`❌ [${requestId}] Error Message: ${exception.message}`);

      if (exception.stack) {
        console.error(`🔍 [${requestId}] Stack Trace:`);
        console.error(exception.stack);
      }

      // Special handling for authentication-related errors
      if (status === 401 || status === 403 || message.toLowerCase().includes('auth') || message.toLowerCase().includes('jwt') || message.toLowerCase().includes('token')) {
        console.error(`🔐 [${requestId}] Authentication Error Analysis:`);
        console.error(`🔐 [${requestId}] - Check JWT token validity and expiration`);
        console.error(`🔐 [${requestId}] - Verify user permissions and roles`);
        console.error(`🔐 [${requestId}] - Confirm authentication middleware is properly configured`);
        console.error(`🔐 [${requestId}] - Check if user exists and is active in database`);
      }
    }

    // Log request body for POST/PUT requests (sanitized)
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.body) {
      const sanitizedBody = this.sanitizeBody(request.body);
      console.error(`📝 [${requestId}] Request Body:`, JSON.stringify(sanitizedBody, null, 2));
    }

    // Log query parameters
    if (request.query && Object.keys(request.query).length > 0) {
      console.error(`🔍 [${requestId}] Query Parameters:`, JSON.stringify(request.query, null, 2));
    }

    // Log client IP for security analysis
    const clientIP = this.getClientIP(request);
    console.error(`🌐 [${requestId}] Client IP: ${clientIP}`);

    response.status(status).json({
      statusCode: status,
      message,
      timestamp,
      requestId,
      path: request.url,
      method: request.method,
    });
  }

  private getClientIP(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers['x-real-ip'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
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
}