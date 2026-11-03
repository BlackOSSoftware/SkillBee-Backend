import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { publicFormRateLimiter } from '../../../middleware/rateLimiters.js';
import { validateRequest } from '../../../middleware/validate.js';
import { AppError } from '../../../utils/AppError.js';
import * as controller from '../controllers/instructorApplication.controller.js';
import {
  adminListQuery,
  idParam,
  statusBody,
  submitApplicationBody,
} from '../validators/instructorApplication.validator.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function handleResumeMulterError(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('Resume must be 5 MB or smaller', 400, 'RESUME_TOO_LARGE'));
    }
    return next(new AppError(err.message || 'Upload failed', 400, 'RESUME_UPLOAD_ERROR'));
  }
  return next(err);
}

export function mountInstructorApplicationRoutes(app, apiPrefix) {
  const pub = Router();
  pub.post(
    '/',
    publicFormRateLimiter,
    upload.single('resume'),
    handleResumeMulterError,
    validateRequest({ body: submitApplicationBody }),
    controller.submit
  );
  app.use(`${apiPrefix}/public/instructor-applications`, pub);

  const admin = Router();
  admin.use(authenticate, requireAdminAccess());
  admin.get('/', validateRequest({ query: adminListQuery }), controller.list);
  admin.get('/:id', validateRequest({ params: idParam }), controller.getOne);
  admin.patch(
    '/:id/status',
    validateRequest({ params: idParam, body: statusBody }),
    controller.patchStatus
  );
  admin.get(
    '/:id/resume',
    validateRequest({ params: idParam }),
    controller.downloadResume
  );
  admin.delete('/:id', validateRequest({ params: idParam }), controller.remove);
  app.use(`${apiPrefix}/admin/instructor-applications`, admin);
}
