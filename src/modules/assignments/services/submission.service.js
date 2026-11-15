import { ASSIGNMENT_STATUS, USER_STATUS } from '../../../config/security.js';
import { Assignment } from '../../../models/Assignment.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { invalidateStudentAssignmentList } from '../../../services/cache/invalidation.service.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL, studentAssignmentsKey } from '../../../services/cache/keys.js';
import {
  assertCanManageCourseAssignments,
  isPlatformAdmin,
} from './assignmentAccess.service.js';
import { storeAssignmentAttachment } from './assignmentFile.service.js';
import { Course } from '../../../models/Course.js';
import { learningEnrollmentQuery } from '../../enrollment/services/enrollmentAccess.service.js';

async function assertStudentEnrollment(studentId, courseId) {
  const enrolled = await CourseEnrollment.exists(learningEnrollmentQuery(studentId, courseId));
  if (!enrolled) throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');
}

export async function listStudentAssignments(req, query = {}) {
  if (req.user?.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const studentId = req.user._id.toString();
  const courseScope = query.courseId || 'all';
  const filterKey = query.filter || 'all';
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const cacheKey = `${studentAssignmentsKey(studentId, courseScope)}:f:${filterKey}:p:${page}:l:${limit}`;

  return getOrSetCache(cacheKey, CACHE_TTL.ASSIGNMENT_LIST, async () => {
    const enrollments = await CourseEnrollment.find(
      learningEnrollmentQuery(req.user._id)
    ).select('courseId');
    const courseIds = enrollments.map((e) => e.courseId);
    if (query.courseId) {
      if (!courseIds.some((id) => id.toString() === String(query.courseId))) {
        throw new AppError('Not enrolled in course', 403, 'NOT_ENROLLED');
      }
    }

    const filter = {
      deletedAt: null,
      // Show published AND closed assignments. Closed ones remain visible
      // (read-only) so students can still see their submission/feedback;
      // submission itself is blocked by assertCanSubmitNow.
      status: { $in: [ASSIGNMENT_STATUS.PUBLISHED, ASSIGNMENT_STATUS.CLOSED] },
      courseId: query.courseId || { $in: courseIds },
    };

    const now = new Date();
    if (query.filter === 'upcoming') {
      filter.dueDate = { $gte: now };
    } else if (query.filter === 'past_due') {
      filter.dueDate = { $lt: now };
    }

    const skip = getSkip({ page, limit });

    const [rows, total] = await Promise.all([
      Assignment.find(filter).sort({ dueDate: 1, createdAt: -1 }).skip(skip).limit(limit),
      Assignment.countDocuments(filter),
    ]);

    const assignmentIds = rows.map((a) => a._id);
    const submissions = await AssignmentSubmission.find({
      assignmentId: { $in: assignmentIds },
      studentId: req.user._id,
    });
    const byAssignment = new Map(submissions.map((s) => [s.assignmentId.toString(), s]));

    let list = rows.map((a) => {
      const sub = byAssignment.get(a._id.toString());
      return {
        ...a.toSafeObject({ forStudent: true }),
        mySubmission: sub
          ? {
              id: sub._id.toString(),
              submissionStatus: sub.submissionStatus,
              submittedAt: sub.submittedAt,
              isLate: sub.isLate,
              marksAwarded: sub.marksAwarded,
            }
          : null,
      };
    });

    if (query.filter === 'submitted') {
      list = list.filter((a) => a.mySubmission);
    } else if (query.filter === 'pending_evaluation') {
      list = list.filter(
        (a) =>
          a.mySubmission &&
          ['submitted', 'under_review', 'resubmitted'].includes(a.mySubmission.submissionStatus)
      );
    } else if (query.filter === 'evaluated') {
      list = list.filter((a) => a.mySubmission?.submissionStatus === 'evaluated');
    }

    return {
      assignments: list,
      pagination: buildPagination({ page, limit, total }),
    };
  });
}

export async function getStudentAssignment(req, id) {
  const assignment = await Assignment.findOne({ _id: id, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  // Published and closed assignments are viewable by enrolled students.
  // Closed ones are read-only — submission is blocked separately.
  if (
    assignment.status !== ASSIGNMENT_STATUS.PUBLISHED &&
    assignment.status !== ASSIGNMENT_STATUS.CLOSED
  ) {
    throw new AppError('Assignment is not available', 403, 'ASSIGNMENT_UNAVAILABLE');
  }
  await assertStudentEnrollment(req.user._id, assignment.courseId);
  const sub = await AssignmentSubmission.findOne({
    assignmentId: assignment._id,
    studentId: req.user._id,
  });
  return {
    assignment: assignment.toSafeObject({ forStudent: true }),
    mySubmission: sub ? sub.toSafeObject({ includeFeedback: true }) : null,
  };
}

function assertCanSubmitNow(assignment) {
  if (assignment.status !== ASSIGNMENT_STATUS.PUBLISHED) {
    throw new AppError('Assignment is not open for submission', 403, 'ASSIGNMENT_CLOSED');
  }
  const now = new Date();
  let isLate = false;
  if (assignment.dueDate && now > assignment.dueDate) {
    if (!assignment.allowLateSubmission) {
      throw new AppError('Submission deadline has passed', 403, 'DEADLINE_PASSED');
    }
    isLate = true;
  }
  return { isLate };
}

export async function submitAssignment(req, assignmentId, { textContent }, files = []) {
  if (req.user?.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  // Reject student-supplied grading fields
  if (
    req.body?.marksAwarded != null ||
    req.body?.evaluatedBy != null ||
    req.body?.submissionStatus != null
  ) {
    throw new AppError('Invalid fields in submission', 400, 'MASS_ASSIGNMENT');
  }

  const assignment = await Assignment.findOne({ _id: assignmentId, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  await assertStudentEnrollment(req.user._id, assignment.courseId);
  const { isLate } = assertCanSubmitNow(assignment);

  const type = assignment.submissionType;
  const text = typeof textContent === 'string' ? textContent.trim() : '';

  if (type === 'text' || type === 'file_and_text') {
    if (!text) throw new AppError('Text content is required', 400, 'TEXT_REQUIRED');
  }
  if (type === 'file_upload' || type === 'file_and_text') {
    if (!files?.length) throw new AppError('File attachment is required', 400, 'FILE_REQUIRED');
  }
  if (type === 'text' && files?.length) {
    throw new AppError('Files not allowed for text-only assignment', 400, 'FILES_NOT_ALLOWED');
  }

  const existing = await AssignmentSubmission.findOne({
    assignmentId: assignment._id,
    studentId: req.user._id,
  });

  if (existing) {
    const canResubmit =
      assignment.allowResubmission &&
      (existing.submissionStatus === 'returned' ||
        (existing.version < (assignment.maxSubmissions || 1) &&
          ['submitted', 'evaluated', 'returned', 'resubmitted'].includes(existing.submissionStatus)));

    if (!canResubmit && existing.submissionStatus !== 'returned') {
      throw new AppError('Duplicate submission not allowed', 409, 'ALREADY_SUBMITTED');
    }
    if (existing.version >= (assignment.maxSubmissions || 1) && existing.submissionStatus !== 'returned') {
      throw new AppError('Maximum submissions reached', 403, 'MAX_SUBMISSIONS');
    }
  }

  const attachments = [];
  for (const file of files || []) {
    const att = await storeAssignmentAttachment({
      tempPath: file.path,
      originalFileName: file.originalname,
      declaredMime: file.mimetype,
      assignment,
      studentId: req.user._id,
    });
    attachments.push(att);
  }

  const now = new Date();

  if (!existing) {
    const created = await AssignmentSubmission.create({
      assignmentId: assignment._id,
      studentId: req.user._id,
      courseId: assignment.courseId,
      lessonId: assignment.lessonId,
      version: 1,
      textContent: type === 'file_upload' ? '' : text,
      attachments,
      submittedAt: now,
      submissionStatus: 'submitted',
      isLate,
    });
    await invalidateStudentAssignmentList(
      req.user._id.toString(),
      assignment.courseId.toString()
    );
    try {
      const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
      emitAppEventAsync('assignment.submitted', {
        userId: req.user._id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        assignmentId: assignment._id,
        assignmentTitle: assignment.title,
        submissionId: created._id,
      });
    } catch {
      /* ignore */
    }
    return created.toSafeObject({ includeFeedback: false });
  }

  // Archive current into versionHistory before overwrite of current fields
  existing.versionHistory.push({
    version: existing.version,
    textContent: existing.textContent,
    attachments: existing.attachments,
    submittedAt: existing.submittedAt,
    isLate: existing.isLate,
    submissionStatus: existing.submissionStatus,
    marksAwarded: existing.marksAwarded,
    feedback: existing.feedback,
    evaluatedBy: existing.evaluatedBy,
    evaluatedAt: existing.evaluatedAt,
  });

  existing.version += 1;
  existing.textContent = type === 'file_upload' ? '' : text;
  existing.attachments = attachments;
  existing.submittedAt = now;
  existing.isLate = isLate;
  existing.submissionStatus = 'resubmitted';
  existing.marksAwarded = null;
  existing.feedback = '';
  existing.evaluatedBy = null;
  existing.evaluatedAt = null;
  await existing.save();
  await invalidateStudentAssignmentList(
    req.user._id.toString(),
    assignment.courseId.toString()
  );
  return existing.toSafeObject({ includeFeedback: false });
}

export async function listMySubmissions(req, query = {}) {
  const filter = { studentId: req.user._id };
  if (query.assignmentId) filter.assignmentId = query.assignmentId;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.status) filter.submissionStatus = query.status;

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });

  const [rows, total] = await Promise.all([
    AssignmentSubmission.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit),
    AssignmentSubmission.countDocuments(filter),
  ]);

  return {
    submissions: rows.map((s) => s.toSafeObject({ includeFeedback: true })),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function getOwnSubmission(req, id) {
  const sub = await AssignmentSubmission.findById(id);
  if (!sub) throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
  if (sub.studentId.toString() !== req.user._id.toString() && !isPlatformAdmin(req.role)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return sub.toSafeObject({ includeFeedback: true, includeHistory: true });
}

export async function getOwnFeedback(req, id) {
  const sub = await getOwnSubmission(req, id);
  return {
    submissionId: sub.id,
    submissionStatus: sub.submissionStatus,
    marksAwarded: sub.marksAwarded,
    feedback: sub.feedback,
    evaluatedAt: sub.evaluatedAt,
  };
}

export async function listSubmissionsAdmin(req, assignmentId, query = {}) {
  const assignment = await Assignment.findOne({ _id: assignmentId, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageCourseAssignments(req, assignment.courseId);

  const filter = { assignmentId };
  if (query.status) filter.submissionStatus = query.status;
  if (query.isLate === true || query.isLate === 'true') filter.isLate = true;
  if (query.isLate === false || query.isLate === 'false') filter.isLate = false;
  if (query.studentId) filter.studentId = query.studentId;
  if (query.search) {
    const users = await User.find({
      $or: [
        { email: new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { firstName: new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { lastName: new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ],
    }).select('_id');
    filter.studentId = { $in: users.map((u) => u._id) };
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [rows, total] = await Promise.all([
    AssignmentSubmission.find(filter).sort({ submittedAt: sortOrder }).skip(skip).limit(limit),
    AssignmentSubmission.countDocuments(filter),
  ]);

  return {
    submissions: rows.map((s) => s.toSafeObject({ includeFeedback: true })),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function listAllSubmissionsAdmin(req, query = {}) {
  const filter = {};
  if (query.assignmentId) filter.assignmentId = query.assignmentId;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.studentId) filter.studentId = query.studentId;
  if (query.status) filter.submissionStatus = query.status;
  if (query.isLate === true || query.isLate === 'true') filter.isLate = true;

  if (!isPlatformAdmin(req.role) && req.role?.slug === 'instructor') {
    const courses = await Course.find({
      instructorIds: req.user._id,
      deletedAt: null,
    }).select('_id');
    const ids = courses.map((c) => c._id);
    // Keep the caller's courseId filter but never leave the instructor's scope
    filter.courseId = query.courseId
      ? { $in: ids.filter((id) => id.toString() === String(query.courseId)) }
      : { $in: ids };
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });

  const [rows, total] = await Promise.all([
    AssignmentSubmission.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit),
    AssignmentSubmission.countDocuments(filter),
  ]);

  return {
    submissions: rows.map((s) => s.toSafeObject({ includeFeedback: true })),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function getSubmissionAdmin(req, id) {
  const sub = await AssignmentSubmission.findById(id);
  if (!sub) throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
  await assertCanManageCourseAssignments(req, sub.courseId);
  return sub.toSafeObject({ includeFeedback: true, includeHistory: true });
}

export async function gradeSubmission(req, id, { marksAwarded, feedback, status }) {
  const sub = await AssignmentSubmission.findById(id);
  if (!sub) throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
  await assertCanManageCourseAssignments(req, sub.courseId);

  const assignment = await Assignment.findById(sub.assignmentId);
  const marks = Number(marksAwarded);
  if (Number.isNaN(marks) || marks < 0) {
    throw new AppError('Marks cannot be negative', 400, 'INVALID_MARKS');
  }
  if (marks > assignment.maximumMarks) {
    throw new AppError('Marks exceed assignment maximum', 400, 'MARKS_EXCEED');
  }
  if (!['submitted', 'under_review', 'resubmitted', 'evaluated', 'returned'].includes(sub.submissionStatus)) {
    throw new AppError('Submission cannot be graded', 409, 'NOT_GRADABLE');
  }

  if (sub.marksAwarded != null || sub.evaluatedAt) {
    sub.evaluationHistory.push({
      marksAwarded: sub.marksAwarded,
      feedback: sub.feedback,
      status: sub.submissionStatus,
      evaluatedBy: sub.evaluatedBy,
      evaluatedAt: sub.evaluatedAt || new Date(),
      note: 'Previous evaluation preserved',
    });
  }

  sub.marksAwarded = marks;
  sub.feedback = feedback || '';
  sub.evaluatedBy = req.user._id;
  sub.evaluatedAt = new Date();
  sub.submissionStatus = status === 'returned' ? 'returned' : 'evaluated';
  await sub.save();
  await invalidateStudentAssignmentList(sub.studentId.toString(), sub.courseId.toString());
  try {
    const { User } = await import('../../../models/User.js');
    const student = await User.findById(sub.studentId).select('email firstName lastName');
    const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
    emitAppEventAsync('assignment.evaluated', {
      userId: sub.studentId,
      email: student?.email,
      firstName: student?.firstName,
      lastName: student?.lastName,
      assignmentId: sub.assignmentId,
      assignmentTitle: assignment?.title,
      submissionId: sub._id,
      score: marks,
    });
  } catch {
    /* ignore */
  }
  return sub.toSafeObject({ includeFeedback: true, includeHistory: true });
}

export async function returnSubmission(req, id, { feedback } = {}) {
  const sub = await AssignmentSubmission.findById(id);
  if (!sub) throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
  await assertCanManageCourseAssignments(req, sub.courseId);

  const assignment = await Assignment.findById(sub.assignmentId);
  if (!assignment.allowResubmission) {
    throw new AppError('Resubmission is not allowed for this assignment', 422, 'RESUBMISSION_DISABLED');
  }

  if (sub.marksAwarded != null || sub.evaluatedAt) {
    sub.evaluationHistory.push({
      marksAwarded: sub.marksAwarded,
      feedback: sub.feedback,
      status: sub.submissionStatus,
      evaluatedBy: sub.evaluatedBy,
      evaluatedAt: sub.evaluatedAt || new Date(),
      note: 'Returned for correction',
    });
  }

  sub.submissionStatus = 'returned';
  if (feedback != null) sub.feedback = feedback;
  sub.reopenedBy = req.user._id;
  sub.reopenedAt = new Date();
  await sub.save();
  await invalidateStudentAssignmentList(sub.studentId.toString(), sub.courseId.toString());
  return sub.toSafeObject({ includeFeedback: true, includeHistory: true });
}

export async function getSubmissionHistory(req, id) {
  return getSubmissionAdmin(req, id);
}
