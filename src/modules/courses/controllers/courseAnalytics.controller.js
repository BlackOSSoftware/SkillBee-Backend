import * as analyticsService from '../services/courseAnalytics.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getCourseAnalytics(req, req.params.id);
  res.json({ success: true, data: { analytics } });
});
