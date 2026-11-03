import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as mediaController from '../controllers/media.controller.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);

const router = Router();
router.use(authenticate);

router.get(
  '/:id/playback',
  validateRequest({ params: z.object({ id: objectId }) }),
  mediaController.learningPlayback
);

router.get(
  '/:id/stream',
  validateRequest({ params: z.object({ id: objectId }) }),
  mediaController.learningStream
);

export default router;
