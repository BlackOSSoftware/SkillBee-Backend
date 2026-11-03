import fs from 'fs/promises';
import * as lessonService from '../services/lesson.service.js';
import * as attachmentService from '../services/attachment.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

function lessonId(req) {
  return req.params.lessonId || req.params.id;
}

export const listLessons = asyncHandler(async (req, res) => {
  const result = await lessonService.listLessonsByTopic(
    req,
    req.params.topicId,
    req.query
  );
  res.json({
    success: true,
    data: { lessons: result.lessons },
    pagination: result.pagination,
  });
});

export const createLesson = asyncHandler(async (req, res) => {
  const result = await lessonService.createLesson(req, req.params.topicId, req.body);
  res.status(201).json({
    success: true,
    message: result.message,
    data: { lesson: result.lesson },
  });
});

export const getLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.getLessonById(req, lessonId(req));
  res.json({ success: true, data: { lesson } });
});

export const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.updateLesson(req, lessonId(req), req.body);
  res.json({
    success: true,
    message: 'Lesson updated successfully',
    data: { lesson },
  });
});

export const deleteLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.deleteLesson(req, lessonId(req));
  res.json({
    success: true,
    message: 'Lesson archived successfully',
    data: { lesson },
  });
});

export const reorderLessons = asyncHandler(async (req, res) => {
  const lessons = await lessonService.reorderLessons(req, req.params.topicId, req.body);
  res.json({ success: true, message: 'Lessons reordered successfully', data: { lessons } });
});

export const moveLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.moveLesson(req, lessonId(req), req.body);
  res.json({ success: true, message: 'Lesson moved successfully', data: { lesson } });
});

export const duplicateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.duplicateLesson(req, lessonId(req));
  res.status(201).json({
    success: true,
    message: 'Lesson duplicated successfully',
    data: { lesson },
  });
});

export const changeLessonStatus = asyncHandler(async (req, res) => {
  const lesson = await lessonService.changeLessonStatus(
    req,
    lessonId(req),
    req.body.status
  );
  res.json({ success: true, message: 'Lesson status updated', data: { lesson } });
});

export const previewLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.getLessonById(req, lessonId(req));
  res.json({ success: true, data: { lesson } });
});

export const uploadVideo = asyncHandler(async (req, res) => {
  try {
    const lesson = await lessonService.uploadLessonVideo(req, lessonId(req), req.file);
    res.json({
      success: true,
      message: 'Video uploaded successfully',
      data: { lesson },
    });
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
  }
});

export const uploadStatus = asyncHandler(async (req, res) => {
  const status = await lessonService.getUploadStatus(req, lessonId(req));
  res.json({ success: true, data: status });
});

export const deleteVideo = asyncHandler(async (req, res) => {
  const lesson = await lessonService.deleteLessonVideo(req, lessonId(req));
  res.json({
    success: true,
    message: 'Video deleted successfully',
    data: { lesson },
  });
});

export const playbackAuth = asyncHandler(async (req, res) => {
  const auth = await lessonService.getPlaybackAuthorization(req, lessonId(req));
  res.json({ success: true, data: auth });
});

export const createAttachment = asyncHandler(async (req, res) => {
  try {
    const meta = typeof req.body.meta === 'string' ? JSON.parse(req.body.meta) : req.body;
    const attachment = await attachmentService.createLessonAttachment(
      req,
      lessonId(req),
      meta,
      req.file
    );
    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: attachment,
    });
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
  }
});

export const listAttachments = asyncHandler(async (req, res) => {
  const attachments = await attachmentService.listLessonAttachments(req, lessonId(req));
  res.json({ success: true, data: { attachments } });
});

export const getAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.getLessonAttachment(
    req,
    lessonId(req),
    req.params.fileId
  );
  res.json({ success: true, data: attachment });
});

export const updateAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.updateLessonAttachment(
    req,
    lessonId(req),
    req.params.fileId,
    req.body
  );
  res.json({ success: true, data: attachment });
});

export const deleteAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.deleteLessonAttachment(
    req,
    lessonId(req),
    req.params.fileId
  );
  res.json({ success: true, message: 'Attachment archived', data: attachment });
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const result = await attachmentService.downloadLessonAttachment(
    req,
    lessonId(req),
    req.params.fileId
  );
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(result.filename)}"`
  );
  result.stream.pipe(res);
});
