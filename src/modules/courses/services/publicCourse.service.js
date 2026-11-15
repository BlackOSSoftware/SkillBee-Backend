import { COURSE_STATUS, REVIEW_STATUS, ROLE_SLUGS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLead } from '../../../models/CourseLead.js';
import { User } from '../../../models/User.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseReview } from '../../../models/CourseReview.js';
import { CourseTopic } from '../../../models/CourseTopic.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import {
  CACHE_TTL,
  courseDetailKey,
  courseListKey,
  curriculumKey,
  featuredKey,
} from '../../../services/cache/keys.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { listPublicCategories } from './category.service.js';
import { getApprovedRatingSummary } from './review.service.js';
import { courseTypeFilter } from './course.service.js';

/** Plain-object course type resolution (works on lean docs). */
export function resolveCourseType(course) {
  if (course?.courseType) return course.courseType;
  return course?.pricing?.type === 'free' ? 'FREE' : 'PRE_RECORDED';
}

/** Backend-driven CTA mapping per course type. */
export function courseActionLabel(course) {
  const type = resolveCourseType(course);
  if (type === 'LIVE_SESSION') return 'Apply Now';
  if (type === 'PRE_RECORDED') return 'Buy Now';
  return 'Enroll Now';
}

export function enrollmentEligibility(course) {
  const type = resolveCourseType(course);
  if (type === 'LIVE_SESSION') return 'application';
  if (type === 'PRE_RECORDED') return 'payment_required';
  return 'self_enroll';
}

function publicInstructor(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    profileImage: user.profileImage,
  };
}

function publicCourseCard(course, rating = null) {
  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription,
    thumbnail: course.thumbnail,
    level: course.level,
    language: course.language,
    courseType: resolveCourseType(course),
    actionLabel: courseActionLabel(course),
    enrollmentEligibility: enrollmentEligibility(course),
    durationValue: course.durationValue,
    durationUnit: course.durationUnit,
    isFeatured: course.isFeatured,
    pricing: {
      type: course.pricing?.type,
      regularPrice: course.pricing?.regularPrice,
      salePrice: course.pricing?.salePrice,
      currency: course.pricing?.currency,
    },
    categories: (course.categoryIds || [])
      .filter((c) => c?.name)
      .map((c) => ({ id: c._id.toString(), name: c.name, slug: c.slug })),
    instructors: (course.instructorIds || []).map(publicInstructor).filter(Boolean),
    rating: rating || { averageRating: 0, approvedReviewCount: 0 },
    publishedAt: course.publishedAt,
  };
}

export async function listPublicCourses(query) {
  const cacheKey = courseListKey(query);
  return getOrSetCache(cacheKey, CACHE_TTL.COURSE_LIST, async () => {
    const filter = {
      deletedAt: null,
      status: COURSE_STATUS.PUBLISHED,
    };
    if (query.categoryId) filter.categoryIds = query.categoryId;
    if (query.level) filter.level = query.level;
    if (query.language) filter.language = query.language;
    if (query.pricingType) filter['pricing.type'] = query.pricingType;
    if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured;
    if (query.search) {
      const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { shortDescription: rx }, { tags: rx }, { slug: rx }];
    }
    if (query.courseType) {
      // courseTypeFilter may itself contain $or — merge via $and to avoid
      // clobbering the search $or above.
      const typeCond = courseTypeFilter(String(query.courseType).toUpperCase());
      if (Object.keys(typeCond).length) {
        filter.$and = [...(filter.$and || []), typeCond];
      }
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = getSkip({ page, limit });

    const [rows, total] = await Promise.all([
      Course.find(filter)
        .populate('categoryIds', 'name slug')
        .populate('instructorIds', 'firstName lastName profileImage')
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(filter),
    ]);

    const data = await Promise.all(
      rows.map(async (course) => {
        const rating = await getApprovedRatingSummary(course._id);
        return publicCourseCard(course, rating);
      })
    );

    return {
      data,
      pagination: buildPagination({ page, limit, total }),
    };
  });
}

