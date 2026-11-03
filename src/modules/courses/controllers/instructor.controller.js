import * as instructorService from '../services/instructor.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const listInstructors = asyncHandler(async (req, res) => {
  const result = await instructorService.listInstructors({
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 100),
    search: req.query.search,
    status: req.query.status,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const getInstructor = asyncHandler(async (req, res) => {
  const instructor = await instructorService.getInstructorById(req.params.id);
  res.json({ success: true, data: { instructor } });
});

export const listInstructorCourses = asyncHandler(async (req, res) => {
  const result = await instructorService.listInstructorCourses(req.params.id, {
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 100),
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const updateInstructorStatus = asyncHandler(async (req, res) => {
  const instructor = await instructorService.updateInstructorStatus(
    req.params.id,
    req.body.status
  );
  res.json({ success: true, data: { instructor } });
});
