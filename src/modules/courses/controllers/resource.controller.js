import fs from 'fs/promises';
import * as resourceService from '../services/resource.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

function parseMeta(body) {
  if (typeof body.meta === 'string') {
    return JSON.parse(body.meta);
  }
  return body;
}

export const createCourseResource = asyncHandler(async (req, res) => {
  try {
    const meta = parseMeta(req.body);
    const resource = await resourceService.createCourseResource(
      req,
      req.params.courseId,
      meta,
      req.file
    );
    res.status(201).json({ success: true, data: { resource } });
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
  }
});

export const listCourseResources = asyncHandler(async (req, res) => {
  const resources = await resourceService.listCourseResources(req, req.params.courseId);
  res.json({ success: true, data: { resources } });
});

export const createLessonResource = asyncHandler(async (req, res) => {
  try {
    const meta = parseMeta(req.body);
    const resource = await resourceService.createLessonResource(
      req,
      req.params.lessonId,
      meta,
      req.file
    );
    res.status(201).json({ success: true, data: { resource } });
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
  }
});

export const listLessonResources = asyncHandler(async (req, res) => {
  const resources = await resourceService.listLessonResources(req, req.params.lessonId);
  res.json({ success: true, data: { resources } });
});

export const getResource = asyncHandler(async (req, res) => {
  const resource = await resourceService.getResource(req, req.params.resourceId);
  res.json({ success: true, data: { resource } });
});

export const updateResource = asyncHandler(async (req, res) => {
  const resource = await resourceService.updateResource(
    req,
    req.params.resourceId,
    req.body
  );
  res.json({ success: true, data: { resource } });
});

export const deleteResource = asyncHandler(async (req, res) => {
  const resource = await resourceService.deleteResource(req, req.params.resourceId);
  res.json({ success: true, data: { resource } });
});

export const downloadResource = asyncHandler(async (req, res) => {
  const result = await resourceService.downloadResourceForLearner(
    req,
    req.params.resourceId
  );
  if (result.type === 'redirect') {
    return res.json({ success: true, data: { url: result.url } });
  }
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(result.filename)}"`
  );
  result.stream.pipe(res);
});
