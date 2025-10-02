import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface FirmaPermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
  canViewReports: boolean;
  canManageInvoices: boolean;
  canManageDeclarations: boolean;
  canManageZUS: boolean;
}

export interface UzytkownikPermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canChangePassword: boolean;
  canAssignRoles: boolean;
  canViewActivity: boolean;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if user has permission for specific firma action
   */
  async checkFirmaPermission(
    userId: string,
    firmaId: string,
    action: keyof FirmaPermissions
  ): Promise<boolean> {
    try {
      // Get user's roles and permissions for the firma
      const userFirma = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              permissions: true
            }
          }
        }
      });

      if (!userFirma) {
        return false;
      }

      // Check if user is admin (has all permissions)
      const hasAdminRole = userFirma.roles.some(role =>
        role.permissions.some(permission => permission.name === 'admin:all')
      );

      if (hasAdminRole) {
        return true;
      }

      // Check firma-specific permissions
      const firmaPermissions = this.getFirmaPermissionMapping();
      const requiredPermission = firmaPermissions[action];

      if (!requiredPermission) {
        return false;
      }

      const hasPermission = userFirma.roles.some(role =>
        role.permissions.some(permission => permission.name === requiredPermission)
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`Error checking firma permission: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Checks if user has permission for specific użytkownik action
   */
  async checkUzytkownikPermission(
    requestingUserId: string,
    targetUserId: string,
    action: keyof UzytkownikPermissions
  ): Promise<boolean> {
    try {
      // Users can always perform actions on themselves
      if (requestingUserId === targetUserId) {
        return true;
      }

      // Get requesting user's roles and permissions
      const requestingUser = await this.prisma.user.findUnique({
        where: { id: requestingUserId },
        include: {
          roles: {
            include: {
              permissions: true
            }
          }
        }
      });

      if (!requestingUser) {
        return false;
      }

      // Check if user is admin (has all permissions)
      const hasAdminRole = requestingUser.roles.some(role =>
        role.permissions.some(permission => permission.name === 'admin:all')
      );

      if (hasAdminRole) {
        return true;
      }

      // Check user management permissions
      const uzytkownikPermissions = this.getUzytkownikPermissionMapping();
      const requiredPermission = uzytkownikPermissions[action];

      if (!requiredPermission) {
        return false;
      }

      const hasPermission = requestingUser.roles.some(role =>
        role.permissions.some(permission => permission.name === requiredPermission)
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`Error checking użytkownik permission: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Gets all firma permissions for a user
   */
  async getFirmaPermissions(userId: string, firmaId: string): Promise<FirmaPermissions> {
    const permissions: FirmaPermissions = {
      canView: await this.checkFirmaPermission(userId, firmaId, 'canView'),
      canEdit: await this.checkFirmaPermission(userId, firmaId, 'canEdit'),
      canDelete: await this.checkFirmaPermission(userId, firmaId, 'canDelete'),
      canManageUsers: await this.checkFirmaPermission(userId, firmaId, 'canManageUsers'),
      canViewReports: await this.checkFirmaPermission(userId, firmaId, 'canViewReports'),
      canManageInvoices: await this.checkFirmaPermission(userId, firmaId, 'canManageInvoices'),
      canManageDeclarations: await this.checkFirmaPermission(userId, firmaId, 'canManageDeclarations'),
      canManageZUS: await this.checkFirmaPermission(userId, firmaId, 'canManageZUS'),
    };

    return permissions;
  }

  /**
   * Gets all użytkownik permissions for a user
   */
  async getUzytkownikPermissions(
    requestingUserId: string,
    targetUserId: string
  ): Promise<UzytkownikPermissions> {
    const permissions: UzytkownikPermissions = {
      canView: await this.checkUzytkownikPermission(requestingUserId, targetUserId, 'canView'),
      canEdit: await this.checkUzytkownikPermission(requestingUserId, targetUserId, 'canEdit'),
      canDelete: await this.checkUzytkownikPermission(requestingUserId, targetUserId, 'canDelete'),
      canChangePassword: await this.checkUzytkownikPermission(requestingUserId, targetUserId, 'canChangePassword'),
      canAssignRoles: await this.checkUzytkownikPermission(requestingUserId, targetUserId, 'canAssignRoles'),
      canViewActivity: await this.checkUzytkownikPermission(requestingUserId, targetUserId, 'canViewActivity'),
    };

    return permissions;
  }

  /**
   * Checks if user owns the firma
   */
  async isFirmaOwner(userId: string, firmaId: string): Promise<boolean> {
    try {
      const firma = await this.prisma.company.findUnique({
        where: { id: firmaId },
        include: {
          // Assuming there's an owner relationship or check by user roles
          // This would need to be adjusted based on actual schema
        }
      });

      // For now, check if user has owner role for this firma
      const userRoles = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          roles: {
            where: {
              // Assuming roles have tenant_id matching firma
              // This would need to be adjusted based on actual schema
            }
          }
        }
      });

      return userRoles?.roles.some(role =>
        role.permissions.some(permission => permission.name === 'firma:owner')
      ) || false;
    } catch (error) {
      this.logger.error(`Error checking firma ownership: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Creates default permissions for a new firma
   */
  async createFirmaPermissions(firmaId: string, ownerUserId: string): Promise<void> {
    try {
      // Create firma-specific roles and permissions
      const firmaRole = await this.prisma.role.create({
        data: {
          tenant_id: firmaId,
          name: 'firma_owner',
        }
      });

      // Create owner permissions
      const ownerPermissions = [
        'firma:view',
        'firma:edit',
        'firma:delete',
        'firma:manage_users',
        'firma:view_reports',
        'firma:manage_invoices',
        'firma:manage_declarations',
        'firma:manage_zus',
        'firma:owner'
      ];

      for (const permissionName of ownerPermissions) {
        let permission = await this.prisma.permission.findUnique({
          where: { name: permissionName }
        });

        if (!permission) {
          permission = await this.prisma.permission.create({
            data: { name: permissionName }
          });
        }

        await this.prisma.role.update({
          where: { id: firmaRole.id },
          data: {
            permissions: {
              connect: { id: permission.id }
            }
          }
        });
      }

      // Assign owner role to the user
      await this.prisma.user.update({
        where: { id: ownerUserId },
        data: {
          roles: {
            connect: { id: firmaRole.id }
          }
        }
      });

      this.logger.log(`Created firma permissions for firma ${firmaId}`);
    } catch (error) {
      this.logger.error(`Error creating firma permissions: ${error.message}`, error.stack);
      throw new Error(`Failed to create firma permissions: ${error.message}`);
    }
  }

  /**
   * Maps firma actions to permission names
   */
  private getFirmaPermissionMapping(): Record<keyof FirmaPermissions, string> {
    return {
      canView: 'firma:view',
      canEdit: 'firma:edit',
      canDelete: 'firma:delete',
      canManageUsers: 'firma:manage_users',
      canViewReports: 'firma:view_reports',
      canManageInvoices: 'firma:manage_invoices',
      canManageDeclarations: 'firma:manage_declarations',
      canManageZUS: 'firma:manage_zus',
    };
  }

  /**
   * Maps użytkownik actions to permission names
   */
  private getUzytkownikPermissionMapping(): Record<keyof UzytkownikPermissions, string> {
    return {
      canView: 'uzytkownik:view',
      canEdit: 'uzytkownik:edit',
      canDelete: 'uzytkownik:delete',
      canChangePassword: 'uzytkownik:change_password',
      canAssignRoles: 'uzytkownik:assign_roles',
      canViewActivity: 'uzytkownik:view_activity',
    };
  }

  /**
   * Validates if a permission string follows the correct format
   */
  validatePermissionFormat(permission: string): boolean {
    const permissionPattern = /^[a-z_]+:[a-z_]+$/;
    return permissionPattern.test(permission);
  }

  /**
   * Gets all available permissions
   */
  async getAllPermissions(): Promise<string[]> {
    try {
      const permissions = await this.prisma.permission.findMany({
        select: { name: true }
      });

      return permissions.map(p => p.name);
    } catch (error) {
      this.logger.error(`Error getting all permissions: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Creates a new permission if it doesn't exist
   */
  async createPermissionIfNotExists(permissionName: string): Promise<void> {
    try {
      if (!this.validatePermissionFormat(permissionName)) {
        throw new Error(`Invalid permission format: ${permissionName}`);
      }

      const existingPermission = await this.prisma.permission.findUnique({
        where: { name: permissionName }
      });

      if (!existingPermission) {
        await this.prisma.permission.create({
          data: { name: permissionName }
        });

        this.logger.log(`Created new permission: ${permissionName}`);
      }
    } catch (error) {
      this.logger.error(`Error creating permission: ${error.message}`, error.stack);
      throw new Error(`Failed to create permission: ${error.message}`);
    }
  }
}