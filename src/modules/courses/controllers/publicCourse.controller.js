import * as publicCourseService from '../services/publicCourse.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const listCourses = asyncHandler(async (req, res) => {
  const result = await publicCourseService.listPublicCourses(req.query);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const listFeatured = asyncHandler(async (_req, res) => {
  const courses = await publicCourseService.listFeaturedCourses();
  res.json({ success: true, data: { courses } });
});

export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await publicCourseService.listPublicCategories();
  res.json({ success: true, data: { categories } });
});

export const getBySlug = asyncHandler(async (req, res) => {
  const course = await publicCourseService.getPublicCourseBySlug(
    req.params.slug,
    req.user?._id
  );
  res.json({ success: true, data: { course } });
});

export const getCurriculum = asyncHandler(async (req, res) => {
  const curriculum = await publicCourseService.getPublicCurriculum(
    req.params.slug,
    req.user?._id
  );
  res.json({ success: true, data: curriculum });
});
