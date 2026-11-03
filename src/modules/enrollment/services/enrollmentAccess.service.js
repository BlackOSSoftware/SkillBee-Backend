import { COURSE_STATUS, ROLE_SLUGS, USER_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { AppError } from '../../../utils/AppError.js';

/** Statuses that may grant learning access (still subject to expiresAt). */
export const LEARNING_ACCESS_STATUSES = Object.freeze(['active', 'completed']);

/** Statuses that never grant learning access. */
export const BLOCKED_ENROLLMENT_STATUSES = Object.freeze([
  'pending',
  'expired',
  'revoked',
  'suspended',
  'cancelled',
]);

export function isPlatformAdmin(role) {
  const slug = role?.slug || role;
  return slug === ROLE_SLUGS.SUPER_ADMIN || slug === ROLE_SLUGS.ADMIN;
}

export function isEnrollmentTimeExpired(enrollment, now = new Date()) {
  return Boolean(enrollment?.expiresAt && new Date(enrollment.expiresAt) <= now);
}

/**
 * Resolve learning access for a student+course.
 * Expiration is enforced here even if a job has not flipped status yet.
 */
export async function findLearningEnrollment(studentId, courseId, { touchAccess = false } = {}) {
  if (!studentId || !courseId) return null;

  const enrollment = await CourseEnrollment.findOne({
    courseId,
    studentId,
    deletedAt: null,
    status: { $in: [...LEARNING_ACCESS_STATUSES] },
  });

  if (!enrollment) return null;

  if (isEnrollmentTimeExpired(enrollment)) {
    if (enrollment.status !== 'expired') {
      const from = enrollment.status;
      enrollment.status = 'expired';
      enrollment.pushHistory({
        action: 'expired',
        fromStatus: from,
        toStatus: 'expired',
        reason: 'Access denied — enrollmentExpiresAt passed',
      });
      await enrollment.save();
    }
    return null;
  }

  if (touchAccess) {
    enrollment.lastAccessedAt = new Date();
    await enrollment.save();
  }

  return enrollment;
}

export async function hasLearningAccess(studentId, courseId) {
  return Boolean(await findLearningEnrollment(studentId, courseId));
}

/**
 * Shared predicate used by quizzes, assignments, media, learning (Phase 3–6 integration).
 */
export function learningEnrollmentQuery(studentId, courseId, now = new Date()) {
  const q = {
    studentId,
    deletedAt: null,
    status: { $in: [...LEARNING_ACCESS_STATUSES] },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };
  if (courseId) q.courseId = courseId;
  return q;
}

export async function assertLearningAccess(studentId, courseId, { touchAccess = false } = {}) {
  const enrollment = await findLearningEnrollment(studentId, courseId, { touchAccess });
  if (!enrollment) {
    throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');
  }
  return enrollment;
}

export async function assertStudentNotSuspended(user) {
  if (user?.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }
}

export async function loadPublishedCourse(courseId, { allowArchivedForStaff = false, role } = {}) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (course.status === COURSE_STATUS.ARCHIVED && !(allowArchivedForStaff && isPlatformAdmin(role))) {
    throw new AppError('Course is archived', 404, 'COURSE_ARCHIVED');
  }
  return course;
}

export async function assertLessonInCourse(lessonId, courseId) {
  const lesson = await CourseLesson.findOne({
    _id: lessonId,
    courseId,
    deletedAt: null,
  });
  if (!lesson) {
    throw new AppError('Lesson not found in this course', 404, 'LESSON_NOT_FOUND');
  }
  return lesson;
}

/**
 * Full gate for student learning actions (content, complete, progress).
 */
export async function assertStudentCanAccessLesson(req, lessonId) {
  await assertStudentNotSuspended(req.user);

  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');

  const course = await loadPublishedCourse(lesson.courseId, { role: req.role });
  const staff =
    isPlatformAdmin(req.role) ||
    (course.instructorIds || []).some((id) => id.toString() === req.user._id.toString());

  if (staff) {
    return { lesson, course, enrollment: null, isStaff: true };
  }

  if (course.status !== COURSE_STATUS.PUBLISHED) {
    throw new AppError('Course is not available', 403, 'COURSE_UNAVAILABLE');
  }

  if (lesson.status !== 'published') {
    throw new AppError('Lesson is not available', 404, 'LESSON_NOT_FOUND');
  }

  if (lesson.scheduledAt && lesson.scheduledAt > new Date()) {
    throw new AppError('Lesson is scheduled for later release', 403, 'SCHEDULED');
  }

  const enrollment = await assertLearningAccess(req.user._id, course._id, { touchAccess: true });
  return { lesson, course, enrollment, isStaff: false };
}
