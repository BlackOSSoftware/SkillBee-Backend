import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as quizService from '../services/quiz.service.js';
import * as questionService from '../services/question.service.js';
import * as questionBankService from '../services/questionBank.service.js';
import * as attemptService from '../services/quizAttempt.service.js';
import * as analyticsService from '../services/quizAnalytics.service.js';

export const listQuizzes = asyncHandler(async (req, res) => {
  const result = await quizService.listQuizzes(req, req.query);
  res.json({ success: true, data: { quizzes: result.quizzes }, pagination: result.pagination });
});

export const createQuiz = asyncHandler(async (req, res) => {
  const quiz = await quizService.createQuiz(req, req.body);
  res.status(201).json({ success: true, data: { quiz } });
});

export const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await quizService.getQuiz(req, req.params.id);
  res.json({ success: true, data: { quiz } });
});

export const updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await quizService.updateQuiz(req, req.params.id, req.body);
  res.json({ success: true, data: { quiz } });
});

export const deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await quizService.archiveQuiz(req, req.params.id);
  res.json({ success: true, data: { quiz, message: 'Quiz archived' } });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const quiz = await quizService.changeQuizStatus(req, req.params.id, req.body.status);
  res.json({ success: true, data: { quiz } });
});

export const duplicateQuiz = asyncHandler(async (req, res) => {
  const quiz = await quizService.duplicateQuiz(req, req.params.id);
  res.status(201).json({ success: true, data: { quiz } });
});

export const listQuestions = asyncHandler(async (req, res) => {
  const questions = await questionService.listQuestions(req, req.params.id);
  res.json({ success: true, data: { questions } });
});

export const addQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.addQuestion(req, req.params.id, req.body);
  res.status(201).json({ success: true, data: { question } });
});

export const updateQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.updateQuestion(req, req.params.questionId, req.body);
  res.json({ success: true, data: { question } });
});

export const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.archiveQuestion(req, req.params.questionId);
  res.json({ success: true, data: { question, message: 'Question archived' } });
});

export const reorderQuestions = asyncHandler(async (req, res) => {
  const questions = await questionService.reorderQuestions(
    req,
    req.params.id,
    req.body.questionIds
  );
  res.json({ success: true, data: { questions } });
});

export const addFromBank = asyncHandler(async (req, res) => {
  const questions = await questionBankService.addFromBank(
    req,
    req.params.id,
    req.body.questionBankIds
  );
  res.status(201).json({ success: true, data: { questions } });
});

export const listAttempts = asyncHandler(async (req, res) => {
  const result = await attemptService.listQuizAttempts(req, req.params.id, req.query);
  res.json({
    success: true,
    data: { attempts: result.attempts },
    pagination: result.pagination,
  });
});

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getQuizAnalytics(req, req.params.id);
  res.json({ success: true, data: { analytics } });
});
