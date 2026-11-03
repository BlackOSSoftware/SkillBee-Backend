import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { QuizQuestion } from '../../../models/QuizQuestion.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import {
  serializeQuestionForResult,
  serializeQuestionForStudent,
} from '../serializers/question.serializer.js';
import { assertCanManageCourseQuizzes, isPlatformAdmin } from './quizAccess.service.js';
import { assertStudentCanStartQuiz } from './quizEligibility.service.js';
import { finalizeAttemptScores, scoreQuestion } from './quizEvaluation.service.js';
import { buildQuestionSnapshot, selectQuestions } from './quizRandomization.service.js';
import { computeExpiresAt, finalizeIfExpired } from './quizTimer.service.js';
import { Course } from '../../../models/Course.js';

function normalizeSubmittedAnswer(raw, questionType) {
  if (!raw || typeof raw !== 'object') {
    throw new AppError('Invalid answer payload', 400, 'INVALID_ANSWER');
  }
  const out = {};
  if (questionType === 'multiple_choice' || questionType === 'multiple_select') {
    if (!Array.isArray(raw.selectedOptionIds)) {
      throw new AppError('selectedOptionIds required', 400, 'INVALID_ANSWER');
    }
    out.selectedOptionIds = raw.selectedOptionIds.map(String);
  } else if (questionType === 'true_false') {
    if (typeof raw.booleanAnswer !== 'boolean' && typeof raw.answer !== 'boolean') {
      throw new AppError('booleanAnswer required', 400, 'INVALID_ANSWER');
    }
    out.booleanAnswer =
      typeof raw.booleanAnswer === 'boolean' ? raw.booleanAnswer : Boolean(raw.answer);
  } else if (questionType === 'short_answer' || questionType === 'long_answer') {
    if (typeof raw.text !== 'string') {
      throw new AppError('text answer required', 400, 'INVALID_ANSWER');
    }
    out.text = raw.text;
  } else if (questionType === 'fill_in_the_blanks') {
    if (!Array.isArray(raw.blankAnswers)) {
      throw new AppError('blankAnswers required', 400, 'INVALID_ANSWER');
    }
    out.blankAnswers = raw.blankAnswers.map((b) => ({
      blankId: String(b.blankId),
      value: String(b.value ?? ''),
    }));
  } else {
    throw new AppError('Unsupported question type', 400, 'INVALID_ANSWER');
  }
  return out;
}

function serializeAttemptForStudentStart(attempt) {
  return {
    attemptId: attempt._id.toString(),
    quizId: attempt.quizId.toString(),
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    timeLimitSeconds: attempt.expiresAt
      ? Math.max(0, Math.floor((attempt.expiresAt - attempt.startedAt) / 1000))
      : 0,
    status: attempt.status,
    totalMarks: attempt.totalMarks,
    questions: attempt.questionSnapshots.map(serializeQuestionForStudent),
  };
}

function resultsVisible(attempt) {
  if (!attempt.resultPublishedAt) {
    if (attempt.showResults === 'immediate' || attempt.showResults === 'after_submission') {
      return ['evaluated', 'submitted', 'evaluating'].includes(attempt.status);
    }
    if (attempt.showResults === 'after_manual_grading') {
      return attempt.evaluationStatus === 'completed' && attempt.status === 'evaluated';
    }
    return false;
  }
  return true;
}

export function serializeAttemptResult(attempt, { isAdmin = false } = {}) {
  const showCorrect = isAdmin || (resultsVisible(attempt) && attempt.showCorrectAnswers);
  const showExplanation = isAdmin || (resultsVisible(attempt) && attempt.showExplanation);
  const canSeeScores = isAdmin || resultsVisible(attempt);

  const questions = attempt.questionSnapshots.map((snap) => {
    const ans = (attempt.answers || []).find(
      (a) => a.questionId.toString() === snap.questionId.toString()
    );
    if (!canSeeScores && !isAdmin) {
      return serializeQuestionForStudent(snap);
    }
    return serializeQuestionForResult(snap, ans, { showCorrect, showExplanation });
  });

  const base = {
    attemptId: attempt._id.toString(),
    quizId: attempt.quizId.toString(),
    quizTitle: attempt.quizTitle,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    evaluationStatus: attempt.evaluationStatus,
    submittedAt: attempt.submittedAt,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    timeTakenSeconds: attempt.timeTakenSeconds,
    resultPublished: Boolean(attempt.resultPublishedAt) || resultsVisible(attempt),
  };

  if (!canSeeScores) {
    return {
      ...base,
      message: 'Results are not yet available for this attempt',
      questions: isAdmin ? questions : undefined,
    };
  }

  let correct = 0;
  let incorrect = 0;
  for (const a of attempt.answers || []) {
    if (a.isCorrect === true) correct += 1;
    else if (a.isCorrect === false && !a.needsManualGrading) incorrect += 1;
  }

  return {
    ...base,
    totalMarks: attempt.totalMarks,
    obtainedMarks: attempt.obtainedMarks,
    negativeMarks: attempt.negativeMarks,
    percentage: attempt.percentage,
    passed: attempt.passed,
    correctCount: correct,
    incorrectCount: incorrect,
    questions,
  };
}

