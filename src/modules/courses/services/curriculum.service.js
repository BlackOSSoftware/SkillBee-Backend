import mongoose from 'mongoose';
import { CourseTopic, normalizeAvailability } from '../../../models/CourseTopic.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { COURSE_STATUS } from '../../../config/security.js';
import { invalidateCurriculumByCourseId } from '../../../services/cache/invalidation.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import {
  assertCanManageCourse,
  assertCanReadCourse,
  getCourseOrThrow,
} from './courseAccess.service.js';
import { ensureUniqueLessonSlug } from './courseSlug.service.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertCourseAcceptsCurriculum(course) {
  if (course.status === COURSE_STATUS.ARCHIVED || course.deletedAt) {
    throw new AppError(
      'Cannot modify curriculum on archived/deleted courses',
      422,
      'COURSE_ARCHIVED'
    );
  }
}

export async function getTopicById(req, topicId) {
  const topic = await CourseTopic.findOne({ _id: topicId, deletedAt: null });
  if (!topic) throw new AppError('Topic not found', 404, 'TOPIC_NOT_FOUND');
  const course = await getCourseOrThrow(topic.courseId);
  assertCanReadCourse(req, course);
  return topic.toSafeObject();
}

export async function listTopics(req, courseId, query = {}) {
  const course = await getCourseOrThrow(courseId);
  assertCanReadCourse(req, course);

  const filter = { courseId, deletedAt: null };
  if (query.status) {
    if (query.status === 'published') filter.status = { $in: ['published', 'active'] };
    else if (query.status === 'archived') filter.status = { $in: ['archived', 'inactive'] };
    else filter.status = query.status;
  }
  if (query.search) {
    filter.title = new RegExp(escapeRegex(query.search), 'i');
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 100, 100);
  const skip = getSkip({ page, limit });

  const [rows, total] = await Promise.all([
    CourseTopic.find(filter).sort({ sortOrder: 1 }).skip(skip).limit(limit),
    CourseTopic.countDocuments(filter),
  ]);

  const topics = [];
  for (const topic of rows) {
    const obj = topic.toSafeObject();
    if (query.includeLessons === true || query.includeLessons === 'true') {
      const lessons = await CourseLesson.find({
        topicId: topic._id,
        deletedAt: null,
      }).sort({ sortOrder: 1 });
      obj.lessons = lessons.map((l) =>
        l.toAdminObject({ includeStorageKey: false })
      );
    }
    topics.push(obj);
  }

  return {
    topics,
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function createTopic(req, courseId, input) {
  const course = await getCourseOrThrow(courseId);
  await assertCanManageCourse(req, course);
  await assertCourseAcceptsCurriculum(course);

  if (input.availabilityType === 'scheduled' && !input.availableAt) {
    throw new AppError('availableAt is required for scheduled topics', 400, 'VALIDATION_ERROR');
  }

  let sortOrder = input.sortOrder;
  if (sortOrder == null) {
    const last = await CourseTopic.findOne({ courseId, deletedAt: null })
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  const topic = await CourseTopic.create({
    courseId,
    title: input.title,
    description: input.description || '',
    sortOrder,
    availabilityType: normalizeAvailability(input.availabilityType || 'immediate'),
    availableAt: input.availableAt || null,
    status: input.status || 'draft',
    isRequired: input.isRequired !== false,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await invalidateCurriculumByCourseId(courseId);
  return topic.toSafeObject();
}

export async function updateTopic(req, topicId, input, courseId = null) {
  const topic = await CourseTopic.findOne({ _id: topicId, deletedAt: null });
  if (!topic) throw new AppError('Topic not found', 404, 'TOPIC_NOT_FOUND');
  if (courseId && topic.courseId.toString() !== courseId) {
    throw new AppError('Topic does not belong to this course', 404, 'TOPIC_NOT_FOUND');
  }

  const course = await getCourseOrThrow(topic.courseId);
  await assertCanManageCourse(req, course);
  await assertCourseAcceptsCurriculum(course);

  if (input.availabilityType === 'scheduled' && !(input.availableAt || topic.availableAt)) {
    throw new AppError('availableAt is required for scheduled topics', 400, 'VALIDATION_ERROR');
  }

  if (input.title !== undefined) topic.title = input.title;
  if (input.description !== undefined) topic.description = input.description;
  if (input.sortOrder !== undefined) topic.sortOrder = input.sortOrder;
  if (input.availabilityType !== undefined) {
    topic.availabilityType = normalizeAvailability(input.availabilityType);
  }
  if (input.availableAt !== undefined) topic.availableAt = input.availableAt;
  if (input.status !== undefined) topic.status = input.status;
  if (input.isRequired !== undefined) topic.isRequired = input.isRequired;
  topic.updatedBy = req.user._id;
  await topic.save();
  await invalidateCurriculumByCourseId(topic.courseId);
  return topic.toSafeObject();
}

export async function changeTopicStatus(req, topicId, status) {
  return updateTopic(req, topicId, { status });
}

export async function deleteTopic(req, topicId, courseId = null) {
  const topic = await CourseTopic.findOne({ _id: topicId, deletedAt: null });
  if (!topic) throw new AppError('Topic not found', 404, 'TOPIC_NOT_FOUND');
  if (courseId && topic.courseId.toString() !== courseId) {
    throw new AppError('Topic does not belong to this course', 404, 'TOPIC_NOT_FOUND');
  }

  const course = await getCourseOrThrow(topic.courseId);
  await assertCanManageCourse(req, course);

  const run = async (session = null) => {
    topic.deletedAt = new Date();
    topic.status = 'archived';
    topic.updatedBy = req.user._id;
    await topic.save(session ? { session } : undefined);

    // Soft-archive lessons; preserve IDs for historical references
    await CourseLesson.updateMany(
      { topicId: topic._id, deletedAt: null },
      {
        $set: {
          deletedAt: new Date(),
          status: 'archived',
          updatedBy: req.user._id,
        },
      },
      session ? { session } : undefined
    );

    return topic.toSafeObject();
  };

  if (process.env.NODE_ENV === 'test') {
    const result = await run(null);
    await invalidateCurriculumByCourseId(topic.courseId);
    return result;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await run(session);
    await session.commitTransaction();
    await invalidateCurriculumByCourseId(topic.courseId);
    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Accepts either:
 * { topicIds: [id1, id2, ...] }  (Phase 3)
 * { items: [{ id, sortOrder }] } (Phase 2 compat)
 */
export async function reorderTopics(req, courseId, payload) {
  const course = await getCourseOrThrow(courseId);
  await assertCanManageCourse(req, course);

  let orderedIds;
  if (Array.isArray(payload.topicIds)) {
    orderedIds = payload.topicIds;
  } else if (Array.isArray(payload.items)) {
    orderedIds = [...payload.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => i.id);
  } else {
    throw new AppError('topicIds or items required', 400, 'VALIDATION_ERROR');
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError('Duplicate topic IDs in reorder list', 400, 'DUPLICATE_REORDER_IDS');
  }

  const activeTopics = await CourseTopic.find({ courseId, deletedAt: null }).select('_id');
  const activeIds = new Set(activeTopics.map((t) => t._id.toString()));

  if (orderedIds.length !== activeIds.size) {
    throw new AppError(
      'Reorder list must include every active topic exactly once',
      400,
      'INCOMPLETE_REORDER'
    );
  }
  for (const id of orderedIds) {
    if (!activeIds.has(id)) {
      throw new AppError('One or more topics are invalid for this course', 400, 'INVALID_TOPICS');
    }
  }

  const run = async (session = null) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await CourseTopic.updateOne(
        { _id: orderedIds[i], courseId },
        { $set: { sortOrder: i, updatedBy: req.user._id } },
        session ? { session } : undefined
      );
    }
  };

  if (process.env.NODE_ENV === 'test') {
    await run(null);
  } else {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await run(session);
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  await invalidateCurriculumByCourseId(courseId);
  const result = await listTopics(req, courseId, { limit: 100 });
  return result.topics;
}

export async function duplicateTopic(req, topicId) {
  const source = await CourseTopic.findOne({ _id: topicId, deletedAt: null });
  if (!source) throw new AppError('Topic not found', 404, 'TOPIC_NOT_FOUND');
  const course = await getCourseOrThrow(source.courseId);
  await assertCanManageCourse(req, course);
  await assertCourseAcceptsCurriculum(course);

  const last = await CourseTopic.findOne({ courseId: source.courseId, deletedAt: null })
    .sort({ sortOrder: -1 })
    .select('sortOrder');

  const topic = await CourseTopic.create({
    courseId: source.courseId,
    title: `${source.title} (Copy)`,
    description: source.description,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    availabilityType: normalizeAvailability(source.availabilityType),
    availableAt: source.availableAt,
    status: 'draft',
    isRequired: source.isRequired,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  const lessons = await CourseLesson.find({ topicId: source._id, deletedAt: null }).sort({
    sortOrder: 1,
  });

  for (const lesson of lessons) {
    const slug = await ensureUniqueLessonSlug(course._id, `${lesson.slug}-copy`);
    await CourseLesson.create({
      courseId: course._id,
      topicId: topic._id,
      title: `${lesson.title} (Copy)`,
      slug,
      description: lesson.description,
      type: lesson.type,
      content: lesson.content,
      durationSeconds: lesson.durationSeconds,
      isPreview: lesson.isPreview,
      isRequired: lesson.isRequired,
      sortOrder: lesson.sortOrder,
      scheduledAt: null,
      status: 'draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
  }

  return topic.toSafeObject();
}
