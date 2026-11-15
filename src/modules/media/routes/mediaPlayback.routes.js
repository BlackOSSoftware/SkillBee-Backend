import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuthenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as mediaController from '../controllers/media.controller.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);

const router = Router();

// Stream is authorized by the signed view token alone — `<video>` cannot send
// the Bearer header, so this route must not require `authenticate`.
// `optionalAuthenticate` still cross-checks the token user when a session exists.
router.get(
  '/:id/stream',
  optionalAuthenticate,
  validateRequest({ params: z.object({ id: objectId }) }),
  mediaController.learningStream
);

router.use(authenticate);

router.get(
  '/:id/playback',
  validateRequest({ params: z.object({ id: objectId }) }),
  mediaController.learningPlayback
);

export default router;
