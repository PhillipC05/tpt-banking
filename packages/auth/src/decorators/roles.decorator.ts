import { SetMetadata } from '@nestjs/common';
import { Role } from '../types/jwt-payload';

export const ROLES_KEY = 'roles';

/**
 * Decorator that specifies which roles are allowed to access a route.
 * Used with RolesGuard.
 *
 * @example
 * @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER)
 * @Get('/reports')
 * getReports() {}
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
