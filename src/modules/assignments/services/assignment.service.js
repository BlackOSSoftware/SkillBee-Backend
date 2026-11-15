import {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SUBMISSION_TYPES,
} from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { Assignment } from '../../../models/Assignment.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { invalidateAssignmentCaches } from '../../../services/cache/invalidation.service.js';
import { ensureUniqueAssignmentSlug } from '../utils/slug.js';
import {
  assertCanManageCourseAssignments,
  isPlatformAdmin,
} from './assignmentAccess.service.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateSubmissionTypeConfig(input) {
  const type = input.submissionType;
  if (!ASSIGNMENT_SUBMISSION_TYPES.includes(type)) {
    throw new AppError('Invalid submission type', 400, 'INVALID_SUBMISSION_TYPE');
  }
  if (type === 'file_upload' || type === 'file_and_text') {
    if (!input.allowedFileTypes?.length) {
      throw new AppError('allowedFileTypes required for file submissions', 400, 'INVALID_FILE_TYPES');
    }
    if (!input.maximumFileSizeBytes || input.maximumFileSizeBytes < 1) {
      throw new AppError('maximumFileSizeBytes must be positive', 400, 'INVALID_FILE_SIZE');
    }
  }
  if (input.maximumMarks == null || Number(input.maximumMarks) < 0) {
    throw new AppError('maximumMarks must be non-negative', 400, 'INVALID_MARKS');
  }
}

async function assertLessonBelongsToCourse(lessonId, courseId) {
  if (!lessonId) return null;
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson || lesson.courseId.toString() !== courseId.toString()) {
    throw new AppError('Lesson does not belong to course', 400, 'INVALID_LESSON');
  }
  return lesson;
}

