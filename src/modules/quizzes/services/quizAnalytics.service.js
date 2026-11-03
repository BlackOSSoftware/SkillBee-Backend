import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { AppError } from '../../../utils/AppError.js';
import { assertCanManageCourseQuizzes } from './quizAccess.service.js';
import { finalizeExpiredForQuiz } from './quizTimer.service.js';

export async function getQuizAnalytics(req, quizId) {
  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);

  await finalizeExpiredForQuiz(quizId);

  const [totals] = await QuizAttempt.aggregate([
    { $match: { quizId: quiz._id } },
    {
      $group: {
        _id: null,
        totalAttempts: { $sum: 1 },
        completedAttempts: {
          $sum: {
            $cond: [
              { $in: ['$status', ['submitted', 'evaluating', 'evaluated']] },
              1,
              0,
            ],
          },
        },
        inProgressAttempts: {
          $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
        },
        expiredAttempts: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
        },
        uniqueStudents: { $addToSet: '$studentId' },
        avgScore: {
          $avg: {
            $cond: [
              { $in: ['$status', ['evaluated', 'evaluating', 'submitted', 'expired']] },
              '$percentage',
              null,
            ],
          },
        },
        highestScore: { $max: '$percentage' },
        lowestScore: {
          $min: {
            $cond: [{ $ne: ['$percentage', null] }, '$percentage', null],
          },
        },
        passCount: {
          $sum: { $cond: [{ $eq: ['$passed', true] }, 1, 0] },
        },
        failCount: {
          $sum: { $cond: [{ $eq: ['$passed', false] }, 1, 0] },
        },
        avgTime: {
          $avg: {
            $cond: [{ $ne: ['$timeTakenSeconds', null] }, '$timeTakenSeconds', null],
          },
        },
        pendingManual: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$evaluationStatus', 'partial'] },
                  { $eq: ['$status', 'evaluating'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const t = totals || {
    totalAttempts: 0,
    completedAttempts: 0,
    inProgressAttempts: 0,
    expiredAttempts: 0,
    uniqueStudents: [],
    avgScore: null,
    highestScore: null,
    lowestScore: null,
    passCount: 0,
    failCount: 0,
    avgTime: null,
    pendingManual: 0,
  };

  const scored = (t.passCount || 0) + (t.failCount || 0);
  return {
    quizId: quiz._id.toString(),
    title: quiz.title,
    totalAttempts: t.totalAttempts || 0,
    completedAttempts: t.completedAttempts || 0,
    inProgressAttempts: t.inProgressAttempts || 0,
    expiredAttempts: t.expiredAttempts || 0,
    uniqueStudents: Array.isArray(t.uniqueStudents) ? t.uniqueStudents.length : 0,
    averageScore: t.avgScore != null ? Number(Number(t.avgScore).toFixed(2)) : null,
    highestScore: t.highestScore != null ? Number(Number(t.highestScore).toFixed(2)) : null,
    lowestScore: t.lowestScore != null ? Number(Number(t.lowestScore).toFixed(2)) : null,
    passCount: t.passCount || 0,
    failCount: t.failCount || 0,
    passPercentage: scored > 0 ? Number((((t.passCount || 0) / scored) * 100).toFixed(2)) : null,
    averageTimeTaken:
      t.avgTime != null ? Number(Number(t.avgTime).toFixed(1)) : null,
    pendingManualEvaluations: t.pendingManual || 0,
  };
}
