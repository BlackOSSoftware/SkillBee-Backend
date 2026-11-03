import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseTopic } from '../../../models/CourseTopic.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL, courseAnalyticsKey } from '../../../services/cache/keys.js';
import {
  assertCanReadCourse,
  getCourseOrThrow,
} from './courseAccess.service.js';
import { getApprovedRatingSummary } from './review.service.js';

export async function getCourseAnalytics(req, courseId) {
  const course = await getCourseOrThrow(courseId);
  assertCanReadCourse(req, course);

  return getOrSetCache(courseAnalyticsKey(courseId), CACHE_TTL.DASHBOARD, async () => {
    const [
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      totalLessons,
      publishedLessons,
      totalTopics,
      rating,
    ] = await Promise.all([
      CourseEnrollment.countDocuments({ courseId, deletedAt: null }),
      CourseEnrollment.countDocuments({ courseId, deletedAt: null, status: 'active' }),
      CourseEnrollment.countDocuments({ courseId, deletedAt: null, status: 'completed' }),
      CourseLesson.countDocuments({ courseId, deletedAt: null }),
      CourseLesson.countDocuments({ courseId, deletedAt: null, status: 'published' }),
      CourseTopic.countDocuments({ courseId, deletedAt: null }),
      getApprovedRatingSummary(course._id),
    ]);

    return {
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      averageRating: rating.averageRating,
      approvedReviewCount: rating.approvedReviewCount,
      totalLessons,
      publishedLessons,
      totalTopics,
      courseStatus: course.status,
      createdAt: course.createdAt,
      publishedAt: course.publishedAt,
    };
  });
}