export async function startQuizAttempt(req, quizId) {
  const { quiz, resumeAttempt, nextAttemptNumber } = await assertStudentCanStartQuiz(req, quizId);

  if (resumeAttempt) {
    const attempt = await finalizeIfExpired(resumeAttempt);
    if (attempt.status !== 'in_progress') {
      throw new AppError('Previous attempt expired', 409, 'ATTEMPT_EXPIRED');
    }
    return serializeAttemptForStudentStart(attempt);
  }

  const questions = await QuizQuestion.find({
    quizId: quiz._id,
    deletedAt: null,
    status: 'active',
  });
  if (!questions.length) {
    throw new AppError('Quiz has no questions', 422, 'NO_QUESTIONS');
  }

  const selected = selectQuestions(questions, quiz);
  const snapshots = selected.map((q) => buildQuestionSnapshot(q, quiz.randomizeAnswers));
  const totalMarks = snapshots.reduce((s, q) => s + (Number(q.marks) || 0), 0);
  const startedAt = new Date();
  const expiresAt = computeExpiresAt(startedAt, quiz.timeLimitSeconds);

  const attempt = await QuizAttempt.create({
    quizId: quiz._id,
    courseId: quiz.courseId,
    studentId: req.user._id,
    attemptNumber: nextAttemptNumber,
    quizVersion: quiz.version,
    quizTitle: quiz.title,
    passingPercentage: quiz.passingPercentage,
    negativeMarkingEnabled: quiz.negativeMarkingEnabled,
    negativeMarksPerWrongAnswer: quiz.negativeMarksPerWrongAnswer,
    allowPartialCreditMultiSelect: quiz.allowPartialCreditMultiSelect,
    showResults: quiz.showResults,
    showCorrectAnswers: quiz.showCorrectAnswers,
    showExplanation: quiz.showExplanation,
    questionSnapshots: snapshots,
    selectedQuestionIds: snapshots.map((s) => s.questionId),
    answers: [],
    startedAt,
    expiresAt,
    status: 'in_progress',
    totalMarks,
    evaluationStatus: 'pending',
  });

  return serializeAttemptForStudentStart(attempt);
}

