import mongoose from 'mongoose';
import { COURSE_STATUS, ROLE_SLUGS, USER_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import {
  CourseEnrollment,
  ENROLLMENT_STATUSES,
  ENROLLMENT_TYPES,
} from '../../../models/CourseEnrollment.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL, adminEnrollmentsKey, studentCoursesKey } from '../../../services/cache/keys.js';
import { invalidateEnrollmentCaches } from '../../../services/cache/invalidation.service.js';
import {
  findLearningEnrollment,
  isEnrollmentTimeExpired,
  learningEnrollmentQuery,
} from './enrollmentAccess.service.js';
import {
  findNextIncompleteLesson,
  getEnrollmentProgressDetail,
  recalculateEnrollmentProgress,
  summarizeProgress,
} from './progress.service.js';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertStudentUser(studentId) {
  const user = await User.findOne({ _id: studentId, deletedAt: null }).populate('roleId');
  if (!user) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Student account is suspended', 400, 'STUDENT_SUSPENDED');
  }
  const roleSlug = user.roleId?.slug;
  if (roleSlug && roleSlug !== ROLE_SLUGS.STUDENT && roleSlug !== ROLE_SLUGS.INSTRUCTOR) {
    // Allow enrolling users who are students; instructors can also be learners
  }
  return user;
}

async function assertCourseEnrollable(courseId, { allowUnpublished = false } = {}) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (course.status === COURSE_STATUS.ARCHIVED) {
    throw new AppError('Cannot enroll into archived course', 400, 'COURSE_ARCHIVED');
  }
  if (!allowUnpublished && course.status !== COURSE_STATUS.PUBLISHED) {
    throw new AppError('Course must be published for enrollment', 400, 'COURSE_NOT_PUBLISHED');
  }
  if (course.enrollment?.limitEnabled) {
    const activeCount = await CourseEnrollment.countDocuments({
      courseId: course._id,
      deletedAt: null,
      status: { $in: ['active', 'pending', 'completed'] },
    });
    if (activeCount >= (course.enrollment.maximumStudents || 0)) {
      throw new AppError('Course enrollment limit reached', 400, 'ENROLLMENT_LIMIT');
    }
  }
  return course;
}

function computeExpiry(course, explicitExpiresAt) {
  if (explicitExpiresAt) return new Date(explicitExpiresAt);
  if (course.expiry?.enabled && course.expiry.durationValue) {
    const msMap = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
    };
    const unit = course.expiry.durationUnit || 'days';
    const ms = (msMap[unit] || msMap.days) * course.expiry.durationValue;
    return new Date(Date.now() + ms);
  }
  return null;
}

export async function createManualEnrollment(req, input) {
  const student = await assertStudentUser(input.studentId);
  const course = await assertCourseEnrollable(input.courseId, {
    allowUnpublished: Boolean(input.allowUnpublished),
  });

  const existing = await CourseEnrollment.findOne({
    courseId: course._id,
    studentId: student._id,
    deletedAt: null,
  });

  const type = input.enrollmentType || 'admin_granted';
  if (!ENROLLMENT_TYPES.includes(type)) {
    throw new AppError('Invalid enrollment type', 400, 'INVALID_ENROLLMENT_TYPE');
  }

  if (existing) {
    if (['active', 'pending', 'completed'].includes(existing.status)) {
      if (!isEnrollmentTimeExpired(existing)) {
        throw new AppError(
          'Student already has an active enrollment for this course',
          409,
          'DUPLICATE_ACTIVE_ENROLLMENT'
        );
      }
    }
    // Re-activate revoked/expired/cancelled/suspended — preserve history
    const from = existing.status;
    existing.status = input.status || 'active';
    existing.enrollmentType = type;
    existing.source = type;
    existing.enrolledAt = new Date();
    existing.enrolledBy = req.user._id;
    existing.expiresAt = computeExpiry(course, input.enrollmentExpiresAt);
    existing.revokedAt = null;
    existing.revokedBy = null;
    existing.revocationReason = null;
    existing.completedAt = null;
    existing.courseCompletionStatus = 'not_started';
    existing.progressPercentage = existing.progressPercentage || 0;
    existing.pushHistory({
      action: 'reactivated',
      fromStatus: from,
      toStatus: existing.status,
      actorId: req.user._id,
      reason: input.reason || 'Manual re-enrollment',
    });
    await existing.save();
    await recalculateEnrollmentProgress(existing._id, { actorId: req.user._id });
    await bumpCourseEnrollmentCount(course._id);
    await invalidateEnrollmentCaches({
      studentId: student._id.toString(),
      courseId: course._id.toString(),
      enrollmentId: existing._id.toString(),
    });
    const refreshed = await CourseEnrollment.findById(existing._id);
    try {
      const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
      emitAppEventAsync('enrollment.activated', {
        userId: student._id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        courseId: course._id,
        courseName: course.title,
        enrollmentId: existing._id,
      });
    } catch {
      /* ignore */
    }
    return refreshed.toSafeObject();
  }

  const enrollment = new CourseEnrollment({
    courseId: course._id,
    studentId: student._id,
    status: input.status || 'active',
    enrollmentType: type,
    source: type,
    enrolledBy: req.user._id,
    enrolledAt: new Date(),
    expiresAt: computeExpiry(course, input.enrollmentExpiresAt),
  });
  enrollment.pushHistory({
    action: 'created',
    toStatus: enrollment.status,
    actorId: req.user._id,
    reason: input.reason || 'Manual enrollment',
  });
  await enrollment.save();
  await recalculateEnrollmentProgress(enrollment._id, { actorId: req.user._id });
  await bumpCourseEnrollmentCount(course._id);
  await invalidateEnrollmentCaches({
    studentId: student._id.toString(),
    courseId: course._id.toString(),
    enrollmentId: enrollment._id.toString(),
  });
  const created = await CourseEnrollment.findById(enrollment._id);
  try {
    const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
    emitAppEventAsync('enrollment.activated', {
      userId: student._id,
      email: student.email,
      firstName: student.firstName,
      lastName: student.lastName,
      courseId: course._id,
      courseName: course.title,
      enrollmentId: enrollment._id,
    });
  } catch {
    /* ignore */
  }
  return created.toSafeObject();
}

