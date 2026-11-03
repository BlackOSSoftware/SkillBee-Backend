import path from 'path';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';

export function getUploadRoot() {
  return path.resolve(env.UPLOAD_ROOT);
}

export function getTempRoot() {
  return path.resolve(env.TEMP_UPLOAD_ROOT || path.join(env.UPLOAD_ROOT, 'temporary'));
}

export function assertSafeRelativeKey(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  }
  if (storageKey.includes('..') || path.isAbsolute(storageKey) || storageKey.includes('\0')) {
    throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  }
  return storageKey.replace(/\\/g, '/');
}

export function resolveInsideRoot(root, storageKey) {
  const safeKey = assertSafeRelativeKey(storageKey);
  const absolute = path.resolve(root, safeKey);
  const normalizedRoot = path.resolve(root);
  if (!absolute.startsWith(normalizedRoot + path.sep) && absolute !== normalizedRoot) {
    throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  }
  return absolute;
}

export function buildMediaStorageKey(kind, storedFileName) {
  const date = new Date().toISOString().slice(0, 10);
  if (kind === 'video') return path.posix.join('videos', 'originals', date, storedFileName);
  if (kind === 'document') return path.posix.join('documents', date, storedFileName);
  if (kind === 'assignment') return path.posix.join('assignments', date, storedFileName);
  return path.posix.join('temporary', date, storedFileName);
}
