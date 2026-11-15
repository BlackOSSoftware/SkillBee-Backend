import mongoose from 'mongoose';
import { env } from '../../../config/env.js';
import { COURSE_STATUS, COURSE_TYPES, ROLE_SLUGS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseCategory } from '../../../models/CourseCategory.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseResource } from '../../../models/CourseResource.js';
import { CourseTopic } from '../../../models/CourseTopic.js';
import { Role } from '../../../models/Role.js';
import { User } from '../../../models/User.js';
import { invalidateCourseCaches } from '../../../services/cache/invalidation.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { sanitizeRichText } from '../../../utils/sanitizeHtml.js';
import {
  assertCanManageCourse,
  assertCanReadCourse,
  getCourseOrThrow,
  isPlatformAdmin,
} from './courseAccess.service.js';
import { mapGallery, mapThumbnail } from './courseMedia.service.js';
import { ensureUniqueCourseSlug } from './courseSlug.service.js';

async function validateCategoryIds(categoryIds = []) {
  if (!categoryIds.length) return [];
  const categories = await CourseCategory.find({
    _id: { $in: categoryIds },
    deletedAt: null,
    status: 'active',
  }).select('_id');
  if (categories.length !== categoryIds.length) {
    throw new AppError('One or more categories are invalid', 400, 'INVALID_CATEGORIES');
  }
  return categoryIds;
}

async function validateInstructorIds(instructorIds = []) {
  if (!instructorIds.length) return [];
  const instructorRole = await Role.findBySlug(ROLE_SLUGS.INSTRUCTOR);
  const adminRole = await Role.findBySlug(ROLE_SLUGS.ADMIN);
  const superRole = await Role.findBySlug(ROLE_SLUGS.SUPER_ADMIN);
  const allowedRoleIds = [instructorRole?._id, adminRole?._id, superRole?._id].filter(Boolean);

  const users = await User.find({
    _id: { $in: instructorIds },
    deletedAt: null,
    status: 'active',
    roleId: { $in: allowedRoleIds },
  }).select('_id');

  if (users.length !== instructorIds.length) {
    throw new AppError('One or more instructors are invalid', 400, 'INVALID_INSTRUCTORS');
  }
  return instructorIds;
}

function normalizePricing(pricing, courseType = null) {
  if (!pricing) {
    if (courseType === 'PRE_RECORDED') {
      return { type: 'paid', regularPrice: 0, salePrice: null, currency: 'INR' };
    }
    return { type: 'free', regularPrice: 0, salePrice: null, currency: 'INR' };
  }
  if (courseType === 'FREE' || pricing.type === 'free') {
    return {
      ...pricing,
      type: 'free',
      regularPrice: 0,
      salePrice: null,
    };
  }
  return pricing;
}

/**
 * Mongo filter for courseType that stays backward compatible with
 * legacy documents where courseType was never set (resolved via pricing.type).
 */
export function courseTypeFilter(courseType) {
  if (!courseType) return {};
  if (courseType === 'LIVE_SESSION') return { courseType: 'LIVE_SESSION' };
  if (courseType === 'FREE') {
    return {
      $or: [
        { courseType: 'FREE' },
        { courseType: null, 'pricing.type': 'free' },
      ],
    };
  }
  // PRE_RECORDED
  return {
    $or: [
      { courseType: 'PRE_RECORDED' },
      {
        courseType: null,
        $or: [{ 'pricing.type': 'paid' }, { 'pricing.type': { $exists: false } }],
      },
    ],
  };
}

/**
 * Validate courseType ↔ pricing consistency on the merged document.
 * FREE → pricing must be free. PRE_RECORDED → paid pricing with price > 0.
 * LIVE_SESSION → pricing unrestricted (application-based enrollment).
 */
function assertCourseTypePricing(course) {
  const type = course.effectiveCourseType ? course.effectiveCourseType() : course.courseType;
  const pricing = course.pricing || {};
  if (type === 'FREE' && pricing.type !== 'free') {
    throw new AppError('FREE courses must use free pricing', 422, 'COURSE_TYPE_PRICING');
  }
  if (type === 'PRE_RECORDED' && !(pricing.type === 'paid' && pricing.regularPrice > 0)) {
    throw new AppError(
      'PRE_RECORDED courses require paid pricing with regularPrice > 0',
      422,
      'COURSE_TYPE_PRICING'
    );
  }
}

