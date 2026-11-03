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
