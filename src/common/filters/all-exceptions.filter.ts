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

    this.logger.error(`[${requestId}] Unhandled Exception at ${timestamp}`);
    this.logger.error(`[${requestId}] ${request.method} ${request.url}`);
    this.logger.error(`[${requestId}] Status: ${status}`);
    this.logger.error(`[${requestId}] Message: ${message}`);

    // Enhanced error categorization for new features
    if (request.url.includes('/management-dashboard') ||
        request.url.includes('/workflow-automation') ||
        request.url.includes('/performance-optimization') ||
        request.url.includes('/mobile-sync') ||
        request.url.includes('/feature-flags')) {
      this.logger.error(`[${requestId}] New Feature Error: ${request.method} ${request.url}`);
    }

    // Log request details for debugging
    if (request.headers.authorization) {
      this.logger.error(`[${requestId}] Auth Header Present: ${request.headers.authorization.startsWith('Bearer ')}`);
    } else {
      this.logger.error(`[${requestId}] No Authorization Header`);
    }

    if (request.user) {
      const userId = (request.user as any).id || (request.user as any).userId || (request.user as any).sub;
      const tenantId = (request.user as any).tenantId || (request.user as any).companyId;
      this.logger.error(`[${requestId}] User Context: userId=${userId}, tenantId=${tenantId}, roles=${JSON.stringify((request.user as any).roles)}`);
    }

    // Enhanced error details
    if (exception instanceof Error) {
      this.logger.error(`[${requestId}] Exception Type: ${exception.constructor.name}`);
      this.logger.error(`[${requestId}] Error Message: ${exception.message}`);

      if (exception.stack) {
        this.logger.error(`[${requestId}] Stack Trace:`, exception.stack);
      }

      // Special handling for authentication-related errors
      if (status === 401 || status === 403 || message.toLowerCase().includes('auth') || message.toLowerCase().includes('jwt') || message.toLowerCase().includes('token')) {
        this.logger.error(`[${requestId}] Authentication Error Analysis: Check JWT token validity and expiration, Verify user permissions and roles, Confirm authentication middleware is properly configured, Check if user exists and is active in database`);
      }
    }

    // Log request body for POST/PUT requests (sanitized)
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.body) {
      const sanitizedBody = this.sanitizeBody(request.body);
      this.logger.error(`[${requestId}] Request Body: ${JSON.stringify(sanitizedBody, null, 2)}`);
    }

    // Log query parameters
    if (request.query && Object.keys(request.query).length > 0) {
      this.logger.error(`[${requestId}] Query Parameters: ${JSON.stringify(request.query, null, 2)}`);
    }

    // Log client IP for security analysis
    const clientIP = this.getClientIP(request);
    this.logger.error(`[${requestId}] Client IP: ${clientIP}`);

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