/**
 * Student self-enrollment for FREE courses only.
 * No payment involved — creates an active enrollment directly.
 * PRE_RECORDED courses must go through checkout; LIVE_SESSION through applications.
 */
export async function enrollFreeCourse(req, courseId) {
  const student = await assertStudentUser(req.user._id);
  const course = await assertCourseEnrollable(courseId);

  const effectiveType =
    course.effectiveCourseType?.() ||
    course.courseType ||
    (course.pricing?.type === 'free' ? 'FREE' : 'PRE_RECORDED');

  if (effectiveType === 'LIVE_SESSION') {
    throw new AppError(
      'Live session courses require an application — use the application form',
      400,
      'LIVE_COURSE_APPLICATION_REQUIRED'
    );
  }
  if (effectiveType !== 'FREE') {
    throw new AppError(
      'This course requires payment — please use checkout',
      400,
      'PAYMENT_REQUIRED'
    );
  }

  const existing = await CourseEnrollment.findOne({
    courseId: course._id,
    studentId: student._id,
    deletedAt: null,
  });

  if (existing) {
    if (['active', 'pending', 'completed'].includes(existing.status)) {
      if (!isEnrollmentTimeExpired(existing)) {
        throw new AppError('Already enrolled in this course', 409, 'ALREADY_ENROLLED');
      }
    }
    if (['revoked', 'suspended', 'cancelled'].includes(existing.status)) {
      throw new AppError(
        'Enrollment was revoked — please contact support',
        403,
        'ENROLLMENT_REVOKED'
      );
    }
    // Expired enrollment → reactivate (unique index allows only one doc)
    const from = existing.status;
    existing.status = 'active';
    existing.enrollmentType = 'free';
    existing.source = 'free';
    existing.enrolledAt = new Date();
    existing.enrolledBy = req.user._id;
    existing.expiresAt = computeExpiry(course, null);
    existing.revokedAt = null;
    existing.revokedBy = null;
    existing.revocationReason = null;
    existing.completedAt = null;
    existing.courseCompletionStatus = 'not_started';
    existing.pushHistory({
      action: 'reactivated',
      fromStatus: from,
      toStatus: 'active',
      actorId: req.user._id,
      reason: 'Self re-enrollment (free course)',
    });
    await existing.save();
    await recalculateEnrollmentProgress(existing._id, { actorId: req.user._id });
    await bumpCourseEnrollmentCount(course._id);
    await invalidateEnrollmentCaches({
      studentId: student._id.toString(),
      courseId: course._id.toString(),
      enrollmentId: existing._id.toString(),
    });
    const refreshed = await CourseEnrollment.findById(existing._id);
    emitEnrollmentEvent(student, course, refreshed._id);
    return refreshed.toSafeObject();
  }

  const enrollment = new CourseEnrollment({
    courseId: course._id,
    studentId: student._id,
    status: 'active',
    enrollmentType: 'free',
    source: 'free',
    enrolledBy: req.user._id,
    enrolledAt: new Date(),
    expiresAt: computeExpiry(course, null),
  });
  enrollment.pushHistory({
    action: 'created',
    toStatus: 'active',
    actorId: req.user._id,
    reason: 'Self-enrollment (free course)',
  });
  await enrollment.save();
  await recalculateEnrollmentProgress(enrollment._id, { actorId: req.user._id });
  await bumpCourseEnrollmentCount(course._id);
  await invalidateEnrollmentCaches({
    studentId: student._id.toString(),
    courseId: course._id.toString(),
    enrollmentId: enrollment._id.toString(),
  });
  const created = await CourseEnrollment.findById(enrollment._id);
  emitEnrollmentEvent(student, course, enrollment._id);
  return created.toSafeObject();
}

