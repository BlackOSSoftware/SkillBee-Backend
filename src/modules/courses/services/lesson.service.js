import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { COURSE_STATUS, VIDEO_PROCESSING_STATUS } from '../../../config/security.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseResource } from '../../../models/CourseResource.js';
import { CourseTopic } from '../../../models/CourseTopic.js';
import { invalidateCurriculumByCourseId } from '../../../services/cache/invalidation.service.js';
import { AppError } from '../../../utils/AppError.js';
import { sanitizeRichText } from '../../../utils/sanitizeHtml.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import {
  assertCanManageCourse,
  assertCanReadCourse,
  getCourseOrThrow,
  isPlatformAdmin,
} from './courseAccess.service.js';
import { removeStoredMedia, storeLessonVideo } from './courseMedia.service.js';
import { ensureUniqueLessonSlug } from './courseSlug.service.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getTopicOrThrow(topicId) {
  const topic = await CourseTopic.findOne({ _id: topicId, deletedAt: null });
  if (!topic) throw new AppError('Topic not found', 404, 'TOPIC_NOT_FOUND');
  return topic;
}

function buildTextContent(input) {
  if (!input) return { body: '', format: 'html' };
  if (input.textContent?.body != null) {
    return {
      body: sanitizeRichText(input.textContent.body),
      format: input.textContent.format || 'html',
    };
  }
  if (typeof input.content?.textContent === 'string') {
    return { body: sanitizeRichText(input.content.textContent), format: 'html' };
  }
  if (input.content?.textContent?.body != null) {
    return {
      body: sanitizeRichText(input.content.textContent.body),
      format: input.content.textContent.format || 'html',
    };
  }
  return { body: '', format: 'html' };
}

function buildLiveSession(input) {
  return (
    input.liveSession ||
    input.content?.liveSession ||
    null
  );
}

function buildResourceContent(input) {
  return (
    input.resourceContent ||
    input.content?.resourceContent ||
    null
  );
}

function buildExternalVideo(input) {
  const video = input.video || input.content?.video;
  if (!video?.externalUrl) return null;
  return {
    source: 'external',
    provider: video.provider || 'other',
    externalUrl: video.externalUrl,
    storageProvider: 'local',
    storageKey: null,
    processingStatus: VIDEO_PROCESSING_STATUS.READY,
    uploadedAt: null,
  };
}

export async function assertLessonPublishReady(lesson) {
  if (lesson.type === 'video') {
    const video = lesson.content?.video;
    if (!video) {
      throw new AppError('Video lesson requires video source', 422, 'PUBLISH_VALIDATION');
    }
    if (video.source === 'uploaded') {
      if (!video.storageKey) {
        throw new AppError('Uploaded video file is missing', 422, 'PUBLISH_VALIDATION');
      }
      if (video.processingStatus !== VIDEO_PROCESSING_STATUS.READY) {
        throw new AppError(
          `Video processing status must be ready (current: ${video.processingStatus})`,
          422,
          'VIDEO_NOT_READY'
        );
      }
    } else if (video.source === 'external') {
      if (!video.externalUrl) {
        throw new AppError('External video URL is required', 422, 'PUBLISH_VALIDATION');
      }
    }
  }

  if (lesson.type === 'text') {
    const body =
      typeof lesson.content?.textContent === 'string'
        ? lesson.content.textContent
        : lesson.content?.textContent?.body;
    if (!body || !String(body).replace(/<[^>]+>/g, '').trim()) {
      throw new AppError('Text lesson requires non-empty content', 422, 'PUBLISH_VALIDATION');
    }
  }

  if (lesson.type === 'live') {
    const live = lesson.content?.liveSession;
    if (!live?.meetingUrl || !live?.startsAt || !live?.endsAt) {
      throw new AppError('Live lesson requires meeting URL and schedule', 422, 'PUBLISH_VALIDATION');
    }
    if (new Date(live.startsAt) >= new Date(live.endsAt)) {
      throw new AppError('Live session endsAt must be after startsAt', 422, 'PUBLISH_VALIDATION');
    }
  }

  if (lesson.type === 'resource') {
    const ids = lesson.content?.resourceContent?.resourceIds || [];
    if (!ids.length) {
      throw new AppError('Resource lesson requires at least one resource', 422, 'PUBLISH_VALIDATION');
    }
    const count = await CourseResource.countDocuments({
      _id: { $in: ids },
      courseId: lesson.courseId,
      deletedAt: null,
      status: { $in: ['active'] },
    });
    if (count !== ids.length) {
      throw new AppError('Resource lesson references are invalid', 422, 'PUBLISH_VALIDATION');
    }
  }
}

