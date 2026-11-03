import * as courseService from '../services/course.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const listCourses = asyncHandler(async (req, res) => {
  const result = await courseService.listCourses(req);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const createCourse = asyncHandler(async (req, res) => {
  const course = await courseService.createCourse(req, req.body);
  res.status(201).json({ success: true, data: { course } });
});

export const getCourse = asyncHandler(async (req, res) => {
  const course = await courseService.getCourseById(req, req.params.id);
  res.json({ success: true, data: { course } });
});

export const updateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourse(req, req.params.id, req.body);
  res.json({ success: true, data: { course } });
});

export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await courseService.softDeleteCourse(req, req.params.id);
  res.json({ success: true, data: { course, message: 'Course soft-deleted' } });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const course = await courseService.changeCourseStatus(
    req,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, data: { course } });
});

export const duplicateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.duplicateCourse(req, req.params.id);
  res.status(201).json({ success: true, data: { course } });
});

export const previewCourse = asyncHandler(async (req, res) => {
  const course = await courseService.getCoursePreview(req, req.params.id);
  res.json({ success: true, data: { course } });
});

export const listStudents = asyncHandler(async (req, res) => {
  const students = await courseService.listCourseStudents(req, req.params.id);
  res.json({ success: true, data: { students } });
});

export const reorderCourse = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourseSortOrder(
    req,
    req.params.id,
    req.body.sortOrder
  );
  res.json({ success: true, data: { course } });
});

export const listInstructors = asyncHandler(async (req, res) => {
  const instructors = await courseService.listCourseInstructors(req, req.params.courseId);
  res.json({ success: true, data: { instructors } });
});

export const replaceInstructors = asyncHandler(async (req, res) => {
  const course = await courseService.replaceCourseInstructors(
    req,
    req.params.courseId,
    req.body.instructorIds
  );
  res.json({ success: true, data: { course } });
});
