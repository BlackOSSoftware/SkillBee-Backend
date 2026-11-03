import { ROLE_SLUGS } from '../config/security.js';
import { AppError } from '../utils/AppError.js';

export function authorize(...allowedRoleSlugs) {
  return (req, _res, next) => {
    if (!req.user || !req.role) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (allowedRoleSlugs.length && !allowedRoleSlugs.includes(req.role.slug)) {
      return next(new AppError('Insufficient role', 403, 'FORBIDDEN'));
    }

    return next();
  };
}

export function requirePermissions(...requiredPermissions) {
  return (req, _res, next) => {
    if (!req.user || !req.role) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    // Super admin bypasses explicit permission checks
    if (req.role.slug === ROLE_SLUGS.SUPER_ADMIN) {
      return next();
    }

    const owned = new Set(req.permissions || req.role.permissions || []);
    const missing = requiredPermissions.filter((p) => !owned.has(p));

    if (missing.length) {
      return next(
        new AppError('Insufficient permissions', 403, 'FORBIDDEN', { missing })
      );
    }

    return next();
  };
}

/** Any of the admin-capable roles (super_admin or admin) */
export function requireAdminAccess() {
  return authorize(ROLE_SLUGS.SUPER_ADMIN, ROLE_SLUGS.ADMIN);
}

/** Admin staff or instructors for course management surfaces */
export function requireCourseStaffAccess() {
  return authorize(ROLE_SLUGS.SUPER_ADMIN, ROLE_SLUGS.ADMIN, ROLE_SLUGS.INSTRUCTOR);
}

/** Accept any of the listed permissions (OR) */
export function requireAnyPermission(...requiredPermissions) {
  return (req, _res, next) => {
    if (!req.user || !req.role) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }
    if (req.role.slug === ROLE_SLUGS.SUPER_ADMIN) {
      return next();
    }
    const owned = new Set(req.permissions || req.role.permissions || []);
    const ok = requiredPermissions.some((p) => owned.has(p));
    if (!ok) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    return next();
  };
}
