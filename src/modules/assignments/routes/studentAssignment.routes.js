import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import {
  assignmentSubmitRateLimiter,
} from '../../../middleware/rateLimiters.js';
import * as assignmentController from '../controllers/assignment.controller.js';
import * as submissionController from '../controllers/submission.controller.js';
import {
  assignmentIdParamSchema,
  studentListQuerySchema,
} from '../validators/assignment.validator.js';
import {
  listSubmissionsQuerySchema,
  submissionIdParamSchema,
  submitAssignmentSchema,
} from '../validators/submission.validator.js';
import {
  assignmentUpload,
  handleAssignmentMulterError,
} from '../middleware/upload.js';

const studentAssignmentRouter = Router();
studentAssignmentRouter.use(authenticate);

studentAssignmentRouter.get(
  '/',
  validate(studentListQuerySchema, 'query'),
  assignmentController.listStudent
);

studentAssignmentRouter.get(
  '/my-submissions',
  validate(listSubmissionsQuerySchema, 'query'),
  submissionController.mySubmissions
);

studentAssignmentRouter.get(
  '/:id',
  validateRequest({ params: assignmentIdParamSchema }),
  assignmentController.getStudent
);

studentAssignmentRouter.post(
  '/:id/submit',
  assignmentSubmitRateLimiter,
  assignmentUpload.array('files', 5),
  handleAssignmentMulterError,
  validateRequest({ params: assignmentIdParamSchema, body: submitAssignmentSchema }),
  submissionController.submit
);

const studentSubmissionRouter = Router();
studentSubmissionRouter.use(authenticate);

studentSubmissionRouter.get(
  '/:id',
  validateRequest({ params: submissionIdParamSchema }),
  submissionController.getOwn
);

studentSubmissionRouter.get(
  '/:id/feedback',
  validateRequest({ params: submissionIdParamSchema }),
  submissionController.getFeedback
);

studentSubmissionRouter.get(
  '/:id/attachments/:attachmentId/download',
  submissionController.downloadAttachment
);

export { studentAssignmentRouter, studentSubmissionRouter };
