import { REVIEW_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseReview } from '../../../models/CourseReview.js';
import { deleteCache, getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL } from '../../../services/cache/keys.js';

const emptyDistribution = () => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
});

function toPublicDistribution(stored) {
  if (!stored) return emptyDistribution();
  return {
    1: stored.star1 || stored[1] || 0,
    2: stored.star2 || stored[2] || 0,
    3: stored.star3 || stored[3] || 0,
    4: stored.star4 || stored[4] || 0,
    5: stored.star5 || stored[5] || 0,
  };
}

export function ratingStatsCacheKey(courseId) {
  return `course:rating-stats:${courseId}`;
}

export function publicReviewsCacheKey(courseId, query = {}) {
  const parts = [
    query.page || 1,
    query.limit || 10,
    query.rating || '-',
    query.sort || 'newest',
  ];
  return `course:reviews:public:${courseId}:${parts.join(':')}`;
}

export async function invalidateReviewCaches(courseId) {
  if (!courseId) return;
  const id = courseId.toString();
  await deleteCache(ratingStatsCacheKey(id));
  // Broad invalidation of paginated public lists
  const { clearCacheByPrefix } = await import('../../../services/cache/cache.service.js');
  await clearCacheByPrefix(`course:reviews:public:${id}:`);
}

/**
 * Aggregate approved reviews only and persist on Course.ratingStats.
 */
export async function recalculateCourseRatingStats(courseId) {
  const match = {
    courseId: typeof courseId === 'string' ? courseId : courseId,
    deletedAt: null,
    status: REVIEW_STATUS.APPROVED,
  };
  // Ensure ObjectId type for aggregation
  const mongoose = await import('mongoose');
  const oid =
    courseId instanceof mongoose.default.Types.ObjectId
      ? courseId
      : new mongoose.default.Types.ObjectId(String(courseId));

  const [row] = await CourseReview.aggregate([
    { $match: { ...match, courseId: oid } },
    {
      $group: {
        _id: '$courseId',
        averageRating: { $avg: '$rating' },
        approvedReviewCount: { $sum: 1 },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      },
    },
  ]);

  const stats = {
    averageRating: row ? Number(row.averageRating.toFixed(2)) : 0,
    approvedReviewCount: row?.approvedReviewCount || 0,
    distribution: {
      star1: row?.star1 || 0,
      star2: row?.star2 || 0,
      star3: row?.star3 || 0,
      star4: row?.star4 || 0,
      star5: row?.star5 || 0,
    },
    recalculatedAt: new Date(),
  };

  await Course.updateOne({ _id: oid }, { $set: { ratingStats: stats } });
  await invalidateReviewCaches(oid);
  return {
    averageRating: stats.averageRating,
    approvedReviewCount: stats.approvedReviewCount,
    totalApprovedReviews: stats.approvedReviewCount,
    distribution: toPublicDistribution(stats.distribution),
  };
}

export async function getApprovedRatingSummary(courseId) {
  const id = courseId.toString();
  return getOrSetCache(ratingStatsCacheKey(id), CACHE_TTL.COURSE_DETAIL || 300, async () => {
    const course = await Course.findById(id).select('ratingStats').lean();
    if (course?.ratingStats?.recalculatedAt) {
      return {
        averageRating: course.ratingStats.averageRating || 0,
        approvedReviewCount: course.ratingStats.approvedReviewCount || 0,
        totalApprovedReviews: course.ratingStats.approvedReviewCount || 0,
        distribution: toPublicDistribution(course.ratingStats.distribution),
      };
    }
    return recalculateCourseRatingStats(id);
  });
}

/** Pure helper for unit tests */
export function computeStatsFromRatings(ratings) {
  const distribution = emptyDistribution();
  let sum = 0;
  for (const r of ratings) {
    const n = Number(r);
    if (!Number.isInteger(n) || n < 1 || n > 5) continue;
    distribution[n] += 1;
    sum += n;
  }
  const count = Object.values(distribution).reduce((a, b) => a + b, 0);
  return {
    averageRating: count ? Number((sum / count).toFixed(2)) : 0,
    approvedReviewCount: count,
    totalApprovedReviews: count,
    distribution,
  };
}

void CACHE_TTL;
