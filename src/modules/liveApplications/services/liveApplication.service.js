import { COURSE_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { LiveCourseApplication } from '../../../models/LiveCourseApplication.js';
import { OrderCounter } from '../../../models/OrderCounter.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { recalculateEnrollmentProgress } from '../../enrollment/services/progress.service.js';
import { invalidateEnrollmentCaches } from '../../../services/cache/invalidation.service.js';

const ADMIN_REVIEWABLE_STATUSES = new Set([
  'PENDING',
  'UNDER_REVIEW',
  'CONTACTED',
  'APPROVED',
  'REJECTED',
]);

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function allocateApplicationReference(now = new Date()) {
  const year = now.getUTCFullYear();
  const key = `LCA:${year}`;
  const counter = await OrderCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `LCA-${year}-${String(counter.seq).padStart(6, '0')}`;
}

async function assertLiveCourse(courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  const effectiveType =
    course.effectiveCourseType?.() ||
    course.courseType ||
    (course.pricing?.type === 'free' ? 'FREE' : 'PRE_RECORDED');
  if (effectiveType !== 'LIVE_SESSION') {
    throw new AppError(
      'Applications are only accepted for live session courses',
      400,
      'NOT_A_LIVE_COURSE'
    );
  }
  if (course.status !== COURSE_STATUS.PUBLISHED) {
    throw new AppError('Course is not open for applications', 400, 'COURSE_NOT_PUBLISHED');
  }
  return course;
}

/**
 * Submit a live-course application. Works for authenticated students
 * (student ref attached) and public applicants (student = null).
 * Duplicate (email + course) submissions are rejected.
 */
export async function submitApplication(req, input) {
  const course = await assertLiveCourse(input.liveCourse);
  const email = String(input.email).trim().toLowerCase();

  const existing = await LiveCourseApplication.findOne({
    email,
    liveCourse: course._id,
    deletedAt: null,
  });
  if (existing) {
    throw new AppError(
      `An application already exists for this course (ref: ${existing.applicationReference})`,
      409,
      'DUPLICATE_APPLICATION'
    );
  }

  const studentId = req.user?._id || null;
  const name =
    input.name?.trim() ||
    `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() ||
    '';

  const application = await LiveCourseApplication.create({
    applicationReference: await allocateApplicationReference(),
    student: studentId,
    name,
    email,
    whatsappNumber: input.whatsappNumber.trim(),
    currentCompany: input.currentCompany.trim(),
    currentCity: input.currentCity.trim(),
    courseInterested: input.courseInterested,
    liveCourse: course._id,
    referralSource: input.referralSource,
    comment: input.comment || '',
    status: 'PENDING',
  });

  return application.toSafeObject();
}

export async function listMyApplications(req) {
  const rows = await LiveCourseApplication.find({
    student: req.user._id,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('liveCourse', 'title slug')
    .lean();
  return rows.map((r) => ({
    ...r,
    id: r._id.toString(),
    liveCourse: r.liveCourse?._id
      ? { id: r.liveCourse._id.toString(), title: r.liveCourse.title, slug: r.liveCourse.slug }
      : r.liveCourse,
  }));
}

export async function listAdminApplications(query) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });

  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.liveCourse) filter.liveCourse = query.liveCourse;
  if (query.courseInterested) filter.courseInterested = query.courseInterested;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { name: rx },
      { email: rx },
      { applicationReference: rx },
      { currentCompany: rx },
      { whatsappNumber: rx },
    ];
  }

  const [rows, total] = await Promise.all([
    LiveCourseApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('liveCourse', 'title slug courseType')
      .populate('student', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .lean(),
    LiveCourseApplication.countDocuments(filter),
  ]);

  const data = rows.map((r) => ({
    ...r,
    id: r._id.toString(),
    liveCourse: r.liveCourse?._id
      ? {
          id: r.liveCourse._id.toString(),
          title: r.liveCourse.title,
          slug: r.liveCourse.slug,
          courseType: r.liveCourse.courseType,
        }
      : r.liveCourse,
    student: r.student?._id
      ? {
          id: r.student._id.toString(),
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          email: r.student.email,
        }
      : r.student,
    reviewedBy: r.reviewedBy?._id
      ? {
          id: r.reviewedBy._id.toString(),
          firstName: r.reviewedBy.firstName,
          lastName: r.reviewedBy.lastName,
          email: r.reviewedBy.email,
        }
      : r.reviewedBy,
  }));

  return { data, pagination: buildPagination({ page, limit, total }) };
}

export async function getAdminApplication(id) {
  const app = await LiveCourseApplication.findOne({ _id: id, deletedAt: null })
    .populate('liveCourse')
    .populate('student', 'firstName lastName email phone')
    .populate('reviewedBy', 'firstName lastName email')
    .populate('convertedEnrollment');
  if (!app) throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
  return app;
}

export async function updateApplicationStatus(req, id, status) {
  const app = await LiveCourseApplication.findOne({ _id: id, deletedAt: null });
  if (!app) throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
  if (!ADMIN_REVIEWABLE_STATUSES.has(status)) {
    throw new AppError(
      'Use the convert endpoint to mark an application as CONVERTED',
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
  app.status = status;
  app.reviewedBy = req.user._id;
  app.reviewedAt = new Date();
  await app.save();
  return app.toSafeObject();
}

export async function updateApplicationRemarks(req, id, adminRemarks) {
  const app = await LiveCourseApplication.findOne({ _id: id, deletedAt: null });
  if (!app) throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
  app.adminRemarks = adminRemarks;
  await app.save();
  return app.toSafeObject();
}

/**
 * Convert an APPROVED application into a pending enrollment.
 * The enrollment stays 'pending' — admin activates it (after offline
 * payment/confirmation) via the existing enrollment status endpoint.
 * Never grants learning access by itself. Idempotent.
 */
export async function convertApplication(req, id) {
  const app = await LiveCourseApplication.findOne({ _id: id, deletedAt: null });
  if (!app) throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');

  if (app.status === 'CONVERTED' && app.convertedEnrollment) {
    return { application: app.toSafeObject(), alreadyConverted: true };
  }
  if (app.status !== 'APPROVED') {
    throw new AppError(
      'Only APPROVED applications can be converted',
      400,
      'APPLICATION_NOT_APPROVED'
    );
  }
  if (!app.student) {
    throw new AppError(
      'Applicant has no linked student account — ask them to register, then link the application',
      400,
      'APPLICATION_NO_STUDENT'
    );
  }

  const course = await Course.findOne({ _id: app.liveCourse, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  let enrollment = await CourseEnrollment.findOne({
    courseId: course._id,
    studentId: app.student,
    deletedAt: null,
  });

  if (enrollment && ['active', 'completed', 'pending'].includes(enrollment.status)) {
    // Already enrolled/pending — link and mark converted without duplicating.
    app.convertedEnrollment = enrollment._id;
  } else {
    if (!enrollment) {
      enrollment = new CourseEnrollment({
        courseId: course._id,
        studentId: app.student,
        status: 'pending',
        enrollmentType: 'live_application',
        source: 'live_application',
        enrolledBy: req.user._id,
        enrolledAt: new Date(),
        expiresAt: null,
      });
      enrollment.pushHistory({
        action: 'created',
        toStatus: 'pending',
        actorId: req.user._id,
        reason: `Live application ${app.applicationReference} converted`,
        meta: { applicationId: app._id.toString() },
      });
    } else {
      const from = enrollment.status;
      enrollment.status = 'pending';
      enrollment.enrollmentType = 'live_application';
      enrollment.source = 'live_application';
      enrollment.enrolledBy = req.user._id;
      enrollment.enrolledAt = new Date();
      enrollment.revokedAt = null;
      enrollment.revokedBy = null;
      enrollment.revocationReason = null;
      enrollment.pushHistory({
        action: 'reactivated',
        fromStatus: from,
        toStatus: 'pending',
        actorId: req.user._id,
        reason: `Live application ${app.applicationReference} converted`,
        meta: { applicationId: app._id.toString() },
      });
    }
    await enrollment.save();
    try {
      await recalculateEnrollmentProgress(enrollment._id, { actorId: req.user._id });
    } catch {
      /* progress optional */
    }
    await invalidateEnrollmentCaches({
      studentId: app.student.toString(),
      courseId: course._id.toString(),
      enrollmentId: enrollment._id.toString(),
    });
    // Keep course.enrollment.currentStudents in sync (pending counts).
    const count = await CourseEnrollment.countDocuments({
      courseId: course._id,
      deletedAt: null,
      status: { $in: ['active', 'completed', 'pending'] },
    });
    await Course.updateOne(
      { _id: course._id },
      { $set: { 'enrollment.currentStudents': count } }
    );
    app.convertedEnrollment = enrollment._id;
  }

  app.status = 'CONVERTED';
  app.reviewedBy = req.user._id;
  app.reviewedAt = new Date();
  await app.save();

  return { application: app.toSafeObject(), alreadyConverted: false };
}
