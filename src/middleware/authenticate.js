import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearerToken || req.cookies?.accessToken;

  if (!token) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const decoded = verifyAccessToken(token);
  const user = await User.findOne(User.notDeletedFilter({ _id: decoded.sub })).populate(
    'roleId'
  );

  if (!user || !user.isActiveAccount()) {
    throw new AppError('Invalid or inactive user', 401, 'UNAUTHORIZED');
  }

  if (!user.roleId || !user.roleId.isActive) {
    throw new AppError('User role is invalid or inactive', 403, 'INVALID_ROLE');
  }

  req.user = user;
  req.role = user.roleId;
  req.permissions = user.roleId.permissions || [];
  req.tokenPayload = decoded;
  next();
});

/**
 * Best-effort auth for middleware that runs before route-level `authenticate`
 * (e.g. the global rate limiter). Populates req.user/req.role on success and
 * always calls next() — never rejects. Only a fully verified, active user with
 * an active role sets req.role, so downstream checks never trust client input.
 */
export const optionalAuthenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearerToken || req.cookies?.accessToken;
    if (!token) return next();

    const decoded = verifyAccessToken(token);
    const user = await User.findOne(User.notDeletedFilter({ _id: decoded.sub })).populate('roleId');
    if (!user || !user.isActiveAccount()) return next();
    if (!user.roleId || !user.roleId.isActive) return next();

    req.user = user;
    req.role = user.roleId;
    req.permissions = user.roleId.permissions || [];
    req.tokenPayload = decoded;
  } catch {
    // Invalid/expired token — treat as unauthenticated; route auth will 401 later.
  }
  next();
};
