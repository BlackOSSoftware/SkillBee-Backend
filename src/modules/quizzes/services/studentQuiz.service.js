import { QUIZ_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { QuizQuestion } from '../../../models/QuizQuestion.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { learningEnrollmentQuery } from '../../enrollment/services/enrollmentAccess.service.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getEnrolledCourseIds(studentId) {
  const enrollments = await CourseEnrollment.find(learningEnrollmentQuery(studentId))
    .select('courseId')
    .lean();
  return enrollments.map((e) => e.courseId);
}

function summarizeAttempts(attempts) {
  const inProgress = attempts.find((a) => a.status === 'in_progress') || null;
  const completed = attempts.filter((a) => a.status !== 'in_progress');
  const best = completed.reduce((acc, a) => {
    if (a.percentage == null) return acc;
    if (!acc || a.percentage > acc.percentage) return a;
    return acc;
  }, null);
  const last = attempts
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  return {
    total: attempts.length,
    completed: completed.length,
    inProgress: inProgress
      ? {
          attemptId: inProgress._id.toString(),
          attemptNumber: inProgress.attemptNumber,
          startedAt: inProgress.startedAt,
          expiresAt: inProgress.expiresAt,
        }
      : null,
    bestPercentage: best ? best.percentage : null,
    bestPassed: best ? best.passed : null,
    lastAttemptId: last ? last._id.toString() : null,
    lastStatus: last ? last.status : null,
  };
}

function canStartQuiz(quiz, summary, now = new Date()) {
  if (quiz.status !== QUIZ_STATUS.PUBLISHED) return { canStart: false, reason: 'not_published' };
  if (quiz.availability?.enabled) {
    if (quiz.availability.startsAt && new Date(quiz.availability.startsAt) > now) {
      return { canStart: false, reason: 'not_started' };
    }
    if (quiz.availability.endsAt && new Date(quiz.availability.endsAt) < now) {
      return { canStart: false, reason: 'ended' };
    }
  }
  if (summary.inProgress) {
    return quiz.allowResume
      ? { canStart: true, reason: 'resume' }
      : { canStart: false, reason: 'in_progress' };
  }
  if (quiz.maximumAttempts && summary.completed >= quiz.maximumAttempts) {
    return { canStart: false, reason: 'max_attempts' };
  }
  return { canStart: true, reason: 'start' };
}

function toStudentQuiz(quiz, courseTitle, questionCount, summary) {
  const access = canStartQuiz(quiz, summary);
  return {
    id: quiz._id.toString(),
    title: quiz.title,
    slug: quiz.slug,
    description: quiz.description,
    courseId: quiz.courseId.toString(),
    courseTitle: courseTitle || null,
    lessonId: quiz.lessonId?.toString?.() || null,
    timeLimitSeconds: quiz.timeLimitSeconds,
    totalMarks: quiz.totalMarks,
    passingPercentage: quiz.passingPercentage,
    maximumAttempts: quiz.maximumAttempts,
    unlimitedAttempts: !quiz.maximumAttempts,
    allowResume: quiz.allowResume,
    allowBackNavigation: quiz.allowBackNavigation,
    showResults: quiz.showResults,
    showCorrectAnswers: quiz.showCorrectAnswers,
    showExplanation: quiz.showExplanation,
    negativeMarkingEnabled: quiz.negativeMarkingEnabled,
    questionCount,
    availability: quiz.availability,
    status: quiz.status,
    publishedAt: quiz.publishedAt,
    createdAt: quiz.createdAt,
    myAttempts: summary,
    canStart: access.canStart,
    startReason: access.reason,
  };
}

export async function listStudentQuizzes(req, query = {}) {
  if (req.user?.status === 'suspended') {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }
  const courseIds = await getEnrolledCourseIds(req.user._id);
  if (!courseIds.length) {
    return { quizzes: [], pagination: buildPagination({ page: 1, limit: query.limit || 20, total: 0 }) };
  }

  const filter = {
    deletedAt: null,
    status: QUIZ_STATUS.PUBLISHED,
    courseId: query.courseId ? query.courseId : { $in: courseIds },
  };
  // Never leave the enrolled scope even if a courseId filter is supplied.
  if (query.courseId && !courseIds.some((id) => id.toString() === String(query.courseId))) {
    return { quizzes: [], pagination: buildPagination({ page: 1, limit: query.limit || 20, total: 0 }) };
  }
  if (query.search) filter.title = new RegExp(escapeRegex(query.search), 'i');

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });

  const [rows, total] = await Promise.all([
    Quiz.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Quiz.countDocuments(filter),
  ]);

  const quizIds = rows.map((q) => q._id);
  const courseIdSet = [...new Set(rows.map((q) => q.courseId.toString()))];

  const [questionCounts, attempts, courses] = await Promise.all([
    QuizQuestion.aggregate([
      { $match: { quizId: { $in: quizIds }, deletedAt: null, status: 'active' } },
      { $group: { _id: '$quizId', count: { $sum: 1 } } },
    ]),
    QuizAttempt.find({
      quizId: { $in: quizIds },
      studentId: req.user._id,
    })
      .select('quizId attemptNumber status percentage passed startedAt expiresAt submittedAt createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    Course.find({ _id: { $in: courseIdSet }, deletedAt: null }).select('title').lean(),
  ]);

  const qCountMap = new Map(questionCounts.map((r) => [r._id.toString(), r.count]));
  const courseTitleMap = new Map(courses.map((c) => [c._id.toString(), c.title]));
  const attemptsByQuiz = new Map();
  for (const a of attempts) {
    const key = a.quizId.toString();
    if (!attemptsByQuiz.has(key)) attemptsByQuiz.set(key, []);
    attemptsByQuiz.get(key).push(a);
  }

  const quizzes = rows.map((q) => {
    const key = q._id.toString();
    const summary = summarizeAttempts(attemptsByQuiz.get(key) || []);
    return toStudentQuiz(
      q,
      courseTitleMap.get(q.courseId.toString()),
      qCountMap.get(key) || 0,
      summary
    );
  });

  return { quizzes, pagination: buildPagination({ page, limit, total }) };
}

