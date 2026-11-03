import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { storageConfig } from './storageConfig.js';
import { AppError } from '../../utils/AppError.js';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function assertSafeRelativeKey(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  }
  if (storageKey.includes('..') || path.isAbsolute(storageKey)) {
    throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  }
  return storageKey.replace(/\\/g, '/');
}

export function buildAbsolutePath(storageKey) {
  const safeKey = assertSafeRelativeKey(storageKey);
  const absolute = path.resolve(storageConfig.uploadRoot, safeKey);
  if (!absolute.startsWith(storageConfig.uploadRoot)) {
    throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  }
  return absolute;
}

export function createUniqueStorageKey(folder, originalFileName) {
  const ext = path.extname(originalFileName || '').toLowerCase();
  if (ext && !storageConfig.allowedExtensions.has(ext)) {
    throw new AppError('Unsupported file extension', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  const id = crypto.randomBytes(16).toString('hex');
  const date = new Date().toISOString().slice(0, 10);
  return path.posix.join(folder, date, `${id}${ext}`);
}

export async function saveUploadStream({
  fileStream,
  originalFileName,
  mimeType,
  kind = 'document',
}) {
  const allowed =
    kind === 'video'
      ? storageConfig.allowedVideoMimeTypes
      : storageConfig.allowedDocumentMimeTypes;
  const maxBytes =
    kind === 'video' ? storageConfig.maxVideoBytes : storageConfig.maxDocumentBytes;

  if (!allowed.has(mimeType)) {
    throw new AppError('Unsupported media type', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  const folder = kind === 'video' ? storageConfig.videosDir : storageConfig.documentsDir;
  await ensureDir(path.join(storageConfig.uploadRoot, folder));
  await ensureDir(path.join(storageConfig.uploadRoot, storageConfig.tmpDir));

  const storageKey = createUniqueStorageKey(folder, originalFileName);
  const absolutePath = buildAbsolutePath(storageKey);
  await ensureDir(path.dirname(absolutePath));

  let sizeBytes = 0;
  const tmpKey = path.posix.join(
    storageConfig.tmpDir,
    `${crypto.randomBytes(12).toString('hex')}${path.extname(originalFileName || '')}`
  );
  const tmpAbsolute = buildAbsolutePath(tmpKey);

  try {
    const writeStream = createWriteStream(tmpAbsolute);
    fileStream.on('data', (chunk) => {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) {
        fileStream.destroy();
        writeStream.destroy();
      }
    });

    await pipeline(fileStream, writeStream);

    if (sizeBytes > maxBytes) {
      await fs.unlink(tmpAbsolute).catch(() => {});
      throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
    }

    await fs.rename(tmpAbsolute, absolutePath);

    return {
      storageProvider: 'local',
      storageKey,
      originalFileName,
      mimeType,
      sizeBytes,
    };
  } catch (err) {
    await fs.unlink(tmpAbsolute).catch(() => {});
    if (err instanceof AppError) throw err;
    if (err.message?.includes('destroyed') || sizeBytes > maxBytes) {
      throw new AppError('File too large', 413, 'FILE_TOO_LARGE');
    }
    throw err;
  }
}

export async function deleteStoredFile(storageKey) {
  if (!storageKey) return;
  const absolute = buildAbsolutePath(storageKey);
  await fs.unlink(absolute).catch(() => {});
}

export async function openStoredFile(storageKey) {
  const absolute = buildAbsolutePath(storageKey);
  const handle = await fs.open(absolute, 'r');
  return {
    stream: handle.createReadStream(),
    absolutePath: absolute,
  };
}
