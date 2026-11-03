import sanitizeHtml from 'sanitize-html';
import { QUESTION_SENDER_ROLES, QUESTION_STATUS, ROLE_SLUGS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseQuestion } from '../../../models/CourseQuestion.js';
import { QuestionReply } from '../../../models/QuestionReply.js';
import { User } from '../../../models/User.js';
import { sendNotificationEmail } from '../../../services/notifications/email.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { findLearningEnrollment } from '../../enrollment/services/enrollmentAccess.service.js';

function cleanText(value, max) {
  return sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

function mapAttachments(raw = []) {
  return (raw || [])
    .slice(0, 5)
    .map((a) => ({
      mediaAssetId: a.mediaAssetId || null,
      fileName: cleanText(a.fileName || '', 255),
      mimeType: cleanText(a.mimeType || '', 120),
      // Only store http(s) public URLs — never private/signed secrets
      publicUrl: /^https?:\/\//i.test(String(a.publicUrl || ''))
        ? String(a.publicUrl).slice(0, 2000)
        : '',
    }))
    .filter((a) => a.publicUrl || a.mediaAssetId || a.fileName);
}

function senderRoleFromReq(req) {
  const slug = req.role?.slug;
  if (slug === ROLE_SLUGS.SUPER_ADMIN || slug === ROLE_SLUGS.ADMIN) {
    return QUESTION_SENDER_ROLES.ADMIN;
  }
  if (slug === ROLE_SLUGS.INSTRUCTOR) return QUESTION_SENDER_ROLES.INSTRUCTOR;
  return QUESTION_SENDER_ROLES.STUDENT;
}

async function assertEnrolled(userId, courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  const enrollment = await findLearningEnrollment(userId, courseId);
  if (!enrollment) {
    throw new AppError('Active enrollment required to ask questions', 403, 'NOT_ENROLLED');
  }
  return { course, enrollment };
}

async function getQuestionOrThrow(id, { includeDeleted = false } = {}) {
  const filter = { _id: id };
  if (!includeDeleted) filter.deletedAt = null;
  const question = await CourseQuestion.findOne(filter);
  if (!question) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');
  return question;
}

async function listReplies(questionId) {
  const rows = await QuestionReply.find({ questionId, deletedAt: null })
    .sort({ createdAt: 1 })
    .lean();
  return rows.map((r) => {
    const reply = QuestionReply.hydrate(r);
    return reply.toSafeObject();
  });
}

export async function createStudentQuestion(req, courseId, input) {
  await assertEnrolled(req.user._id, courseId);

  if (input.lessonId) {
    const lesson = await CourseLesson.findOne({
      _id: input.lessonId,
      courseId,
      deletedAt: null,
    }).select('_id');
    if (!lesson) throw new AppError('Lesson not found for this course', 400, 'INVALID_LESSON');
  }

  const question = await CourseQuestion.create({
    courseId,
    studentId: req.user._id,
    lessonId: input.lessonId || null,
    title: cleanText(input.title, 200),
    description: cleanText(input.description, 5000),
    status: QUESTION_STATUS.OPEN,
    replyCount: 0,
    lastActivityAt: new Date(),
    auditLog: [{ action: 'created', actorId: req.user._id, at: new Date() }],
  });

  return question.toSafeObject();
}

export async function createStudentReply(req, questionId, input) {
  const question = await getQuestionOrThrow(questionId);
  if (question.studentId.toString() !== req.user._id.toString()) {
    throw new AppError('You can only reply to your own questions', 403, 'FORBIDDEN');
  }
  if (question.status === QUESTION_STATUS.RESOLVED) {
    throw new AppError('Cannot reply to a resolved question', 409, 'QUESTION_RESOLVED');
  }
  await assertEnrolled(req.user._id, question.courseId);

  return addReply(req, question, input, QUESTION_SENDER_ROLES.STUDENT);
}

export async function createAdminReply(req, questionId, input) {
  const question = await getQuestionOrThrow(questionId);
  if (question.status === QUESTION_STATUS.RESOLVED) {
    throw new AppError('Cannot reply to a resolved question; reopen first', 409, 'QUESTION_RESOLVED');
  }
  const reply = await addReply(req, question, input, senderRoleFromReq(req));

  // Notify student (idempotent)
  try {
    const student = await User.findById(question.studentId).select('email firstName');
    if (student?.email) {
      await sendNotificationEmail({
        to: student.email,
        subject: `New reply on your question: ${question.title}`,
        template: 'qa_admin_reply',
        idempotencyKey: `qa-reply:${reply.id}:${student.email}`,
        meta: { questionId: question._id.toString(), replyId: reply.id },
      });
    }
  } catch {
    // never fail reply on notification errors
  }

  return reply;
}

async function addReply(req, question, input, senderRole) {
  const message = cleanText(input.message, 5000);
  if (!message) throw new AppError('Message is required', 400, 'INVALID_MESSAGE');

  const payload = {
    questionId: question._id,
    senderId: req.user._id,
    senderRole,
    message,
    attachments: mapAttachments(input.attachments),
    idempotencyKey: input.idempotencyKey || null,
  };

  let reply;
  try {
    reply = await QuestionReply.create(payload);
  } catch (err) {
    if (err?.code === 11000 && input.idempotencyKey) {
      const existing = await QuestionReply.findOne({
        questionId: question._id,
        idempotencyKey: input.idempotencyKey,
        deletedAt: null,
      });
      if (existing) return existing.toSafeObject();
    }
    throw err;
  }

  await CourseQuestion.updateOne(
    { _id: question._id },
    {
      $inc: { replyCount: 1 },
      $set: { lastActivityAt: new Date() },
      $push: {
        auditLog: {
          $each: [
            {
              action: 'reply_added',
              actorId: req.user._id,
              at: new Date(),
              meta: { replyId: reply._id.toString(), senderRole },
            },
          ],
          $slice: -50,
        },
      },
    }
  );

  return reply.toSafeObject();
}

export async function listStudentQuestions(req, query) {
  const filter = { studentId: req.user._id, deletedAt: null };
  if (query.courseId) filter.courseId = query.courseId;
  if (query.status) filter.status = query.status;

  const sort =
    query.sort === 'last_activity' ? { lastActivityAt: -1 } : { createdAt: -1 };
  const skip = getSkip(query);

  const [rows, total] = await Promise.all([
    CourseQuestion.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    CourseQuestion.countDocuments(filter),
  ]);

  return {
    data: rows.map((r) => CourseQuestion.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getStudentQuestion(req, id) {
  const question = await getQuestionOrThrow(id);
  if (question.studentId.toString() !== req.user._id.toString()) {
    throw new AppError('You can only view your own questions', 403, 'FORBIDDEN');
  }
  const replies = await listReplies(question._id);
  return { ...question.toSafeObject(), replies };
}

export async function listAdminQuestions(req, query) {
  const filter = { deletedAt: null };
  if (query.courseId) filter.courseId = query.courseId;
  if (query.status) filter.status = query.status;
  if (query.answered === 'unanswered') filter.replyCount = 0;
  if (query.answered === 'answered') filter.replyCount = { $gt: 0 };
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = query.startDate;
    if (query.endDate) filter.createdAt.$lte = query.endDate;
  }

  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const students = await User.find({
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
    })
      .select('_id')
      .limit(50)
      .lean();
    const ids = students.map((s) => s._id);
    filter.$or = [{ title: rx }, { description: rx }, ...(ids.length ? [{ studentId: { $in: ids } }] : [])];
  }

  const sort =
    query.sort === 'last_activity' ? { lastActivityAt: -1 } : { createdAt: -1 };
  const skip = getSkip(query);

  const [rows, total] = await Promise.all([
    CourseQuestion.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .populate('studentId', 'firstName lastName email')
      .populate('courseId', 'title slug')
      .lean(),
    CourseQuestion.countDocuments(filter),
  ]);

  return {
    data: rows.map((r) => {
      const q = CourseQuestion.hydrate(r).toSafeObject({ includeAdmin: true });
      q.student = r.studentId?.email
        ? {
            id: r.studentId._id.toString(),
            firstName: r.studentId.firstName,
            lastName: r.studentId.lastName,
            email: r.studentId.email,
          }
        : undefined;
      q.course = r.courseId?.title
        ? {
            id: r.courseId._id.toString(),
            title: r.courseId.title,
            slug: r.courseId.slug,
          }
        : undefined;
      return q;
    }),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getAdminQuestion(req, id) {
  const question = await getQuestionOrThrow(id);
  const replies = await listReplies(question._id);
  const student = await User.findById(question.studentId).select('firstName lastName email');
  const course = await Course.findById(question.courseId).select('title slug');
  return {
    ...question.toSafeObject({ includeAdmin: true }),
    student: student
      ? {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
        }
      : null,
    course: course
      ? { id: course._id.toString(), title: course.title, slug: course.slug }
      : null,
    replies,
  };
}

export async function updateQuestionStatus(req, id, status) {
  const question = await getQuestionOrThrow(id);
  const from = question.status;
  if (from === status) return question.toSafeObject({ includeAdmin: true });

  question.status = status;
  if (status === QUESTION_STATUS.RESOLVED) {
    question.resolvedAt = new Date();
    question.resolvedBy = req.user._id;
  } else {
    question.resolvedAt = null;
    question.resolvedBy = null;
  }
  question.lastActivityAt = new Date();
  question.pushAudit('status_changed', req.user._id, { from, to: status });
  await question.save();
  return question.toSafeObject({ includeAdmin: true });
}

export async function deleteQuestion(req, id) {
  const question = await getQuestionOrThrow(id);
  question.deletedAt = new Date();
  question.pushAudit('deleted', req.user._id);
  await question.save();
  // Soft-delete replies to avoid orphan exposure (history preserved)
  await QuestionReply.updateMany(
    { questionId: question._id, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );
  return question.toSafeObject({ includeAdmin: true });
}
