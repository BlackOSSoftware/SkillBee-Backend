import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';

const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx']);

function matchesSignature(buffer, mime) {
  if (mime === 'application/pdf') {
    return buffer.slice(0, 4).toString('ascii') === '%PDF';
  }
  // DOC/DOCX are OLE or ZIP (PK)
  if (mime === 'application/msword') {
    return buffer[0] === 0xd0 && buffer[1] === 0xcf;
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  return false;
}

export function assertResumeFile(file) {
  if (!file || !file.buffer) {
    throw new AppError('Resume file is required', 400, 'RESUME_REQUIRED');
  }
  if (file.size > RESUME_MAX_BYTES) {
    throw new AppError('Resume must be 5 MB or smaller', 400, 'RESUME_TOO_LARGE');
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new AppError('Resume must be PDF, DOC, or DOCX', 400, 'RESUME_INVALID_TYPE');
  }
  const mime = file.mimetype || '';
  if (!ALLOWED_MIME.has(mime)) {
    throw new AppError('Resume MIME type not allowed', 400, 'RESUME_INVALID_MIME');
  }
  if (!matchesSignature(file.buffer, mime)) {
    throw new AppError('Resume file signature invalid', 400, 'RESUME_INVALID_SIGNATURE');
  }
}

export async function storeResumeFile(file) {
  assertResumeFile(file);
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(env.UPLOAD_ROOT, 'resumes', date);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
  const storedFileName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const absolute = path.join(dir, storedFileName);
  await fs.writeFile(absolute, file.buffer);
  const storagePath = path.join('resumes', date, storedFileName).replace(/\\/g, '/');
  return {
    originalFileName: String(file.originalname || 'resume').slice(0, 255),
    storedFileName,
    storagePath,
    mimeType: file.mimetype,
    fileSize: file.size,
  };
}

export function resolveResumeAbsolutePath(storagePath) {
  const normalized = String(storagePath || '').replace(/\\/g, '/');
  if (!normalized.startsWith('resumes/') || normalized.includes('..')) {
    throw new AppError('Invalid resume path', 400, 'INVALID_RESUME_PATH');
  }
  return path.join(env.UPLOAD_ROOT, ...normalized.split('/'));
}

export async function deleteResumeFile(storagePath) {
  try {
    const abs = resolveResumeAbsolutePath(storagePath);
    await fs.unlink(abs);
  } catch {
    // ignore missing
  }
}