export async function listCourses(req) {
  const query = req.query;
  const filter = { deletedAt: null };

  if (!isPlatformAdmin(req.role) && req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    filter.instructorIds = req.user._id;
  }

  if (query.status) filter.status = query.status;
  if (query.categoryId) filter.categoryIds = query.categoryId;
  if (query.instructorId) filter.instructorIds = query.instructorId;
  if (query.level) filter.level = query.level;
  if (query.language) filter.language = query.language;
  if (query.pricingType) filter['pricing.type'] = query.pricingType;
  if (query.courseType) Object.assign(filter, courseTypeFilter(query.courseType));
  if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = query.startDate;
    if (query.endDate) filter.createdAt.$lte = query.endDate;
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { shortDescription: rx }, { tags: rx }, { slug: rx }];
  }

  const sort = { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1 };
  const skip = getSkip(query);

  const [rows, total] = await Promise.all([
    Course.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .populate('categoryIds', 'name slug status')
      .populate('instructorIds', 'firstName lastName email profileImage')
      .lean(),
    Course.countDocuments(filter),
  ]);

  return {
    data: rows.map((doc) => {
      const course = Course.hydrate(doc);
      return course.toAdminObject();
    }),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getCourseById(req, id) {
  const course = await Course.findOne({ _id: id, deletedAt: null })
    .populate('categoryIds', 'name slug status')
    .populate('instructorIds', 'firstName lastName email profileImage status');
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  assertCanReadCourse(req, course);
  return course.toAdminObject();
}

export async function createCourse(req, input) {
  const slug = await ensureUniqueCourseSlug(input.slug || input.title);
  const categoryIds = await validateCategoryIds(input.categoryIds || []);
  const instructorIds = await validateInstructorIds(input.instructorIds || []);

  // Backward compatible: legacy clients omit courseType — derive it from pricing.
  const courseType =
    input.courseType ||
    (input.pricing?.type === 'paid' ? 'PRE_RECORDED' : 'FREE');
  if (!COURSE_TYPES.includes(courseType)) {
    throw new AppError('Invalid course type', 400, 'INVALID_COURSE_TYPE');
  }

  const course = await Course.create({
    ...input,
    slug,
    courseType,
    description: sanitizeRichText(input.description || ''),
    thumbnail: mapThumbnail(input.thumbnail) ?? null,
    gallery: mapGallery(input.gallery) || [],
    categoryIds,
    instructorIds,
    pricing: normalizePricing(input.pricing, courseType),
    status: COURSE_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  assertCourseTypePricing(course);

  await invalidateCourseCaches({ slug: course.slug, courseId: course._id.toString() });
  return course.toAdminObject();
}

export async function updateCourse(req, id, input) {
  const course = await getCourseOrThrow(id);
  await assertCanManageCourse(req, course);
  const previousSlug = course.slug;

  if (input.title !== undefined) course.title = input.title;
  if (input.slug !== undefined) {
    course.slug = await ensureUniqueCourseSlug(input.slug, course._id);
  }
  if (input.shortDescription !== undefined) course.shortDescription = input.shortDescription;
  if (input.description !== undefined) course.description = sanitizeRichText(input.description);
  if (input.thumbnail !== undefined) course.thumbnail = mapThumbnail(input.thumbnail);
  if (input.gallery !== undefined) course.gallery = mapGallery(input.gallery);
  if (input.categoryIds !== undefined) {
    course.categoryIds = await validateCategoryIds(input.categoryIds);
  }
  if (input.instructorIds !== undefined) {
    if (!isPlatformAdmin(req.role)) {
      throw new AppError('Only admins can reassign instructors', 403, 'FORBIDDEN');
    }
    course.instructorIds = await validateInstructorIds(input.instructorIds);
  }
  if (input.level !== undefined) course.level = input.level;
  if (input.language !== undefined) course.language = input.language;
  if (input.courseType !== undefined) {
    if (!COURSE_TYPES.includes(input.courseType)) {
      throw new AppError('Invalid course type', 400, 'INVALID_COURSE_TYPE');
    }
    course.courseType = input.courseType;
  }
  if (input.durationValue !== undefined) course.durationValue = input.durationValue;
  if (input.durationUnit !== undefined) course.durationUnit = input.durationUnit;
  if (input.isFeatured !== undefined) course.isFeatured = input.isFeatured;
  if (input.sortOrder !== undefined) course.sortOrder = input.sortOrder;
  if (input.learningObjectives !== undefined) course.learningObjectives = input.learningObjectives;
  if (input.requirements !== undefined) course.requirements = input.requirements;
  if (input.targetAudience !== undefined) course.targetAudience = input.targetAudience;
  if (input.faqs !== undefined) course.faqs = input.faqs;
  if (input.tags !== undefined) course.tags = input.tags;
  if (input.certificate !== undefined) course.certificate = { ...course.certificate, ...input.certificate };
  if (input.enrollment !== undefined) {
    course.enrollment = {
      ...course.enrollment.toObject?.() || course.enrollment,
      ...input.enrollment,
    };
  }
  if (input.expiry !== undefined) course.expiry = { ...course.expiry.toObject?.() || course.expiry, ...input.expiry };
  if (input.liveSession !== undefined) {
    if (course.effectiveCourseType() !== 'LIVE_SESSION') {
      throw new AppError(
        'liveSession details are only allowed for LIVE_SESSION courses',
        400,
        'INVALID_COURSE_TYPE'
      );
    }
    course.liveSession = {
      ...(course.liveSession?.toObject?.() || course.liveSession || {}),
      ...input.liveSession,
    };
  }
  if (input.seo !== undefined) course.seo = { ...course.seo.toObject?.() || course.seo, ...input.seo };
  if (input.pricing !== undefined) {
    if (!isPlatformAdmin(req.role)) {
      throw new AppError('Only admins can manage pricing', 403, 'FORBIDDEN');
    }
    course.pricing = normalizePricing(
      {
        ...(course.pricing.toObject?.() || course.pricing),
        ...input.pricing,
      },
      course.effectiveCourseType()
    );
  }

  if (input.courseType !== undefined || input.pricing !== undefined) {
    assertCourseTypePricing(course);
  }
  course.updatedBy = req.user._id;
  await course.save();

  if (
    previousSlug &&
    course.slug !== previousSlug &&
    course.status === COURSE_STATUS.PUBLISHED
  ) {
    try {
      const { ensureCourseSlugRedirect } = await import(
        '../../seo/services/redirect.service.js'
      );
      await ensureCourseSlugRedirect({
        oldSlug: previousSlug,
        newSlug: course.slug,
        actorId: req.user._id,
      });
    } catch {
      // SEO redirect failure must not block course updates
    }
  }

  await invalidateCourseCaches({ slug: course.slug, courseId: course._id.toString() });
  if (previousSlug !== course.slug) {
    await invalidateCourseCaches({ slug: previousSlug, courseId: course._id.toString() });
  }
  try {
    const { invalidateSeoCaches } = await import('../../seo/services/seoCache.service.js');
    await invalidateSeoCaches();
  } catch {
    // optional
  }
  return course.toAdminObject();
}

export async function softDeleteCourse(req, id) {
  const course = await getCourseOrThrow(id);
  await assertCanManageCourse(req, course);
  if (!isPlatformAdmin(req.role)) {
    throw new AppError('Only admins can delete courses', 403, 'FORBIDDEN');
  }
  course.deletedAt = new Date();
  course.status = COURSE_STATUS.ARCHIVED;
  course.archivedAt = course.archivedAt || new Date();
  course.updatedBy = req.user._id;
  await course.save();
  await invalidateCourseCaches({ slug: course.slug, courseId: course._id.toString() });
  return course.toAdminObject();
}

export async function updateCourseSortOrder(req, id, sortOrder) {
  const course = await getCourseOrThrow(id);
  await assertCanManageCourse(req, course);
  course.sortOrder = sortOrder;
  course.updatedBy = req.user._id;
  await course.save();
  await invalidateCourseCaches({ slug: course.slug, courseId: course._id.toString() });
  return course.toAdminObject();
}

async function assertPublishReady(course) {
  if (!course.title?.trim()) {
    throw new AppError('Title is required to publish', 422, 'PUBLISH_VALIDATION');
  }
  if (!course.slug) {
    throw new AppError('Slug is required to publish', 422, 'PUBLISH_VALIDATION');
  }
  if (!course.description?.trim()) {
    throw new AppError('Description is required to publish', 422, 'PUBLISH_VALIDATION');
  }
  if (!course.thumbnail?.secureUrl) {
    throw new AppError('Thumbnail is required to publish', 422, 'PUBLISH_VALIDATION');
  }
  if (!course.instructorIds?.length) {
    throw new AppError('At least one instructor is required', 422, 'PUBLISH_VALIDATION');
  }
  if (!course.categoryIds?.length) {
    throw new AppError('At least one category is required', 422, 'PUBLISH_VALIDATION');
  }
  if (course.pricing?.type === 'paid' && !(course.pricing.regularPrice > 0)) {
    throw new AppError('Paid course pricing is invalid', 422, 'PUBLISH_VALIDATION');
  }
  const effectiveType = course.effectiveCourseType?.() || course.courseType;
  if (effectiveType === 'FREE' && course.pricing?.type !== 'free') {
    throw new AppError('FREE courses must use free pricing', 422, 'PUBLISH_VALIDATION');
  }
  if (
    effectiveType === 'PRE_RECORDED' &&
    !(course.pricing?.type === 'paid' && course.pricing.regularPrice > 0)
  ) {
    throw new AppError(
      'PRE_RECORDED courses require paid pricing with regularPrice > 0',
      422,
      'PUBLISH_VALIDATION'
    );
  }

  const lessonCount = await CourseLesson.countDocuments({
    courseId: course._id,
    deletedAt: null,
    status: { $ne: 'archived' },
  });
  if (lessonCount < 1 && !env.ALLOW_PUBLISH_WITHOUT_LESSONS) {
    throw new AppError(
      'Curriculum must contain at least one lesson before publishing',
      422,
      'PUBLISH_VALIDATION'
    );
  }
}

export async function changeCourseStatus(req, id, status) {
  const course = await getCourseOrThrow(id);
  await assertCanManageCourse(req, course, { forPublish: status === COURSE_STATUS.PUBLISHED });

  if (status === COURSE_STATUS.PUBLISHED) {
    await assertPublishReady(course);
    course.status = COURSE_STATUS.PUBLISHED;
    course.publishedAt = course.publishedAt || new Date();
    course.archivedAt = null;
  } else if (status === COURSE_STATUS.DRAFT) {
    course.status = COURSE_STATUS.DRAFT;
  } else if (status === COURSE_STATUS.ARCHIVED) {
    course.status = COURSE_STATUS.ARCHIVED;
    course.archivedAt = new Date();
  }

  course.updatedBy = req.user._id;
  await course.save();
  await invalidateCourseCaches({ slug: course.slug, courseId: course._id.toString() });
  try {
    const { invalidateSeoCaches } = await import('../../seo/services/seoCache.service.js');
    await invalidateSeoCaches();
  } catch {
    // optional
  }
  return course.toAdminObject();
}

export async function duplicateCourse(req, id) {
  const source = await getCourseOrThrow(id);
  assertCanReadCourse(req, source);
  if (!isPlatformAdmin(req.role)) {
    throw new AppError('Only admins can duplicate courses', 403, 'FORBIDDEN');
  }

  const useTransaction = process.env.NODE_ENV !== 'test';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const slug = await ensureUniqueCourseSlug(`${source.slug}-copy`);
    const coursePayload = {
      title: `${source.title} (Copy)`,
      slug,
      shortDescription: source.shortDescription,
      description: source.description,
      thumbnail: source.thumbnail,
      gallery: source.gallery,
      categoryIds: source.categoryIds,
      instructorIds: source.instructorIds,
      level: source.level,
      language: source.language,
      courseType: source.courseType || source.effectiveCourseType?.() || null,
      liveSession: source.liveSession?.toObject?.() || source.liveSession || {},
      durationValue: source.durationValue,
      durationUnit: source.durationUnit,
      status: COURSE_STATUS.DRAFT,
      isFeatured: false,
      sortOrder: source.sortOrder,
      learningObjectives: source.learningObjectives,
      requirements: source.requirements,
      targetAudience: source.targetAudience,
      faqs: source.faqs,
      tags: source.tags,
      certificate: source.certificate,
      enrollment: {
        limitEnabled: source.enrollment?.limitEnabled,
        maximumStudents: source.enrollment?.maximumStudents,
        currentStudents: 0,
      },
      expiry: source.expiry,
      seo: source.seo,
      pricing: source.pricing,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      publishedAt: null,
      archivedAt: null,
      deletedAt: null,
      legacy: { sourcePlatform: 'native' },
    };

    const created = session
      ? (await Course.create([coursePayload], { session }))[0]
      : await Course.create(coursePayload);

    const topicsQuery = CourseTopic.find({ courseId: source._id, deletedAt: null });
    if (session) topicsQuery.session(session);
    const topics = await topicsQuery;

    const topicIdMap = new Map();
    for (const topic of topics) {
      const topicPayload = {
        courseId: created._id,
        title: topic.title,
        description: topic.description,
        sortOrder: topic.sortOrder,
        availabilityType: topic.availabilityType,
        availableAt: topic.availableAt,
        status: topic.status,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      };
      const newTopic = session
        ? (await CourseTopic.create([topicPayload], { session }))[0]
        : await CourseTopic.create(topicPayload);
      topicIdMap.set(topic._id.toString(), newTopic._id);
    }

    const lessonsQuery = CourseLesson.find({ courseId: source._id, deletedAt: null });
    if (session) lessonsQuery.session(session);
    const lessons = await lessonsQuery;

    const lessonIdMap = new Map();
    for (const lesson of lessons) {
      const newTopicId = topicIdMap.get(lesson.topicId.toString());
      if (!newTopicId) continue;
      const lessonPayload = {
        courseId: created._id,
        topicId: newTopicId,
        title: lesson.title,
        slug: lesson.slug,
        description: lesson.description,
        type: lesson.type,
        content: lesson.content,
        durationSeconds: lesson.durationSeconds,
        isPreview: lesson.isPreview,
        isRequired: lesson.isRequired,
        sortOrder: lesson.sortOrder,
        scheduledAt: lesson.scheduledAt,
        status: lesson.status === 'published' ? 'draft' : lesson.status,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      };
      const newLesson = session
        ? (await CourseLesson.create([lessonPayload], { session }))[0]
        : await CourseLesson.create(lessonPayload);
      lessonIdMap.set(lesson._id.toString(), newLesson._id);
    }

    const resourcesQuery = CourseResource.find({ courseId: source._id, deletedAt: null });
    if (session) resourcesQuery.session(session);
    const resources = await resourcesQuery;

    for (const resource of resources) {
      const resourcePayload = {
        courseId: created._id,
        topicId: resource.topicId
          ? topicIdMap.get(resource.topicId.toString()) || null
          : null,
        lessonId: resource.lessonId
          ? lessonIdMap.get(resource.lessonId.toString()) || null
          : null,
        title: resource.title,
        description: resource.description,
        resourceType: resource.resourceType,
        storageProvider: resource.storageProvider,
        storageKey: resource.storageKey,
        originalFileName: resource.originalFileName,
        mimeType: resource.mimeType,
        sizeBytes: resource.sizeBytes,
        externalUrl: resource.externalUrl,
        sortOrder: resource.sortOrder,
        status: resource.status,
        createdBy: req.user._id,
      };
      if (session) {
        await CourseResource.create([resourcePayload], { session });
      } else {
        await CourseResource.create(resourcePayload);
      }
    }

    if (session) await session.commitTransaction();
    return created.toAdminObject();
  } catch (err) {
    if (session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

export async function getCoursePreview(req, id) {
  return getCourseById(req, id);
}

export async function listCourseStudents(req, id) {
  const course = await getCourseOrThrow(id);
  assertCanReadCourse(req, course);

  const enrollments = await CourseEnrollment.find({
    courseId: course._id,
    deletedAt: null,
  })
    .populate('studentId', 'firstName lastName email status')
    .sort({ enrolledAt: -1 })
    .lean();

  return enrollments.map((row) => ({
    id: row._id.toString(),
    status: row.status,
    progressPercentage: row.progressPercentage,
    enrolledAt: row.enrolledAt,
    completedAt: row.completedAt,
    student: row.studentId
      ? {
          id: row.studentId._id.toString(),
          firstName: row.studentId.firstName,
          lastName: row.studentId.lastName,
          email: row.studentId.email,
          status: row.studentId.status,
        }
      : null,
  }));
}

export async function replaceCourseInstructors(req, courseId, instructorIds) {
  const course = await getCourseOrThrow(courseId);
  if (!isPlatformAdmin(req.role)) {
    throw new AppError('Only admins can manage instructors', 403, 'FORBIDDEN');
  }
  course.instructorIds = await validateInstructorIds(instructorIds);
  course.updatedBy = req.user._id;
  await course.save();
  await course.populate('instructorIds', 'firstName lastName email profileImage');
  return course.toAdminObject();
}

export async function listCourseInstructors(req, courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null }).populate(
    'instructorIds',
    'firstName lastName email profileImage status'
  );
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  assertCanReadCourse(req, course);
  return (course.instructorIds || []).map((u) => ({
    id: u._id.toString(),
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    profileImage: u.profileImage,
    status: u.status,
  }));
}
