import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as enrollmentService from '../services/enrollment.service.js';
import { syncExpiredEnrollments } from '../services/enrollment.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await enrollmentService.listAdminEnrollments(req.query);
  res.json({
    success: true,
    data: { enrollments: result.enrollments },
    pagination: result.pagination,
  });
});

export const create = asyncHandler(async (req, res) => {
  const enrollment = await enrollmentService.createManualEnrollment(req, req.body);
  res.status(201).json({ success: true, data: { enrollment } });
});

export const getOne = asyncHandler(async (req, res) => {
  const enrollment = await enrollmentService.getEnrollmentById(req.params.id);
  res.json({ success: true, data: { enrollment } });
});

export const update = asyncHandler(async (req, res) => {
  const enrollment = await enrollmentService.updateEnrollment(req, req.params.id, req.body);
  res.json({ success: true, data: { enrollment } });
});

export const remove = asyncHandler(async (req, res) => {
  const enrollment = await enrollmentService.revokeEnrollment(
    req,
    req.params.id,
    req.body?.reason
  );
  res.json({ success: true, data: { enrollment, message: 'Enrollment revoked' } });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const enrollment = await enrollmentService.updateEnrollmentStatus(
    req,
    req.params.id,
    req.body.status,
    req.body.reason
  );
  res.json({ success: true, data: { enrollment } });
});

export const history = asyncHandler(async (req, res) => {
  const result = await enrollmentService.getEnrollmentHistory(req.params.id);
  res.json({ success: true, data: result });
});

export const progress = asyncHandler(async (req, res) => {
  const result = await enrollmentService.getAdminEnrollmentProgress(req.params.id);
  res.json({ success: true, data: { progress: result } });
});

export const listByCourse = asyncHandler(async (req, res) => {
  const result = await enrollmentService.listCourseEnrollments(req.params.courseId, req.query);
  res.json({
    success: true,
    data: { enrollments: result.enrollments },
    pagination: result.pagination,
  });
});

export const listByStudent = asyncHandler(async (req, res) => {
  const result = await enrollmentService.listStudentEnrollmentsAdmin(
    req.params.studentId,
    req.query
  );
  res.json({
    success: true,
    data: { enrollments: result.enrollments },
    pagination: result.pagination,
  });
});

export const syncExpired = asyncHandler(async (_req, res) => {
  const result = await syncExpiredEnrollments();
  res.json({ success: true, data: result });
});