export async function listFeaturedCourses() {
  return getOrSetCache(featuredKey(), CACHE_TTL.FEATURED, async () => {
    const rows = await Course.find({
      deletedAt: null,
      status: COURSE_STATUS.PUBLISHED,
      isFeatured: true,
    })
      .populate('categoryIds', 'name slug')
      .populate('instructorIds', 'firstName lastName profileImage')
      .sort({ sortOrder: 1, publishedAt: -1 })
      .limit(12)
      .lean();

    return Promise.all(
      rows.map(async (course) => {
        const rating = await getApprovedRatingSummary(course._id);
        return publicCourseCard(course, rating);
      })
    );
  });
}

export async function getPublicCourseBySlug(slug, viewerUserId = null) {
  let enrolled = false;
  // Resolve enrollment first so cache key isolates private enrolled flag
  const courseIdProbe = await Course.findOne({
    slug,
    deletedAt: null,
    status: COURSE_STATUS.PUBLISHED,
  })
    .select('_id')
    .lean();
  if (!courseIdProbe) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  if (viewerUserId) {
    const { learningEnrollmentQuery } = await import(
      '../../enrollment/services/enrollmentAccess.service.js'
    );
    enrolled = Boolean(
      await CourseEnrollment.exists(learningEnrollmentQuery(viewerUserId, courseIdProbe._id))
    );
  }

  // Cache shared public payload (enrolled=false). Enrolled viewers get same public
  // fields with enrolled overlay — do not put other users' data in the key.
  const publicPayload = await getOrSetCache(
    courseDetailKey(slug, false),
    CACHE_TTL.COURSE_DETAIL,
    async () => {
      const course = await Course.findOne({
        slug,
        deletedAt: null,
        status: COURSE_STATUS.PUBLISHED,
      })
        .populate('categoryIds', 'name slug description image')
        .populate('instructorIds', 'firstName lastName profileImage');

      if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

      const [rating, reviews] = await Promise.all([
        getApprovedRatingSummary(course._id),
        CourseReview.find({
          courseId: course._id,
          deletedAt: null,
          status: REVIEW_STATUS.APPROVED,
        })
          .populate('studentId', 'firstName lastName')
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
      ]);

      return {
        ...publicCourseCard(course, rating),
        description: course.description,
        gallery: course.gallery,
        learningObjectives: course.learningObjectives,
        requirements: course.requirements,
        targetAudience: course.targetAudience,
        faqs: course.faqs,
        tags: course.tags,
        certificate: {
          enabled: course.certificate?.enabled,
          minimumCompletionPercentage: course.certificate?.minimumCompletionPercentage,
        },
        seo: course.seo,
        liveSession:
          resolveCourseType(course) === 'LIVE_SESSION' && course.liveSession
            ? {
                batchName: course.liveSession.batchName,
                startDate: course.liveSession.startDate,
                endDate: course.liveSession.endDate,
                sessionMode: course.liveSession.sessionMode,
                sessionSchedule: course.liveSession.sessionSchedule,
              }
            : null,
        reviews: reviews.map((r) => ({
          id: r._id.toString(),
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          createdAt: r.createdAt,
          student: r.studentId
            ? {
                firstName: r.studentId.firstName,
                lastName: r.studentId.lastName,
              }
            : null,
        })),
      };
    }
  );

  return { ...publicPayload, enrolled };
}