function emitEnrollmentEvent(student, course, enrollmentId) {
  setImmediate(async () => {
    try {
      const { emitAppEventAsync } = await import(
        '../../../services/events/eventBus.service.js'
      );
      emitAppEventAsync('enrollment.activated', {
        userId: student._id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        courseId: course._id,
        courseName: course.title,
        enrollmentId,
      });
    } catch {
      /* ignore */
    }
  });
}

async function bumpCourseEnrollmentCount(courseId) {
  const count = await CourseEnrollment.countDocuments({
    courseId,
    deletedAt: null,
    status: { $in: ['active', 'completed', 'pending'] },
  });
  await Course.updateOne(
    { _id: courseId },
    { $set: { 'enrollment.currentStudents': count } }
  );
}

export async function listAdminEnrollments(query) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const filter = { deletedAt: null };
  if (query.courseId) filter.courseId = query.courseId;
  if (query.studentId) filter.studentId = query.studentId;
  if (query.status) filter.status = query.status;
  if (query.enrollmentType) {
    filter.$or = [{ enrollmentType: query.enrollmentType }, { source: query.enrollmentType }];
  }
  if (query.enrolledFrom || query.enrolledTo) {
    filter.enrolledAt = {};
    if (query.enrolledFrom) filter.enrolledAt.$gte = new Date(query.enrolledFrom);
    if (query.enrolledTo) filter.enrolledAt.$lte = new Date(query.enrolledTo);
  }
  if (query.expiresFrom || query.expiresTo) {
    filter.expiresAt = {};
    if (query.expiresFrom) filter.expiresAt.$gte = new Date(query.expiresFrom);
    if (query.expiresTo) filter.expiresAt.$lte = new Date(query.expiresTo);
  }
  if (query.progressMin !== undefined || query.progressMax !== undefined) {
    filter.progressPercentage = {};
    if (query.progressMin !== undefined) filter.progressPercentage.$gte = Number(query.progressMin);
    if (query.progressMax !== undefined) filter.progressPercentage.$lte = Number(query.progressMax);
  }
  if (query.courseCompletionStatus) {
    filter.courseCompletionStatus = query.courseCompletionStatus;
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    const users = await User.find({
      deletedAt: null,
      $or: [{ email: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.studentId = { $in: users.map((u) => u._id) };
  }

  const sortField = query.sortBy || 'enrolledAt';
  const sortDir = query.sortOrder === 'asc' ? 1 : -1;

  const load = async () => {
    const [rows, total] = await Promise.all([
      CourseEnrollment.find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .populate('studentId', 'firstName lastName email')
        .populate('courseId', 'title slug status')
        .lean(),
      CourseEnrollment.countDocuments(filter),
    ]);

    return {
      enrollments: rows.map(serializeEnrollmentLean),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  };

  // Search results are user-specific / volatile — skip Redis
  if (query.search) return load();
  return getOrSetCache(adminEnrollmentsKey(query), CACHE_TTL.DASHBOARD, load);
}

function serializeEnrollmentLean(row) {
  const student = row.studentId;
  const course = row.courseId;
  return {
    id: row._id.toString(),
    courseId: course?._id?.toString?.() || course?.toString?.() || String(row.courseId),
    studentId: student?._id?.toString?.() || student?.toString?.() || String(row.studentId),
    student: student?._id
      ? {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
        }
      : null,
    course: course?._id
      ? {
          id: course._id.toString(),
          title: course.title,
          slug: course.slug,
          status: course.status,
        }
      : null,
    enrollmentStatus: row.status,
    status: row.status,
    enrollmentType: row.enrollmentType || row.source,
    progressPercentage: row.progressPercentage,
    completedLessonsCount: row.completedLessonsCount,
    totalRequiredLessons: row.totalRequiredLessons,
    courseCompletionStatus: row.courseCompletionStatus,
    enrolledAt: row.enrolledAt,
    enrollmentExpiresAt: row.expiresAt,
    expiresAt: row.expiresAt,
    completedAt: row.completedAt,
    lastAccessedAt: row.lastAccessedAt,
    revokedAt: row.revokedAt,
    revocationReason: row.revocationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getEnrollmentById(id) {
  const row = await CourseEnrollment.findOne({ _id: id, deletedAt: null })
    .populate('studentId', 'firstName lastName email')
    .populate('courseId', 'title slug status')
    .populate('enrolledBy', 'firstName lastName email')
    .populate('revokedBy', 'firstName lastName email');
  if (!row) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');
  return {
    ...row.toSafeObject(),
    student: row.studentId
      ? {
          id: row.studentId._id.toString(),
          firstName: row.studentId.firstName,
          lastName: row.studentId.lastName,
          email: row.studentId.email,
        }
      : null,
    course: row.courseId
      ? {
          id: row.courseId._id.toString(),
          title: row.courseId.title,
          slug: row.courseId.slug,
          status: row.courseId.status,
        }
      : null,
  };
}

export async function updateEnrollment(req, id, input) {
  const enrollment = await CourseEnrollment.findOne({ _id: id, deletedAt: null });
  if (!enrollment) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');

  const from = enrollment.status;
  if (input.enrollmentExpiresAt !== undefined) {
    enrollment.expiresAt = input.enrollmentExpiresAt
      ? new Date(input.enrollmentExpiresAt)
      : null;
  }
  if (input.enrollmentType) {
    enrollment.enrollmentType = input.enrollmentType;
    enrollment.source = input.enrollmentType;
  }
  if (input.status && ENROLLMENT_STATUSES.includes(input.status)) {
    enrollment.status = input.status;
    if (input.status === 'revoked' || input.status === 'cancelled') {
      enrollment.revokedAt = new Date();
      enrollment.revokedBy = req.user._id;
      enrollment.revocationReason = input.revocationReason || input.reason || null;
    }
  }

  enrollment.pushHistory({
    action: input.status && input.status !== from ? 'status_changed' : 'updated',
    fromStatus: from,
    toStatus: enrollment.status,
    actorId: req.user._id,
    reason: input.reason || null,
  });
  await enrollment.save();
  await invalidateEnrollmentCaches({
    studentId: enrollment.studentId.toString(),
    courseId: enrollment.courseId.toString(),
    enrollmentId: enrollment._id.toString(),
  });
  return enrollment.toSafeObject();
}

export async function updateEnrollmentStatus(req, id, status, reason) {
  return updateEnrollment(req, id, { status, reason, revocationReason: reason });
}

export async function revokeEnrollment(req, id, reason) {
  const enrollment = await CourseEnrollment.findOne({ _id: id, deletedAt: null });
  if (!enrollment) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');
  if (enrollment.status === 'revoked') {
    return enrollment.toSafeObject();
  }
  const from = enrollment.status;
  enrollment.status = 'revoked';
  enrollment.revokedAt = new Date();
  enrollment.revokedBy = req.user._id;
  enrollment.revocationReason = reason || 'Revoked by administrator';
  enrollment.pushHistory({
    action: 'revoked',
    fromStatus: from,
    toStatus: 'revoked',
    actorId: req.user._id,
    reason: enrollment.revocationReason,
  });
  await enrollment.save();
  await bumpCourseEnrollmentCount(enrollment.courseId);
  await invalidateEnrollmentCaches({
    studentId: enrollment.studentId.toString(),
    courseId: enrollment.courseId.toString(),
    enrollmentId: enrollment._id.toString(),
  });
  return enrollment.toSafeObject();
}

export async function getEnrollmentHistory(id) {
  const enrollment = await CourseEnrollment.findOne({ _id: id, deletedAt: null })
    .select('history studentId courseId status')
    .lean();
  if (!enrollment) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');
  return {
    enrollmentId: enrollment._id.toString(),
    history: (enrollment.history || []).map((h) => ({
      id: h._id?.toString?.(),
      action: h.action,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      actorId: h.actorId?.toString?.() || null,
      meta: h.meta,
      at: h.at,
    })),
  };
}

export async function listCourseEnrollments(courseId, query) {
  return listAdminEnrollments({ ...query, courseId });
}

export async function listStudentEnrollmentsAdmin(studentId, query) {
  return listAdminEnrollments({ ...query, studentId });
}

export async function getAdminEnrollmentProgress(id) {
  const enrollment = await CourseEnrollment.findOne({ _id: id, deletedAt: null });
  if (!enrollment) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');
  return getEnrollmentProgressDetail(enrollment);
}

/** Mark expired enrollments (optional job) — access still denied via expiresAt check without this. */
export async function syncExpiredEnrollments(limit = 200) {
  const now = new Date();
  const rows = await CourseEnrollment.find({
    deletedAt: null,
    status: { $in: ['active', 'pending', 'completed'] },
    expiresAt: { $ne: null, $lte: now },
  }).limit(limit);

  let updated = 0;
  for (const row of rows) {
    const from = row.status;
    row.status = 'expired';
    row.pushHistory({
      action: 'expired',
      fromStatus: from,
      toStatus: 'expired',
      reason: 'Scheduled expiration sync',
    });
    await row.save();
    await invalidateEnrollmentCaches({
      studentId: row.studentId.toString(),
      courseId: row.courseId.toString(),
      enrollmentId: row._id.toString(),
    });
    updated += 1;
  }
  return { updated };
}

export async function listMyCourses(req, query) {
  const studentId = req.user._id.toString();
  const filterKey = query.filter || 'all';
  const cacheKey = studentCoursesKey(studentId, filterKey);

  return getOrSetCache(cacheKey, CACHE_TTL.DASHBOARD, async () => {
    const now = new Date();
    const filter = { studentId: req.user._id, deletedAt: null };

    if (filterKey === 'in_progress') {
      filter.status = { $in: ['active'] };
      filter.progressPercentage = { $gt: 0, $lt: 100 };
      filter.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
    } else if (filterKey === 'completed') {
      filter.$or = [{ status: 'completed' }, { courseCompletionStatus: 'completed' }];
    } else if (filterKey === 'pending' || filterKey === 'not_started') {
      filter.status = 'active';
      filter.progressPercentage = 0;
      filter.courseCompletionStatus = { $in: ['not_started'] };
      filter.$and = [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }];
    } else if (filterKey === 'expired') {
      filter.$or = [
        { status: 'expired' },
        { expiresAt: { $ne: null, $lte: now }, status: { $in: ['active', 'completed'] } },
      ];
    } else if (filterKey === 'active') {
      filter.status = { $in: ['active', 'completed'] };
      filter.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
    }

    const rows = await CourseEnrollment.find(filter)
      .sort({ lastAccessedAt: -1, enrolledAt: -1 })
      .populate('courseId', 'title slug thumbnail status pricing level')
      .lean();

    const courses = [];
    for (const row of rows) {
      const course = row.courseId;
      if (!course) continue;
      const expired =
        row.status === 'expired' || (row.expiresAt && new Date(row.expiresAt) <= now);
      const next =
        !expired && ['active', 'completed'].includes(row.status)
          ? await findNextIncompleteLesson(row)
          : null;
      courses.push({
        enrollmentId: row._id.toString(),
        enrollmentStatus: expired && row.status !== 'expired' ? 'expired' : row.status,
        enrollmentType: row.enrollmentType || row.source,
        enrolledAt: row.enrolledAt,
        enrollmentExpiresAt: row.expiresAt,
        progressPercentage: row.progressPercentage,
        completedLessonsCount: row.completedLessonsCount,
        totalRequiredLessons: row.totalRequiredLessons,
        courseCompletionStatus: row.courseCompletionStatus,
        lastAccessedAt: row.lastAccessedAt,
        completedAt: row.completedAt,
        nextIncompleteLesson: next,
        course: {
          id: course._id.toString(),
          title: course.title,
          slug: course.slug,
          thumbnail: course.thumbnail,
          status: course.status,
          pricing: course.pricing,
          level: course.level,
        },
      });
    }
    return { courses };
  });
}

export async function getMyCourseProgress(req, courseId) {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError('Invalid course id', 400, 'INVALID_ID');
  }
  const enrollment = await findLearningEnrollment(req.user._id, courseId);
  if (!enrollment) {
    // Still allow viewing snapshot if enrolled but expired/revoked? Spec: only own data — return 403 if no learning access
    const any = await CourseEnrollment.findOne({
      courseId,
      studentId: req.user._id,
      deletedAt: null,
    });
    if (!any) throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');
    // Return read-only snapshot without granting access
    return {
      ...(await getEnrollmentProgressDetail(any)),
      accessGranted: false,
    };
  }
  return {
    ...(await getEnrollmentProgressDetail(enrollment)),
    accessGranted: true,
  };
}

export { learningEnrollmentQuery, summarizeProgress };
