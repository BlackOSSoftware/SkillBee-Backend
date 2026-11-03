import { ROLE_SLUGS, USER_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { Role } from '../../../models/Role.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';

async function instructorRoleIds() {
  const roles = await Role.find({
    slug: { $in: [ROLE_SLUGS.INSTRUCTOR, ROLE_SLUGS.ADMIN, ROLE_SLUGS.SUPER_ADMIN] },
  }).select('_id');
  return roles.map((r) => r._id);
}

export async function listInstructors(query) {
  const roleIds = await instructorRoleIds();
  const filter = {
    deletedAt: null,
    roleId: { $in: roleIds },
  };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }

  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    User.find(filter)
      .populate('roleId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    User.countDocuments(filter),
  ]);

  return {
    data: rows.map((u) => ({
      ...u.toSafeObject(),
      role: u.roleId
        ? { id: u.roleId._id.toString(), name: u.roleId.name, slug: u.roleId.slug }
        : null,
    })),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getInstructorById(id) {
  const roleIds = await instructorRoleIds();
  const user = await User.findOne({
    _id: id,
    deletedAt: null,
    roleId: { $in: roleIds },
  }).populate('roleId', 'name slug');
  if (!user) throw new AppError('Instructor not found', 404, 'INSTRUCTOR_NOT_FOUND');
  return {
    ...user.toSafeObject(),
    role: user.roleId
      ? { id: user.roleId._id.toString(), name: user.roleId.name, slug: user.roleId.slug }
      : null,
  };
}

export async function listInstructorCourses(id, query) {
  await getInstructorById(id);
  const filter = { instructorIds: id, deletedAt: null };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    Course.find(filter)
      .select('title slug status level isFeatured publishedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Course.countDocuments(filter),
  ]);
  return {
    data: rows.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      slug: c.slug,
      status: c.status,
      level: c.level,
      isFeatured: c.isFeatured,
      publishedAt: c.publishedAt,
    })),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function updateInstructorStatus(id, status) {
  if (!Object.values(USER_STATUS).includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }
  const instructor = await getInstructorById(id);
  await User.updateOne({ _id: instructor.id }, { $set: { status } });
  return getInstructorById(id);
}
