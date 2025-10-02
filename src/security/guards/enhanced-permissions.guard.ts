import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

export interface PermissionContext {
  resource: string;
  action: string;
  companyId?: string;
  userId?: string;
  ownership?: boolean;
}

export interface EnhancedPermissionsMetadata {
  permissions?: string[];
  requireAll?: boolean;
  context?: PermissionContext;
}

@Injectable()
export class EnhancedPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionsMeta = this.reflector.get<EnhancedPermissionsMetadata>(
      'enhanced-permissions',
      context.getHandler()
    );

    if (!permissionsMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Check if user has required permissions
    if (permissionsMeta.permissions && permissionsMeta.permissions.length > 0) {
      const hasPermission = await this.checkUserPermissions(
        user,
        permissionsMeta.permissions,
        permissionsMeta.requireAll || false,
        permissionsMeta.context
      );

      if (!hasPermission) {
        return false;
      }
    }

    return true;
  }

  private async checkUserPermissions(
    user: any,
    requiredPermissions: string[],
    requireAll: boolean,
    permissionContext?: PermissionContext
  ): Promise<boolean> {
    try {
      // Get user's permissions from database
      const userPermissions = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: {
          roles: {
            include: {
              permissions: true
            }
          }
        }
      });

      if (!userPermissions) {
        return false;
      }

      // Extract all permission names
      const userPermissionNames = new Set<string>();
      userPermissions.roles.forEach(role => {
        role.permissions.forEach(permission => {
          userPermissionNames.add(permission.name);
        });
      });

      // Check permissions based on requirement strategy
      if (requireAll) {
        // User must have ALL required permissions
        return requiredPermissions.every(permission =>
          userPermissionNames.has(permission)
        );
      } else {
        // User must have AT LEAST ONE of the required permissions
        return requiredPermissions.some(permission =>
          userPermissionNames.has(permission)
        );
      }
    } catch (error) {
      console.error('Error checking user permissions:', error);
      return false;
    }
  }
}