import path from 'path';
import { env } from '../../config/env.js';

export const storageConfig = {
  uploadRoot: path.resolve(env.UPLOAD_ROOT),
  videosDir: 'videos',
  documentsDir: 'documents',
  tmpDir: 'tmp',
  maxVideoBytes: Math.floor(env.MAX_VIDEO_SIZE_MB * 1024 * 1024),
  maxDocumentBytes: Math.floor(env.MAX_DOCUMENT_SIZE_MB * 1024 * 1024),
  allowedVideoMimeTypes: new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
  ]),
  allowedDocumentMimeTypes: new Set([
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
  ]),
  allowedExtensions: new Set([
    '.mp4',
    '.webm',
    '.mov',
    '.avi',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.zip',
  ]),
};
