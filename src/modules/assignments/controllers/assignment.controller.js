import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as assignmentService from '../services/assignment.service.js';
import * as submissionService from '../services/submission.service.js';

export const listAdmin = asyncHandler(async (req, res) => {
  const result = await assignmentService.listAssignmentsAdmin(req, req.query);
  res.json({
    success: true,
    data: { assignments: result.assignments },
    pagination: result.pagination,
  });
});

export const create = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.createAssignment(req, req.body);
  res.status(201).json({ success: true, data: { assignment } });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.getAssignmentAdmin(req, req.params.id);
  res.json({ success: true, data: { assignment } });
});

export const update = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.updateAssignment(req, req.params.id, req.body);
  res.json({ success: true, data: { assignment } });
});

export const remove = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.softDeleteAssignment(req, req.params.id);
  res.json({ success: true, data: { assignment, message: 'Assignment soft-deleted' } });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.changeAssignmentStatus(
    req,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, data: { assignment } });
});

export const listSubmissions = asyncHandler(async (req, res) => {
  const result = await submissionService.listSubmissionsAdmin(req, req.params.id, req.query);
  res.json({
    success: true,
    data: { submissions: result.submissions },
    pagination: result.pagination,
  });
});

export const listStudent = asyncHandler(async (req, res) => {
  const result = await submissionService.listStudentAssignments(req, req.query);
  res.json({
    success: true,
    data: { assignments: result.assignments },
    pagination: result.pagination,
  });
});

export const getStudent = asyncHandler(async (req, res) => {
  const data = await submissionService.getStudentAssignment(req, req.params.id);
  res.json({ success: true, data });
});
