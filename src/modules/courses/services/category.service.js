import { Course } from '../../../models/Course.js';
import { CourseCategory } from '../../../models/CourseCategory.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { invalidateCategoryCaches } from '../../../services/cache/invalidation.service.js';
import { CACHE_TTL, categoriesKey } from '../../../services/cache/keys.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { ensureUniqueCategorySlug } from './courseSlug.service.js';
import { mapThumbnail } from './courseMedia.service.js';

async function assertNoCircularParent(categoryId, parentCategoryId) {
  if (!parentCategoryId) return;
  if (categoryId && parentCategoryId === categoryId.toString()) {
    throw new AppError('Category cannot be its own parent', 400, 'CIRCULAR_CATEGORY');
  }

  let current = parentCategoryId;
  const visited = new Set();
  while (current) {
    if (categoryId && current.toString() === categoryId.toString()) {
      throw new AppError('Circular category relationship detected', 400, 'CIRCULAR_CATEGORY');
    }
    if (visited.has(current.toString())) break;
    visited.add(current.toString());
    const parent = await CourseCategory.findById(current).select('parentCategoryId');
    current = parent?.parentCategoryId || null;
  }
}

export async function listCategories(query, { publicOnly = false } = {}) {
  const filter = { deletedAt: null };
  if (publicOnly) filter.status = 'active';
  if (query.status) filter.status = query.status;
  if (query.parentCategoryId !== undefined) {
    filter.parentCategoryId = query.parentCategoryId || null;
  }
  if (query.search) {
    filter.name = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    CourseCategory.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(query.limit),
    CourseCategory.countDocuments(filter),
  ]);

  return {
    data: rows.map((r) => r.toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getCategoryById(id) {
  const category = await CourseCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
  return category.toSafeObject();
}

export async function createCategory(userId, input) {
  if (input.parentCategoryId) {
    const parent = await CourseCategory.findOne({
      _id: input.parentCategoryId,
      deletedAt: null,
    });
    if (!parent) throw new AppError('Parent category not found', 400, 'INVALID_PARENT');
    await assertNoCircularParent(null, input.parentCategoryId);
  }

  const slug = await ensureUniqueCategorySlug(input.slug || input.name);
  const category = await CourseCategory.create({
    ...input,
    slug,
    image: mapThumbnail(input.image) ?? null,
    createdBy: userId,
    updatedBy: userId,
  });
  await invalidateCategoryCaches();
  return category.toSafeObject();
}

export async function updateCategory(userId, id, input) {
  const category = await CourseCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');

  if (input.parentCategoryId !== undefined) {
    if (input.parentCategoryId) {
      const parent = await CourseCategory.findOne({
        _id: input.parentCategoryId,
        deletedAt: null,
      });
      if (!parent) throw new AppError('Parent category not found', 400, 'INVALID_PARENT');
      await assertNoCircularParent(category._id, input.parentCategoryId);
    }
    category.parentCategoryId = input.parentCategoryId;
  }

  if (input.name !== undefined) category.name = input.name;
  if (input.slug !== undefined) {
    category.slug = await ensureUniqueCategorySlug(input.slug, category._id);
  }
  if (input.description !== undefined) category.description = input.description;
  if (input.image !== undefined) category.image = mapThumbnail(input.image);
  if (input.status !== undefined) category.status = input.status;
  if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
  if (input.seo !== undefined) category.seo = { ...category.seo.toObject?.() || category.seo, ...input.seo };

  category.updatedBy = userId;
  await category.save();
  await invalidateCategoryCaches();
  return category.toSafeObject();
}

export async function deleteCategory(userId, id) {
  const category = await CourseCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');

  const activeCourses = await Course.countDocuments({
    categoryIds: category._id,
    deletedAt: null,
    status: { $ne: 'archived' },
  });
  if (activeCourses > 0) {
    throw new AppError(
      'Category is used by active courses. Reassign or archive courses first.',
      409,
      'CATEGORY_IN_USE',
      { activeCourses }
    );
  }

  category.deletedAt = new Date();
  category.status = 'inactive';
  category.updatedBy = userId;
  await category.save();
  await invalidateCategoryCaches();
  return category.toSafeObject();
}

export async function updateCategoryStatus(userId, id, status) {
  return updateCategory(userId, id, { status });
}

export async function reorderCategories(userId, items) {
  await Promise.all(
    items.map((item) =>
      CourseCategory.updateOne(
        { _id: item.id, deletedAt: null },
        { $set: { sortOrder: item.sortOrder, updatedBy: userId } }
      )
    )
  );
  await invalidateCategoryCaches();
  return { message: 'Categories reordered' };
}

export async function listCategoryCourses(id, query) {
  await getCategoryById(id);
  const filter = { categoryIds: id, deletedAt: null };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    Course.find(filter)
      .select('title slug status level pricing isFeatured publishedAt')
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
      pricingType: c.pricing?.type,
      isFeatured: c.isFeatured,
      publishedAt: c.publishedAt,
    })),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function listPublicCategories() {
  return getOrSetCache(categoriesKey(), CACHE_TTL.CATEGORIES, async () => {
    const rows = await CourseCategory.find({ deletedAt: null, status: 'active' })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return rows.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      description: c.description,
      image: c.image,
      parentCategoryId: c.parentCategoryId ? c.parentCategoryId.toString() : null,
      sortOrder: c.sortOrder,
      seo: c.seo,
    }));
  });
}
