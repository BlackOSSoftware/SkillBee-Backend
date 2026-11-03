import { createReadStream, existsSync, statSync } from 'fs';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { COURSE_STATUS, USER_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseResource } from '../../../models/CourseResource.js';
import { CourseTopic } from '../../../models/CourseTopic.js';
import { AppError } from '../../../utils/AppError.js';
import { buildAbsolutePath } from '../../../integrations/storage/localStorage.service.js';
import { isPlatformAdmin } from './courseAccess.service.js';
import { getPlaybackAuthorization } from './lesson.service.js';

async function resolveAccess(req, course) {
  if (req.user?.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const isStaff =
    isPlatformAdmin(req.role) ||
    (course.instructorIds || []).some((id) => id.toString() === req.user._id.toString());

  const { learningEnrollmentQuery } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = Boolean(
    await CourseEnrollment.exists(learningEnrollmentQuery(req.user._id, course._id))
  );

  return { isStaff, enrolled };
}

function assertLessonAvailable({ lesson, isStaff, enrolled }) {
  if (!isStaff && lesson.status !== 'published') {
    throw new AppError('Lesson is not available', 404, 'LESSON_NOT_FOUND');
  }

  if (!isStaff && !enrolled && !(lesson.isPreview && lesson.status === 'published')) {
    throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');
  }

  if (lesson.scheduledAt && lesson.scheduledAt > new Date() && !isStaff) {
    throw new AppError('Lesson is scheduled for later release', 403, 'SCHEDULED');
  }
}

export async function getLearningCurriculum(req, courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (course.status === COURSE_STATUS.ARCHIVED && !isPlatformAdmin(req.role)) {
    throw new AppError('Course is archived', 404, 'COURSE_ARCHIVED');
  }

  const { isStaff, enrolled } = await resolveAccess(req, course);
  const now = new Date();

  const topics = await CourseTopic.find({
    courseId: course._id,
    deletedAt: null,
    status: {
      $in: isStaff
        ? ['draft', 'published', 'active', 'archived']
        : ['published', 'active'],
    },
  }).sort({ sortOrder: 1 });

  const result = [];
  for (const topic of topics) {
    const topicLocked =
      !isStaff &&
      topic.availabilityType === 'scheduled' &&
      topic.availableAt &&
      topic.availableAt > now;

    if (topicLocked) {
      result.push({
        id: topic._id.toString(),
        title: topic.title,
        description: topic.description,
        sortOrder: topic.sortOrder,
        locked: true,
        lessons: [],
      });
      continue;
    }

    const lessonFilter = {
      topicId: topic._id,
      deletedAt: null,
    };
    if (!isStaff) {
      lessonFilter.status = 'published';
    }

    const lessons = await CourseLesson.find(lessonFilter).sort({ sortOrder: 1 });
    result.push({
      id: topic._id.toString(),
      title: topic.title,
      description: topic.description,
      sortOrder: topic.sortOrder,
      locked: false,
      lessons: lessons.map((lesson) => lesson.toLearnerObject({ enrolled, isStaff })),
    });
  }

  return {
    course: {
      id: course._id.toString(),
      title: course.title,
      slug: course.slug,
      status: course.status,
    },
    enrolled,
    isStaff,
    topics: result,
  };
}

export async function getLearningLesson(req, lessonId) {
  const lesson = await CourseLesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) throw new AppError('Lesson not found', 404, 'LESSON_NOT_FOUND');

  const course = await Course.findOne({ _id: lesson.courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  const { isStaff, enrolled } = await resolveAccess(req, course);
  assertLessonAvailable({ lesson, isStaff, enrolled });
  return lesson.toLearnerObject({ enrolled, isStaff });
}

export async function listLearningAttachments(req, lessonId) {
  await getLearningLesson(req, lessonId);
  const rows = await CourseResource.find({
    lessonId,
    deletedAt: null,
    status: 'active',
    visibility: { $ne: 'instructor_only' },
  }).sort({ sortOrder: 1 });

  return rows.map((r) => ({
    id: r._id.toString(),
    title: r.title,
    description: r.description,
    resourceType: r.resourceType,
    originalFileName: r.originalFileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    visibility: r.visibility,
  }));
}

export async function getLearningPlayback(req, lessonId) {
  return getPlaybackAuthorization(req, lessonId);
}

/**
 * Stream protected uploaded video with HTTP Range support.
 * Requires ?token=playbackToken from /video/playback.
 */
export async function streamLearningVideo(req, res, lessonId) {
  const token = req.query.token || req.headers['x-playback-token'];
  if (!token) throw new AppError('Playback token required', 401, 'PLAYBACK_TOKEN_REQUIRED');

  let payload;
  try {
    payload = jwt.verify(token, env.PLAYBACK_TOKEN_SECRET);
  } catch {
    throw new AppError('Invalid or expired playback token', 401, 'PLAYBACK_TOKEN_INVALID');
  }

  if (payload.type !== 'playback' || payload.lessonId !== lessonId) {
    throw new AppError('Playback token mismatch', 403, 'PLAYBACK_TOKEN_MISMATCH');
  }

  if (payload.sub !== req.user._id.toString()) {
    throw new AppError('Playback token user mismatch', 403, 'PLAYBACK_TOKEN_MISMATCH');
  }

  const absolutePath = buildAbsolutePath(payload.storageKey);
  if (!existsSync(absolutePath)) {
    throw new AppError('Video file not found', 404, 'VIDEO_FILE_MISSING');
  }

  const stat = statSync(absolutePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = 'video/mp4';

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'private, no-store');

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) throw new AppError('Invalid Range header', 416, 'INVALID_RANGE');
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileSize - 1;
    if (start >= fileSize || end >= fileSize || start > end) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      throw new AppError('Requested range not satisfiable', 416, 'INVALID_RANGE');
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(absolutePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', fileSize);
  createReadStream(absolutePath).pipe(res);
}
