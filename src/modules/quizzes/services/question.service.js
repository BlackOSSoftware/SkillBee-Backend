import crypto from 'crypto';
import { Quiz } from '../../../models/Quiz.js';
import { QuizQuestion } from '../../../models/QuizQuestion.js';
import { AppError } from '../../../utils/AppError.js';
import { serializeQuestionForAdmin } from '../serializers/question.serializer.js';
import { assertCanManageCourseQuizzes } from './quizAccess.service.js';

function newOptionId() {
  return crypto.randomBytes(6).toString('hex');
}

export function validateQuestionPayload(input) {
  const type = input.questionType;
  const marks = Number(input.marks);
  if (Number.isNaN(marks) || marks < 0) {
    throw new AppError('Invalid marks', 400, 'INVALID_MARKS');
  }
  if (input.negativeMarks != null && input.negativeMarks < 0) {
    throw new AppError('Negative marks cannot be negative', 400, 'INVALID_NEGATIVE');
  }

  if (type === 'multiple_choice' || type === 'multiple_select') {
    const options = input.options || [];
    if (options.length < 2) {
      throw new AppError('At least two options required', 400, 'INVALID_OPTIONS');
    }
    const ids = options.map((o) => o.id || newOptionId());
    const normalized = options.map((o, i) => ({
      id: o.id || ids[i],
      text: o.text,
      image: o.image || null,
      sortOrder: o.sortOrder ?? i,
    }));
    const correct = input.correctOptionIds || [];
    if (!correct.length) {
      throw new AppError('At least one correct option required', 400, 'INVALID_CORRECT');
    }
    const idSet = new Set(normalized.map((o) => o.id));
    for (const c of correct) {
      if (!idSet.has(c)) {
        throw new AppError('Correct option id not found in options', 400, 'INVALID_CORRECT');
      }
    }
    if (type === 'multiple_choice' && correct.length !== 1) {
      throw new AppError('Multiple choice requires exactly one correct option', 400, 'INVALID_CORRECT');
    }
    return { ...input, options: normalized, correctOptionIds: correct, gradingMode: 'auto' };
  }

  if (type === 'true_false') {
    if (typeof input.correctAnswer !== 'boolean') {
      throw new AppError('correctAnswer must be boolean', 400, 'INVALID_CORRECT');
    }
    return { ...input, gradingMode: 'auto' };
  }

  if (type === 'short_answer') {
    if (!input.acceptedAnswers?.length) {
      throw new AppError('At least one accepted answer required', 400, 'INVALID_CORRECT');
    }
    return { ...input, gradingMode: 'auto' };
  }

  if (type === 'long_answer') {
    const rubric = input.gradingRubric || [];
    const rubricTotal = rubric.reduce((s, r) => s + (Number(r.maximumMarks) || 0), 0);
    if (rubric.length && rubricTotal > marks) {
      throw new AppError('Rubric marks exceed question marks', 400, 'INVALID_RUBRIC');
    }
    return { ...input, gradingMode: 'manual' };
  }

  if (type === 'fill_in_the_blanks') {
    const blanks = input.blanks || [];
    if (!blanks.length) throw new AppError('At least one blank required', 400, 'INVALID_BLANKS');
    for (const b of blanks) {
      if (!b.acceptedAnswers?.length) {
        throw new AppError('Each blank needs accepted answers', 400, 'INVALID_BLANKS');
      }
    }
    const blankMarks = blanks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
    if (blankMarks > 0 && Math.abs(blankMarks - marks) > 0.001) {
      throw new AppError(
        'Sum of blank marks must equal question marks',
        400,
        'INVALID_BLANK_MARKS'
      );
    }
    return {
      ...input,
      blanks: blanks.map((b) => ({
        id: b.id || newOptionId(),
        acceptedAnswers: b.acceptedAnswers,
        caseSensitive: Boolean(b.caseSensitive),
        marks: b.marks ?? 0,
      })),
      gradingMode: 'auto',
    };
  }

  throw new AppError('Unsupported question type', 400, 'INVALID_TYPE');
}

