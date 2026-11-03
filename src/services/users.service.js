import mongoose from 'mongoose';
import { ROLE_SLUGS, USER_STATUS } from '../config/security.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { normalizePhone } from '../utils/phone.js';

async function assertEmailAvailable(email, excludeUserId = null) {
  const filter = { email: email.toLowerCase(), deletedAt: null };
  if (excludeUserId) {
    filter._id = { $ne: excludeUserId };
  }

  const existing = await User.findOne(filter);
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }
}

async function getRoleOrThrow(roleId) {
  const role = await Role.findById(roleId);
  if (!role || !role.isActive) {
    throw new AppError('Role not found or inactive', 400, 'INVALID_ROLE');
  }
  return role;
}

async function countActiveSuperAdmins(excludeUserId = null) {
  const superAdminRole = await Role.findBySlug(ROLE_SLUGS.SUPER_ADMIN);
  if (!superAdminRole) {
    return 0;
  }

  const filter = User.notDeletedFilter({
    roleId: superAdminRole._id,
    status: USER_STATUS.ACTIVE,
  });

  if (excludeUserId) {
    filter._id = { $ne: excludeUserId };
  }

  return User.countDocuments(filter);
}

async function ensureNotLastActiveSuperAdmin(user, actionLabel) {
  const role =
    user.roleId && typeof user.roleId === 'object' && user.roleId.slug
      ? user.roleId
      : await Role.findById(user.roleId);

  if (!role || role.slug !== ROLE_SLUGS.SUPER_ADMIN) {
    return;
  }

  if (user.status !== USER_STATUS.ACTIVE || user.deletedAt) {
    return;
  }

  const remaining = await countActiveSuperAdmins(user._id);
  if (remaining < 1) {
    throw new AppError(
      `Cannot ${actionLabel} the last active super-admin`,
      400,
      'LAST_SUPER_ADMIN'
    );
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listUsers(query) {
  const {
    page,
    limit,
    search,
    status,
    roleId,
    role,
    includeDeleted = false,
  } = query;

  const filter = includeDeleted ? {} : { deletedAt: null };

  if (status) {
    filter.status = status;
  }

  if (roleId) {
    filter.roleId = roleId;
  } else if (role) {
    const roleDoc = await Role.findBySlug(role);
    if (!roleDoc) {
      return {
        users: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
    filter.roleId = roleDoc._id;
  }

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { firstName: rx },
      { lastName: rx },
      { email: rx },
      { phone: rx },
    ];
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(filter).populate('roleId').sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    users: users.map((u) => u.toSafeObject()),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

export async function getUserById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const user = await User.findById(id).populate('roleId');
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return user.toSafeObject();
}

export async function createUser(input) {
  await assertEmailAvailable(input.email);
  const role = await getRoleOrThrow(input.roleId);

  const user = new User({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    phone: normalizePhone(input.phone),
    roleId: role._id,
    status: input.status || USER_STATUS.ACTIVE,
    profileImage: input.profileImage ?? null,
    profile: input.profile || {},
    emailVerified: Boolean(input.emailVerified),
    phoneVerified: Boolean(input.phoneVerified),
  });

  await user.setPassword(input.password);
  await user.save();
  await user.populate('roleId');

  return user.toSafeObject();
}

export async function updateUser(id, input) {
  const user = await User.findById(id).select('+refreshTokens').populate('roleId');
  if (!user || user.deletedAt) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (input.email && input.email.toLowerCase() !== user.email) {
    await assertEmailAvailable(input.email, user._id);
    user.email = input.email.toLowerCase();
    user.emailVerified = false;
  }

  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;
  if (input.phone !== undefined) user.phone = normalizePhone(input.phone);
  if (input.profileImage !== undefined) user.profileImage = input.profileImage;
  if (input.profile !== undefined) user.profile = input.profile;
  if (input.emailVerified !== undefined) user.emailVerified = input.emailVerified;
  if (input.phoneVerified !== undefined) user.phoneVerified = input.phoneVerified;

  if (input.roleId) {
    const nextRole = await getRoleOrThrow(input.roleId);
    const currentSlug = user.roleId?.slug;
    if (currentSlug === ROLE_SLUGS.SUPER_ADMIN && nextRole.slug !== ROLE_SLUGS.SUPER_ADMIN) {
      await ensureNotLastActiveSuperAdmin(user, 'demote');
    }
    user.roleId = nextRole._id;
  }

  if (input.password) {
    await user.setPassword(input.password);
    user.refreshTokens = [];
  }

  await user.save();
  await user.populate('roleId');
  return user.toSafeObject();
}

export async function softDeleteUser(id) {
  const user = await User.findById(id).select('+refreshTokens').populate('roleId');
  if (!user || user.deletedAt) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  await ensureNotLastActiveSuperAdmin(user, 'delete');

  user.deletedAt = new Date();
  user.status = USER_STATUS.INACTIVE;
  user.refreshTokens = [];
  await user.save();
  await user.populate('roleId');

  return user.toSafeObject();
}

export async function updateUserStatus(id, status) {
  const user = await User.findById(id).select('+refreshTokens').populate('roleId');
  if (!user || user.deletedAt) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (status !== USER_STATUS.ACTIVE) {
    await ensureNotLastActiveSuperAdmin(user, 'deactivate');
  }

  user.status = status;
  if (status !== USER_STATUS.ACTIVE) {
    user.refreshTokens = [];
  }

  await user.save();
  await user.populate('roleId');
  return user.toSafeObject();
}
