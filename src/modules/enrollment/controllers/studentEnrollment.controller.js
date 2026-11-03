import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as enrollmentService from '../services/enrollment.service.js';
import { completeLesson } from '../services/progress.service.js';
import { getStudentDashboard } from '../services/dashboard.service.js';

export const myCourses = asyncHandler(async (req, res) => {
  const result = await enrollmentService.listMyCourses(req, req.query);
  res.json({ success: true, data: result });
});

export const courseProgress = asyncHandler(async (req, res) => {
  const progress = await enrollmentService.getMyCourseProgress(req, req.params.id);
  res.json({ success: true, data: { progress } });
});

export const dashboard = asyncHandler(async (req, res) => {
  const dashboardData = await getStudentDashboard(req);
  res.json({ success: true, data: { dashboard: dashboardData } });
});

export const completeLessonHandler = asyncHandler(async (req, res) => {
  const result = await completeLesson(req, req.params.id, req.body || {});
  res.json({ success: true, data: result });
});
