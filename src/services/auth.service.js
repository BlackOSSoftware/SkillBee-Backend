import crypto from 'crypto';
import { ROLE_SLUGS, USER_STATUS, security } from '../config/security.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { AppError } from '../utils/AppError.js';
import { normalizePhone } from '../utils/phone.js';
import {
  destroyCloudinaryImage,
  uploadImageBufferToCloudinary,
} from '../modules/media/services/cloudinary.service.js';
import { assertSignatureMatches } from '../modules/media/utils/fileValidation.js';
import {
  generateRawToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

function buildTokenPayload(user, role) {
  return {
    sub: user._id.toString(),
    email: user.email,
    roleId: role?._id?.toString() || user.roleId?.toString(),
    role: role?.slug || null,
  };
}

function parseExpiryToMs(expiresIn) {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

async function loadRole(roleId) {
  const role = await Role.findById(roleId);
  if (!role || !role.isActive) {
    throw new AppError('User role is invalid or inactive', 403, 'INVALID_ROLE');
  }
  return role;
}

async function issueTokens(user, role) {
  const resolvedRole = role || (await loadRole(user.roleId));
  const payload = buildTokenPayload(user, resolvedRole);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseExpiryToMs(security.refreshToken.expiresIn));

  user.refreshTokens = (user.refreshTokens || [])
    .filter((t) => t.expiresAt > new Date())
    .slice(-4);
  user.refreshTokens.push({ tokenHash, expiresAt });
  await user.save();

  user.roleId = resolvedRole;
  return { accessToken, refreshToken, expiresAt, role: resolvedRole };
}

async function findActiveUserByEmail(email, extraSelect = '') {
  return User.findOne(User.notDeletedFilter({ email }))
    .select(`+passwordHash +refreshTokens ${extraSelect}`.trim())
    .populate('roleId');
}

export async function registerUser(input) {
  const email = input.email.toLowerCase();
  const existing = await User.findOne({ email, deletedAt: null });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const studentRole = await Role.findBySlug(ROLE_SLUGS.STUDENT);
  if (!studentRole) {
    throw new AppError('Student role is not configured', 500, 'ROLE_MISSING');
  }

  const user = new User({
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone: normalizePhone(input.phone),
    roleId: studentRole._id,
    status: USER_STATUS.ACTIVE,
    profile: input.profile || {},
  });
  await user.setPassword(input.password);
  await user.save();

  const withTokens = await User.findById(user._id).select('+refreshTokens');
  const tokens = await issueTokens(withTokens, studentRole);

  try {
    const { emitAppEventAsync } = await import('./events/eventBus.service.js');
    emitAppEventAsync('account.created', {
      userId: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch {
    // never block registration
  }

  return {
    user: {
      ...user.toSafeObject(),
      role: studentRole.toSafeObject(),
      roleId: studentRole._id.toString(),
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function loginUser({ email, password }) {
  const user = await findActiveUserByEmail(email);

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.isActiveAccount()) {
    throw new AppError('Account is not active', 403, 'ACCOUNT_INACTIVE');
  }

  const role = user.roleId;
  if (!role || !role.isActive) {
    throw new AppError('User role is invalid or inactive', 403, 'INVALID_ROLE');
  }

  user.lastLogin = new Date();
  const tokens = await issueTokens(user, role);

  return {
    user: user.toSafeObject(),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) {
    throw new AppError('Refresh token required', 401, 'UNAUTHORIZED');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findOne(User.notDeletedFilter({ _id: decoded.sub }))
    .select('+refreshTokens')
    .populate('roleId');

  if (!user || !user.isActiveAccount()) {
    throw new AppError('Invalid or inactive user', 401, 'UNAUTHORIZED');
  }

  const role = user.roleId;
  if (!role || !role.isActive) {
    throw new AppError('User role is invalid or inactive', 403, 'INVALID_ROLE');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = user.refreshTokens.find(
    (t) => t.tokenHash === tokenHash && t.expiresAt > new Date()
  );

  if (!stored) {
    throw new AppError('Refresh token revoked or expired', 401, 'INVALID_REFRESH_TOKEN');
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  const tokens = await issueTokens(user, role);

  return {
    user: user.toSafeObject(),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function logoutUser(userId, refreshToken) {
  if (!refreshToken) {
    return;
  }

  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) {
    return;
  }

  const tokenHash = hashToken(refreshToken);
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  await user.save();
}

export async function getCurrentUser(userId) {
  const user = await User.findOne(User.notDeletedFilter({ _id: userId })).populate('roleId');
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return user.toSafeObject();
}

const AVATAR_CLOUDINARY_FOLDER = 'avatars';

/**
 * Extract the Cloudinary public_id from a stored secure_url so the previous
 * avatar asset can be destroyed after a successful replace/remove. Returns
 * null for non-Cloudinary URLs (external avatars are left untouched).
 */
function cloudinaryPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('res.cloudinary.com')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = segments.indexOf('upload');
    if (uploadIndex === -1) return null;
    const rest = segments.slice(uploadIndex + 1);
    // Skip the optional /v<timestamp>/ version segment.
    if (rest.length && /^v\d+$/.test(rest[0])) rest.shift();
    if (!rest.length) return null;
    const last = rest.length - 1;
    rest[last] = rest[last].replace(/\.[a-z0-9]+$/i, '');
    return rest.join('/');
  } catch {
    return null;
  }
}

/**
 * Self-service profile update (PUT /auth/me). Only firstName/lastName and the
 * profile photo are writable — protected fields are rejected upstream.
 *
 * Photo lifecycle is ordered so the existing image is never lost before the
 * replacement upload succeeds:
 *   1. upload new avatar to Cloudinary (old image untouched)
 *   2. persist the new URL on the user
 *   3. best-effort destroy the previous Cloudinary asset
 */
export async function updateCurrentUser(userId, input = {}) {
  const user = await User.findOne(User.notDeletedFilter({ _id: userId })).populate('roleId');
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const previousImage = user.profileImage || null;
  let uploaded = null;

  if (input.file) {
    assertSignatureMatches(input.file.buffer, input.file.mimetype);
    const publicId = `avatar-${user._id.toString()}-${crypto.randomBytes(4).toString('hex')}`;
    uploaded = await uploadImageBufferToCloudinary(input.file.buffer, {
      folder: `${env.CLOUDINARY_UPLOAD_FOLDER}/${AVATAR_CLOUDINARY_FOLDER}`,
      publicId,
      originalFileName: input.file.originalname,
    });
    user.profileImage = uploaded.secureUrl;
  } else if (input.removeProfileImage) {
    user.profileImage = null;
  }

  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;

  try {
    await user.save();
  } catch (err) {
    // The DB write failed after a successful upload — remove the orphan.
    if (uploaded?.publicId) {
      await destroyCloudinaryImage(uploaded.publicId).catch(() => {});
    }
    throw err;
  }

  if (previousImage && previousImage !== user.profileImage) {
    const oldPublicId = cloudinaryPublicIdFromUrl(previousImage);
    if (oldPublicId) {
      await destroyCloudinaryImage(oldPublicId).catch(() => {});
    }
  }

  return user.toSafeObject();
}

export async function requestPasswordReset(email) {
  const user = await User.findOne(User.notDeletedFilter({ email: email.toLowerCase() }));

  if (!user) {
    return { message: 'If that email exists, a reset link has been sent' };
  }

  await PasswordResetToken.deleteMany({ user: user._id });

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + security.passwordResetExpiresMinutes * 60 * 1000
  );

  await PasswordResetToken.create({
    user: user._id,
    tokenHash,
    expiresAt,
  });

  try {
    const { env } = await import('../config/env.js');
    const base = (env.EMAIL_FRONTEND_URL || env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
    const resetLink = base ? `${base}/reset-password?token=${rawToken}` : '';
    const { emitAppEventAsync } = await import('./events/eventBus.service.js');
    emitAppEventAsync('password.reset_requested', {
      userId: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      resetLink,
    });
  } catch {
    // never block password reset request
  }

  return {
    message: 'If that email exists, a reset link has been sent',
    ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {}),
  };
}

export async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const record = await PasswordResetToken.findOne({ tokenHash, usedAt: null });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
  }

  const user = await User.findById(record.user).select('+passwordHash +refreshTokens');
  if (!user || user.deletedAt) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  await user.setPassword(password);
  user.refreshTokens = [];
  await user.save();

  record.usedAt = new Date();
  await record.save();

  return { message: 'Password updated successfully' };
}
