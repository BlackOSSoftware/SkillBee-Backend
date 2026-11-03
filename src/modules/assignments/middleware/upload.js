import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import { getTempRoot } from '../../media/utils/storagePath.js';

const tmpDir = path.join(getTempRoot(), 'assignments');
fs.mkdirSync(tmpDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, tmpDir);
  },
  filename(_req, file, cb) {
    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`
    );
  },
});

export const assignmentUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: Math.floor(env.MAX_DOCUMENT_SIZE_MB * 1024 * 1024),
    files: 5,
  },
});

export function handleAssignmentMulterError(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File too large', 413, 'FILE_TOO_LARGE'));
    }
    return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
  }
  return next(err);
}
