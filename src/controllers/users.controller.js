import * as usersService from '../services/users.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listUsers = asyncHandler(async (req, res) => {
  const result = await usersService.listUsers(req.query);

  res.json({
    success: true,
    data: result,
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);

  res.json({
    success: true,
    data: { user },
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await usersService.createUser(req.body);

  res.status(201).json({
    success: true,
    data: { user },
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await usersService.updateUser(req.params.id, req.body);

  res.json({
    success: true,
    data: { user },
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await usersService.softDeleteUser(req.params.id);

  res.json({
    success: true,
    data: { user, message: 'User soft-deleted' },
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await usersService.updateUserStatus(req.params.id, req.body.status);

  res.json({
    success: true,
    data: { user },
  });
});