export async function listLessonsByTopic(req, topicId, query = {}) {
  const topic = await getTopicOrThrow(topicId);
  const course = await getCourseOrThrow(topic.courseId);
  assertCanReadCourse(req, course);

  const filter = { topicId, deletedAt: null };
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.isPreview !== undefined) {
    filter.isPreview = query.isPreview === true || query.isPreview === 'true';
  }
  if (query.search) filter.title = new RegExp(escapeRegex(query.search), 'i');
  if (query.scheduledAt) filter.scheduledAt = { $gte: new Date(query.scheduledAt) };

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 100, 100);
  const skip = getSkip({ page, limit });

  const [rows, total] = await Promise.all([
    CourseLesson.find(filter).sort({ sortOrder: 1 }).skip(skip).limit(limit),
    CourseLesson.countDocuments(filter),
  ]);

  return {
    lessons: rows.map((l) => l.toAdminObject()),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function getLessonById(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  assertCanReadCourse(req, course);
  return lesson.toAdminObject();
}

export async function createLesson(req, topicId, input) {
  const topic = await getTopicOrThrow(topicId);
  const course = await getCourseOrThrow(topic.courseId);
  await assertCanManageCourse(req, course);

  if (course.status === COURSE_STATUS.ARCHIVED || course.deletedAt) {
    throw new AppError('Cannot add lessons to archived courses', 422, 'COURSE_ARCHIVED');
  }

  const slug = await ensureUniqueLessonSlug(course._id, input.slug || input.title);
  let sortOrder = input.sortOrder;
  if (sortOrder == null) {
    const last = await CourseLesson.findOne({ topicId, deletedAt: null })
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  const lesson = await CourseLesson.create({
    courseId: course._id,
    topicId,
    title: input.title,
    slug,
    description: sanitizeRichText(input.description || ''),
    type: input.type,
    content: {
      textContent: buildTextContent(input),
      liveSession: buildLiveSession(input),
      resourceContent: buildResourceContent(input),
      video: buildExternalVideo(input),
    },
    durationSeconds: input.durationSeconds || 0,
    isPreview: Boolean(input.isPreview),
    isRequired: input.isRequired !== false,
    sortOrder,
    scheduledAt: input.scheduledAt || null,
    status: input.status === 'published' ? 'draft' : input.status || 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await invalidateCurriculumByCourseId(course._id);

  return {
    message: 'Lesson created successfully',
    lesson: lesson.toAdminObject(),
  };
}

export async function updateLesson(req, lessonId, input) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  if (input.title !== undefined) lesson.title = input.title;
  if (input.slug !== undefined) {
    lesson.slug = await ensureUniqueLessonSlug(course._id, input.slug, lesson._id);
  }
  if (input.description !== undefined) lesson.description = sanitizeRichText(input.description);
  if (input.type !== undefined) lesson.type = input.type;

  const nextContent = {
    textContent: lesson.content?.textContent,
    liveSession: lesson.content?.liveSession,
    resourceContent: lesson.content?.resourceContent,
    video: lesson.content?.video,
  };

  if (input.textContent || input.content?.textContent !== undefined) {
    nextContent.textContent = buildTextContent(input);
  }
  if (input.liveSession || input.content?.liveSession !== undefined) {
    nextContent.liveSession = buildLiveSession(input);
  }
  if (input.resourceContent || input.content?.resourceContent !== undefined) {
    nextContent.resourceContent = buildResourceContent(input);
  }
  if (input.video?.externalUrl || input.content?.video?.externalUrl) {
    nextContent.video = buildExternalVideo(input) || nextContent.video;
  }
  lesson.content = nextContent;

  if (input.durationSeconds !== undefined) lesson.durationSeconds = input.durationSeconds;
  if (input.isPreview !== undefined) lesson.isPreview = input.isPreview;
  if (input.isRequired !== undefined) lesson.isRequired = input.isRequired;
  if (input.sortOrder !== undefined) lesson.sortOrder = input.sortOrder;
  if (input.scheduledAt !== undefined) lesson.scheduledAt = input.scheduledAt;
  if (input.status !== undefined && input.status !== 'published') {
    lesson.status = input.status;
  }
  lesson.updatedBy = req.user._id;
  await lesson.save();
  await invalidateCurriculumByCourseId(lesson.courseId);
  return lesson.toAdminObject();
}

export async function changeLessonStatus(req, lessonId, status) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  const topic = await getTopicOrThrow(lesson.topicId);
  if (status === 'published') {
    if (['archived', 'inactive'].includes(topic.status) || topic.deletedAt) {
      throw new AppError('Cannot publish lesson under archived topic', 422, 'TOPIC_ARCHIVED');
    }
    if (course.status === COURSE_STATUS.ARCHIVED) {
      throw new AppError('Cannot publish lesson under archived course', 422, 'COURSE_ARCHIVED');
    }
    await assertLessonPublishReady(lesson);
  }

  lesson.status = status;
  lesson.updatedBy = req.user._id;
  await lesson.save();
  await invalidateCurriculumByCourseId(lesson.courseId);
  return lesson.toAdminObject();
}

export async function deleteLesson(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  // Soft archive — preserve ID for historical progress references
  lesson.deletedAt = new Date();
  lesson.status = 'archived';
  lesson.updatedBy = req.user._id;
  await lesson.save();
  await invalidateCurriculumByCourseId(lesson.courseId);
  return lesson.toAdminObject();
}

export async function reorderLessons(req, topicId, payload) {
  const topic = await getTopicOrThrow(topicId);
  const course = await getCourseOrThrow(topic.courseId);
  await assertCanManageCourse(req, course);

  let orderedIds;
  if (Array.isArray(payload.lessonIds)) {
    orderedIds = payload.lessonIds;
  } else if (Array.isArray(payload.items)) {
    orderedIds = [...payload.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => i.id);
  } else {
    throw new AppError('lessonIds or items required', 400, 'VALIDATION_ERROR');
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError('Duplicate lesson IDs in reorder list', 400, 'DUPLICATE_REORDER_IDS');
  }

  const active = await CourseLesson.find({ topicId, deletedAt: null }).select('_id');
  const activeIds = new Set(active.map((l) => l._id.toString()));
  if (orderedIds.length !== activeIds.size) {
    throw new AppError(
      'Reorder list must include every active lesson exactly once',
      400,
      'INCOMPLETE_REORDER'
    );
  }
  for (const id of orderedIds) {
    if (!activeIds.has(id)) {
      throw new AppError('One or more lessons are invalid for this topic', 400, 'INVALID_LESSONS');
    }
  }

  await Promise.all(
    orderedIds.map((id, index) =>
      CourseLesson.updateOne(
        { _id: id, topicId },
        { $set: { sortOrder: index, updatedBy: req.user._id } }
      )
    )
  );

  const result = await listLessonsByTopic(req, topicId);
  return result.lessons;
}

export async function moveLesson(req, lessonId, { targetTopicId, targetPosition, sortOrder }) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  const targetTopic = await getTopicOrThrow(targetTopicId);
  if (targetTopic.courseId.toString() !== lesson.courseId.toString()) {
    throw new AppError(
      'Cross-course lesson moves are not supported',
      422,
      'INVALID_MOVE'
    );
  }

  const position = targetPosition ?? sortOrder;
  lesson.topicId = targetTopic._id;
  if (position != null) lesson.sortOrder = position;
  lesson.updatedBy = req.user._id;
  await lesson.save();
  return lesson.toAdminObject();
}

export async function duplicateLesson(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  const slug = await ensureUniqueLessonSlug(course._id, `${lesson.slug}-copy`);
  const copy = await CourseLesson.create({
    courseId: lesson.courseId,
    topicId: lesson.topicId,
    title: `${lesson.title} (Copy)`,
    slug,
    description: lesson.description,
    type: lesson.type,
    content: lesson.content,
    durationSeconds: lesson.durationSeconds,
    isPreview: lesson.isPreview,
    isRequired: lesson.isRequired,
    sortOrder: lesson.sortOrder + 1,
    scheduledAt: null,
    status: 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  return copy.toAdminObject();
}

export async function uploadLessonVideo(req, lessonId, file) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  if (lesson.type !== 'video') {
    throw new AppError('Lesson type must be video', 422, 'INVALID_LESSON_TYPE');
  }

  const previousKey = lesson.content?.video?.storageKey;
  const saved = await storeLessonVideo(file);

  const videoMeta = {
    source: 'uploaded',
    provider: 'local',
    externalUrl: null,
    ...saved,
    uploadedAt: new Date(),
  };

  lesson.content = {
    ...(lesson.content?.toObject?.() || lesson.content || {}),
    video: videoMeta,
  };
  lesson.updatedBy = req.user._id;
  await lesson.save();

  if (previousKey && previousKey !== videoMeta.storageKey) {
    const stillReferenced = await CourseLesson.exists({
      _id: { $ne: lesson._id },
      deletedAt: null,
      'content.video.storageKey': previousKey,
    });
    if (!stillReferenced) {
      await removeStoredMedia(previousKey);
    }
  }

  return lesson.toAdminObject();
}

export async function getUploadStatus(req, lessonId) {
  const lesson = await getLessonById(req, lessonId);
  return {
    lessonId: lesson.id,
    processingStatus: lesson.content?.video?.processingStatus || null,
    source: lesson.content?.video?.source || null,
    availableQualities: lesson.content?.video?.availableQualities || [],
    hasHls: Boolean(lesson.content?.video?.hasHls),
    uploadedAt: lesson.content?.video?.uploadedAt || null,
  };
}

export async function deleteLessonVideo(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');
  const course = await getCourseOrThrow(lesson.courseId);
  await assertCanManageCourse(req, course);

  const key = lesson.content?.video?.storageKey;
  lesson.content = {
    ...(lesson.content?.toObject?.() || lesson.content || {}),
    video: null,
  };
  if (lesson.status === 'published' && lesson.type === 'video') {
    lesson.status = 'draft';
  }
  lesson.updatedBy = req.user._id;
  await lesson.save();

  if (key) {
    const stillReferenced = await CourseLesson.exists({
      deletedAt: null,
      'content.video.storageKey': key,
    });
    if (!stillReferenced) await removeStoredMedia(key);
  }

  return lesson.toAdminObject();
}

export async function getPlaybackAuthorization(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');

  const video = lesson.content?.video;
  if (!video) throw new AppError('Video not available', 404, 'VIDEO_NOT_FOUND');

  if (video.source === 'external') {
    return { type: 'external', externalUrl: video.externalUrl };
  }

  if (!video.storageKey) throw new AppError('Video not available', 404, 'VIDEO_NOT_FOUND');
  if (video.processingStatus !== VIDEO_PROCESSING_STATUS.READY) {
    throw new AppError('Video is still processing', 422, 'VIDEO_NOT_READY');
  }

  const course = await getCourseOrThrow(lesson.courseId);
  const isStaff =
    isPlatformAdmin(req.role) ||
    (course.instructorIds || []).some((id) => id.toString() === req.user._id.toString());

  const { learningEnrollmentQuery } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = await CourseEnrollment.exists(
    learningEnrollmentQuery(req.user._id, lesson.courseId)
  );

  if (!isStaff && !enrolled && !lesson.isPreview) {
    throw new AppError('Enrollment required for playback', 403, 'NOT_ENROLLED');
  }

  if (
    lesson.scheduledAt &&
    lesson.scheduledAt > new Date() &&
    !isStaff &&
    !lesson.isPreview
  ) {
    throw new AppError('Lesson is scheduled for later release', 403, 'SCHEDULED');
  }

  const token = jwt.sign(
    {
      sub: req.user._id.toString(),
      lessonId: lesson._id.toString(),
      storageKey: video.storageKey,
      type: 'playback',
    },
    env.PLAYBACK_TOKEN_SECRET,
    { expiresIn: env.PLAYBACK_TOKEN_EXPIRES_IN }
  );

  return {
    type: 'uploaded',
    playbackToken: token,
    expiresIn: env.PLAYBACK_TOKEN_EXPIRES_IN,
    qualities: video.availableQualities || [],
    processingStatus: video.processingStatus,
  };
}
