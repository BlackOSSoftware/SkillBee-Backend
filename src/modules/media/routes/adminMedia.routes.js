import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAnyPermission, requireCourseStaffAccess } from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import { uploadRateLimiter } from '../../../middleware/rateLimiters.js';
import * as mediaController from '../controllers/media.controller.js';
import {
  confirmUploadSchema,
  initiateUploadSchema,
  listMediaQuerySchema,
  mediaIdParamSchema,
  updateMediaSchema,
  uploadIdParamSchema,
} from '../validators/media.validator.js';
import { handleMediaMulterError, mediaBinaryUpload } from '../middleware/upload.middleware.js';

const router = Router();

router.use(authenticate, requireCourseStaffAccess());

const read = requireAnyPermission(PERMISSIONS.MEDIA_READ, PERMISSIONS.COURSES_MEDIA_UPLOAD);
const upload = requireAnyPermission(PERMISSIONS.MEDIA_UPLOAD, PERMISSIONS.COURSES_MEDIA_UPLOAD);
const update = requireAnyPermission(PERMISSIONS.MEDIA_UPDATE, PERMISSIONS.COURSES_MEDIA_UPLOAD);
const del = requireAnyPermission(PERMISSIONS.MEDIA_DELETE, PERMISSIONS.COURSES_MEDIA_DELETE);
const restore = requireAnyPermission(PERMISSIONS.MEDIA_RESTORE, PERMISSIONS.MEDIA_DELETE);
const storage = requireAnyPermission(PERMISSIONS.MEDIA_STORAGE_READ, PERMISSIONS.MEDIA_READ);
const refs = requireAnyPermission(PERMISSIONS.MEDIA_REFERENCES_READ, PERMISSIONS.MEDIA_READ);

router.get('/', read, validate(listMediaQuerySchema, 'query'), mediaController.listMedia);
router.get('/categories', read, mediaController.getCategories);
router.get('/storage', storage, mediaController.getStorage);

router.post(
  '/upload-url',
  upload,
  uploadRateLimiter,
  validate(initiateUploadSchema),
  mediaController.createUploadUrl
);

// Direct multipart → Cloudinary (file actually appears in Cloudinary Media Library)
router.post(
  '/images',
  upload,
  uploadRateLimiter,
  mediaBinaryUpload.single('file'),
  handleMediaMulterError,
  mediaController.directUploadImage
);

router.put(
  '/uploads/:uploadId/content',
  upload,
  uploadRateLimiter,
  validateRequest({ params: uploadIdParamSchema }),
  mediaBinaryUpload.single('file'),
  handleMediaMulterError,
  mediaController.uploadContent
);

router.post(
  '/confirm',
  upload,
  validate(confirmUploadSchema),
  mediaController.confirmUpload
);

router.get(
  '/:id/references',
  refs,
  validateRequest({ params: mediaIdParamSchema }),
  mediaController.getReferences
);

router.post(
  '/:id/restore',
  restore,
  validateRequest({ params: mediaIdParamSchema }),
  mediaController.restoreMedia
);

router.get(
  '/:id',
  read,
  validateRequest({ params: mediaIdParamSchema }),
  mediaController.getMedia
);

router.patch(
  '/:id',
  update,
  validateRequest({ params: mediaIdParamSchema, body: updateMediaSchema }),
  mediaController.updateMedia
);

router.delete(
  '/:id',
  del,
  validateRequest({ params: mediaIdParamSchema }),
  mediaController.deleteMedia
);

export default router;
