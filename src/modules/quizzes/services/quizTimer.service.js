import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { finalizeAttemptScores } from './quizEvaluation.service.js';

/** Lazy finalization of expired in-progress attempts */
export async function finalizeIfExpired(attempt) {
  if (!attempt || attempt.status !== 'in_progress') return attempt;
  if (!attempt.expiresAt) return attempt;
  if (attempt.expiresAt > new Date()) return attempt;

  attempt.status = 'expired';
  attempt.autoSubmittedAt = new Date();
  attempt.submittedAt = attempt.submittedAt || attempt.autoSubmittedAt;
  attempt.timeTakenSeconds = Math.max(
    0,
    Math.floor((attempt.expiresAt - attempt.startedAt) / 1000)
  );

  // Score whatever answers were saved (usually empty unless progressive save exists)
  const scores = finalizeAttemptScores(attempt);
  attempt.obtainedMarks = scores.obtainedMarks;
  attempt.negativeMarks = scores.negativeMarks;
  attempt.percentage = scores.percentage;
  attempt.passed = scores.passed;
  attempt.evaluationStatus = scores.evaluationStatus;
  if (!scores.pendingManual) {
    attempt.status = 'evaluated';
    if (['immediate', 'after_submission'].includes(attempt.showResults)) {
      attempt.resultPublishedAt = new Date();
    }
  } else {
    attempt.status = 'evaluating';
  }
  await attempt.save();
  return attempt;
}

export async function finalizeExpiredForQuiz(quizId) {
  const now = new Date();
  const rows = await QuizAttempt.find({
    quizId,
    status: 'in_progress',
    expiresAt: { $ne: null, $lte: now },
  }).limit(100);
  for (const row of rows) {
    await finalizeIfExpired(row);
  }
  return rows.length;
}

export function computeExpiresAt(startedAt, timeLimitSeconds) {
  if (!timeLimitSeconds || timeLimitSeconds <= 0) return null;
  return new Date(startedAt.getTime() + timeLimitSeconds * 1000);
}
