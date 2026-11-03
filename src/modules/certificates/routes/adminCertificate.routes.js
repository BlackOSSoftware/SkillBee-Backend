import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/certificate.controller.js';
import {
  certificateIdParams,
  certificateListQuery,
  eligibilityParams,
  issueCertificateBody,
  revokeBody,
} from '../validators/certificate.validator.js';

const router = Router();
router.use(authenticate, requireAdminAccess());

router.get('/', validateRequest({ query: certificateListQuery }), ctrl.listAdmin);
router.post('/issue', validateRequest({ body: issueCertificateBody }), ctrl.issue);
router.get('/:id', validateRequest({ params: certificateIdParams }), ctrl.getAdmin);
router.post(
  '/:id/revoke',
  validateRequest({ params: certificateIdParams, body: revokeBody }),
  ctrl.revoke
);
router.post(
  '/:id/regenerate',
  validateRequest({ params: certificateIdParams }),
  ctrl.regenerate
);
router.get(
  '/:id/history',
  validateRequest({ params: certificateIdParams }),
  ctrl.history
);
router.get(
  '/:id/download',
  validateRequest({ params: certificateIdParams }),
  ctrl.downloadAdmin
);

export default router;

export const adminEligibilityRouter = Router({ mergeParams: true });
adminEligibilityRouter.use(authenticate, requireAdminAccess());
adminEligibilityRouter.get(
  '/',
  validateRequest({ params: eligibilityParams }),
  ctrl.eligibility
);
