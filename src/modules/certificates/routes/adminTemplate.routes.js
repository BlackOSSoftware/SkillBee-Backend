import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/template.controller.js';
import {
  createTemplateBody,
  templateIdParams,
  templateListQuery,
  templateStatusBody,
  updateTemplateBody,
} from '../validators/certificate.validator.js';

const router = Router();
router.use(authenticate, requireAdminAccess());

router.get('/', validateRequest({ query: templateListQuery }), ctrl.list);
router.post('/', validateRequest({ body: createTemplateBody }), ctrl.create);
router.get('/:id', validateRequest({ params: templateIdParams }), ctrl.getOne);
router.patch(
  '/:id',
  validateRequest({ params: templateIdParams, body: updateTemplateBody }),
  ctrl.update
);
router.delete('/:id', validateRequest({ params: templateIdParams }), ctrl.remove);
router.patch(
  '/:id/status',
  validateRequest({ params: templateIdParams, body: templateStatusBody }),
  ctrl.changeStatus
);
router.patch('/:id/default', validateRequest({ params: templateIdParams }), ctrl.setDefault);
router.post('/:id/duplicate', validateRequest({ params: templateIdParams }), ctrl.duplicate);

export default router;
