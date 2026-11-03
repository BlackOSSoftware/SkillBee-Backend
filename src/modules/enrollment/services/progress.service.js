import mongoose from 'mongoose';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { LessonProgress } from '../../../models/LessonProgress.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { Assignment } from '../../../models/Assignment.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { ASSIGNMENT_STATUS } from '../../../config/security.js';
import { AppError } from '../../../utils/AppError.js';
import { assertLessonCompletionAllowed } from './completionRules.service.js';
import { assertStudentCanAccessLesson } from './enrollmentAccess.service.js';
import { invalidateEnrollmentCaches } from '../../../services/cache/invalidation.service.js';

/**
 * Required lessons for progress: published, not deleted, isRequired=true.
 * Optional lessons never count toward progressPercentage.
 *
 * Zero required lessons: progress stays 0 and course is NOT auto-completed
 * (requirements_pending / not_started depending on assessments).
 */
export async function listRequiredLessons(courseId) {
  return CourseLesson.find({
    courseId,
    deletedAt: null,
    status: 'published',
    isRequired: true,
  })
    .select('_id type title sortOrder topicId isRequired')
    .sort({ sortOrder: 1 })
    .lean();
}

export async function recalculateEnrollmentProgress(enrollmentId, { actorId = null } = {}) {
  const enrollment = await CourseEnrollment.findOne({ _id: enrollmentId, deletedAt: null });
  if (!enrollment) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');

  const required = await listRequiredLessons(enrollment.courseId);
  const requiredIds = required.map((l) => l._id);
  const totalRequired = requiredIds.length;

  let completedRequired = 0;
  if (totalRequired > 0) {
    completedRequired = await LessonProgress.countDocuments({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      lessonId: { $in: requiredIds },
      completionStatus: 'completed',
      revokedAt: null,
    });
  }

  const progressPercentage =
    totalRequired === 0 ? 0 : Math.min(100, Math.round((completedRequired / totalRequired) * 100));

  // Course-level assessment requirements (linked at course scope, not lesson)
  const quizOk = await evaluateCourseQuizRequirements(enrollment);
  const assignmentOk = await evaluateCourseAssignmentRequirements(enrollment);

  const lessonsOk = totalRequired === 0 ? false : completedRequired >= totalRequired;
  // Zero required lessons: do not auto-complete — stay not_started / requirements_pending
  let courseCompletionStatus = 'not_started';
  if (completedRequired > 0 || enrollment.lastAccessedAt) {
    courseCompletionStatus = 'in_progress';
  }
  if (totalRequired > 0 && completedRequired > 0 && completedRequired < totalRequired) {
    courseCompletionStatus = 'in_progress';
  }
  if (totalRequired > 0 && lessonsOk && (!quizOk || !assignmentOk)) {
    courseCompletionStatus = 'requirements_pending';
  }
  if (totalRequired > 0 && lessonsOk && quizOk && assignmentOk) {
    courseCompletionStatus = 'completed';
  }
  if (totalRequired === 0 && quizOk && assignmentOk) {
    // Only assessments, no lessons — still require explicit assessment pass; if none configured, stay not_started
    const hasAssessments = await courseHasCompletionAssessments(enrollment.courseId);
    courseCompletionStatus = hasAssessments ? 'completed' : 'not_started';
  }

  enrollment.completedLessonsCount = completedRequired;
  enrollment.totalRequiredLessons = totalRequired;
  enrollment.progressPercentage = progressPercentage;
  enrollment.courseCompletionStatus = courseCompletionStatus;
  enrollment.completionEvaluationAt = new Date();

  const prevStatus = enrollment.status;
  if (courseCompletionStatus === 'completed') {
    enrollment.status = 'completed';
    enrollment.completedAt = enrollment.completedAt || new Date();
  } else if (enrollment.status === 'completed' && courseCompletionStatus !== 'completed') {
    // Curriculum grew — reopen learning access
    enrollment.status = 'active';
    enrollment.completedAt = null;
  }

  if (prevStatus !== enrollment.status) {
    enrollment.pushHistory({
      action: 'status_changed',
      fromStatus: prevStatus,
      toStatus: enrollment.status,
      actorId,
      reason: 'Progress recalculation',
      meta: { progressPercentage, completedRequired, totalRequired, courseCompletionStatus },
    });
  } else {
    enrollment.pushHistory({
      action: 'progress_recalculated',
      actorId,
      meta: { progressPercentage, completedRequired, totalRequired, courseCompletionStatus },
    });
  }

  await enrollment.save();
  await invalidateEnrollmentCaches({
    studentId: enrollment.studentId.toString(),
    courseId: enrollment.courseId.toString(),
    enrollmentId: enrollment._id.toString(),
  });

  // Phase 8: async auto-issue when course completes (does not block progress response)
  if (courseCompletionStatus === 'completed') {
    try {
      const { scheduleAutomaticIssuance } = await import(
        '../../certificates/services/certificate.service.js'
      );
      scheduleAutomaticIssuance({
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        actorId,
      });
    } catch {
      /* certificate module optional at runtime */
    }
  }

  return summarizeProgress(enrollment);
}

