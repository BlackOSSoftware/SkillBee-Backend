import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { MediaAsset } from '../../../models/MediaAsset.js';
import { AppError } from '../../../utils/AppError.js';
import {
  assertDiskQuota,
  ensureStorageDirs,
} from '../../media/services/localStorage.service.js';
import {
  assertSignatureMatches,
  detectMimeFromBuffer,
  DOCUMENT_EXT,
  DOCUMENT_MIME,
} from '../../media/utils/fileValidation.js';
import { createStoredFileName, sanitizeOriginalFileName } from '../../media/utils/safeFilename.js';
import {
  buildMediaStorageKey,
  getUploadRoot,
  resolveInsideRoot,
} from '../../media/utils/storagePath.js';

const EXT_TO_MIME = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};

export function normalizeAllowedExt(list = []) {
  return list.map((e) => {
    const s = String(e).toLowerCase().trim();
    return s.startsWith('.') ? s : `.${s}`;
  });
}

export function validateAssignmentFileMeta({ originalFileName, mimeType, sizeBytes, assignment }) {
  const ext = path.extname(originalFileName || '').toLowerCase();
  const allowed = normalizeAllowedExt(assignment.allowedFileTypes || []);
  if (!allowed.includes(ext)) {
    throw new AppError('File extension not allowed for this assignment', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (!DOCUMENT_EXT.has(ext)) {
    throw new AppError('Unsupported file extension', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (mimeType && !DOCUMENT_MIME.has(mimeType)) {
    // allow if extension maps and client mime is wrong but we'll verify signature
    const expected = EXT_TO_MIME[ext];
    if (expected && mimeType !== expected && mimeType !== 'application/octet-stream') {
      throw new AppError('Unsupported MIME type', 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
  }
  const max = assignment.maximumFileSizeBytes || 10 * 1024 * 1024;
  if (!sizeBytes || sizeBytes < 1) {
    throw new AppError('Empty upload', 400, 'EMPTY_UPLOAD');
  }
  if (sizeBytes > max) {
    throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
  }
  return { ext, maxBytes: max, expectedMime: EXT_TO_MIME[ext] || mimeType };
}

/**
 * Persist multer temp file into assignments/ storage and create MediaAsset.
 */
export async function storeAssignmentAttachment({
  tempPath,
  originalFileName,
  declaredMime,
  assignment,
  studentId,
}) {
  if (!tempPath || !existsSync(tempPath)) {
    throw new AppError('Upload file missing', 400, 'UPLOAD_FILE_MISSING');
  }

  const stat = await fs.stat(tempPath);
  const { ext, maxBytes, expectedMime } = validateAssignmentFileMeta({
    originalFileName,
    mimeType: declaredMime,
    sizeBytes: stat.size,
    assignment,
  });

  await ensureStorageDirs();
  await assertDiskQuota(stat.size);

  const head = Buffer.alloc(64);
  const fd = await fs.open(tempPath, 'r');
  try {
    await fd.read(head, 0, 64, 0);
  } finally {
    await fd.close();
  }
  const expected = expectedMime || declaredMime;
  const detected = detectMimeFromBuffer(head);
  // Assignments require a detectable signature for binary types (PDF/ZIP/Office)
  if (ext === '.pdf') {
    if (detected !== 'application/pdf') {
      throw new AppError(
        'File signature does not match declared type',
        415,
        'INVALID_FILE_SIGNATURE'
      );
    }
  } else if (ext === '.zip' || ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
    if (detected && detected !== 'application/zip' && detected !== expected) {
      throw new AppError(
        'File signature does not match declared type',
        415,
        'INVALID_FILE_SIGNATURE'
      );
    }
  } else {
    assertSignatureMatches(head, expected);
  }

  const safeName = sanitizeOriginalFileName(originalFileName);
  const stored = createStoredFileName(safeName.endsWith(ext) ? safeName : `${safeName}${ext}`);
  const storageKey = buildMediaStorageKey('assignment', stored);
  const dest = resolveInsideRoot(getUploadRoot(), storageKey);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const rs = createReadStream(tempPath);
    const ws = createWriteStream(dest);
    rs.on('data', (chunk) => hash.update(chunk));
    pipeline(rs, ws).then(resolve).catch(reject);
  });

  // Remove multer temp
  await fs.unlink(tempPath).catch(() => {});

  if (stat.size > maxBytes) {
    await fs.unlink(dest).catch(() => {});
    throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
  }

  const asset = await MediaAsset.create({
    title: safeName,
    originalFileName: safeName,
    storedFileName: stored,
    mediaType: 'document',
    category: 'assignment_submission',
    storageProvider: 'local',
    storageKey,
    mimeType: expectedMime || declaredMime || 'application/octet-stream',
    extension: ext.replace('.', ''),
    sizeBytes: stat.size,
    checksum: hash.digest('hex'),
    processingStatus: 'ready',
    visibility: 'private',
    downloadAllowed: true,
    ownerId: studentId,
    courseId: assignment.courseId,
    lessonId: assignment.lessonId || null,
    uploadedBy: studentId,
  });

  return {
    mediaAssetId: asset._id,
    originalFileName: safeName,
    storedFileName: stored,
    mimeType: asset.mimeType,
    extension: asset.extension,
    sizeBytes: asset.sizeBytes,
    checksum: asset.checksum,
    storageKey,
  };
}

export function openAssignmentAttachmentStream(storageKey) {
  const absolute = resolveInsideRoot(getUploadRoot(), storageKey);
  if (!existsSync(absolute)) {
    throw new AppError('Attachment file not found', 404, 'ATTACHMENT_MISSING');
  }
  return {
    stream: createReadStream(absolute),
    // absolute path never returned to clients
  };
}
