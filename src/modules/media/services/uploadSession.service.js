import crypto from 'crypto';
import { env } from '../../../config/env.js';
import { ROLE_SLUGS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { MediaUploadSession } from '../../../models/MediaUploadSession.js';
import { AppError } from '../../../utils/AppError.js';
import { validateUploadRequest } from '../utils/fileValidation.js';
import { sanitizeOriginalFileName } from '../utils/safeFilename.js';
import {
  createCloudinaryPublicIdHint,
  createSignedImageUpload,
  isCloudinaryConfigured,
} from './cloudinary.service.js';
import { assertDiskQuota, ensureStorageDirs } from './localStorage.service.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newUploadId() {
  return crypto.randomBytes(16).toString('hex');
}

async function assertCourseAccess(req, courseId) {
  if (!courseId) return null;
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (req.role?.slug === ROLE_SLUGS.SUPER_ADMIN || req.role?.slug === ROLE_SLUGS.ADMIN) {
    return course;
  }
  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    const ok = (course.instructorIds || []).some((id) => id.toString() === req.user._id.toString());
    if (!ok) throw new AppError('Not assigned to this course', 403, 'FORBIDDEN');
    return course;
  }
  throw new AppError('Forbidden', 403, 'FORBIDDEN');
}

export async function initiateUpload(req, input) {
  const originalFileName = sanitizeOriginalFileName(input.originalFileName);
  validateUploadRequest({
    mediaType: input.mediaType,
    category: input.category,
    originalFileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  await assertCourseAccess(req, input.courseId);
  const uploadId = newUploadId();
  const expiresAt = new Date(Date.now() + env.UPLOAD_SESSION_TTL_MINUTES * 60 * 1000);

  if (input.mediaType === 'image') {
    if (!isCloudinaryConfigured() && env.NODE_ENV !== 'test') {
      throw new AppError('Cloudinary is not configured', 503, 'CLOUDINARY_NOT_CONFIGURED');
    }
    const folder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${input.category}`;
    const publicIdHint = createCloudinaryPublicIdHint(input.category, uploadId);
    const signed =
      env.NODE_ENV === 'test' && !isCloudinaryConfigured()
        ? {
            provider: 'cloudinary',
            uploadUrl: 'https://api.cloudinary.com/v1_1/test/image/upload',
            uploadParameters: {
              api_key: 'test',
              timestamp: Math.round(Date.now() / 1000),
              signature: 'test-signature',
              folder,
              public_id: publicIdHint,
            },
          }
        : createSignedImageUpload({ folder, publicId: publicIdHint });

    await MediaUploadSession.create({
      uploadId,
      mediaType: 'image',
      category: input.category,
      storageProvider: 'cloudinary',
      originalFileName,
      expectedSizeBytes: input.sizeBytes,
      expectedMimeType: input.mimeType,
      ownerId: req.user._id,
      uploadedBy: req.user._id,
      courseId: input.courseId || null,
      lessonId: input.lessonId || null,
      cloudinaryFolder: folder,
      cloudinaryPublicIdHint: publicIdHint,
      expiresAt,
      status: 'initiated',
    });

    return {
      uploadId,
      provider: 'cloudinary',
      uploadUrl: signed.uploadUrl,
      uploadParameters: signed.uploadParameters,
      expiresAt,
      accessMode: 'view_only',
      downloadAllowed: false,
    };
  }

  // video / document → VPS
  await ensureStorageDirs();
  await assertDiskQuota(input.sizeBytes);
  const rawToken = crypto.randomBytes(32).toString('hex');
  await MediaUploadSession.create({
    uploadId,
    mediaType: input.mediaType,
    category: input.category,
    storageProvider: 'local',
    originalFileName,
    expectedSizeBytes: input.sizeBytes,
    expectedMimeType: input.mimeType,
    ownerId: req.user._id,
    uploadedBy: req.user._id,
    courseId: input.courseId || null,
    lessonId: input.lessonId || null,
    uploadTokenHash: hashToken(rawToken),
    expiresAt,
    status: 'initiated',
  });

  return {
    uploadId,
    provider: 'local',
    uploadUrl: `${env.API_PREFIX}/admin/media/uploads/${uploadId}/content`,
    uploadToken: rawToken,
    expiresAt,
    accessMode: input.mediaType === 'document' ? 'protected_download' : 'view_only',
    downloadAllowed: input.mediaType === 'document',
    resumableUpload: false,
  };
}

export async function getOwnedSession(req, uploadId) {
  const session = await MediaUploadSession.findOne({ uploadId });
  if (!session) throw new AppError('Upload session not found', 404, 'UPLOAD_SESSION_NOT_FOUND');
  if (session.expiresAt < new Date() && !['confirmed'].includes(session.status)) {
    session.status = 'expired';
    await session.save();
    throw new AppError('Upload session expired', 410, 'UPLOAD_SESSION_EXPIRED');
  }
  const isAdmin =
    req.role?.slug === ROLE_SLUGS.SUPER_ADMIN || req.role?.slug === ROLE_SLUGS.ADMIN;
  if (!isAdmin && session.uploadedBy.toString() !== req.user._id.toString()) {
    throw new AppError('Upload session belongs to another user', 403, 'FORBIDDEN');
  }
  return session;
}

export function verifyUploadToken(session, token) {
  if (!token) throw new AppError('Upload token required', 401, 'UPLOAD_TOKEN_REQUIRED');
  if (!session.uploadTokenHash) {
    throw new AppError('Upload token not applicable', 400, 'UPLOAD_TOKEN_NA');
  }
  if (session.uploadTokenUsedAt) {
    throw new AppError('Upload token already used', 409, 'UPLOAD_TOKEN_REPLAY');
  }
  const incoming = hashToken(token);
  if (incoming !== session.uploadTokenHash) {
    throw new AppError('Invalid upload token', 401, 'UPLOAD_TOKEN_INVALID');
  }
}

export { hashToken };
