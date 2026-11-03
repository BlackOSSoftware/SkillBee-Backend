import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { storageConfig } from '../../../integrations/storage/storageConfig.js';
import { AppError } from '../../../utils/AppError.js';

const tmpDir = path.join(storageConfig.uploadRoot, storageConfig.tmpDir);
fs.mkdirSync(tmpDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, tmpDir);
  },
  filename(_req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

function fileFilter(kind) {
  return (_req, file, cb) => {
    const allowed =
      kind === 'video'
        ? storageConfig.allowedVideoMimeTypes
        : storageConfig.allowedDocumentMimeTypes;
    if (!allowed.has(file.mimetype)) {
      cb(new AppError('Unsupported media type', 415, 'UNSUPPORTED_MEDIA_TYPE'));
      return;
    }
    cb(null, true);
  };
}

export const videoUpload = multer({
  storage: diskStorage,
  limits: { fileSize: storageConfig.maxVideoBytes },
  fileFilter: fileFilter('video'),
});

export const documentUpload = multer({
  storage: diskStorage,
  limits: { fileSize: storageConfig.maxDocumentBytes },
  fileFilter: fileFilter('document'),
});

export function handleMulterError(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File too large', 413, 'FILE_TOO_LARGE'));
    }
    return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
  }
  return next(err);
}
