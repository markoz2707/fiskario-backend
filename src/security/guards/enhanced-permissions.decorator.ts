import { SetMetadata } from '@nestjs/common';
import { PermissionContext } from './enhanced-permissions.guard';

export interface EnhancedPermissionsOptions {
  permissions?: string[];
  requireAll?: boolean;
  context?: PermissionContext;
}

export const EnhancedPermissions = (options: EnhancedPermissionsOptions) => {
  return SetMetadata('enhanced-permissions', options);
};

// Convenience decorators for common use cases
export const RequirePermission = (permission: string) =>
  EnhancedPermissions({ permissions: [permission] });

export const RequireAllPermissions = (permissions: string[]) =>
  EnhancedPermissions({ permissions, requireAll: true });

export const RequireCompanyAccess = (action: string, companyId?: string) =>
  EnhancedPermissions({
    permissions: [`company:${action}`],
    context: { resource: 'company', action, companyId }
  });

export const RequireUserAccess = (action: string, userId?: string) =>
  EnhancedPermissions({
    permissions: [`user:${action}`],
    context: { resource: 'user', action, userId }
  });

export const RequireOwnership = (resource: string, resourceId?: string) =>
  EnhancedPermissions({
    permissions: [`${resource}:owner`],
    context: { resource, action: 'access', ownership: true }
  });