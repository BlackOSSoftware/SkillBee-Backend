import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { optionalAuthenticate } from '../../../middleware/optionalAuthenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { publicFormRateLimiter } from '../../../middleware/rateLimiters.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/liveApplication.controller.js';
import {
  adminListQuery,
  idParam,
  remarksBody,
  statusBody,
  submitApplicationBody,
} from '../validators/liveApplication.validator.js';

export function mountLiveApplicationRoutes(app, apiPrefix) {
  // Public application submission — optional auth attaches student ref when logged in.
  const publicApplications = Router();
  publicApplications.post(
    '/',
    publicFormRateLimiter,
    optionalAuthenticate,
    validateRequest({ body: submitApplicationBody }),
    ctrl.submit
  );
  app.use(`${apiPrefix}/live-course-applications`, publicApplications);

  // Student: own applications.
  const studentApplications = Router();
  studentApplications.use(authenticate);
  studentApplications.get('/', ctrl.listMine);
  app.use(`${apiPrefix}/student/live-course-applications`, studentApplications);

  // Admin: review queue.
  const adminApplications = Router();
  adminApplications.use(authenticate, requireAdminAccess());
  adminApplications.get(
    '/',
    validateRequest({ query: adminListQuery }),
    ctrl.listAdmin
  );
  adminApplications.get(
    '/:id',
    validateRequest({ params: idParam }),
    ctrl.getAdmin
  );
  adminApplications.patch(
    '/:id/status',
    validateRequest({ params: idParam, body: statusBody }),
    ctrl.updateStatus
  );
  adminApplications.patch(
    '/:id/remarks',
    validateRequest({ params: idParam, body: remarksBody }),
    ctrl.updateRemarks
  );
  adminApplications.post(
    '/:id/convert',
    validateRequest({ params: idParam }),
    ctrl.convert
  );
  app.use(`${apiPrefix}/admin/live-course-applications`, adminApplications);
}
