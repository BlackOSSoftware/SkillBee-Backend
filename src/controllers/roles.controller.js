import * as rolesService from '../services/roles.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listRoles = asyncHandler(async (_req, res) => {
  const roles = await rolesService.listRoles();

  res.json({
    success: true,
    data: { roles },
  });
});

export const createRole = asyncHandler(async (req, res) => {
  const role = await rolesService.createRole(req.body);

  res.status(201).json({
    success: true,
    data: { role },
  });
});

export const updateRole = asyncHandler(async (req, res) => {
  const role = await rolesService.updateRole(req.params.id, req.body);

  res.json({
    success: true,
    data: { role },
  });
});

export const deleteRole = asyncHandler(async (req, res) => {
  const result = await rolesService.deleteRole(req.params.id);

  res.json({
    success: true,
    data: result,
  });
});

export const listPermissions = asyncHandler(async (_req, res) => {
  const permissions = await rolesService.listPermissions();

  res.json({
    success: true,
    data: { permissions },
  });
});

export const assignPermissions = asyncHandler(async (req, res) => {
  const role = await rolesService.assignRolePermissions(
    req.params.id,
    req.body.permissions
  );

  res.json({
    success: true,
    data: { role },
  });
});
