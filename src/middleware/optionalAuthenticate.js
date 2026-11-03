import { User } from '../models/User.js';
import { verifyAccessToken } from '../utils/tokens.js';

export async function optionalAuthenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearerToken || req.cookies?.accessToken;
    if (!token) return next();

    const decoded = verifyAccessToken(token);
    const user = await User.findOne({ _id: decoded.sub, deletedAt: null }).populate('roleId');
    if (user?.isActiveAccount?.()) {
      req.user = user;
      req.role = user.roleId;
      req.permissions = user.roleId?.permissions || [];
    }
  } catch {
    // ignore invalid token for optional auth
  }
  return next();
}
