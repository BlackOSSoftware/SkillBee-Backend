import { Router } from 'express';
import { validateRequest } from '../../../middleware/validate.js';
import { certificateVerifyRateLimiter } from '../../../middleware/rateLimiters.js';
import * as ctrl from '../controllers/certificate.controller.js';
import { verifyCodeParams } from '../validators/certificate.validator.js';

const router = Router();

router.get(
  '/:code',
  certificateVerifyRateLimiter,
  validateRequest({ params: verifyCodeParams }),
  ctrl.verify
);

export default router;
