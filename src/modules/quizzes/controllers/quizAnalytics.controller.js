import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as analyticsService from '../services/quizAnalytics.service.js';

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getQuizAnalytics(req, req.params.id);
  res.json({ success: true, data: { analytics } });
});
