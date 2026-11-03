import path from 'path';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import { MEDIA_CATEGORIES } from '../../../models/MediaAsset.js';

export const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

export const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
]);
export const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi']);

export const DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]);
export const DOCUMENT_EXT = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.zip',
]);

const CATEGORY_MEDIA_TYPE = {
  course_thumbnail: 'image',
  course_gallery: 'image',
  instructor_image: 'image',
  lesson_video: 'video',
  study_material: 'document',
  assignment_submission: 'document',
  other: null,
};

const SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', asciiAt: 8, ascii: 'WEBP' },
  { mime: 'application/pdf', ascii: '%PDF' },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'video/mp4', asciiAt: 4, ascii: 'ftyp' },
];

export function categoryMediaType(category) {
  return CATEGORY_MEDIA_TYPE[category] || null;
}

export function maxBytesForMediaType(mediaType) {
  if (mediaType === 'image') return Math.floor(env.IMAGE_MAX_SIZE_MB * 1024 * 1024);
  if (mediaType === 'video') return Math.floor(env.MAX_VIDEO_SIZE_MB * 1024 * 1024);
  return Math.floor(env.MAX_DOCUMENT_SIZE_MB * 1024 * 1024);
}

export function validateUploadRequest({ mediaType, category, originalFileName, mimeType, sizeBytes }) {
  if (!MEDIA_CATEGORIES.includes(category)) {
    throw new AppError('Invalid media category', 400, 'INVALID_CATEGORY');
  }
  const expected = categoryMediaType(category);
  if (expected && expected !== mediaType) {
    throw new AppError(
      `Category ${category} requires mediaType ${expected}`,
      400,
      'CATEGORY_TYPE_MISMATCH'
    );
  }
  if (mediaType === 'image' && category === 'other') {
    // allowed
  }

  const ext = path.extname(originalFileName || '').toLowerCase();
  let allowedMime;
  let allowedExt;
  if (mediaType === 'image') {
    allowedMime = IMAGE_MIME;
    allowedExt = IMAGE_EXT;
  } else if (mediaType === 'video') {
    allowedMime = VIDEO_MIME;
    allowedExt = VIDEO_EXT;
  } else if (mediaType === 'document') {
    allowedMime = DOCUMENT_MIME;
    allowedExt = DOCUMENT_EXT;
  } else {
    throw new AppError('Invalid media type', 400, 'INVALID_MEDIA_TYPE');
  }

  if (!allowedMime.has(mimeType)) {
    throw new AppError('Unsupported MIME type', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (!allowedExt.has(ext)) {
    throw new AppError('Unsupported file extension', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (ext === '.svg' || mimeType === 'image/svg+xml') {
    throw new AppError('SVG uploads are not allowed', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  const max = maxBytesForMediaType(mediaType);
  if (!sizeBytes || sizeBytes < 1) {
    throw new AppError('sizeBytes is required', 400, 'VALIDATION_ERROR');
  }
  if (sizeBytes > max) {
    throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
  }

  return { ext, maxBytes: max };
}

export function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;
  for (const sig of SIGNATURES) {
    if (sig.bytes) {
      const ok = sig.bytes.every((b, i) => buffer[i] === b);
      if (ok) return sig.mime;
    }
    if (sig.ascii) {
      const at = sig.asciiAt || 0;
      const slice = buffer.slice(at, at + sig.ascii.length).toString('ascii');
      if (slice === sig.ascii) return sig.mime;
    }
  }
  return null;
}

export function assertSignatureMatches(buffer, expectedMime) {
  const detected = detectMimeFromBuffer(buffer);
  if (!detected) return; // soft: some formats hard to sniff
  const family = (mime) => mime.split('/')[0];
  if (family(detected) !== family(expectedMime) && detected !== expectedMime) {
    // allow zip-based office docs
    if (detected === 'application/zip' && expectedMime.includes('openxmlformats')) return;
    if (detected === 'video/mp4' && expectedMime.startsWith('video/')) return;
    throw new AppError('File signature does not match declared type', 415, 'INVALID_FILE_SIGNATURE');
  }
}

export function getMediaCategoriesCatalog() {
  return [
    {
      category: 'course_thumbnail',
      mediaType: 'image',
      storageProvider: 'cloudinary',
      acceptedMimeTypes: [...IMAGE_MIME],
      acceptedExtensions: [...IMAGE_EXT],
      maxSizeMb: env.IMAGE_MAX_SIZE_MB,
      downloadAllowed: false,
      accessMode: 'view_only',
    },
    {
      category: 'course_gallery',
      mediaType: 'image',
      storageProvider: 'cloudinary',
      acceptedMimeTypes: [...IMAGE_MIME],
      acceptedExtensions: [...IMAGE_EXT],
      maxSizeMb: env.IMAGE_MAX_SIZE_MB,
      downloadAllowed: false,
      accessMode: 'view_only',
    },
    {
      category: 'instructor_image',
      mediaType: 'image',
      storageProvider: 'cloudinary',
      acceptedMimeTypes: [...IMAGE_MIME],
      acceptedExtensions: [...IMAGE_EXT],
      maxSizeMb: env.IMAGE_MAX_SIZE_MB,
      downloadAllowed: false,
      accessMode: 'view_only',
    },
    {
      category: 'lesson_video',
      mediaType: 'video',
      storageProvider: 'local',
      acceptedMimeTypes: [...VIDEO_MIME],
      acceptedExtensions: [...VIDEO_EXT],
      maxSizeMb: env.MAX_VIDEO_SIZE_MB,
      downloadAllowed: false,
      accessMode: 'view_only',
      resumableUpload: false,
    },
    {
      category: 'study_material',
      mediaType: 'document',
      storageProvider: 'local',
      acceptedMimeTypes: [...DOCUMENT_MIME],
      acceptedExtensions: [...DOCUMENT_EXT],
      maxSizeMb: env.MAX_DOCUMENT_SIZE_MB,
      downloadAllowed: true,
      accessMode: 'protected_download',
    },
    {
      category: 'other',
      mediaType: 'image|video|document',
      storageProvider: 'depends_on_type',
      acceptedMimeTypes: [...IMAGE_MIME, ...VIDEO_MIME, ...DOCUMENT_MIME],
      notes: 'Images/videos are view-only; documents may download when authorized',
    },
  ];
}
