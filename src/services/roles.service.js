import mongoose from 'mongoose';
import { PERMISSION_CATALOG, ROLE_SLUGS } from '../config/security.js';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { slugify } from '../utils/slugify.js';

async function assertValidPermissionCodes(codes) {
  const unique = [...new Set(codes.map((c) => c.toLowerCase()))];
  const found = await Permission.find({ code: { $in: unique } });
  const foundCodes = new Set(found.map((p) => p.code));
  const missing = unique.filter((code) => !foundCodes.has(code));

  if (missing.length) {
    throw new AppError('Unknown permissions', 400, 'INVALID_PERMISSIONS', { missing });
  }

  return unique;
}

export async function listRoles() {
  const roles = await Role.find().sort({ name: 1 });
  return roles.map((r) => r.toSafeObject());
}

export async function createRole(input) {
  const slug = input.slug || slugify(input.name);
  if (!slug) {
    throw new AppError('Invalid role slug', 400, 'INVALID_SLUG');
  }

  const existing = await Role.findOne({ slug });
  if (existing) {
    throw new AppError('Role slug already exists', 409, 'ROLE_EXISTS');
  }

  const permissions = await assertValidPermissionCodes(input.permissions || []);

  const role = await Role.create({
    name: input.name,
    slug,
    description: input.description || '',
    permissions,
    isSystem: false,
    isActive: input.isActive !== false,
  });

  return role.toSafeObject();
}

export async function updateRole(id, input) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Role not found', 404, 'NOT_FOUND');
  }

  const role = await Role.findById(id);
  if (!role) {
    throw new AppError('Role not found', 404, 'NOT_FOUND');
  }

  if (role.isSystem && input.isActive === false) {
    throw new AppError('System roles cannot be deactivated', 400, 'SYSTEM_ROLE');
  }

  if (input.name !== undefined) role.name = input.name;
  if (input.description !== undefined) role.description = input.description;
  if (input.isActive !== undefined) role.isActive = input.isActive;

  await role.save();
  return role.toSafeObject();
}

export async function deleteRole(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Role not found', 404, 'NOT_FOUND');
  }

  const role = await Role.findById(id);
  if (!role) {
    throw new AppError('Role not found', 404, 'NOT_FOUND');
  }

  if (role.isSystem) {
    throw new AppError('System roles cannot be deleted', 400, 'SYSTEM_ROLE');
  }

  const assignedCount = await User.countDocuments({ roleId: role._id, deletedAt: null });
  if (assignedCount > 0) {
    throw new AppError('Role is assigned to users', 400, 'ROLE_IN_USE', {
      assignedCount,
    });
  }

  await role.deleteOne();
  return { message: 'Role deleted' };
}

export async function listPermissions() {
  const permissions = await Permission.find().sort({ module: 1, code: 1 });
  if (!permissions.length) {
    return PERMISSION_CATALOG.map((p, index) => ({
      id: `catalog-${index}`,
      code: p.code,
      name: p.name,
      module: p.module,
      description: p.description || p.name,
    }));
  }
  return permissions.map((p) => p.toSafeObject());
}

export async function assignRolePermissions(id, permissionCodes) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Role not found', 404, 'NOT_FOUND');
  }

  const role = await Role.findById(id);
  if (!role) {
    throw new AppError('Role not found', 404, 'NOT_FOUND');
  }

  if (role.slug === ROLE_SLUGS.SUPER_ADMIN) {
    // Super admin always keeps full catalog; still allow explicit assign of all codes
  }

  const permissions = await assertValidPermissionCodes(permissionCodes);
  role.permissions = permissions;
  await role.save();
  return role.toSafeObject();
}
