import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess, requirePermissions } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS, USER_STATUS } from '../../../config/security.js';
import * as instructorController from '../controllers/instructor.controller.js';
import { objectId } from '../validators/common.js';

const router = Router();

router.use(
  authenticate,
  requireAdminAccess(),
  requirePermissions(PERMISSIONS.COURSES_INSTRUCTORS_MANAGE)
);

router.get('/', instructorController.listInstructors);
router.get(
  '/:id',
  validateRequest({ params: z.object({ id: objectId }) }),
  instructorController.getInstructor
);
router.get(
  '/:id/courses',
  validateRequest({ params: z.object({ id: objectId }) }),
  instructorController.listInstructorCourses
);
router.patch(
  '/:id/status',
  validateRequest({
    params: z.object({ id: objectId }),
    body: z.object({ status: z.enum(Object.values(USER_STATUS)) }).strict(),
  }),
  instructorController.updateInstructorStatus
);

export default router;
