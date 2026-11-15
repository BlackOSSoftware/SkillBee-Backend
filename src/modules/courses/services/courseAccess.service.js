import { ROLE_SLUGS, PERMISSIONS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { AppError } from '../../../utils/AppError.js';

export function isPlatformAdmin(role) {
  return role?.slug === ROLE_SLUGS.SUPER_ADMIN || role?.slug === ROLE_SLUGS.ADMIN;
}

export function hasPermission(req, ...codes) {
  if (!req.role) return false;
  if (req.role.slug === ROLE_SLUGS.SUPER_ADMIN) return true;
  const owned = new Set(req.permissions || req.role.permissions || []);
  return codes.every((code) => owned.has(code));
}

export async function getCourseOrThrow(courseId, { includeDeleted = false } = {}) {
  const filter = { _id: courseId };
  if (!includeDeleted) filter.deletedAt = null;
  const course = await Course.findOne(filter);
  if (!course) {
    throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  }
  return course;
}

export async function assertCanManageCourse(req, course, { forPublish = false } = {}) {
  if (!req.user || !req.role) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  if (isPlatformAdmin(req.role)) {
    if (forPublish && !hasPermission(req, PERMISSIONS.COURSES_PUBLISH)) {
      // admin role seed includes publish; still enforce if stripped
      if (req.role.slug !== ROLE_SLUGS.SUPER_ADMIN) {
        throw new AppError('Publish permission required', 403, 'FORBIDDEN');
      }
    }
    return course;
  }

  if (req.role.slug !== ROLE_SLUGS.INSTRUCTOR) {
    throw new AppError('Insufficient role', 403, 'FORBIDDEN');
  }

  // instructorIds may be populated User docs or raw ObjectIds depending on the query
  const assigned = (course.instructorIds || []).some(
    (id) => String(id._id ?? id) === req.user._id.toString()
  );
  if (!assigned) {
    throw new AppError('You are not assigned to this course', 403, 'FORBIDDEN');
  }

  if (forPublish && !hasPermission(req, PERMISSIONS.COURSES_PUBLISH)) {
    throw new AppError('Publish permission required', 403, 'FORBIDDEN');
  }

  return course;
}

export function assertCanReadCourse(req, course) {
  if (isPlatformAdmin(req.role)) return true;
  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    const assigned = (course.instructorIds || []).some(
      (id) => String(id._id ?? id) === req.user._id.toString()
    );
    if (!assigned) {
      throw new AppError('You are not assigned to this course', 403, 'FORBIDDEN');
    }
    return true;
  }
  throw new AppError('Insufficient role', 403, 'FORBIDDEN');
}
