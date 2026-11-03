import fs from 'fs';
import { createReadStream } from 'fs';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as mediaService from '../services/media.service.js';
import { initiateUpload } from '../services/uploadSession.service.js';
import { AppError } from '../../../utils/AppError.js';

export const listMedia = asyncHandler(async (req, res) => {
  const result = await mediaService.listMedia(req, req.query);
  res.json({
    success: true,
    data: { media: result.media },
    pagination: result.pagination,
  });
});

export const getCategories = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: { categories: mediaService.getMediaCategoriesCatalog() },
  });
});

export const getStorage = asyncHandler(async (_req, res) => {
  const data = await mediaService.getStorageStatistics();
  res.json({ success: true, data });
});

export const createUploadUrl = asyncHandler(async (req, res) => {
  const data = await initiateUpload(req, req.body);
  res.status(201).json({ success: true, data });
});

/** Multipart direct upload → real Cloudinary asset (view-only) */
export const directUploadImage = asyncHandler(async (req, res) => {
  try {
    const meta = typeof req.body.meta === 'string' ? JSON.parse(req.body.meta) : req.body;
    const media = await mediaService.directUploadImage(req, meta, req.file);
    res.status(201).json({
      success: true,
      message: 'Image uploaded to Cloudinary',
      data: { media },
    });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

export const uploadContent = asyncHandler(async (req, res) => {
  const token =
    req.headers['x-upload-token'] ||
    (req.headers.authorization?.startsWith('Upload ')
      ? req.headers.authorization.slice(7)
      : null) ||
    req.query.uploadToken;

  let stream;
  if (req.file?.path) {
    stream = createReadStream(req.file.path);
  } else if (req.readable && !req.readableEnded) {
    stream = req;
  } else {
    throw new AppError('Upload body required', 400, 'UPLOAD_REQUIRED');
  }

  try {
    const session = await mediaService.receiveLocalUpload(
      req,
      req.params.uploadId,
      stream,
      token
    );
    res.json({ success: true, message: 'Upload received', data: session });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

export const confirmUpload = asyncHandler(async (req, res) => {
  const asset = await mediaService.confirmUpload(req, req.body);
  res.status(201).json({
    success: true,
    message: 'Upload confirmed',
    data: { media: asset },
  });
});

export const getMedia = asyncHandler(async (req, res) => {
  const media = await mediaService.getMediaById(req, req.params.id);
  res.json({ success: true, data: { media } });
});

export const updateMedia = asyncHandler(async (req, res) => {
  const media = await mediaService.updateMediaMetadata(req, req.params.id, req.body);
  res.json({ success: true, message: 'Media updated', data: { media } });
});

export const deleteMedia = asyncHandler(async (req, res) => {
  const media = await mediaService.deleteMedia(req, req.params.id);
  res.json({ success: true, message: 'Media deleted', data: { media } });
});

export const restoreMedia = asyncHandler(async (req, res) => {
  const media = await mediaService.restoreMedia(req, req.params.id);
  res.json({ success: true, message: 'Media restored', data: { media } });
});

export const getReferences = asyncHandler(async (req, res) => {
  const { MediaAsset } = await import('../../../models/MediaAsset.js');
  const asset = await MediaAsset.findById(req.params.id);
  if (!asset) {
    throw new AppError('Media not found', 404, 'MEDIA_NOT_FOUND');
  }
  await mediaService.getMediaById(req, req.params.id, {
    includeDeleted: Boolean(asset.deletedAt),
  });
  const references = await mediaService.findReferences(asset);
  res.json({
    success: true,
    data: { mediaId: asset._id.toString(), references },
  });
});

export const learningPlayback = asyncHandler(async (req, res) => {
  const data = await mediaService.getLearningPlayback(req, req.params.id);
  res.json({ success: true, data });
});

export const learningStream = asyncHandler(async (req, res) => {
  await mediaService.streamMediaView(req, res, req.params.id);
});
