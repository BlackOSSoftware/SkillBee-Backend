import { Readable } from 'stream';
import { normalizeCloudinaryInput, uploadImageBuffer } from '../../../integrations/cloudinary/cloudinary.service.js';
import {
  deleteStoredFile,
  saveUploadStream,
} from '../../../integrations/storage/localStorage.service.js';
import { env } from '../../../config/env.js';
import { VIDEO_PROCESSING_STATUS } from '../../../config/security.js';
import { AppError } from '../../../utils/AppError.js';


export function mapThumbnail(input) {
  if (input === null) return null;
  if (input === undefined) return undefined;
  return normalizeCloudinaryInput(input);
}

export function mapGallery(items) {
  if (items === undefined) return undefined;
  return (items || []).map((item) => normalizeCloudinaryInput(item));
}

export async function uploadCourseImageFromBuffer(buffer, options) {
  return uploadImageBuffer(buffer, options);
}

export async function storeLessonVideo(file) {
  if (!file) {
    throw new AppError('Video file is required', 400, 'VIDEO_REQUIRED');
  }

  const stream =
    file.stream ||
    (file.buffer ? Readable.from(file.buffer) : null) ||
    (file.path
      ? (await import('fs')).createReadStream(file.path)
      : null);

  if (!stream) {
    throw new AppError('Invalid upload stream', 400, 'INVALID_UPLOAD');
  }

  const saved = await saveUploadStream({
    fileStream: stream,
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    kind: 'video',
  });

  // Honest statuses only:
  // - HLS enabled → pending until external worker verifies HLS output
  // - HLS disabled → ready for progressive source playback (no fake HLS paths)
  if (env.VIDEO_HLS_ENABLED) {
    return {
      ...saved,
      durationSeconds: 0,
      processingStatus: VIDEO_PROCESSING_STATUS.PENDING,
      hlsMasterPath: null,
      thumbnailPath: null,
      availableQualities: [],
    };
  }

  return {
    ...saved,
    durationSeconds: 0,
    processingStatus: VIDEO_PROCESSING_STATUS.READY,
    hlsMasterPath: null,
    thumbnailPath: null,
    availableQualities: ['source'],
  };
}

export async function storeDocument(file) {
  if (!file) {
    throw new AppError('File is required', 400, 'FILE_REQUIRED');
  }

  const stream =
    file.stream ||
    (file.buffer ? Readable.from(file.buffer) : null) ||
    (file.path
      ? (await import('fs')).createReadStream(file.path)
      : null);

  if (!stream) {
    throw new AppError('Invalid upload stream', 400, 'INVALID_UPLOAD');
  }

  return saveUploadStream({
    fileStream: stream,
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    kind: 'document',
  });
}

export async function removeStoredMedia(storageKey) {
  await deleteStoredFile(storageKey);
}

/**
 * Worker hook: mark HLS ready only after verified playlist exists on disk.
 * Do not call this with fabricated paths.
 */
export function markVideoHlsReady(videoMeta, { hlsMasterPath, qualities = ['720p'] }) {
  if (!hlsMasterPath) {
    throw new AppError('Verified HLS master path is required', 422, 'HLS_REQUIRED');
  }
  return {
    ...videoMeta,
    processingStatus: VIDEO_PROCESSING_STATUS.READY,
    hlsMasterPath,
    availableQualities: qualities,
  };
}
