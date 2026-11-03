import sanitizeHtml from 'sanitize-html';
import { REVIEW_STATUS } from '../../../config/security.js';
import { env } from '../../../config/env.js';
import { Course } from '../../../models/Course.js';
import { CourseReview } from '../../../models/CourseReview.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { findLearningEnrollment } from '../../enrollment/services/enrollmentAccess.service.js';
import {
  getApprovedRatingSummary,
  invalidateReviewCaches,
  publicReviewsCacheKey,
  recalculateCourseRatingStats,
} from './ratingStats.service.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL } from '../../../services/cache/keys.js';
import { isPlatformAdmin } from './courseAccess.service.js';

function sanitizeReviewText(text, maxLen) {
  const cleaned = sanitizeHtml(String(text || ''), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
  return cleaned.slice(0, maxLen);
}

async function assertReviewEligibility(userId, courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  const enrollment = await findLearningEnrollment(userId, courseId);
  if (!enrollment) {
    throw new AppError(
      'Active enrollment required to review this course',
      403,
      'NOT_ENROLLED'
    );
  }

  if (env.REVIEW_REQUIRE_COURSE_COMPLETION) {
    if (enrollment.courseCompletionStatus !== 'completed' && enrollment.status !== 'completed') {
      throw new AppError(
        'Course completion required before reviewing',
        403,
        'REVIEW_COMPLETION_REQUIRED'
      );
    }
  }

  return { course, enrollment };
}

export async function createStudentReview(req, courseId, input) {
  const { enrollment } = await assertReviewEligibility(req.user._id, courseId);

  const existing = await CourseReview.findOne({
    studentId: req.user._id,
    courseId,
    deletedAt: null,
  });
  if (existing) {
    throw new AppError('You have already reviewed this course', 409, 'REVIEW_DUPLICATE');
  }

  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError('Rating must be an integer between 1 and 5', 400, 'INVALID_RATING');
  }

  const title = sanitizeReviewText(input.title || '', 150);
  const comment = sanitizeReviewText(input.comment || '', 2000);
  if (!comment && !title) {
    // allow rating-only, but comment empty is OK per optional comment
  }

  let review;
  try {
    review = await CourseReview.create({
      courseId,
      studentId: req.user._id,
      enrollmentId: enrollment._id,
      rating,
      title,
      comment,
      status: REVIEW_STATUS.PENDING,
      moderationHistory: [
        {
          action: 'submitted',
          toStatus: REVIEW_STATUS.PENDING,
          actorId: req.user._id,
        },
      ],
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('You have already reviewed this course', 409, 'REVIEW_DUPLICATE');
    }
    throw err;
  }

  await invalidateReviewCaches(courseId);
  return review.toSafeObject({ includeStudentPrivate: true });
}

export async function updateStudentReview(req, reviewId, input) {
  const review = await CourseReview.findOne({ _id: reviewId, deletedAt: null });
  if (!review) throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND');
  if (review.studentId.toString() !== req.user._id.toString()) {
    throw new AppError('You can only edit your own review', 403, 'FORBIDDEN');
  }

  // Re-check eligibility still holds
  await assertReviewEligibility(req.user._id, review.courseId);

  if (input.rating !== undefined) {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError('Rating must be an integer between 1 and 5', 400, 'INVALID_RATING');
    }
    review.rating = rating;
  }
  if (input.title !== undefined) review.title = sanitizeReviewText(input.title, 150);
  if (input.comment !== undefined) review.comment = sanitizeReviewText(input.comment, 2000);

  const from = review.status;
  review.status = REVIEW_STATUS.PENDING;
  review.rejectionReason = null;
  review.pushModeration({
    action: 'edited',
    fromStatus: from,
    toStatus: REVIEW_STATUS.PENDING,
    actorId: req.user._id,
  });
  await review.save();

  // If was approved, stats must drop until re-approved
  if (from === REVIEW_STATUS.APPROVED) {
    await recalculateCourseRatingStats(review.courseId);
  } else {
    await invalidateReviewCaches(review.courseId);
  }

  return review.toSafeObject({ includeStudentPrivate: true });
}

