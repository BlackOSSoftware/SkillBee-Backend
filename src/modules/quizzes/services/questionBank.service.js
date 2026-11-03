import { QuestionBank } from '../../../models/QuestionBank.js';
import { Quiz } from '../../../models/Quiz.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { validateQuestionPayload, addQuestion } from './question.service.js';
import { assertCanManageCourseQuizzes } from './quizAccess.service.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listBank(req, query = {}) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  else filter.status = 'active';
  if (query.questionType) filter.questionType = query.questionType;
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.category) filter.category = query.category;
  if (query.tag) filter.tags = query.tag;
  if (query.search) {
    filter.$or = [
      { questionText: new RegExp(escapeRegex(query.search), 'i') },
      { tags: new RegExp(escapeRegex(query.search), 'i') },
    ];
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });

  const [rows, total] = await Promise.all([
    QuestionBank.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    QuestionBank.countDocuments(filter),
  ]);

  return {
    questions: rows.map((q) => q.toSafeObject()),
    pagination: buildPagination({ page, limit, total }),
  };
}

export async function createBankQuestion(req, input) {
  const payload = validateQuestionPayload({
    ...input,
    marks: input.defaultMarks ?? input.marks ?? 1,
  });
  const doc = await QuestionBank.create({
    questionText: payload.questionText,
    questionType: payload.questionType,
    description: payload.description || '',
    options: payload.options || [],
    correctOptionIds: payload.correctOptionIds || [],
    correctAnswer: payload.correctAnswer,
    acceptedAnswers: payload.acceptedAnswers || [],
    answerMatchingMode: payload.answerMatchingMode || 'case_insensitive',
    gradingMode: payload.gradingMode,
    gradingRubric: payload.gradingRubric || [],
    blanks: payload.blanks || [],
    explanation: payload.explanation || '',
    defaultMarks: payload.marks,
    negativeMarks: payload.negativeMarks || 0,
    difficulty: input.difficulty || 'medium',
    tags: input.tags || [],
    category: input.category || 'general',
    status: 'active',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  return doc.toSafeObject();
}

export async function getBankQuestion(req, id) {
  const doc = await QuestionBank.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Question bank item not found', 404, 'BANK_NOT_FOUND');
  return doc.toSafeObject();
}

export async function updateBankQuestion(req, id, input) {
  const doc = await QuestionBank.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Question bank item not found', 404, 'BANK_NOT_FOUND');

  const merged = {
    questionText: input.questionText ?? doc.questionText,
    questionType: input.questionType ?? doc.questionType,
    description: input.description ?? doc.description,
    marks: input.defaultMarks ?? input.marks ?? doc.defaultMarks,
    negativeMarks: input.negativeMarks ?? doc.negativeMarks,
    options: input.options ?? doc.options,
    correctOptionIds: input.correctOptionIds ?? doc.correctOptionIds,
    correctAnswer: input.correctAnswer ?? doc.correctAnswer,
    acceptedAnswers: input.acceptedAnswers ?? doc.acceptedAnswers,
    answerMatchingMode: input.answerMatchingMode ?? doc.answerMatchingMode,
    gradingRubric: input.gradingRubric ?? doc.gradingRubric,
    blanks: input.blanks ?? doc.blanks,
    explanation: input.explanation ?? doc.explanation,
  };
  const payload = validateQuestionPayload(merged);
  doc.questionText = payload.questionText;
  doc.questionType = payload.questionType;
  doc.description = payload.description || '';
  doc.options = payload.options || [];
  doc.correctOptionIds = payload.correctOptionIds || [];
  doc.correctAnswer = payload.correctAnswer;
  doc.acceptedAnswers = payload.acceptedAnswers || [];
  doc.answerMatchingMode = payload.answerMatchingMode;
  doc.gradingMode = payload.gradingMode;
  doc.gradingRubric = payload.gradingRubric || [];
  doc.blanks = payload.blanks || [];
  doc.explanation = payload.explanation || '';
  doc.defaultMarks = payload.marks;
  doc.negativeMarks = payload.negativeMarks || 0;
  if (input.difficulty) doc.difficulty = input.difficulty;
  if (input.tags) doc.tags = input.tags;
  if (input.category) doc.category = input.category;
  if (input.status) doc.status = input.status;
  doc.updatedBy = req.user._id;
  await doc.save();
  return doc.toSafeObject();
}

export async function deleteBankQuestion(req, id) {
  const doc = await QuestionBank.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Question bank item not found', 404, 'BANK_NOT_FOUND');
  doc.deletedAt = new Date();
  doc.status = 'archived';
  doc.updatedBy = req.user._id;
  await doc.save();
  return doc.toSafeObject();
}

export async function listCategories() {
  const cats = await QuestionBank.distinct('category', {
    deletedAt: null,
    status: 'active',
  });
  return cats.sort();
}

/**
 * Snapshot bank question into a quiz — copies content so later bank edits
 * do not mutate quiz questions or historical attempts.
 */
export async function addFromBank(req, quizId, bankQuestionIds) {
  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  await assertCanManageCourseQuizzes(req, quiz.courseId);

  const ids = [...new Set(bankQuestionIds.map(String))];
  const bankItems = await QuestionBank.find({
    _id: { $in: ids },
    deletedAt: null,
    status: 'active',
  });
  if (bankItems.length !== ids.length) {
    throw new AppError('One or more bank questions not found', 400, 'BANK_NOT_FOUND');
  }

  const created = [];
  for (const item of bankItems) {
    const q = await addQuestion(req, quizId, {
      questionBankId: item._id.toString(),
      questionText: item.questionText,
      questionType: item.questionType,
      description: item.description,
      marks: item.defaultMarks,
      negativeMarks: item.negativeMarks,
      explanation: item.explanation,
      difficulty: item.difficulty,
      tags: item.tags,
      options: item.options,
      correctOptionIds: item.correctOptionIds,
      correctAnswer: item.correctAnswer,
      acceptedAnswers: item.acceptedAnswers,
      answerMatchingMode: item.answerMatchingMode,
      gradingRubric: item.gradingRubric,
      blanks: item.blanks,
    });
    created.push(q);
  }
  return created;
}
