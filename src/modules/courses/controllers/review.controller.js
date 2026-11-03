import * as reviewService from '../services/review.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const createStudentReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createStudentReview(req, req.params.id, req.body);
  res.status(201).json({ success: true, data: { review } });
});

export const updateStudentReview = asyncHandler(async (req, res) => {
  const review = await reviewService.updateStudentReview(req, req.params.id, req.body);
  res.json({ success: true, data: { review } });
});

export const listAdminReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.listAdminReviews(req.query);
  res.json({
    success: true,
    data: { reviews: result.reviews },
    pagination: result.pagination,
  });
});

export const getAdminReview = asyncHandler(async (req, res) => {
  const id = req.params.id || req.params.reviewId;
  const review = await reviewService.getAdminReview(id);
  res.json({ success: true, data: { review } });
});

export const listReviews = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listCourseReviews(req, req.params.courseId);
  res.json({ success: true, data: { reviews } });
});

export const moderateReview = asyncHandler(async (req, res) => {
  const id = req.params.id || req.params.reviewId;
  const review = await reviewService.moderateReview(req, id, req.body);
  res.json({ success: true, data: { review } });
});

export const deleteReview = asyncHandler(async (req, res) => {
  const id = req.params.id || req.params.reviewId;
  const review = await reviewService.deleteReview(req, id);
  res.json({ success: true, data: { review } });
});

export const listPublicReviews = asyncHandler(async (req, res) => {
  const data = await reviewService.listPublicCourseReviews(req.params.id, req.query);
  res.json({ success: true, data });
});
