import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as attemptService from '../services/quizAttempt.service.js';

export const start = asyncHandler(async (req, res) => {
  const data = await attemptService.startQuizAttempt(req, req.params.id);
  res.status(201).json({ success: true, data });
});

export const submit = asyncHandler(async (req, res) => {
  const result = await attemptService.submitQuizAttempt(req, req.params.id, req.body);
  res.json({ success: true, data: { result } });
});

export const studentResult = asyncHandler(async (req, res) => {
  const result = await attemptService.getStudentAttemptResult(req, req.params.id);
  res.json({ success: true, data: { result } });
});

export const gradingView = asyncHandler(async (req, res) => {
  const data = await attemptService.getGradingView(req, req.params.id);
  res.json({ success: true, data });
});

export const grade = asyncHandler(async (req, res) => {
  const result = await attemptService.gradeAttempt(req, req.params.id, req.body.grades);
  res.json({ success: true, data: { result } });
});

export const listAdmin = asyncHandler(async (req, res) => {
  const data = await attemptService.listAttemptsAdmin(req, req.query);
  res.json({
    success: true,
    data: { attempts: data.attempts },
    pagination: data.pagination,
  });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const result = await attemptService.getAdminAttempt(req, req.params.id);
  res.json({ success: true, data: { result } });
});
