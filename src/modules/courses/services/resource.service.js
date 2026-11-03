import { createReadStream } from 'fs';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseResource } from '../../../models/CourseResource.js';
import { AppError } from '../../../utils/AppError.js';
import { buildAbsolutePath } from '../../../integrations/storage/localStorage.service.js';
import {
  assertCanManageCourse,
  assertCanReadCourse,
  getCourseOrThrow,
} from './courseAccess.service.js';
import { removeStoredMedia, storeDocument } from './courseMedia.service.js';

export async function listCourseResources(req, courseId) {
  const course = await getCourseOrThrow(courseId);
  assertCanReadCourse(req, course);
  const rows = await CourseResource.find({ courseId, deletedAt: null }).sort({ sortOrder: 1 });
  return rows.map((r) => r.toSafeObject());
}

export async function listLessonResources(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  assertCanReadCourse(req, course);
  const rows = await CourseResource.find({
    lessonId,
    deletedAt: null,
  }).sort({ sortOrder: 1 });
  return rows.map((r) => r.toSafeObject());
}

export async function getResource(req, resourceId) {
  const resource = await CourseResource.findOne({ _id: resourceId, deletedAt: null });
  if (!resource) throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');
  const course = await getCourseOrThrow(resource.courseId);
  assertCanReadCourse(req, course);
  return resource.toSafeObject();
}

export async function createCourseResource(req, courseId, meta, file) {
  const course = await getCourseOrThrow(courseId);
  await assertCanManageCourse(req, course);

  let stored = null;
  if (meta.resourceType !== 'external_link') {
    stored = await storeDocument(file);
  }

  const resource = await CourseResource.create({
    courseId,
    topicId: meta.topicId || null,
    lessonId: meta.lessonId || null,
    title: meta.title,
    description: meta.description || '',
    resourceType: meta.resourceType,
    storageProvider: meta.resourceType === 'external_link' ? 'external' : 'local',
    storageKey: stored?.storageKey || null,
    originalFileName: stored?.originalFileName || null,
    mimeType: stored?.mimeType || null,
    sizeBytes: stored?.sizeBytes || 0,
    externalUrl: meta.externalUrl || null,
    sortOrder: meta.sortOrder || 0,
    status: meta.status || 'active',
    createdBy: req.user._id,
  });

  return resource.toSafeObject();
}

export async function createLessonResource(req, lessonId, meta, file) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  return createCourseResource(
    req,
    lesson.courseId,
    { ...meta, lessonId: lesson._id.toString(), topicId: lesson.topicId.toString() },
    file
  );
}

export async function updateResource(req, resourceId, input) {
  const resource = await CourseResource.findOne({ _id: resourceId, deletedAt: null });
  if (!resource) throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');
  const course = await getCourseOrThrow(resource.courseId);
  await assertCanManageCourse(req, course);

  if (input.title !== undefined) resource.title = input.title;
  if (input.description !== undefined) resource.description = input.description;
  if (input.sortOrder !== undefined) resource.sortOrder = input.sortOrder;
  if (input.status !== undefined) resource.status = input.status;
  if (input.externalUrl !== undefined) resource.externalUrl = input.externalUrl;
  await resource.save();
  return resource.toSafeObject();
}

export async function deleteResource(req, resourceId) {
  const resource = await CourseResource.findOne({ _id: resourceId, deletedAt: null });
  if (!resource) throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');
  const course = await getCourseOrThrow(resource.courseId);
  await assertCanManageCourse(req, course);

  resource.deletedAt = new Date();
  resource.status = 'inactive';
  await resource.save();

  if (resource.storageKey) {
    await removeStoredMedia(resource.storageKey);
  }

  return resource.toSafeObject();
}

export async function downloadResourceForLearner(req, resourceId) {
  const resource = await CourseResource.findOne({ _id: resourceId, deletedAt: null });
  if (!resource) throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');

  if (resource.storageProvider === 'external') {
    return { type: 'redirect', url: resource.externalUrl };
  }

  if (!resource.storageKey) {
    throw new AppError('File not available', 404, 'FILE_NOT_FOUND');
  }

  const { learningEnrollmentQuery } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = await CourseEnrollment.exists(
    learningEnrollmentQuery(req.user._id, resource.courseId)
  );

  if (!enrolled) {
    throw new AppError('Enrollment required to download this resource', 403, 'NOT_ENROLLED');
  }

  // Never trust client-supplied storageKey — only the DB record's key
  const absolutePath = buildAbsolutePath(resource.storageKey);
  return {
    type: 'file',
    stream: createReadStream(absolutePath),
    filename: resource.originalFileName || 'resource',
    mimeType: resource.mimeType || 'application/octet-stream',
  };
}