export async function submitQuizAttempt(req, attemptId, payload) {
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  if (attempt.studentId.toString() !== req.user._id.toString() && !isPlatformAdmin(req.role)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  await finalizeIfExpired(attempt);
  const fresh = await QuizAttempt.findById(attemptId);
  if (fresh.status !== 'in_progress') {
    throw new AppError('Attempt is not in progress', 409, 'ATTEMPT_NOT_ACTIVE');
  }
  if (fresh.expiresAt && fresh.expiresAt <= new Date()) {
    await finalizeIfExpired(fresh);
    throw new AppError('Attempt has expired', 409, 'ATTEMPT_EXPIRED');
  }

  const answersInput = payload.answers || [];
  const seen = new Set();
  const snapById = new Map(
    fresh.questionSnapshots.map((s) => [s.questionId.toString(), s])
  );

  for (const item of answersInput) {
    const qid = String(item.questionId);
    if (seen.has(qid)) {
      throw new AppError('Duplicate question answers', 400, 'DUPLICATE_ANSWERS');
    }
    seen.add(qid);
    if (!snapById.has(qid)) {
      throw new AppError('Unknown question for attempt', 400, 'UNKNOWN_QUESTION');
    }
  }

  if (fresh.requireAllQuestions || payload.requireAll) {
    // requireAllQuestions is on quiz snapshot via config — check isRequired on snaps
  }
  const quiz = await Quiz.findById(fresh.quizId);
  if (quiz?.requireAllQuestions) {
    for (const snap of fresh.questionSnapshots) {
      if (snap.isRequired && !seen.has(snap.questionId.toString())) {
        throw new AppError('All required questions must be answered', 400, 'INCOMPLETE_ANSWERS');
      }
    }
  }

  const scoredAnswers = [];
  for (const item of answersInput) {
    const snap = snapById.get(String(item.questionId));
    const optionIds = new Set((snap.options || []).map((o) => o.id));
    const normalized = normalizeSubmittedAnswer(item.answer, snap.questionType);
    if (normalized.selectedOptionIds) {
      for (const oid of normalized.selectedOptionIds) {
        if (!optionIds.has(oid)) {
          throw new AppError('Invalid option id', 400, 'INVALID_OPTION');
        }
      }
    }
    if (normalized.blankAnswers) {
      const blankIds = new Set((snap.blanks || []).map((b) => b.id));
      for (const b of normalized.blankAnswers) {
        if (!blankIds.has(b.blankId)) {
          throw new AppError('Invalid blank id', 400, 'INVALID_BLANK');
        }
      }
    }

    const scored = scoreQuestion(snap, normalized, {
      negativeMarkingEnabled: fresh.negativeMarkingEnabled,
      negativeMarksPerWrongAnswer: fresh.negativeMarksPerWrongAnswer,
      allowPartialCreditMultiSelect: fresh.allowPartialCreditMultiSelect,
    });

    scoredAnswers.push({
      questionId: snap.questionId,
      ...normalized,
      isCorrect: scored.isCorrect,
      marksAwarded: scored.marksAwarded,
      negativeApplied: scored.negativeApplied || 0,
      needsManualGrading: scored.needsManualGrading,
      feedback: '',
    });
  }

  // Unanswered required questions get zero (no negative)
  for (const snap of fresh.questionSnapshots) {
    if (!seen.has(snap.questionId.toString())) {
      scoredAnswers.push({
        questionId: snap.questionId,
        isCorrect: false,
        marksAwarded: 0,
        negativeApplied: 0,
        needsManualGrading: snap.gradingMode === 'manual' || snap.questionType === 'long_answer',
        feedback: '',
      });
    }
  }

  const now = new Date();
  const filter = { _id: attemptId, status: 'in_progress', studentId: fresh.studentId };
  const scoresPreview = finalizeAttemptScores({
    ...fresh.toObject(),
    answers: scoredAnswers,
  });

  const update = {
    answers: scoredAnswers,
    submittedAt: now,
    timeTakenSeconds: Math.max(0, Math.floor((now - fresh.startedAt) / 1000)),
    obtainedMarks: scoresPreview.obtainedMarks,
    negativeMarks: scoresPreview.negativeMarks,
    percentage: scoresPreview.percentage,
    passed: scoresPreview.passed,
    evaluationStatus: scoresPreview.evaluationStatus,
    status: scoresPreview.pendingManual ? 'evaluating' : 'evaluated',
  };
  if (
    !scoresPreview.pendingManual &&
    ['immediate', 'after_submission'].includes(fresh.showResults)
  ) {
    update.resultPublishedAt = now;
  }
  if (
    scoresPreview.pendingManual === false &&
    fresh.showResults === 'after_manual_grading'
  ) {
    // wait for manual — already handled
  }

  const updated = await QuizAttempt.findOneAndUpdate(filter, { $set: update }, { new: true });
  if (!updated) {
    throw new AppError('Submission conflict — attempt already finalized', 409, 'SUBMIT_CONFLICT');
  }

  if (update.resultPublishedAt || updated.status === 'evaluated') {
    try {
      const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
      emitAppEventAsync('quiz.result', {
        userId: updated.studentId,
        email: req.user?.email,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        quizId: updated.quizId,
        quizTitle: fresh.quizTitle || fresh.title || 'Quiz',
        attemptId: updated._id,
        score: updated.percentage != null ? `${updated.percentage}%` : String(updated.obtainedMarks ?? ''),
      });
    } catch {
      /* ignore */
    }
  }

  return serializeAttemptResult(updated, { isAdmin: false });
}

export async function getStudentAttemptResult(req, attemptId) {
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  if (attempt.studentId.toString() !== req.user._id.toString() && !isPlatformAdmin(req.role)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  await finalizeIfExpired(attempt);
  const fresh = await QuizAttempt.findById(attemptId);
  return serializeAttemptResult(fresh, { isAdmin: false });
}

export async function getGradingView(req, attemptId) {
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, attempt.courseId);

  const pending = attempt.questionSnapshots
    .filter((s) => s.gradingMode === 'manual' || s.questionType === 'long_answer')
    .map((snap) => {
      const ans = (attempt.answers || []).find(
        (a) => a.questionId.toString() === snap.questionId.toString()
      );
      return {
        questionId: snap.questionId.toString(),
        questionText: snap.questionText,
        marks: snap.marks,
        gradingRubric: snap.gradingRubric,
        studentAnswer: {
          text: ans?.text,
        },
        marksAwarded: ans?.marksAwarded ?? null,
        feedback: ans?.feedback || '',
        needsManualGrading: ans?.needsManualGrading !== false,
      };
    });

  return {
    attemptId: attempt._id.toString(),
    status: attempt.status,
    evaluationStatus: attempt.evaluationStatus,
    pendingGrades: pending,
    result: serializeAttemptResult(attempt, { isAdmin: true }),
  };
}

export async function gradeAttempt(req, attemptId, grades) {
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, attempt.courseId);

  if (!['submitted', 'evaluating', 'evaluated', 'expired'].includes(attempt.status)) {
    throw new AppError('Attempt is not ready for grading', 409, 'NOT_GRADABLE');
  }

  const snapById = new Map(
    attempt.questionSnapshots.map((s) => [s.questionId.toString(), s])
  );
  const answers = [...(attempt.answers || [])];

  for (const g of grades) {
    const snap = snapById.get(String(g.questionId));
    if (!snap) throw new AppError('Unknown question', 400, 'UNKNOWN_QUESTION');
    if (snap.gradingMode !== 'manual' && snap.questionType !== 'long_answer') {
      throw new AppError('Question does not require manual grading', 400, 'NOT_MANUAL');
    }
    const marks = Number(g.marksAwarded);
    if (Number.isNaN(marks) || marks < 0) {
      throw new AppError('Invalid marksAwarded', 400, 'INVALID_MARKS');
    }
    if (marks > Number(snap.marks)) {
      throw new AppError('Marks exceed question maximum', 400, 'MARKS_EXCEED');
    }
    let ans = answers.find((a) => a.questionId.toString() === snap.questionId.toString());
    if (!ans) {
      ans = { questionId: snap.questionId };
      answers.push(ans);
    }
    ans.marksAwarded = marks;
    ans.isCorrect = marks >= Number(snap.marks);
    ans.needsManualGrading = false;
    ans.feedback = g.feedback || '';
    ans.gradedBy = req.user._id;
    ans.gradedAt = new Date();
    ans.negativeApplied = 0;
  }

  attempt.answers = answers;
  const scores = finalizeAttemptScores(attempt);
  attempt.obtainedMarks = scores.obtainedMarks;
  attempt.negativeMarks = scores.negativeMarks;
  attempt.percentage = scores.percentage;
  attempt.passed = scores.passed;
  attempt.evaluationStatus = scores.evaluationStatus;
  attempt.gradedBy = req.user._id;
  attempt.gradedAt = new Date();
  attempt.gradingAudit.push({
    at: new Date(),
    by: req.user._id,
    note: `Graded ${grades.length} question(s)`,
  });

  if (!scores.pendingManual) {
    attempt.status = 'evaluated';
    if (
      ['immediate', 'after_submission', 'after_manual_grading'].includes(attempt.showResults)
    ) {
      attempt.resultPublishedAt = attempt.resultPublishedAt || new Date();
    }
  } else {
    attempt.status = 'evaluating';
  }

  await attempt.save();
  return serializeAttemptResult(attempt, { isAdmin: true });
}

