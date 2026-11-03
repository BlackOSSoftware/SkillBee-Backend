import { Router } from 'express';
import { PERMISSIONS } from '../../../config/security.js';
import { requireAnyPermission } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as resourceController from '../controllers/resource.controller.js';
import {
  createResourceMetaSchema,
  resourceIdParamSchema,
  updateResourceSchema,
} from '../validators/resource.validator.js';
import { documentUpload, handleMulterError } from '../middleware/upload.js';
import { objectId } from '../validators/common.js';
import { z } from 'zod';

const manage = requireAnyPermission(
  PERMISSIONS.COURSES_RESOURCES_MANAGE,
  PERMISSIONS.INSTRUCTOR_RESOURCES_MANAGE
);
const read = requireAnyPermission(
  PERMISSIONS.COURSES_RESOURCES_MANAGE,
  PERMISSIONS.INSTRUCTOR_RESOURCES_MANAGE,
  PERMISSIONS.COURSES_READ,
  PERMISSIONS.INSTRUCTOR_COURSES_READ
);

function parseResourceBody(req, _res, next) {
  try {
    if (typeof req.body.meta === 'string') {
      req.body = { ...JSON.parse(req.body.meta) };
    }
    const parsed = createResourceMetaSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    req.body = parsed.data;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Mounted at /api/v1/admin/courses */
const router = Router({ mergeParams: true });

router.post(
  '/:courseId/resources',
  manage,
  documentUpload.single('file'),
  handleMulterError,
  parseResourceBody,
  resourceController.createCourseResource
);

router.get('/:courseId/resources', read, resourceController.listCourseResources);

export default router;

/** Mounted at /api/v1/admin — GET/PATCH/DELETE /resources/:resourceId */
export const adminResourceRouter = Router();

adminResourceRouter.get(
  '/resources/:resourceId',
  read,
  validateRequest({ params: resourceIdParamSchema }),
  resourceController.getResource
);

adminResourceRouter.patch(
  '/resources/:resourceId',
  manage,
  validateRequest({ params: resourceIdParamSchema, body: updateResourceSchema }),
  resourceController.updateResource
);

adminResourceRouter.delete(
  '/resources/:resourceId',
  manage,
  validateRequest({ params: resourceIdParamSchema }),
  resourceController.deleteResource
);

adminResourceRouter.post(
  '/lessons/:lessonId/resources',
  manage,
  documentUpload.single('file'),
  handleMulterError,
  parseResourceBody,
  resourceController.createLessonResource
);

adminResourceRouter.get(
  '/lessons/:lessonId/resources',
  read,
  validateRequest({ params: z.object({ lessonId: objectId }) }),
  resourceController.listLessonResources
);

export const lessonResourceRouter = adminResourceRouter;
