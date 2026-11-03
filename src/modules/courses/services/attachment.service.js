import crypto from 'crypto';
import { createReadStream } from 'fs';
import path from 'path';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseResource } from '../../../models/CourseResource.js';
import { AppError } from '../../../utils/AppError.js';
import { buildAbsolutePath } from '../../../integrations/storage/localStorage.service.js';
import {
  assertCanManageCourse,
  assertCanReadCourse,
  getCourseOrThrow,
  isPlatformAdmin,
} from './courseAccess.service.js';
import { removeStoredMedia, storeDocument } from './courseMedia.service.js';

function mapMimeToResourceType(mimeType = '') {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (mimeType.includes('zip')) return 'archive';
  if (mimeType.startsWith('text/')) return 'text';
  return 'document';
}

async function getLessonForManage(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);
  return { lesson, course };
}

export async function listLessonAttachments(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  assertCanReadCourse(req, course);

  const rows = await CourseResource.find({
    lessonId,
    deletedAt: null,
    status: { $ne: 'inactive' },
  }).sort({ sortOrder: 1 });
  return rows.map((r) => r.toSafeObject());
}

export async function getLessonAttachment(req, lessonId, fileId) {
  const resource = await CourseResource.findOne({
    _id: fileId,
    lessonId,
    deletedAt: null,
  });
  if (!resource) throw new AppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
  const course = await getCourseOrThrow(resource.courseId);
  assertCanReadCourse(req, course);
  return resource.toSafeObject();
}

export async function createLessonAttachment(req, lessonId, meta, file) {
  const { lesson } = await getLessonForManage(req, lessonId);
  const stored = await storeDocument(file);
  const checksum = crypto
    .createHash('sha256')
    .update(`${stored.storageKey}:${stored.sizeBytes}:${stored.originalFileName}`)
    .digest('hex');

  const resource = await CourseResource.create({
    courseId: lesson.courseId,
    topicId: lesson.topicId,
    lessonId: lesson._id,
    title: meta.title || stored.originalFileName || 'Attachment',
    description: meta.description || '',
    resourceType: meta.resourceType || mapMimeToResourceType(stored.mimeType),
    storageProvider: 'local',
    storageKey: stored.storageKey,
    originalFileName: stored.originalFileName,
    mimeType: stored.mimeType,
    extension: path.extname(stored.originalFileName || '').replace('.', '').toLowerCase(),
    sizeBytes: stored.sizeBytes,
    checksum,
    visibility: meta.visibility || 'enrolled',
    sortOrder: meta.sortOrder || 0,
    status: 'active',
    createdBy: req.user._id,
    uploadedBy: req.user._id,
  });

  // Keep resource lesson linkage for resource-type lessons
  if (lesson.type === 'resource') {
    const ids = lesson.content?.resourceContent?.resourceIds || [];
    ids.push(resource._id);
    lesson.content = {
      ...(lesson.content?.toObject?.() || lesson.content || {}),
      resourceContent: {
        resourceIds: ids,
        instructions: lesson.content?.resourceContent?.instructions || '',
      },
    };
    await lesson.save();
  }

  return resource.toSafeObject();
}

export async function updateLessonAttachment(req, lessonId, fileId, input) {
  await getLessonForManage(req, lessonId);
  const resource = await CourseResource.findOne({
    _id: fileId,
    lessonId,
    deletedAt: null,
  });
  if (!resource) throw new AppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');

  if (input.title !== undefined) resource.title = input.title;
  if (input.description !== undefined) resource.description = input.description;
  if (input.visibility !== undefined) resource.visibility = input.visibility;
  if (input.sortOrder !== undefined) resource.sortOrder = input.sortOrder;
  if (input.status !== undefined) {
    resource.status = input.status === 'archived' ? 'archived' : input.status;
  }
  await resource.save();
  return resource.toSafeObject();
}

export async function deleteLessonAttachment(req, lessonId, fileId) {
  await getLessonForManage(req, lessonId);
  const resource = await CourseResource.findOne({
    _id: fileId,
    lessonId,
    deletedAt: null,
  });
  if (!resource) throw new AppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');

  resource.deletedAt = new Date();
  resource.status = 'archived';
  await resource.save();

  // Only delete file if no other active resources share the key
  if (resource.storageKey) {
    const stillUsed = await CourseResource.exists({
      _id: { $ne: resource._id },
      storageKey: resource.storageKey,
      deletedAt: null,
    });
    if (!stillUsed) await removeStoredMedia(resource.storageKey);
  }

  return resource.toSafeObject();
}

export async function downloadLessonAttachment(req, lessonId, fileId) {
  const resource = await CourseResource.findOne({
    _id: fileId,
    lessonId,
    deletedAt: null,
    status: { $in: ['active'] },
  });
  if (!resource || !resource.storageKey) {
    throw new AppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
  }

  const course = await getCourseOrThrow(resource.courseId);
  const isStaff =
    isPlatformAdmin(req.role) ||
    (course.instructorIds || []).some((id) => id.toString() === req.user._id.toString());

  if (resource.visibility === 'instructor_only' && !isStaff) {
    throw new AppError('Attachment restricted to instructors', 403, 'FORBIDDEN');
  }

  const { learningEnrollmentQuery } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = await CourseEnrollment.exists(
    learningEnrollmentQuery(req.user._id, resource.courseId)
  );

  // Visibility is authoritative; lesson.isPreview does not override enrolled-only files.
  if (!isStaff) {
    if (resource.visibility === 'enrolled' && !enrolled) {
      throw new AppError('Enrollment required to download this attachment', 403, 'NOT_ENROLLED');
    }
    if (resource.visibility === 'preview') {
      // preview attachments allowed for authenticated non-suspended users with lesson access
    } else if (resource.visibility !== 'enrolled') {
      throw new AppError('Attachment restricted', 403, 'FORBIDDEN');
    }
  }

  if (req.user.status === 'suspended') {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const absolutePath = buildAbsolutePath(resource.storageKey);
  return {
    stream: createReadStream(absolutePath),
    filename: resource.originalFileName || 'attachment',
    mimeType: resource.mimeType || 'application/octet-stream',
  };
}
