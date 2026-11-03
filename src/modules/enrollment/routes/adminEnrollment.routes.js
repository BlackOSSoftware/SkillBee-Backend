import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/adminEnrollment.controller.js';
import {
  adminListQuery,
  courseIdParams,
  createEnrollmentBody,
  enrollmentIdParams,
  statusBody,
  studentIdParams,
  updateEnrollmentBody,
} from '../validators/enrollment.validator.js';

const router = Router();

router.use(authenticate, requireAdminAccess());

router.get('/', validateRequest({ query: adminListQuery }), ctrl.list);
router.post('/', validateRequest({ body: createEnrollmentBody }), ctrl.create);
router.post('/sync-expired', ctrl.syncExpired);

router.get(
  '/:id',
  validateRequest({ params: enrollmentIdParams }),
  ctrl.getOne
);
router.patch(
  '/:id',
  validateRequest({ params: enrollmentIdParams, body: updateEnrollmentBody }),
  ctrl.update
);
router.delete(
  '/:id',
  validateRequest({ params: enrollmentIdParams }),
  ctrl.remove
);
router.patch(
  '/:id/status',
  validateRequest({ params: enrollmentIdParams, body: statusBody }),
  ctrl.changeStatus
);
router.get(
  '/:id/history',
  validateRequest({ params: enrollmentIdParams }),
  ctrl.history
);
router.get(
  '/:id/progress',
  validateRequest({ params: enrollmentIdParams }),
  ctrl.progress
);

export default router;

export const adminCourseEnrollmentsRouter = Router({ mergeParams: true });
adminCourseEnrollmentsRouter.use(authenticate, requireAdminAccess());
adminCourseEnrollmentsRouter.get(
  '/',
  validateRequest({ params: courseIdParams, query: adminListQuery }),
  ctrl.listByCourse
);

export const adminStudentEnrollmentsRouter = Router({ mergeParams: true });
adminStudentEnrollmentsRouter.use(authenticate, requireAdminAccess());
adminStudentEnrollmentsRouter.get(
  '/',
  validateRequest({ params: studentIdParams, query: adminListQuery }),
  ctrl.listByStudent
);
