import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as templateService from '../services/template.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await templateService.listTemplates(req.query);
  res.json({
    success: true,
    data: { templates: result.templates },
    pagination: result.pagination,
  });
});

export const create = asyncHandler(async (req, res) => {
  const template = await templateService.createTemplate(req, req.body);
  res.status(201).json({ success: true, data: { template } });
});

export const getOne = asyncHandler(async (req, res) => {
  const template = await templateService.getTemplate(req.params.id);
  res.json({ success: true, data: { template } });
});

export const update = asyncHandler(async (req, res) => {
  const template = await templateService.updateTemplate(req, req.params.id, req.body);
  res.json({ success: true, data: { template } });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await templateService.deleteTemplate(req, req.params.id);
  res.json({ success: true, data: result });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const template = await templateService.setTemplateStatus(
    req,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, data: { template } });
});

export const setDefault = asyncHandler(async (req, res) => {
  const template = await templateService.setDefaultTemplate(req, req.params.id);
  res.json({ success: true, data: { template } });
});

export const duplicate = asyncHandler(async (req, res) => {
  const template = await templateService.duplicateTemplate(req, req.params.id);
  res.status(201).json({ success: true, data: { template } });
});
