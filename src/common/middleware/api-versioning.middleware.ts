import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ApiVersioningMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract API version from header, query param, or URL path
    const version = this.extractVersion(req);

    // Set version in request object for use in controllers
    (req as any).apiVersion = version;

    // Add version to response headers for client awareness
    res.setHeader('X-API-Version', version);
    res.setHeader('X-API-Supported-Versions', 'v1,v2');

    // Log version usage for monitoring
    if (version !== 'v1') {
      console.log(`📡 [API Version] ${req.method} ${req.url} - Version: ${version}`);
    }

    next();
  }

  private extractVersion(req: Request): string {
    // Check Accept header for version (e.g., application/vnd.fiskario.v2+json)
    const acceptHeader = req.headers.accept;
    if (acceptHeader) {
      const versionMatch = acceptHeader.match(/vnd\.fiskario\.v(\d+)\+json/);
      if (versionMatch) {
        return `v${versionMatch[1]}`;
      }
    }

    // Check custom header
    const versionHeader = req.headers['x-api-version'] as string;
    if (versionHeader && /^v\d+$/.test(versionHeader)) {
      return versionHeader;
    }

    // Check query parameter
    const versionQuery = req.query.version as string;
    if (versionQuery && /^v\d+$/.test(versionQuery)) {
      return versionQuery;
    }

    // Check URL path (e.g., /api/v2/endpoint)
    const urlMatch = req.url.match(/^\/api\/(v\d+)\//);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Default to v1 for backward compatibility
    return 'v1';
  }
}