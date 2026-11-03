import { Router } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import * as lessonController from '../controllers/lesson.controller.js';
import {
  createLessonSchema,
  lessonStatusSchema,
  listLessonsQuerySchema,
  moveLessonSchema,
  reorderLessonsSchema,
  updateAttachmentSchema,
  updateLessonSchema,
  attachmentMetaSchema,
} from '../validators/lesson.validator.js';
import { objectId } from '../validators/common.js';
import { uploadRateLimiter } from '../../../middleware/rateLimiters.js';
import { documentUpload, handleMulterError, videoUpload } from '../middleware/upload.js';

const router = Router();

const readPerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_LESSONS_READ,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_READ,
  PERMISSIONS.INSTRUCTOR_COURSES_READ
);

const writePerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_LESSONS_CREATE,
  PERMISSIONS.COURSES_LESSONS_UPDATE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

const deletePerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_LESSONS_DELETE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

const publishPerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_LESSONS_PUBLISH,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

const mediaUploadPerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_MEDIA_UPLOAD,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE,
  PERMISSIONS.INSTRUCTOR_RESOURCES_MANAGE
);

const mediaDeletePerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_MEDIA_DELETE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

const attachmentPerm = requireAnyPermission(
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_ATTACHMENTS_MANAGE,
  PERMISSIONS.COURSES_RESOURCES_MANAGE,
  PERMISSIONS.INSTRUCTOR_RESOURCES_MANAGE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE
);

router.get(
  '/topics/:topicId/lessons',
  readPerm,
  validateRequest({ params: z.object({ topicId: objectId }) }),
  validate(listLessonsQuerySchema, 'query'),
  lessonController.listLessons
);

router.post(
  '/topics/:topicId/lessons',
  writePerm,
  validateRequest({ params: z.object({ topicId: objectId }), body: createLessonSchema }),
  lessonController.createLesson
);

router.patch(
  '/topics/:topicId/lessons/reorder',
  writePerm,
  validateRequest({ params: z.object({ topicId: objectId }), body: reorderLessonsSchema }),
  lessonController.reorderLessons
);

router.get(
  '/lessons/:id',
  readPerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.getLesson
);

router.patch(
  '/lessons/:id',
  writePerm,
  validateRequest({ params: z.object({ id: objectId }), body: updateLessonSchema }),
  lessonController.updateLesson
);

router.delete(
  '/lessons/:id',
  deletePerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.deleteLesson
);

router.post(
  '/lessons/:id/move',
  writePerm,
  validateRequest({ params: z.object({ id: objectId }), body: moveLessonSchema }),
  lessonController.moveLesson
);

router.post(
  '/lessons/:id/duplicate',
  writePerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.duplicateLesson
);

router.patch(
  '/lessons/:id/status',
  publishPerm,
  validateRequest({ params: z.object({ id: objectId }), body: lessonStatusSchema }),
  lessonController.changeLessonStatus
);

router.get(
  '/lessons/:id/preview',
  readPerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.previewLesson
);

// Video — Phase 3 paths
router.post(
  '/lessons/:id/video/upload',
  mediaUploadPerm,
  uploadRateLimiter,
  videoUpload.single('video'),
  handleMulterError,
  lessonController.uploadVideo
);

router.get(
  '/lessons/:id/video/status',
  readPerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.uploadStatus
);

router.delete(
  '/lessons/:id/video',
  mediaDeletePerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.deleteVideo
);

// Phase 2 back-compat aliases
router.post(
  '/lessons/:lessonId/video',
  mediaUploadPerm,
  uploadRateLimiter,
  videoUpload.single('video'),
  handleMulterError,
  lessonController.uploadVideo
);

router.get(
  '/lessons/:lessonId/video/status',
  readPerm,
  lessonController.uploadStatus
);

// Attachments
router.post(
  '/lessons/:id/attachments',
  attachmentPerm,
  uploadRateLimiter,
  documentUpload.single('file'),
  handleMulterError,
  (req, _res, next) => {
    try {
      let body = req.body || {};
      if (typeof body.meta === 'string') {
        body = JSON.parse(body.meta);
      }
      const parsed = attachmentMetaSchema.safeParse(body);
      if (!parsed.success) return next(parsed.error);
      req.body = parsed.data;
      return next();
    } catch (err) {
      return next(err);
    }
  },
  lessonController.createAttachment
);

router.get(
  '/lessons/:id/attachments',
  readPerm,
  validateRequest({ params: z.object({ id: objectId }) }),
  lessonController.listAttachments
);

router.get(
  '/lessons/:id/attachments/:fileId',
  readPerm,
  validateRequest({ params: z.object({ id: objectId, fileId: objectId }) }),
  lessonController.getAttachment
);

router.patch(
  '/lessons/:id/attachments/:fileId',
  attachmentPerm,
  validateRequest({
    params: z.object({ id: objectId, fileId: objectId }),
    body: updateAttachmentSchema,
  }),
  lessonController.updateAttachment
);

router.delete(
  '/lessons/:id/attachments/:fileId',
  attachmentPerm,
  validateRequest({ params: z.object({ id: objectId, fileId: objectId }) }),
  lessonController.deleteAttachment
);

export default router;
