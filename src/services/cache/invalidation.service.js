import { Course } from '../../models/Course.js';
import { clearCacheByPrefix, deleteCache } from './cache.service.js';
import {
  PREFIX,
  assignmentDetailKey,
  courseAnalyticsKey,
  courseDetailKey,
  quizMetaKey,
  studentAssignmentsKey,
  studentCoursesKey,
  studentDashboardKey,
  studentProgressKey,
} from './keys.js';

export async function invalidateCurriculumByCourseId(courseId) {
  if (!courseId) return;
  try {
    const course = await Course.findById(courseId).select('slug').lean();
    await invalidateCurriculumCaches({
      slug: course?.slug,
      courseId: courseId.toString(),
    });
    if (course?.slug) {
      await deleteCache(courseDetailKey(course.slug, false));
      await deleteCache(courseDetailKey(course.slug, true));
    }
  } catch {
    await invalidateCurriculumCaches({ courseId: courseId.toString() });
  }
}

/** Invalidate public course listing/featured/detail caches after course writes */
export async function invalidateCourseCaches({ slug, courseId } = {}) {
  await clearCacheByPrefix(`${PREFIX.COURSE_LIST}:`);
  await clearCacheByPrefix(PREFIX.FEATURED);
  if (slug) {
    await deleteCache(courseDetailKey(slug, false));
    await deleteCache(courseDetailKey(slug, true));
    await clearCacheByPrefix(`${PREFIX.CURRICULUM}:${slug}:`);
  } else {
    await clearCacheByPrefix(`${PREFIX.COURSE_DETAIL}:`);
    await clearCacheByPrefix(`${PREFIX.CURRICULUM}:`);
  }
  if (courseId) {
    await deleteCache(courseAnalyticsKey(courseId));
    await clearCacheByPrefix(`${PREFIX.ASSIGNMENT_PUBLISHED}:course:${courseId}`);
  }
}

export async function invalidateCategoryCaches() {
  await deleteCache(PREFIX.CATEGORIES);
  await clearCacheByPrefix(`${PREFIX.COURSE_LIST}:`);
}

export async function invalidateCurriculumCaches({ slug, courseId } = {}) {
  if (slug) {
    await clearCacheByPrefix(`${PREFIX.CURRICULUM}:${slug}:`);
  } else {
    await clearCacheByPrefix(`${PREFIX.CURRICULUM}:`);
  }
  if (courseId) await deleteCache(courseAnalyticsKey(courseId));
}

export async function invalidateAssignmentCaches({ courseId, assignmentId, studentId } = {}) {
  if (courseId) {
    await deleteCache(`${PREFIX.ASSIGNMENT_PUBLISHED}:course:${courseId}`);
  }
  await deleteCache(`${PREFIX.ASSIGNMENT_PUBLISHED}:course:all`);
  if (assignmentId) await deleteCache(assignmentDetailKey(assignmentId));
  if (studentId) {
    await clearCacheByPrefix(`${PREFIX.STUDENT_ASSIGNMENTS}:${studentId}:`);
  } else {
    await clearCacheByPrefix(`${PREFIX.STUDENT_ASSIGNMENTS}:`);
  }
}

export async function invalidateQuizMetaCaches({ quizId } = {}) {
  if (quizId) await deleteCache(quizMetaKey(quizId));
  else await clearCacheByPrefix(`${PREFIX.QUIZ_META}:`);
}

export async function invalidateStudentAssignmentList(studentId, courseId) {
  if (!studentId) return;
  await deleteCache(studentAssignmentsKey(studentId, courseId || 'all'));
  await deleteCache(studentAssignmentsKey(studentId, 'all'));
}

/** Invalidate student/admin enrollment + progress caches after enrollment or completion writes */
export async function invalidateEnrollmentCaches({ studentId, courseId, enrollmentId } = {}) {
  void enrollmentId;
  if (studentId) {
    await clearCacheByPrefix(`${PREFIX.STUDENT_COURSES}:${studentId}:`);
    await deleteCache(studentDashboardKey(studentId));
    await clearCacheByPrefix(`${PREFIX.STUDENT_ASSIGNMENTS}:${studentId}:`);
    if (courseId) {
      await deleteCache(studentProgressKey(studentId, courseId));
      await deleteCache(studentCoursesKey(studentId, 'all'));
    } else {
      await clearCacheByPrefix(`${PREFIX.STUDENT_PROGRESS}:${studentId}:`);
    }
  } else {
    await clearCacheByPrefix(`${PREFIX.STUDENT_COURSES}:`);
    await clearCacheByPrefix(`${PREFIX.STUDENT_DASHBOARD}:`);
    await clearCacheByPrefix(`${PREFIX.STUDENT_PROGRESS}:`);
  }
  await clearCacheByPrefix(`${PREFIX.ADMIN_ENROLLMENTS}:`);
  if (courseId) {
    await deleteCache(courseAnalyticsKey(courseId));
  }
}

export async function invalidateCertificateCaches({ studentId, courseId } = {}) {
  void courseId;
  if (studentId) {
    await deleteCache(`${PREFIX.STUDENT_CERTIFICATES}:${studentId}`);
  } else {
    await clearCacheByPrefix(`${PREFIX.STUDENT_CERTIFICATES}:`);
  }
  await clearCacheByPrefix(`${PREFIX.ADMIN_CERTIFICATES}:`);
  await clearCacheByPrefix(`${PREFIX.CERTIFICATE_TEMPLATES}:`);
}

export async function invalidateCommerceCaches({ studentId } = {}) {
  if (studentId) {
    await deleteCache(`${PREFIX.STUDENT_ORDERS}:${studentId}`);
    await deleteCache(`${PREFIX.STUDENT_CART}:${studentId}`);
  } else {
    await clearCacheByPrefix(`${PREFIX.STUDENT_ORDERS}:`);
    await clearCacheByPrefix(`${PREFIX.STUDENT_CART}:`);
  }
  await clearCacheByPrefix(`${PREFIX.ADMIN_ORDERS}:`);
  await clearCacheByPrefix(`${PREFIX.COURSE_LIST}:`);
}