export async function getPublicCurriculum(slug, viewerUserId = null) {
  const course = await Course.findOne({
    slug,
    deletedAt: null,
    status: COURSE_STATUS.PUBLISHED,
  })
    .select('_id title slug')
    .lean();
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  let enrolled = false;
  if (viewerUserId) {
    const { learningEnrollmentQuery } = await import(
      '../../enrollment/services/enrollmentAccess.service.js'
    );
    enrolled = Boolean(
      await CourseEnrollment.exists(learningEnrollmentQuery(viewerUserId, course._id))
    );
  }

  // Curriculum visibility differs by enrollment — separate cache keys
  return getOrSetCache(curriculumKey(slug, enrolled), CACHE_TTL.CURRICULUM, async () => {
    const now = new Date();
    const topics = await CourseTopic.find({
      courseId: course._id,
      deletedAt: null,
      status: { $in: ['published', 'active'] },
    })
      .sort({ sortOrder: 1 })
      .lean();

    const result = [];
    for (const topic of topics) {
      if (
        topic.availabilityType === 'scheduled' &&
        topic.availableAt &&
        topic.availableAt > now &&
        !enrolled
      ) {
        result.push({
          id: topic._id.toString(),
          title: topic.title,
          description: topic.description,
          sortOrder: topic.sortOrder,
          locked: true,
          lessons: [],
        });
        continue;
      }

      const lessons = await CourseLesson.find({
        topicId: topic._id,
        deletedAt: null,
        status: 'published',
      }).sort({ sortOrder: 1 });

      result.push({
        id: topic._id.toString(),
        title: topic.title,
        description: topic.description,
        sortOrder: topic.sortOrder,
        locked: false,
        lessons: lessons
          .filter((lesson) => !lesson.scheduledAt || lesson.scheduledAt <= now || enrolled)
          .map((lesson) => lesson.toPublicObject({ enrolled })),
      });
    }

    return {
      course: { id: course._id.toString(), title: course.title, slug: course.slug },
      enrolled,
      topics: result,
    };
  });
}

export { listPublicCategories };

/**
 * Public free-course registration.
 * Saves the visitor's contact details as a CourseLead (deduped per
 * email + course), reports whether a student account already exists for
 * the email, and — when the caller is an authenticated student — creates
 * the free enrollment immediately via the existing self-enroll service.
 */
export async function registerFreeCourseLead(req, slug, input) {
  const course = await Course.findOne({
    slug,
    deletedAt: null,
    status: COURSE_STATUS.PUBLISHED,
  });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (resolveCourseType(course) !== 'FREE') {
    throw new AppError('This course is not a free course', 400, 'NOT_A_FREE_COURSE');
  }

  const email = String(input.email).trim().toLowerCase();
  const studentId = req.user?._id || null;

  let lead = await CourseLead.findOne({ email, course: course._id, deletedAt: null });
  if (lead) {
    lead.name = input.name.trim();
    lead.whatsappNumber = input.whatsappNumber.trim();
    lead.currentCompany = input.currentCompany.trim();
    lead.currentCity = input.currentCity.trim();
    if (studentId && !lead.student) lead.student = studentId;
    await lead.save();
  } else {
    lead = await CourseLead.create({
      name: input.name.trim(),
      email,
      whatsappNumber: input.whatsappNumber.trim(),
      currentCompany: input.currentCompany.trim(),
      currentCity: input.currentCity.trim(),
      course: course._id,
      student: studentId,
      source: 'free_course_registration',
      status: 'new',
    });
  }

  const existingUser = await User.findOne({ email, deletedAt: null })
    .select('_id')
    .lean();
  const accountExists = Boolean(existingUser);

  let enrollment = null;
  let alreadyEnrolled = false;
  if (req.user && req.role?.slug === ROLE_SLUGS.STUDENT) {
    const { enrollFreeCourse } = await import(
      '../../enrollment/services/enrollment.service.js'
    );
    try {
      enrollment = await enrollFreeCourse(req, course._id.toString());
    } catch (error) {
      if (error?.code === 'ALREADY_ENROLLED') {
        alreadyEnrolled = true;
      } else {
        throw error;
      }
    }
    if ((enrollment || alreadyEnrolled) && lead.status === 'new') {
      lead.status = 'converted';
      await lead.save();
    }
  }

  return {
    lead: lead.toSafeObject(),
    accountExists,
    enrollment,
    alreadyEnrolled,
  };
}
