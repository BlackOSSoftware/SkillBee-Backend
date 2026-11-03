import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import {
  requireAnyPermission,
  requireCourseStaffAccess,
} from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import * as assignmentController from '../controllers/assignment.controller.js';
import * as submissionController from '../controllers/submission.controller.js';
import {
  assignmentIdParamSchema,
  assignmentStatusSchema,
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
} from '../validators/assignment.validator.js';
import {
  gradeSubmissionSchema,
  listSubmissionsQuerySchema,
  returnSubmissionSchema,
  submissionIdParamSchema,
} from '../validators/submission.validator.js';

const router = Router();
router.use(authenticate, requireCourseStaffAccess());

router.get(
  '/',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_READ),
  validate(listAssignmentsQuerySchema, 'query'),
  assignmentController.listAdmin
);

router.post(
  '/',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_CREATE),
  validate(createAssignmentSchema),
  assignmentController.create
);

router.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_READ),
  validateRequest({ params: assignmentIdParamSchema }),
  assignmentController.getAdmin
);

router.patch(
  '/:id',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_UPDATE),
  validateRequest({ params: assignmentIdParamSchema, body: updateAssignmentSchema }),
  assignmentController.update
);

router.delete(
  '/:id',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_DELETE),
  validateRequest({ params: assignmentIdParamSchema }),
  assignmentController.remove
);

router.patch(
  '/:id/status',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_PUBLISH),
  validateRequest({ params: assignmentIdParamSchema, body: assignmentStatusSchema }),
  assignmentController.changeStatus
);

router.get(
  '/:id/submissions',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ),
  validateRequest({ params: assignmentIdParamSchema, query: listSubmissionsQuerySchema }),
  assignmentController.listSubmissions
);

export default router;

export const adminSubmissionRouter = Router();
adminSubmissionRouter.use(authenticate, requireCourseStaffAccess());

adminSubmissionRouter.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ),
  validateRequest({ params: submissionIdParamSchema }),
  submissionController.getAdmin
);

adminSubmissionRouter.patch(
  '/:id/grade',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_GRADE),
  validateRequest({ params: submissionIdParamSchema, body: gradeSubmissionSchema }),
  submissionController.grade
);

adminSubmissionRouter.patch(
  '/:id/return',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_GRADE),
  validateRequest({ params: submissionIdParamSchema, body: returnSubmissionSchema }),
  submissionController.returnForCorrection
);

adminSubmissionRouter.get(
  '/:id/history',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ),
  validateRequest({ params: submissionIdParamSchema }),
  submissionController.history
);

adminSubmissionRouter.get(
  '/:id/attachments/:attachmentId/download',
  requireAnyPermission(PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ),
  submissionController.downloadAttachment
);
