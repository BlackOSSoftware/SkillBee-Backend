import crypto from 'crypto';
import fs from 'fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import {
  buildMediaStorageKey,
  getTempRoot,
  getUploadRoot,
  resolveInsideRoot,
} from '../utils/storagePath.js';
import { createStoredFileName, sanitizeOriginalFileName } from '../utils/safeFilename.js';
import { assertSignatureMatches } from '../utils/fileValidation.js';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureStorageDirs() {
  const root = getUploadRoot();
  await ensureDir(root);
  await ensureDir(path.join(root, 'videos', 'originals'));
  await ensureDir(path.join(root, 'videos', 'hls'));
  await ensureDir(path.join(root, 'videos', 'thumbnails'));
  await ensureDir(path.join(root, 'documents'));
  await ensureDir(path.join(root, 'assignments'));
  await ensureDir(path.join(root, 'temporary'));
  await ensureDir(getTempRoot());
}

export async function assertDiskQuota(requiredBytes = 0) {
  try {
    const root = getUploadRoot();
    await ensureDir(root);
    if (typeof fs.statfs !== 'function') {
      return { checked: false, reason: 'statfs_unavailable' };
    }
    const stats = await fs.statfs(root);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const used = total - available;
    const usagePercent = total > 0 ? (used / total) * 100 : 0;
    if (usagePercent >= env.MAX_STORAGE_USAGE_PERCENT) {
      throw new AppError('Storage quota exceeded', 507, 'STORAGE_QUOTA_EXCEEDED');
    }
    if (requiredBytes > 0 && available < requiredBytes) {
      throw new AppError('Insufficient disk space', 507, 'INSUFFICIENT_DISK');
    }
    return { checked: true, total, used, available, usagePercent };
  } catch (err) {
    if (err instanceof AppError) throw err;
    return { checked: false, reason: err.message };
  }
}

export async function streamToTemporaryFile({
  fileStream,
  originalFileName,
  expectedMimeType,
  maxBytes,
}) {
  await ensureStorageDirs();
  await assertDiskQuota(Math.min(maxBytes, 50 * 1024 * 1024));

  const safeName = sanitizeOriginalFileName(originalFileName);
  const stored = createStoredFileName(safeName);
  const tempKey = path.posix.join('temporary', stored);
  const absolute = resolveInsideRoot(getUploadRoot(), tempKey);
  await ensureDir(path.dirname(absolute));

  let sizeBytes = 0;
  const hash = crypto.createHash('sha256');
  const headChunks = [];
  let headSize = 0;

  const writeStream = createWriteStream(absolute);
  try {
    fileStream.on('data', (chunk) => {
      sizeBytes += chunk.length;
      hash.update(chunk);
      if (headSize < 64) {
        headChunks.push(chunk);
        headSize += chunk.length;
      }
      if (sizeBytes > maxBytes) {
        fileStream.destroy();
        writeStream.destroy();
      }
    });
    await pipeline(fileStream, writeStream);
  } catch (err) {
    await fs.unlink(absolute).catch(() => {});
    if (sizeBytes > maxBytes) throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
    throw err;
  }

  if (sizeBytes > maxBytes) {
    await fs.unlink(absolute).catch(() => {});
    throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
  }
  if (sizeBytes < 1) {
    await fs.unlink(absolute).catch(() => {});
    throw new AppError('Empty upload', 400, 'EMPTY_UPLOAD');
  }

  const head = Buffer.concat(headChunks);
  assertSignatureMatches(head, expectedMimeType);

  return {
    temporaryStorageKey: tempKey,
    sizeBytes,
    checksum: hash.digest('hex'),
    storedFileName: stored,
  };
}

export async function finalizeTemporaryFile({
  temporaryStorageKey,
  mediaType,
  storedFileName,
  storageKind,
}) {
  const kind =
    storageKind ||
    (mediaType === 'video' ? 'video' : mediaType === 'assignment' ? 'assignment' : 'document');
  const finalKey = buildMediaStorageKey(kind, storedFileName);
  const from = resolveInsideRoot(getUploadRoot(), temporaryStorageKey);
  const to = resolveInsideRoot(getUploadRoot(), finalKey);
  await ensureDir(path.dirname(to));
  if (!existsSync(from)) {
    throw new AppError('Temporary upload file missing', 422, 'UPLOAD_FILE_MISSING');
  }
  await fs.rename(from, to);
  return { storageKey: finalKey, absolutePathHidden: true };
}

export async function deleteLocalKey(storageKey) {
  if (!storageKey) return;
  const absolute = resolveInsideRoot(getUploadRoot(), storageKey);
  await fs.unlink(absolute).catch(() => {});
}

export function openLocalReadStream(storageKey) {
  const absolute = resolveInsideRoot(getUploadRoot(), storageKey);
  if (!existsSync(absolute)) {
    throw new AppError('Media file not found', 404, 'MEDIA_FILE_MISSING');
  }
  return {
    stream: createReadStream(absolute),
    absolutePath: absolute,
  };
}

export async function fileExists(storageKey) {
  if (!storageKey) return false;
  try {
    const absolute = resolveInsideRoot(getUploadRoot(), storageKey);
    await fs.access(absolute);
    return true;
  } catch {
    return false;
  }
}

export async function getFileSize(storageKey) {
  const absolute = resolveInsideRoot(getUploadRoot(), storageKey);
  const stat = await fs.stat(absolute);
  return stat.size;
}
