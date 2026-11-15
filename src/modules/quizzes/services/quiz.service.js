import { COURSE_STATUS, QUIZ_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizQuestion } from '../../../models/QuizQuestion.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { ensureUniqueQuizSlug } from '../utils/slug.js';
import { invalidateQuizMetaCaches } from '../../../services/cache/invalidation.service.js';
import { assertCanManageCourseQuizzes, isPlatformAdmin } from './quizAccess.service.js';
import { recomputeQuizTotalMarks } from './question.service.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listQuizzes(req, query = {}) {
  const filter = { deletedAt: null };
  if (query.courseId) filter.courseId = query.courseId;
  if (query.lessonId) filter.lessonId = query.lessonId;
  if (query.status) filter.status = query.status;
  if (query.createdBy) filter.createdBy = query.createdBy;
  if (query.search) {
    filter.title = new RegExp(escapeRegex(query.search), 'i');
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  if (!isPlatformAdmin(req.role) && req.role?.slug === 'instructor') {
    const courses = await Course.find({
      instructorIds: req.user._id,
      deletedAt: null,
    }).select('_id');
    const ids = courses.map((c) => c._id);
    // Keep the caller's courseId filter but never leave the instructor's scope
    filter.courseId = query.courseId
      ? { $in: ids.filter((id) => id.toString() === String(query.courseId)) }
      : { $in: ids };
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });
  const sortAllow = new Set(['createdAt', 'title', 'status', 'totalMarks']);
  const sortBy = sortAllow.has(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [rows, total] = await Promise.all([
    Quiz.find(filter).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
    Quiz.countDocuments(filter),
  ]);

  return {
    quizzes: rows.map((q) => q.toSafeObject()),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function createQuiz(req, input) {
  await assertCanManageCourseQuizzes(req, input.courseId);
  const course = await Course.findById(input.courseId);
  if (course.status === COURSE_STATUS.ARCHIVED) {
    throw new AppError('Cannot create quiz on archived course', 422, 'COURSE_ARCHIVED');
  }
  if (input.lessonId) {
    const lesson = await CourseLesson.findOne({ _id: input.lessonId, deletedAt: null });
    if (!lesson || lesson.courseId.toString() !== input.courseId) {
      throw new AppError('Lesson does not belong to course', 400, 'INVALID_LESSON');
    }
  }
  if (input.passingPercentage != null && (input.passingPercentage < 0 || input.passingPercentage > 100)) {
    throw new AppError('Invalid passing percentage', 400, 'INVALID_PASSING');
  }
  if (input.timeLimitSeconds != null && input.timeLimitSeconds < 0) {
    throw new AppError('Invalid time limit', 400, 'INVALID_TIMER');
  }
  if (input.negativeMarksPerWrongAnswer != null && input.negativeMarksPerWrongAnswer < 0) {
    throw new AppError('Negative marks cannot be negative', 400, 'INVALID_NEGATIVE');
  }

  const slug = await ensureUniqueQuizSlug(Quiz, input.courseId, input.slug || input.title);
  const quiz = await Quiz.create({
    ...input,
    slug,
    status: QUIZ_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  return quiz.toSafeObject();
}

export async function getQuiz(req, id) {
  const quiz = await Quiz.findOne({ _id: id, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);
  return quiz.toSafeObject();
}

export async function updateQuiz(req, id, input) {
  const quiz = await Quiz.findOne({ _id: id, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);

  const blocked = [
    'totalMarks',
    'createdBy',
    'version',
    'status',
    'publishedAt',
    'deletedAt',
  ];
  for (const key of blocked) delete input[key];

  if (input.title) quiz.title = input.title;
  if (input.slug) {
    quiz.slug = await ensureUniqueQuizSlug(Quiz, quiz.courseId, input.slug, quiz._id);
  }
  if (input.description !== undefined) quiz.description = input.description;
  if (input.instructions !== undefined) quiz.instructions = input.instructions;
  if (input.lessonId !== undefined) {
    if (input.lessonId) {
      const lesson = await CourseLesson.findOne({ _id: input.lessonId, deletedAt: null });
      if (!lesson || lesson.courseId.toString() !== quiz.courseId.toString()) {
        throw new AppError('Lesson does not belong to course', 400, 'INVALID_LESSON');
      }
    }
    quiz.lessonId = input.lessonId;
  }
  if (input.topicId !== undefined) quiz.topicId = input.topicId;
  if (input.timeLimitSeconds !== undefined) quiz.timeLimitSeconds = input.timeLimitSeconds;
  if (input.passingPercentage !== undefined) quiz.passingPercentage = input.passingPercentage;
  if (input.maximumAttempts !== undefined) quiz.maximumAttempts = input.maximumAttempts;
  if (input.randomizeQuestions !== undefined) quiz.randomizeQuestions = input.randomizeQuestions;
  if (input.randomizeAnswers !== undefined) quiz.randomizeAnswers = input.randomizeAnswers;
  if (input.showResults !== undefined) quiz.showResults = input.showResults;
  if (input.showCorrectAnswers !== undefined) quiz.showCorrectAnswers = input.showCorrectAnswers;
  if (input.showExplanation !== undefined) quiz.showExplanation = input.showExplanation;
  if (input.negativeMarkingEnabled !== undefined) {
    quiz.negativeMarkingEnabled = input.negativeMarkingEnabled;
  }
  if (input.negativeMarksPerWrongAnswer !== undefined) {
    quiz.negativeMarksPerWrongAnswer = input.negativeMarksPerWrongAnswer;
  }
  if (input.allowResume !== undefined) quiz.allowResume = input.allowResume;
  if (input.allowBackNavigation !== undefined) quiz.allowBackNavigation = input.allowBackNavigation;
  if (input.requireAllQuestions !== undefined) quiz.requireAllQuestions = input.requireAllQuestions;
  if (input.allowPartialCreditMultiSelect !== undefined) {
    quiz.allowPartialCreditMultiSelect = input.allowPartialCreditMultiSelect;
  }
  if (input.questionSelectionMode !== undefined) {
    quiz.questionSelectionMode = input.questionSelectionMode;
  }
  if (input.questionsToSelect !== undefined) quiz.questionsToSelect = input.questionsToSelect;
  if (input.tags !== undefined) quiz.tags = input.tags;
  if (input.availability !== undefined) quiz.availability = input.availability;

  quiz.updatedBy = req.user._id;
  quiz.version += 1;
  await quiz.save();
  await invalidateQuizMetaCaches({ quizId: quiz._id.toString() });
  return quiz.toSafeObject();
}

export async function changeQuizStatus(req, id, status) {
  const quiz = await Quiz.findOne({ _id: id, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);

  if (status === QUIZ_STATUS.PUBLISHED) {
    const course = await Course.findById(quiz.courseId);
    if (course.status === COURSE_STATUS.ARCHIVED) {
      throw new AppError('Cannot publish quiz on archived course', 422, 'COURSE_ARCHIVED');
    }
    if (quiz.lessonId) {
      const lesson = await CourseLesson.findOne({ _id: quiz.lessonId, deletedAt: null });
      if (!lesson || lesson.courseId.toString() !== quiz.courseId.toString()) {
        throw new AppError('Invalid lesson relationship', 422, 'INVALID_LESSON');
      }
    }
    const qCount = await QuizQuestion.countDocuments({
      quizId: quiz._id,
      deletedAt: null,
      status: 'active',
    });
    if (qCount < 1) {
      throw new AppError('Quiz needs at least one active question', 422, 'NO_QUESTIONS');
    }
    await recomputeQuizTotalMarks(quiz._id);
    const refreshed = await Quiz.findById(quiz._id);
    if (refreshed.totalMarks <= 0) {
      throw new AppError('Quiz total marks must be positive', 422, 'INVALID_TOTAL_MARKS');
    }
    if (refreshed.timeLimitSeconds < 0) {
      throw new AppError('Invalid time limit', 422, 'INVALID_TIMER');
    }
    if (refreshed.availability?.enabled) {
      if (
        refreshed.availability.startsAt &&
        refreshed.availability.endsAt &&
        refreshed.availability.startsAt >= refreshed.availability.endsAt
      ) {
        throw new AppError('Invalid availability window', 422, 'INVALID_AVAILABILITY');
      }
    }
    quiz.publishedAt = quiz.publishedAt || new Date();
  }

  quiz.status = status;
  quiz.updatedBy = req.user._id;
  quiz.version += 1;
  await quiz.save();
  await invalidateQuizMetaCaches({ quizId: quiz._id.toString() });
  return quiz.toSafeObject();
}

export async function archiveQuiz(req, id) {
  return changeQuizStatus(req, id, QUIZ_STATUS.ARCHIVED).then(async (obj) => {
    await Quiz.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    const quiz = await Quiz.findById(id);
    return quiz.toSafeObject();
  });
}

export async function duplicateQuiz(req, id) {
  const source = await Quiz.findOne({ _id: id, deletedAt: null });
  if (!source) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, source.courseId);

  const slug = await ensureUniqueQuizSlug(Quiz, source.courseId, `${source.slug}-copy`);
  const copy = await Quiz.create({
    title: `${source.title} (Copy)`,
    slug,
    description: source.description,
    instructions: source.instructions,
    courseId: source.courseId,
    topicId: source.topicId,
    lessonId: source.lessonId,
    timeLimitSeconds: source.timeLimitSeconds,
    totalMarks: 0,
    passingPercentage: source.passingPercentage,
    maximumAttempts: source.maximumAttempts,
    randomizeQuestions: source.randomizeQuestions,
    randomizeAnswers: source.randomizeAnswers,
    showResults: source.showResults,
    showCorrectAnswers: source.showCorrectAnswers,
    showExplanation: source.showExplanation,
    negativeMarkingEnabled: source.negativeMarkingEnabled,
    negativeMarksPerWrongAnswer: source.negativeMarksPerWrongAnswer,
    allowResume: source.allowResume,
    allowBackNavigation: source.allowBackNavigation,
    requireAllQuestions: source.requireAllQuestions,
    allowPartialCreditMultiSelect: source.allowPartialCreditMultiSelect,
    questionSelectionMode: source.questionSelectionMode,
    questionsToSelect: source.questionsToSelect,
    tags: source.tags,
    availability: source.availability,
    status: QUIZ_STATUS.DRAFT,
    version: 1,
    sourceQuizId: source._id,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  const questions = await QuizQuestion.find({
    quizId: source._id,
    deletedAt: null,
    status: 'active',
  }).sort({ sortOrder: 1 });

  for (const q of questions) {
    await QuizQuestion.create({
      quizId: copy._id,
      questionBankId: q.questionBankId,
      questionText: q.questionText,
      questionType: q.questionType,
      description: q.description,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      sortOrder: q.sortOrder,
      isRequired: q.isRequired,
      explanation: q.explanation,
      difficulty: q.difficulty,
      tags: q.tags,
      options: q.options,
      correctOptionIds: q.correctOptionIds,
      correctAnswer: q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers,
      answerMatchingMode: q.answerMatchingMode,
      gradingMode: q.gradingMode,
      gradingRubric: q.gradingRubric,
      blanks: q.blanks,
      status: 'active',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
  }
  await recomputeQuizTotalMarks(copy._id);
  return (await Quiz.findById(copy._id)).toSafeObject();
}
