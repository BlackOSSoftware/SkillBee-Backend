import { Course } from '../../../models/Course.js';
import { CourseCategory } from '../../../models/CourseCategory.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { slugify } from '../../../utils/slugify.js';
import { AppError } from '../../../utils/AppError.js';

function toKebab(value) {
  return slugify(value).replace(/_/g, '-');
}

export async function ensureUniqueCourseSlug(base, excludeId = null) {
  let slug = toKebab(base);
  if (!slug) throw new AppError('Invalid slug', 400, 'INVALID_SLUG');

  let candidate = slug;
  let i = 2;
  while (true) {
    const existing = await Course.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${slug}-${i}`;
    i += 1;
  }
}

export async function ensureUniqueCategorySlug(base, excludeId = null) {
  let slug = toKebab(base);
  if (!slug) throw new AppError('Invalid slug', 400, 'INVALID_SLUG');

  let candidate = slug;
  let i = 2;
  while (true) {
    const existing = await CourseCategory.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${slug}-${i}`;
    i += 1;
  }
}

export async function ensureUniqueLessonSlug(courseId, base, excludeId = null) {
  let slug = toKebab(base);
  if (!slug) throw new AppError('Invalid slug', 400, 'INVALID_SLUG');

  let candidate = slug;
  let i = 2;
  while (true) {
    const existing = await CourseLesson.findOne({
      courseId,
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${slug}-${i}`;
    i += 1;
  }
}
