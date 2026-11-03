import { ROLE_SLUGS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { AppError } from '../../../utils/AppError.js';

export function isPlatformAdmin(role) {
  return role?.slug === ROLE_SLUGS.SUPER_ADMIN || role?.slug === ROLE_SLUGS.ADMIN;
}

export async function assertCanManageCourseQuizzes(req, courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (isPlatformAdmin(req.role)) return course;
  if (req.role?.slug !== ROLE_SLUGS.INSTRUCTOR) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const assigned = (course.instructorIds || []).some(
    (id) => id.toString() === req.user._id.toString()
  );
  if (!assigned) throw new AppError('Not assigned to this course', 403, 'FORBIDDEN');
  return course;
}

export async function assertCanReadCourseQuizzes(req, courseId) {
  return assertCanManageCourseQuizzes(req, courseId);
}