async function recomputeQuizTotalMarks(quizId) {
  const agg = await QuizQuestion.aggregate([
    { $match: { quizId, deletedAt: null, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$marks' }, count: { $sum: 1 } } },
  ]);
  const total = agg[0]?.total || 0;
  await Quiz.updateOne({ _id: quizId }, { $set: { totalMarks: total } });
  return total;
}

export async function listQuestions(req, quizId) {
  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);
  const rows = await QuizQuestion.find({ quizId, deletedAt: null, status: 'active' }).sort({
    sortOrder: 1,
  });
  return rows.map(serializeQuestionForAdmin);
}

export async function addQuestion(req, quizId, input) {
  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);
  const payload = validateQuestionPayload(input);

  let sortOrder = payload.sortOrder;
  if (sortOrder == null) {
    const last = await QuizQuestion.findOne({ quizId, deletedAt: null })
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  const q = await QuizQuestion.create({
    quizId,
    questionBankId: payload.questionBankId || null,
    questionText: payload.questionText,
    questionType: payload.questionType,
    description: payload.description || '',
    marks: payload.marks,
    negativeMarks: payload.negativeMarks || 0,
    sortOrder,
    isRequired: payload.isRequired !== false,
    explanation: payload.explanation || '',
    difficulty: payload.difficulty || 'medium',
    tags: payload.tags || [],
    options: payload.options || [],
    correctOptionIds: payload.correctOptionIds || [],
    correctAnswer: payload.correctAnswer,
    acceptedAnswers: payload.acceptedAnswers || [],
    answerMatchingMode: payload.answerMatchingMode || 'case_insensitive',
    gradingMode: payload.gradingMode,
    gradingRubric: payload.gradingRubric || [],
    blanks: payload.blanks || [],
    status: 'active',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await recomputeQuizTotalMarks(quizId);
  return serializeQuestionForAdmin(q);
}

export async function updateQuestion(req, questionId, input) {
  const q = await QuizQuestion.findOne({ _id: questionId, deletedAt: null });
  if (!q) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');
  const quiz = await Quiz.findOne({ _id: q.quizId, deletedAt: null });
  await assertCanManageCourseQuizzes(req, quiz.courseId);

  const merged = {
    questionText: input.questionText ?? q.questionText,
    questionType: input.questionType ?? q.questionType,
    description: input.description ?? q.description,
    marks: input.marks ?? q.marks,
    negativeMarks: input.negativeMarks ?? q.negativeMarks,
    options: input.options ?? q.options,
    correctOptionIds: input.correctOptionIds ?? q.correctOptionIds,
    correctAnswer: input.correctAnswer ?? q.correctAnswer,
    acceptedAnswers: input.acceptedAnswers ?? q.acceptedAnswers,
    answerMatchingMode: input.answerMatchingMode ?? q.answerMatchingMode,
    gradingRubric: input.gradingRubric ?? q.gradingRubric,
    blanks: input.blanks ?? q.blanks,
    explanation: input.explanation ?? q.explanation,
    difficulty: input.difficulty ?? q.difficulty,
    tags: input.tags ?? q.tags,
    isRequired: input.isRequired ?? q.isRequired,
    sortOrder: input.sortOrder ?? q.sortOrder,
  };
  const payload = validateQuestionPayload(merged);
  Object.assign(q, payload);
  q.updatedBy = req.user._id;
  await q.save();
  await recomputeQuizTotalMarks(q.quizId);
  return serializeQuestionForAdmin(q);
}

export async function archiveQuestion(req, questionId) {
  const q = await QuizQuestion.findOne({ _id: questionId, deletedAt: null });
  if (!q) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');
  const quiz = await Quiz.findById(q.quizId);
  await assertCanManageCourseQuizzes(req, quiz.courseId);
  q.deletedAt = new Date();
  q.status = 'archived';
  q.updatedBy = req.user._id;
  await q.save();
  await recomputeQuizTotalMarks(q.quizId);
  return serializeQuestionForAdmin(q);
}

export async function reorderQuestions(req, quizId, questionIds) {
  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);

  if (new Set(questionIds).size !== questionIds.length) {
    throw new AppError('Duplicate question IDs', 400, 'DUPLICATE_REORDER_IDS');
  }
  const active = await QuizQuestion.find({ quizId, deletedAt: null, status: 'active' }).select(
    '_id'
  );
  const activeIds = new Set(active.map((q) => q._id.toString()));
  if (questionIds.length !== activeIds.size) {
    throw new AppError('Reorder list must include every active question', 400, 'INCOMPLETE_REORDER');
  }
  for (const id of questionIds) {
    if (!activeIds.has(id)) {
      throw new AppError('Invalid question for this quiz', 400, 'INVALID_QUESTIONS');
    }
  }
  await Promise.all(
    questionIds.map((id, index) =>
      QuizQuestion.updateOne({ _id: id }, { $set: { sortOrder: index, updatedBy: req.user._id } })
    )
  );
  return listQuestions(req, quizId);
}

export { recomputeQuizTotalMarks };
