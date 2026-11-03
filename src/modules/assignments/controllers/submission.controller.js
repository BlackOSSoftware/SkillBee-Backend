import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { AppError } from '../../../utils/AppError.js';
import * as submissionService from '../services/submission.service.js';
import { openAssignmentAttachmentStream } from '../services/assignmentFile.service.js';
import {
  assertCanManageCourseAssignments,
  isPlatformAdmin,
} from '../services/assignmentAccess.service.js';

export const submit = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const submission = await submissionService.submitAssignment(
    req,
    req.params.id,
    { textContent: req.body?.textContent },
    files
  );
  res.status(201).json({ success: true, data: { submission } });
});

export const mySubmissions = asyncHandler(async (req, res) => {
  const result = await submissionService.listMySubmissions(req, req.query);
  res.json({
    success: true,
    data: { submissions: result.submissions },
    pagination: result.pagination,
  });
});

export const getOwn = asyncHandler(async (req, res) => {
  const submission = await submissionService.getOwnSubmission(req, req.params.id);
  res.json({ success: true, data: { submission } });
});

export const getFeedback = asyncHandler(async (req, res) => {
  const feedback = await submissionService.getOwnFeedback(req, req.params.id);
  res.json({ success: true, data: { feedback } });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const submission = await submissionService.getSubmissionAdmin(req, req.params.id);
  res.json({ success: true, data: { submission } });
});

export const grade = asyncHandler(async (req, res) => {
  const submission = await submissionService.gradeSubmission(req, req.params.id, req.body);
  res.json({ success: true, data: { submission } });
});

export const returnForCorrection = asyncHandler(async (req, res) => {
  const submission = await submissionService.returnSubmission(req, req.params.id, req.body);
  res.json({ success: true, data: { submission } });
});

export const history = asyncHandler(async (req, res) => {
  const submission = await submissionService.getSubmissionHistory(req, req.params.id);
  res.json({ success: true, data: { submission } });
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const sub = await AssignmentSubmission.findById(req.params.id);
  if (!sub) throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');

  const isOwner = sub.studentId.toString() === req.user._id.toString();
  if (!isOwner && !isPlatformAdmin(req.role)) {
    if (req.role?.slug === 'instructor') {
      await assertCanManageCourseAssignments(req, sub.courseId);
    } else {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  const attachment = (sub.attachments || []).find(
    (a) => a._id.toString() === req.params.attachmentId
  );
  if (!attachment) throw new AppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');

  const { stream } = openAssignmentAttachmentStream(attachment.storageKey);
  res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(attachment.originalFileName)}"`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.pipe(res);
});
