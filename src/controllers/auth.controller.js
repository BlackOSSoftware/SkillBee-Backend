import { security } from '../config/security.js';
import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Cookie sessions are host-scoped, not port-scoped — every app on
 * localhost:3000/3001/3002 shares the same `accessToken`/`refreshToken`
 * cookies. Admin and instructor consoles authenticate with Bearer tokens
 * (tokenStore) instead, so they must NOT read or write the shared cookies.
 * They identify themselves with the `X-App-Scope` header.
 */
const BEARER_SCOPES = new Set(['admin', 'instructor']);

function usesCookieSession(req) {
  return !BEARER_SCOPES.has(req.headers['x-app-scope']);
}

function setAuthCookies(req, res, { accessToken, refreshToken }) {
  if (!usesCookieSession(req)) return;
  res.cookie('accessToken', accessToken, {
    ...security.cookie,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    ...security.cookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(req, res) {
  if (!usesCookieSession(req)) return;
  res.clearCookie('accessToken', security.cookie);
  res.clearCookie('refreshToken', security.cookie);
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);
  setAuthCookies(req, res, result);

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  setAuthCookies(req, res, result);

  res.json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  // Bearer-token apps must never fall back to the shared localhost refresh cookie.
  const refreshToken =
    req.body.refreshToken || (usesCookieSession(req) ? req.cookies?.refreshToken : null);
  const result = await authService.refreshSession(refreshToken);
  setAuthCookies(req, res, result);

  res.json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken =
    req.body.refreshToken || (usesCookieSession(req) ? req.cookies?.refreshToken : null);
  await authService.logoutUser(req.user._id, refreshToken);
  clearAuthCookies(req, res);

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user._id);

  res.json({
    success: true,
    data: { user },
  });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateCurrentUser(req.user._id, {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    removeProfileImage: req.body.removeProfileImage,
    file: req.file,
  });

  res.json({
    success: true,
    data: { user },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body.email);

  res.json({
    success: true,
    data: result,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  clearAuthCookies(req, res);

  res.json({
    success: true,
    data: result,
  });
});
