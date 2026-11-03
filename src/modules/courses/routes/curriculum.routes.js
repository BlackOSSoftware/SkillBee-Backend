import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../../config/security.js';
import { requireAnyPermission } from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import * as curriculumController from '../controllers/curriculum.controller.js';
import {
  createTopicSchema,
  listTopicsQuerySchema,
  reorderTopicsSchema,
  topicStatusSchema,
  updateTopicSchema,
} from '../validators/curriculum.validator.js';
import { objectId } from '../validators/common.js';

const router = Router({ mergeParams: true });

const readPerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_CURRICULUM_READ,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_READ,
  PERMISSIONS.INSTRUCTOR_COURSES_READ
);

const writePerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_CURRICULUM_CREATE,
  PERMISSIONS.COURSES_CURRICULUM_UPDATE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

const deletePerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_CURRICULUM_DELETE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

const reorderPerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_CURRICULUM_REORDER,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

router.get(
  '/:courseId/topics',
  readPerm,
  validate(listTopicsQuerySchema, 'query'),
  curriculumController.listTopics
);

router.post(
  '/:courseId/topics',
  writePerm,
  validate(createTopicSchema),
  curriculumController.createTopic
);

router.patch(
  '/:courseId/topics/reorder',
  reorderPerm,
  validate(reorderTopicsSchema),
  curriculumController.reorderTopics
);

router.patch(
  '/:courseId/topics/:topicId',
  writePerm,
  validateRequest({
    params: z.object({ courseId: objectId, topicId: objectId }),
    body: updateTopicSchema,
  }),
  curriculumController.updateTopic
);

router.delete(
  '/:courseId/topics/:topicId',
  deletePerm,
  validateRequest({ params: z.object({ courseId: objectId, topicId: objectId }) }),
  curriculumController.deleteTopic
);

export default router;

/** Mounted at /api/v1/admin for /topics/:id* */
export const topicAdminRouter = Router();

topicAdminRouter.get(
  '/topics/:id',
  readPerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  curriculumController.getTopic
);

topicAdminRouter.patch(
  '/topics/:id',
  writePerm,
  validateRequest({ params: z.object({ id: objectId }), body: updateTopicSchema }),
  curriculumController.updateTopic
);

topicAdminRouter.delete(
  '/topics/:id',
  deletePerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  curriculumController.deleteTopic
);

topicAdminRouter.post(
  '/topics/:id/duplicate',
  writePerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  curriculumController.duplicateTopic
);

topicAdminRouter.patch(
  '/topics/:id/status',
  writePerm,
  validateRequest({ params: z.object({ id: objectId }), body: topicStatusSchema }),
  curriculumController.changeTopicStatus
);