/** Admin list with filters */
export async function listAdminReviews(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { deletedAt: null };

  if (query.status) filter.status = query.status;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.rating) filter.rating = Number(query.rating);

  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [users, courses] = await Promise.all([
      User.find({
        deletedAt: null,
        $or: [{ email: rx }, { firstName: rx }, { lastName: rx }],
      })
        .select('_id')
        .limit(100)
        .lean(),
      Course.find({ deletedAt: null, $or: [{ title: rx }, { slug: rx }] })
        .select('_id')
        .limit(100)
        .lean(),
    ]);
    filter.$or = [
      { studentId: { $in: users.map((u) => u._id) } },
      { courseId: { $in: courses.map((c) => c._id) } },
      { title: rx },
      { comment: rx },
    ];
  }

  let sort = { createdAt: -1 };
  switch (query.sort) {
    case 'oldest':
      sort = { createdAt: 1 };
      break;
    case 'highest':
      sort = { rating: -1, createdAt: -1 };
      break;
    case 'lowest':
      sort = { rating: 1, createdAt: -1 };
      break;
    default:
      sort = { createdAt: -1 };
  }

  const [rows, total] = await Promise.all([
    CourseReview.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('studentId', 'firstName lastName email')
      .populate('courseId', 'title slug')
      .lean(),
    CourseReview.countDocuments(filter),
  ]);

  return {
    reviews: rows.map((r) => ({
      id: r._id.toString(),
      userId: r.studentId?._id?.toString() || r.studentId?.toString(),
      courseId: r.courseId?._id?.toString() || r.courseId?.toString(),
      enrollmentId: r.enrollmentId?.toString?.() || null,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      status: r.status,
      rejectionReason: r.rejectionReason,
      moderatedBy: r.moderatedBy?.toString?.() || null,
      moderatedAt: r.moderatedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      student: r.studentId
        ? {
            id: r.studentId._id.toString(),
            firstName: r.studentId.firstName,
            lastName: r.studentId.lastName,
            email: r.studentId.email,
          }
        : null,
      course: r.courseId
        ? {
            id: r.courseId._id.toString(),
            title: r.courseId.title,
            slug: r.courseId.slug,
          }
        : null,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getAdminReview(id) {
  const review = await CourseReview.findOne({ _id: id, deletedAt: null })
    .populate('studentId', 'firstName lastName email')
    .populate('courseId', 'title slug')
    .populate('moderatedBy', 'firstName lastName email');
  if (!review) throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND');

  return {
    ...review.toSafeObject({ includeAdmin: true }),
    student: review.studentId
      ? {
          id: review.studentId._id.toString(),
          firstName: review.studentId.firstName,
          lastName: review.studentId.lastName,
          email: review.studentId.email,
        }
      : null,
    course: review.courseId
      ? {
          id: review.courseId._id.toString(),
          title: review.courseId.title,
          slug: review.courseId.slug,
        }
      : null,
  };
}

export async function moderateReview(req, reviewId, { status, rejectionReason }) {
  if (!isPlatformAdmin(req.role)) {
    throw new AppError('Only admins can moderate reviews', 403, 'FORBIDDEN');
  }
  if (![REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED].includes(status)) {
    throw new AppError('Status must be approved or rejected', 400, 'INVALID_STATUS');
  }

  const review = await CourseReview.findOne({ _id: reviewId, deletedAt: null });
  if (!review) throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND');

  const from = review.status;
  if (from === status) {
    return review.toSafeObject({ includeAdmin: true });
  }

  review.status = status;
  review.moderatedBy = req.user._id;
  review.moderatedAt = new Date();
  review.reviewedBy = req.user._id;
  review.reviewedAt = review.moderatedAt;
  if (status === REVIEW_STATUS.REJECTED) {
    review.rejectionReason = sanitizeReviewText(rejectionReason || '', 2000) || null;
  } else {
    review.rejectionReason = null;
  }
  review.pushModeration({
    action: status === REVIEW_STATUS.APPROVED ? 'approved' : 'rejected',
    fromStatus: from,
    toStatus: status,
    actorId: req.user._id,
    reason: review.rejectionReason,
  });
  await review.save();
  await recalculateCourseRatingStats(review.courseId);
  return review.toSafeObject({ includeAdmin: true });
}

export async function deleteReview(req, reviewId) {
  if (!isPlatformAdmin(req.role)) {
    throw new AppError('Only admins can delete reviews', 403, 'FORBIDDEN');
  }
  const review = await CourseReview.findOne({ _id: reviewId, deletedAt: null });
  if (!review) throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND');

  const from = review.status;
  review.deletedAt = new Date();
  review.pushModeration({
    action: 'deleted',
    fromStatus: from,
    toStatus: REVIEW_STATUS.REJECTED,
    actorId: req.user._id,
  });
  // Soft-delete; unique index allows a new review later if needed
  await review.save();
  await recalculateCourseRatingStats(review.courseId);
  return review.toSafeObject({ includeAdmin: true });
}

/** Legacy admin course-scoped list */
export async function listCourseReviews(req, courseId) {
  const filter = { courseId, deletedAt: null };
  if (!isPlatformAdmin(req.role)) {
    filter.status = REVIEW_STATUS.APPROVED;
  }
  const reviews = await CourseReview.find(filter)
    .populate('studentId', 'firstName lastName email')
    .sort({ createdAt: -1 });

  return reviews.map((r) => ({
    ...r.toSafeObject({ includeAdmin: isPlatformAdmin(req.role) }),
    student: r.studentId
      ? {
          id: r.studentId._id.toString(),
          firstName: r.studentId.firstName,
          lastName: r.studentId.lastName,
          ...(isPlatformAdmin(req.role) ? { email: r.studentId.email } : {}),
        }
      : null,
  }));
}

export async function listPublicCourseReviews(courseId, query = {}) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null }).select('_id');
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 10, 50);
  const cacheKey = publicReviewsCacheKey(courseId, { ...query, page, limit });

  return getOrSetCache(cacheKey, CACHE_TTL.COURSE_DETAIL || 300, async () => {
    const filter = {
      courseId,
      deletedAt: null,
      status: REVIEW_STATUS.APPROVED,
    };
    if (query.rating) filter.rating = Number(query.rating);

    let sort = { createdAt: -1 };
    switch (query.sort) {
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'highest':
        sort = { rating: -1, createdAt: -1 };
        break;
      case 'lowest':
        sort = { rating: 1, createdAt: -1 };
        break;
      default:
        sort = { createdAt: -1 };
    }

    const [rows, total, stats] = await Promise.all([
      CourseReview.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('studentId', 'firstName lastName profileImage')
        .lean(),
      CourseReview.countDocuments(filter),
      getApprovedRatingSummary(courseId),
    ]);

    return {
      averageRating: stats.averageRating,
      totalApprovedReviews: stats.approvedReviewCount ?? stats.totalApprovedReviews,
      ratingDistribution: stats.distribution,
      reviews: rows.map((r) => ({
        id: r._id.toString(),
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        student: r.studentId
          ? {
              firstName: r.studentId.firstName,
              lastName: r.studentId.lastName,
              profileImage: r.studentId.profileImage || null,
            }
          : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  });
}

export { getApprovedRatingSummary };