async function courseHasCompletionAssessments(courseId) {
  const [q, a] = await Promise.all([
    Quiz.exists({
      courseId,
      deletedAt: null,
      status: 'published',
      lessonId: null,
      // course-level quizzes without lesson — treated as optional unless we add a flag; skip auto-require
    }),
    Assignment.exists({
      courseId,
      deletedAt: null,
      status: { $in: [ASSIGNMENT_STATUS.PUBLISHED, ASSIGNMENT_STATUS.CLOSED] },
      lessonId: null,
    }),
  ]);
  // Without an explicit "required for course completion" flag, course-level assessments are NOT required.
  void q;
  void a;
  return false;
}

async function evaluateCourseQuizRequirements(enrollment) {
  // Lesson-linked quizzes are enforced at lesson completion time.
  // Course completion currently requires all required lessons (which gate linked quizzes).
  void enrollment;
  return true;
}

async function evaluateCourseAssignmentRequirements(enrollment) {
  void enrollment;
  return true;
}

export function summarizeProgress(enrollment) {
  return {
    enrollmentId: enrollment._id.toString(),
    courseId: enrollment.courseId.toString(),
    studentId: enrollment.studentId.toString(),
    enrollmentStatus: enrollment.status,
    progressPercentage: enrollment.progressPercentage,
    completedLessonsCount: enrollment.completedLessonsCount,
    totalRequiredLessons: enrollment.totalRequiredLessons,
    courseCompletionStatus: enrollment.courseCompletionStatus,
    completionEvaluationAt: enrollment.completionEvaluationAt,
    completedAt: enrollment.completedAt,
    lastAccessedAt: enrollment.lastAccessedAt,
  };
}

