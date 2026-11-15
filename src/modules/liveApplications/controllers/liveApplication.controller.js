import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as service from '../services/liveApplication.service.js';

export const submit = asyncHandler(async (req, res) => {
  const application = await service.submitApplication(req, req.body);
  res.status(201).json({ success: true, data: { application } });
});

export const listMine = asyncHandler(async (req, res) => {
  const applications = await service.listMyApplications(req);
  res.json({ success: true, data: applications });
});

export const listAdmin = asyncHandler(async (req, res) => {
  const result = await service.listAdminApplications(req.query);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const application = await service.getAdminApplication(req.params.id);
  res.json({ success: true, data: application });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const application = await service.updateApplicationStatus(
    req,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, data: { application } });
});

export const updateRemarks = asyncHandler(async (req, res) => {
  const application = await service.updateApplicationRemarks(
    req,
    req.params.id,
    req.body.adminRemarks
  );
  res.json({ success: true, data: { application } });
});

export const convert = asyncHandler(async (req, res) => {
  const result = await service.convertApplication(req, req.params.id);
  res.json({ success: true, data: result });
});
