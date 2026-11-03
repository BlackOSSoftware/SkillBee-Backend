import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as questionService from '../services/question.service.js';

export const updateQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.updateQuestion(req, req.params.questionId, req.body);
  res.json({ success: true, data: { question } });
});

export const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.archiveQuestion(req, req.params.questionId);
  res.json({ success: true, data: { question, message: 'Question archived' } });
});
