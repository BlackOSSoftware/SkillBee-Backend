import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuthenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as lessonController from '../controllers/lesson.controller.js';
import * as learningService from '../services/learning.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { objectId } from '../validators/common.js';
import { resourceIdParamSchema } from '../validators/resource.validator.js';
import * as resourceController from '../controllers/resource.controller.js';

const router = Router();

/**
 * Video stream is authorized by the short-lived signed playback token alone.
 * `<video>` elements cannot send custom headers and may not carry the session
 * cookie (expired/missing), so this route must not require `authenticate`.
 * `optionalAuthenticate` still populates req.user when a session exists so the
 * token's `sub` can be cross-checked against the logged-in user.
 */
router.get(
  '/lessons/:lessonId/video/stream',
  optionalAuthenticate,
  validateRequest({ params: z.object({ lessonId: objectId }) }),
  asyncHandler(async (req, res) => {
    await learningService.streamLearningVideo(req, res, req.params.lessonId);
  })
);

router.use(authenticate);

router.get(
  '/courses/:courseId/curriculum',
  validateRequest({ params: z.object({ courseId: objectId }) }),
  asyncHandler(async (req, res) => {
    const data = await learningService.getLearningCurriculum(req, req.params.courseId);
    res.json({ success: true, data });
  })
);

router.get(
  '/lessons/:lessonId',
  validateRequest({ params: z.object({ lessonId: objectId }) }),
  asyncHandler(async (req, res) => {
    const lesson = await learningService.getLearningLesson(req, req.params.lessonId);
    res.json({ success: true, data: lesson });
  })
);

router.get(
  '/lessons/:lessonId/video/playback',
  validateRequest({ params: z.object({ lessonId: objectId }) }),
  asyncHandler(async (req, res) => {
    const data = await learningService.getLearningPlayback(req, req.params.lessonId);
    res.json({ success: true, data });
  })
);

// Phase 2 alias
router.post(
  '/lessons/:lessonId/playback-token',
  validateRequest({ params: z.object({ lessonId: objectId }) }),
  lessonController.playbackAuth
);

router.get(
  '/lessons/:lessonId/attachments',
  validateRequest({ params: z.object({ lessonId: objectId }) }),
  asyncHandler(async (req, res) => {
    const attachments = await learningService.listLearningAttachments(
      req,
      req.params.lessonId
    );
    res.json({ success: true, data: { attachments } });
  })
);

router.get(
  '/lessons/:lessonId/attachments/:fileId/download',
  validateRequest({ params: z.object({ lessonId: objectId, fileId: objectId }) }),
  lessonController.downloadAttachment
);

router.get(
  '/resources/:resourceId/download',
  validateRequest({ params: resourceIdParamSchema }),
  resourceController.downloadResource
);

export default router;