export async function listAssignmentsAdmin(req, query = {}) {
  const filter = { deletedAt: null };
  if (query.courseId) filter.courseId = query.courseId;
  if (query.lessonId) filter.lessonId = query.lessonId;
  if (query.status) filter.status = query.status;
  if (query.search) filter.title = new RegExp(escapeRegex(query.search), 'i');
  if (query.dueBefore || query.dueAfter) {
    filter.dueDate = {};
    if (query.dueAfter) filter.dueDate.$gte = new Date(query.dueAfter);
    if (query.dueBefore) filter.dueDate.$lte = new Date(query.dueBefore);
  }

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
  const sortAllow = new Set(['createdAt', 'dueDate', 'title', 'status', 'maximumMarks']);
  const sortBy = sortAllow.has(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [rows, total] = await Promise.all([
    Assignment.find(filter).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
    Assignment.countDocuments(filter),
  ]);

  return {
    assignments: rows.map((a) => a.toSafeObject()),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function createAssignment(req, input) {
  await assertCanManageCourseAssignments(req, input.courseId);
  await assertLessonBelongsToCourse(input.lessonId, input.courseId);

  if (input.dueDate && Number.isNaN(new Date(input.dueDate).getTime())) {
    throw new AppError('Invalid due date', 400, 'INVALID_DUE_DATE');
  }

  const payload = {
    ...input,
    allowedFileTypes: input.allowedFileTypes || ['.pdf', '.doc', '.docx', '.txt', '.zip'],
    maximumFileSizeBytes: input.maximumFileSizeBytes || 10 * 1024 * 1024,
  };
  validateSubmissionTypeConfig(payload);

  const slug = await ensureUniqueAssignmentSlug(
    Assignment,
    input.courseId,
    input.slug || input.title
  );

  const assignment = await Assignment.create({
    title: payload.title,
    slug,
    instructions: payload.instructions,
    courseId: payload.courseId,
    topicId: payload.topicId || null,
    lessonId: payload.lessonId || null,
    dueDate: payload.dueDate || null,
    maximumMarks: payload.maximumMarks,
    allowedFileTypes: payload.allowedFileTypes,
    maximumFileSizeBytes: payload.maximumFileSizeBytes,
    submissionType: payload.submissionType,
    allowLateSubmission: Boolean(payload.allowLateSubmission),
    allowResubmission: Boolean(payload.allowResubmission),
    maxSubmissions: payload.maxSubmissions || (payload.allowResubmission ? 3 : 1),
    status: ASSIGNMENT_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await invalidateAssignmentCaches({ courseId: assignment.courseId.toString() });
  return assignment.toSafeObject();
}

export async function getAssignmentAdmin(req, id) {
  const assignment = await Assignment.findOne({ _id: id, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageCourseAssignments(req, assignment.courseId);
  return assignment.toSafeObject();
}

export async function updateAssignment(req, id, input) {
  const assignment = await Assignment.findOne({ _id: id, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageCourseAssignments(req, assignment.courseId);

  const blocked = ['createdBy', 'status', 'publishedAt', 'closedAt', 'deletedAt'];
  for (const key of blocked) delete input[key];

  if (input.title) assignment.title = input.title;
  if (input.slug) {
    assignment.slug = await ensureUniqueAssignmentSlug(
      Assignment,
      assignment.courseId,
      input.slug,
      assignment._id
    );
  }
  if (input.instructions !== undefined) assignment.instructions = input.instructions;
  if (input.lessonId !== undefined) {
    await assertLessonBelongsToCourse(input.lessonId, assignment.courseId);
    assignment.lessonId = input.lessonId;
  }
  if (input.topicId !== undefined) assignment.topicId = input.topicId;
  if (input.dueDate !== undefined) assignment.dueDate = input.dueDate;
  if (input.maximumMarks !== undefined) {
    if (Number(input.maximumMarks) < 0) {
      throw new AppError('maximumMarks must be non-negative', 400, 'INVALID_MARKS');
    }
    // Preserve historical grades; do not rewrite past marksAwarded
    assignment.maximumMarks = input.maximumMarks;
  }
  if (input.allowedFileTypes !== undefined) assignment.allowedFileTypes = input.allowedFileTypes;
  if (input.maximumFileSizeBytes !== undefined) {
    assignment.maximumFileSizeBytes = input.maximumFileSizeBytes;
  }
  if (input.submissionType !== undefined) assignment.submissionType = input.submissionType;
  if (input.allowLateSubmission !== undefined) {
    assignment.allowLateSubmission = input.allowLateSubmission;
  }
  if (input.allowResubmission !== undefined) {
    assignment.allowResubmission = input.allowResubmission;
  }
  if (input.maxSubmissions !== undefined) assignment.maxSubmissions = input.maxSubmissions;

  validateSubmissionTypeConfig({
    submissionType: assignment.submissionType,
    allowedFileTypes: assignment.allowedFileTypes,
    maximumFileSizeBytes: assignment.maximumFileSizeBytes,
    maximumMarks: assignment.maximumMarks,
  });

  assignment.updatedBy = req.user._id;
  await assignment.save();
  await invalidateAssignmentCaches({
    courseId: assignment.courseId.toString(),
    assignmentId: assignment._id.toString(),
  });
  return assignment.toSafeObject();
}

export async function changeAssignmentStatus(req, id, status) {
  const assignment = await Assignment.findOne({ _id: id, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageCourseAssignments(req, assignment.courseId);

  if (!Object.values(ASSIGNMENT_STATUS).includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }

  if (status === ASSIGNMENT_STATUS.PUBLISHED) {
    if (!assignment.instructions?.trim()) {
      throw new AppError('Instructions required to publish', 422, 'INVALID_CONFIG');
    }
    if (assignment.maximumMarks < 0) {
      throw new AppError('Invalid maximum marks', 422, 'INVALID_MARKS');
    }
    validateSubmissionTypeConfig(assignment);
    assignment.publishedAt = assignment.publishedAt || new Date();
    assignment.closedAt = null;
  }
  if (status === ASSIGNMENT_STATUS.CLOSED) {
    assignment.closedAt = new Date();
  }
  if (status === ASSIGNMENT_STATUS.ARCHIVED) {
    const count = await AssignmentSubmission.countDocuments({ assignmentId: assignment._id });
    if (count > 0) {
      // Soft-archive only — never hard-delete when submissions exist
    }
  }

  assignment.status = status;
  assignment.updatedBy = req.user._id;
  await assignment.save();
  await invalidateAssignmentCaches({
    courseId: assignment.courseId.toString(),
    assignmentId: assignment._id.toString(),
  });
  return assignment.toSafeObject();
}

export async function softDeleteAssignment(req, id) {
  const assignment = await Assignment.findOne({ _id: id, deletedAt: null });
  if (!assignment) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageCourseAssignments(req, assignment.courseId);

  const count = await AssignmentSubmission.countDocuments({ assignmentId: assignment._id });
  if (count > 0) {
    assignment.status = ASSIGNMENT_STATUS.ARCHIVED;
  }
  assignment.deletedAt = new Date();
  assignment.updatedBy = req.user._id;
  await assignment.save();
  await invalidateAssignmentCaches({
    courseId: assignment.courseId.toString(),
    assignmentId: assignment._id.toString(),
  });
  return assignment.toSafeObject();
}
