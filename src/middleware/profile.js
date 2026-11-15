import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { IMAGE_EXT, IMAGE_MIME } from '../modules/media/utils/fileValidation.js';

/**
 * Profile photo upload for PUT /auth/me.
 * Memory storage keeps the avatar small and lets us stream the buffer
 * straight to Cloudinary — no temp files on disk.
 */
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.floor(env.IMAGE_MAX_SIZE_MB * 1024 * 1024),
    files: 1,
  },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!IMAGE_MIME.has(file.mimetype) || !IMAGE_EXT.has(ext)) {
      return cb(
        new AppError(
          'Unsupported image type. Use JPEG, PNG, WebP or AVIF.',
          415,
          'UNSUPPORTED_MEDIA_TYPE'
        )
      );
    }
    cb(null, true);
  },
});

export const profileImageUpload = avatarUpload.single('profileImage');

/**
 * Account fields that must never be writable through the self-service
 * profile endpoint — role, ownership, verification and credentials are
 * managed by dedicated admin/auth workflows only.
 */
const PROTECTED_PROFILE_FIELDS = new Set([
  'id',
  '_id',
  'email',
  'phone',
  'role',
  'roleId',
  'permissions',
  'status',
  'emailVerified',
  'phoneVerified',
  'password',
  'passwordHash',
  'refreshTokens',
  'deletedAt',
  'lastLogin',
  'createdAt',
  'updatedAt',
  // Photo URL is only settable via the uploaded file / removeProfileImage flag.
  'profileImage',
]);

/**
 * Rejects requests that try to modify protected account fields instead of
 * silently ignoring them. Runs after multer (multipart fields live in
 * req.body) and before the zod validator strips unknown keys.
 */
export function rejectProtectedProfileFields(req, _res, next) {
  const offending = Object.keys(req.body ?? {}).filter((key) =>
    PROTECTED_PROFILE_FIELDS.has(key)
  );
  if (offending.length) {
    return next(
      new AppError(
        `Field "${offending[0]}" cannot be updated through this endpoint`,
        400,
        'FIELD_NOT_EDITABLE'
      )
    );
  }
  return next();
}