export async function listAttemptsAdmin(req, query = {}) {
  const filter = {};
  if (query.quizId) filter.quizId = query.quizId;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.studentId) filter.studentId = query.studentId;
  if (query.status) filter.status = query.status;
  if (query.passed === true || query.passed === false) filter.passed = query.passed;
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
    if (filter.courseId) {
      if (!ids.some((id) => id.toString() === String(filter.courseId))) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
    } else {
      filter.courseId = { $in: ids };
    }
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });
  const sortAllow = new Set(['createdAt', 'submittedAt', 'percentage', 'attemptNumber']);
  const sortBy = sortAllow.has(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [rows, total] = await Promise.all([
    QuizAttempt.find(filter).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
    QuizAttempt.countDocuments(filter),
  ]);

  return {
    attempts: rows.map((a) => ({
      id: a._id.toString(),
      quizId: a.quizId.toString(),
      courseId: a.courseId.toString(),
      studentId: a.studentId.toString(),
      attemptNumber: a.attemptNumber,
      status: a.status,
      evaluationStatus: a.evaluationStatus,
      obtainedMarks: a.obtainedMarks,
      totalMarks: a.totalMarks,
      percentage: a.percentage,
      passed: a.passed,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      createdAt: a.createdAt,
    })),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function getAdminAttempt(req, attemptId) {
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, attempt.courseId);
  await finalizeIfExpired(attempt);
  const fresh = await QuizAttempt.findById(attemptId);
  return serializeAttemptResult(fresh, { isAdmin: true });
}

export async function listQuizAttempts(req, quizId, query = {}) {
  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);
  return listAttemptsAdmin(req, { ...query, quizId });
}
