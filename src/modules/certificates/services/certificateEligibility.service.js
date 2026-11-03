import { COURSE_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { Certificate } from '../../../models/Certificate.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { Assignment } from '../../../models/Assignment.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { ASSIGNMENT_STATUS } from '../../../config/security.js';
import {
  findLearningEnrollment,
  isEnrollmentTimeExpired,
} from '../../enrollment/services/enrollmentAccess.service.js';
import { listRequiredLessons } from '../../enrollment/services/progress.service.js';
import { LessonProgress } from '../../../models/LessonProgress.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * Backend eligibility engine — never trusts client completion flags.
 */
export async function checkEligibility(studentId, courseId) {
  return getEligibilityDetails(studentId, courseId);
}

export async function getCertificateEligibilityStatus(studentId, courseId) {
  const details = await getEligibilityDetails(studentId, courseId);
  return {
    eligible: details.eligible,
    reason: details.reason,
    evaluatedAt: details.evaluatedAt,
  };
}

export async function validateCompletionRequirements(studentId, courseId) {
  const details = await getEligibilityDetails(studentId, courseId);
  if (!details.eligible) {
    throw new AppError(details.reason || 'Not eligible for certificate', 400, 'NOT_ELIGIBLE', {
      missingRequirements: details.missingRequirements,
    });
  }
  return details;
}

export async function getEligibilityDetails(studentId, courseId) {
  const evaluatedAt = new Date();
  const missingRequirements = [];

  const course = await Course.findOne({ _id: courseId, deletedAt: null }).lean();
  if (!course) {
    return ineligible('Course not found', { evaluatedAt, missingRequirements: ['course'] });
  }

  if (!course.certificate?.enabled) {
    return ineligible('Course is not configured for certificate issuance', {
      evaluatedAt,
      courseId: course._id.toString(),
      missingRequirements: ['certificate.enabled'],
    });
  }

  if (course.status === COURSE_STATUS.ARCHIVED) {
    return ineligible('Course is archived', {
      evaluatedAt,
      missingRequirements: ['course.status'],
    });
  }

  const enrollment = await CourseEnrollment.findOne({
    courseId,
    studentId,
    deletedAt: null,
  });

  if (!enrollment) {
    return ineligible('No enrollment found', {
      evaluatedAt,
      missingRequirements: ['enrollment'],
    });
  }

  if (['revoked', 'cancelled', 'suspended', 'pending'].includes(enrollment.status)) {
    return ineligible(`Enrollment status is ${enrollment.status}`, {
      evaluatedAt,
      enrollmentId: enrollment._id.toString(),
      enrollmentStatus: enrollment.status,
      missingRequirements: ['enrollment.status'],
    });
  }

  if (isEnrollmentTimeExpired(enrollment, evaluatedAt) || enrollment.status === 'expired') {
    return ineligible('Enrollment has expired', {
      evaluatedAt,
      enrollmentId: enrollment._id.toString(),
      missingRequirements: ['enrollment.expiresAt'],
    });
  }

  // Prefer learning-access check (active/completed + not expired)
  const learning = await findLearningEnrollment(studentId, courseId);
  if (!learning && enrollment.status !== 'completed') {
    return ineligible('Enrollment does not grant learning access', {
      evaluatedAt,
      enrollmentId: enrollment._id.toString(),
      missingRequirements: ['enrollment.access'],
    });
  }

  const requiredLessons = await listRequiredLessons(courseId);
  const totalRequired = requiredLessons.length;
  let completedRequired = 0;
  if (totalRequired > 0) {
    completedRequired = await LessonProgress.countDocuments({
      enrollmentId: enrollment._id,
      studentId,
      lessonId: { $in: requiredLessons.map((l) => l._id) },
      completionStatus: 'completed',
      revokedAt: null,
    });
  }

  const progressPercentage =
    totalRequired === 0 ? 0 : Math.round((completedRequired / totalRequired) * 100);
  const minPct = course.certificate?.minimumCompletionPercentage ?? 80;

  if (totalRequired === 0) {
    missingRequirements.push('required_lessons (course has zero required published lessons)');
  } else if (completedRequired < totalRequired) {
    missingRequirements.push(
      `required_lessons (${completedRequired}/${totalRequired} completed)`
    );
  }

  if (progressPercentage < minPct) {
    missingRequirements.push(
      `minimumCompletionPercentage (${progressPercentage}% < ${minPct}%)`
    );
  }

  // Lesson-linked quizzes must be passed
  const linkedQuizzes = await Quiz.find({
    courseId,
    deletedAt: null,
    status: 'published',
    lessonId: { $ne: null },
  })
    .select('_id title lessonId')
    .lean();

  const failedQuizzes = [];
  for (const q of linkedQuizzes) {
    const passed = await QuizAttempt.exists({
      quizId: q._id,
      studentId,
      deletedAt: null,
      status: 'evaluated',
      passed: true,
    });
    if (!passed) {
      failedQuizzes.push(q._id.toString());
      missingRequirements.push(`quiz:${q._id.toString()}`);
    }
  }

  const linkedAssignments = await Assignment.find({
    courseId,
    deletedAt: null,
    status: { $in: [ASSIGNMENT_STATUS.PUBLISHED, ASSIGNMENT_STATUS.CLOSED] },
    lessonId: { $ne: null },
  })
    .select('_id title lessonId')
    .lean();

  const pendingAssignments = [];
  for (const a of linkedAssignments) {
    const ok = await AssignmentSubmission.exists({
      assignmentId: a._id,
      studentId,
      deletedAt: null,
      status: { $in: ['evaluated', 'returned'] },
    });
    if (!ok) {
      pendingAssignments.push(a._id.toString());
      missingRequirements.push(`assignment:${a._id.toString()}`);
    }
  }

  const courseCompletionOk =
    enrollment.courseCompletionStatus === 'completed' ||
    (totalRequired > 0 && completedRequired >= totalRequired && failedQuizzes.length === 0 && pendingAssignments.length === 0);

  if (!courseCompletionOk && !missingRequirements.length) {
    missingRequirements.push('courseCompletionStatus');
  }

  const existing = await Certificate.findOne({
    enrollmentId: enrollment._id,
    certificateStatus: 'issued',
    deletedAt: null,
  })
    .select('_id certificateNumber')
    .lean();

  if (existing) {
    return {
      eligible: false,
      reason: 'An active certificate already exists for this enrollment',
      evaluatedAt,
      courseId: course._id.toString(),
      studentId: studentId.toString(),
      enrollmentId: enrollment._id.toString(),
      courseCompletionStatus: enrollment.courseCompletionStatus,
      requiredLessonsCompleted: completedRequired,
      totalRequiredLessons: totalRequired,
      progressPercentage,
      requiredQuizzesPassed: failedQuizzes.length === 0,
      requiredAssignmentsCompleted: pendingAssignments.length === 0,
      missingRequirements: ['active_certificate_exists'],
      existingCertificateId: existing._id.toString(),
      existingCertificateNumber: existing.certificateNumber,
      completionDate: enrollment.completedAt || enrollment.completionEvaluationAt || null,
    };
  }

  const eligible = missingRequirements.length === 0 && courseCompletionOk;

  return {
    eligible,
    reason: eligible ? 'Eligible for certificate issuance' : 'Missing completion requirements',
    evaluatedAt,
    courseId: course._id.toString(),
    studentId: studentId.toString(),
    enrollmentId: enrollment._id.toString(),
    enrollmentStatus: enrollment.status,
    courseCompletionStatus: enrollment.courseCompletionStatus,
    requiredLessonsCompleted: completedRequired,
    totalRequiredLessons: totalRequired,
    progressPercentage,
    minimumCompletionPercentage: minPct,
    requiredQuizzesPassed: failedQuizzes.length === 0,
    requiredAssignmentsCompleted: pendingAssignments.length === 0,
    failedQuizzes,
    pendingAssignments,
    missingRequirements,
    completionDate: enrollment.completedAt || enrollment.completionEvaluationAt || evaluatedAt,
    certificateEnabled: true,
    autoIssue: Boolean(course.certificate?.autoIssue),
    templateId: course.certificate?.templateId?.toString?.() || null,
  };
}

function ineligible(reason, extra = {}) {
  return {
    eligible: false,
    reason,
    requiredLessonsCompleted: 0,
    totalRequiredLessons: 0,
    progressPercentage: 0,
    requiredQuizzesPassed: false,
    requiredAssignmentsCompleted: false,
    missingRequirements: extra.missingRequirements || [],
    ...extra,
  };
}
