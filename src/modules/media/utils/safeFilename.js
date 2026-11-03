import path from 'path';
import crypto from 'crypto';

export function sanitizeOriginalFileName(name = 'file') {
  const base = path.basename(String(name)).replace(/[^\w.\- ()[\]]+/g, '_');
  return base.slice(0, 180) || 'file';
}

export function createStoredFileName(originalFileName) {
  const ext = path.extname(originalFileName || '').toLowerCase();
  return `${crypto.randomBytes(16).toString('hex')}${ext}`;
}