export async function completeLesson(req, lessonId, body = {}) {
  const { lesson, course, enrollment, isStaff } = await assertStudentCanAccessLesson(req, lessonId);

  if (isStaff && !enrollment) {
    throw new AppError(
      'Staff cannot record student lesson completion without enrollment context',
      400,
      'STAFF_COMPLETION_UNSUPPORTED'
    );
  }

  const { completionSource } = await assertLessonCompletionAllowed({
    lesson,
    studentId: req.user._id,
    clientPayload: body,
  });

  const now = new Date();
  const filter = {
    studentId: req.user._id,
    enrollmentId: enrollment._id,
    lessonId: lesson._id,
  };

  const existing = await LessonProgress.findOne(filter);
  if (existing?.completionStatus === 'completed' && !existing.revokedAt) {
    const progress = await recalculateEnrollmentProgress(enrollment._id, {
      actorId: req.user._id,
    });
    return {
      alreadyCompleted: true,
      lessonProgress: existing.toSafeObject(),
      progress,
      course: { id: course._id.toString(), title: course.title },
    };
  }

  const watchInfo =
    typeof body.watchDurationSeconds === 'number' && body.watchDurationSeconds >= 0
      ? Math.floor(body.watchDurationSeconds)
      : 0;

  const doc =
    existing ||
    new LessonProgress({
      ...filter,
      courseId: course._id,
      completionStatus: 'not_started',
    });

  if (!doc.startedAt) doc.startedAt = now;
  doc.completionStatus = 'completed';
  doc.completedAt = doc.completedAt || now;
  doc.lastAccessedAt = now;
  doc.completionSource = completionSource;
  doc.revokedAt = null;
  doc.revokedBy = null;
  doc.revokeReason = null;
  if (watchInfo > 0) doc.watchDurationSeconds = watchInfo;

  await doc.save();

  const progress = await recalculateEnrollmentProgress(enrollment._id, {
    actorId: req.user._id,
  });

  return {
    alreadyCompleted: false,
    lessonProgress: doc.toSafeObject(),
    progress,
    course: { id: course._id.toString(), title: course.title },
  };
}

export async function getEnrollmentProgressDetail(enrollment) {
  const required = await listRequiredLessons(enrollment.courseId);
  const progressRows = await LessonProgress.find({
    enrollmentId: enrollment._id,
    revokedAt: null,
  })
    .select('lessonId completionStatus completedAt lastAccessedAt')
    .lean();

  const byLesson = new Map(progressRows.map((p) => [p.lessonId.toString(), p]));
  const lessons = required.map((l) => {
    const p = byLesson.get(l._id.toString());
    return {
      lessonId: l._id.toString(),
      title: l.title,
      type: l.type,
      isRequired: true,
      completionStatus: p?.completionStatus || 'not_started',
      completedAt: p?.completedAt || null,
    };
  });

  const next = lessons.find((l) => l.completionStatus !== 'completed') || null;

  return {
    ...summarizeProgress(enrollment),
    lessons,
    nextIncompleteLesson: next,
  };
}

export async function findNextIncompleteLesson(enrollment) {
  const required = await listRequiredLessons(enrollment.courseId);
  if (!required.length) return null;
  const completed = await LessonProgress.find({
    enrollmentId: enrollment._id,
    lessonId: { $in: required.map((l) => l._id) },
    completionStatus: 'completed',
    revokedAt: null,
  })
    .select('lessonId')
    .lean();
  const done = new Set(completed.map((c) => c.lessonId.toString()));
  const next = required.find((l) => !done.has(l._id.toString()));
  if (!next) return null;
  return {
    lessonId: next._id.toString(),
    title: next.title,
    type: next.type,
  };
}

/** Admin: revoke a lesson completion (does not delete history row — marks revoked) */
export async function revokeLessonCompletion(req, progressId, reason) {
  const row = await LessonProgress.findById(progressId);
  if (!row) throw new AppError('Lesson progress not found', 404, 'PROGRESS_NOT_FOUND');
  row.completionStatus = 'in_progress';
  row.completedAt = null;
  row.revokedAt = new Date();
  row.revokedBy = req.user._id;
  row.revokeReason = reason || 'Admin revoked completion';
  await row.save();
  const progress = await recalculateEnrollmentProgress(row.enrollmentId, {
    actorId: req.user._id,
  });
  return { lessonProgress: row.toSafeObject(), progress };
}

export async function touchLessonAccess(studentId, enrollmentId, lessonId, courseId) {
  const now = new Date();
  await LessonProgress.findOneAndUpdate(
    { studentId, enrollmentId, lessonId },
    {
      $set: { lastAccessedAt: now },
      $setOnInsert: {
        courseId,
        completionStatus: 'in_progress',
        startedAt: now,
        completionSource: 'system',
      },
    },
    { upsert: true }
  );
}