export async function getStudentQuiz(req, id) {
  if (req.user?.status === 'suspended') {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }
  const quiz = await Quiz.findOne({ _id: id, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  if (quiz.status !== QUIZ_STATUS.PUBLISHED) {
    throw new AppError('Quiz is not available', 403, 'QUIZ_NOT_PUBLISHED');
  }

  // Enrollment gate (same predicate as start).
  const { learningEnrollmentQuery: leq } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = await CourseEnrollment.exists(leq(req.user._id, quiz.courseId));
  if (!enrolled) throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');

  const [questionCount, attempts, course] = await Promise.all([
    QuizQuestion.countDocuments({ quizId: quiz._id, deletedAt: null, status: 'active' }),
    QuizAttempt.find({ quizId: quiz._id, studentId: req.user._id })
      .select('attemptNumber status percentage passed startedAt expiresAt submittedAt timeTakenSeconds evaluationStatus resultPublishedAt createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    Course.findOne({ _id: quiz.courseId, deletedAt: null }).select('title').lean(),
  ]);

  const summary = summarizeAttempts(attempts);
  const access = canStartQuiz(quiz, summary);

  const myAttempts = attempts.map((a) => ({
    attemptId: a._id.toString(),
    attemptNumber: a.attemptNumber,
    status: a.status,
    percentage: a.percentage,
    passed: a.passed,
    startedAt: a.startedAt,
    expiresAt: a.expiresAt,
    submittedAt: a.submittedAt,
    timeTakenSeconds: a.timeTakenSeconds,
    evaluationStatus: a.evaluationStatus,
    resultPublished: Boolean(a.resultPublishedAt),
    createdAt: a.createdAt,
  }));

  return {
    quiz: {
      ...toStudentQuiz(quiz, course?.title, questionCount, summary),
      instructions: quiz.instructions,
      negativeMarksPerWrongAnswer: quiz.negativeMarksPerWrongAnswer,
      requireAllQuestions: quiz.requireAllQuestions,
      allowPartialCreditMultiSelect: quiz.allowPartialCreditMultiSelect,
      questionSelectionMode: quiz.questionSelectionMode,
      questionsToSelect: quiz.questionsToSelect,
      tags: quiz.tags,
    },
    myAttempts,
    canStart: access.canStart,
    startReason: access.reason,
  };
}
