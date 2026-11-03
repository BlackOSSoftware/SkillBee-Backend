import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/certificate.controller.js';
import { certificateIdParams } from '../validators/certificate.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listStudent);
router.get('/:id', validateRequest({ params: certificateIdParams }), ctrl.getStudent);
router.get(
  '/:id/download',
  validateRequest({ params: certificateIdParams }),
  ctrl.downloadStudent
);

export default router;
