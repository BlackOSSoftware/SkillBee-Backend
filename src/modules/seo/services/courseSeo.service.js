import sanitizeHtml from 'sanitize-html';
import { COURSE_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { AppError } from '../../../utils/AppError.js';
import { ensureUniqueCourseSlug } from '../../courses/services/courseSlug.service.js';
import { invalidateCourseCaches } from '../../../services/cache/invalidation.service.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import {
  absoluteUrl,
  coursePublicPath,
  validateHttpUrl,
} from '../utils/seoPaths.js';
import { ensureCourseSlugRedirect } from './redirect.service.js';
import { invalidateSeoCaches } from './seoCache.service.js';
import { getSettingsCached } from './seoSettings.service.js';

function clean(text, max) {
  return sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

export function mapCourseSeoResponse(course, settings) {
  const seo = course.seo?.toObject?.() || course.seo || {};
  const path = coursePublicPath(course.slug);
  const canonical =
    seo.canonicalUrl || absoluteUrl(settings?.siteUrl, path);
  return {
    courseId: course._id.toString(),
    title: course.title,
    slug: course.slug,
    status: course.status,
    publicPath: path,
    seoTitle: seo.metaTitle || '',
    metaDescription: seo.metaDescription || '',
    canonicalUrl: canonical,
    robotsIndex: !seo.noIndex,
    robotsFollow: seo.robotsFollow !== false,
    ogTitle: seo.ogTitle || '',
    ogDescription: seo.ogDescription || '',
    ogImage: seo.ogImage || course.thumbnail?.secureUrl || '',
    focusKeyword: seo.focusKeyword || '',
    schemaType: seo.schemaType || 'Course',
    schemaData: seo.schemaData || {},
  };
}
/**
 * Minimal course list for the SEO course picker.
 * Guarded by seo.manage — intentionally separate from /admin/courses so
 * SEO-only roles can pick a course without course-management permissions.
 */
export async function listCoursesForSeo({ search, page = 1, limit = 20 } = {}) {
  const filter = { deletedAt: null };
  const term = String(search || '').trim();
  if (term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.title = { $regex: escaped, $options: 'i' };
  }
  const [rows, total] = await Promise.all([
    Course.find(filter)
      .select('_id title slug status')
      .sort({ title: 1 })
      .skip(getSkip({ page, limit }))
      .limit(limit)
      .lean(),
    Course.countDocuments(filter),
  ]);
  return {
    data: rows.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      slug: c.slug,
      status: c.status,
    })),
    pagination: buildPagination({ page, limit, total }),
  };
}


export async function getCourseSeo(courseId) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  const settings = await getSettingsCached();
  return mapCourseSeoResponse(course, settings);
}

export async function updateCourseSeo(req, courseId, input) {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  const settings = await getSettingsCached();
  const oldSlug = course.slug;

  const seo = { ...(course.seo?.toObject?.() || course.seo || {}) };

  if (input.seoTitle !== undefined) seo.metaTitle = clean(input.seoTitle, 120);
  if (input.metaTitle !== undefined) seo.metaTitle = clean(input.metaTitle, 120);
  if (input.metaDescription !== undefined) {
    seo.metaDescription = clean(input.metaDescription, 320);
  }
  if (input.robotsIndex !== undefined) seo.noIndex = !input.robotsIndex;
  if (input.noIndex !== undefined) seo.noIndex = Boolean(input.noIndex);
  if (input.robotsFollow !== undefined) seo.robotsFollow = Boolean(input.robotsFollow);
  if (input.ogTitle !== undefined) seo.ogTitle = clean(input.ogTitle, 120);
  if (input.ogDescription !== undefined) seo.ogDescription = clean(input.ogDescription, 320);
  if (input.ogImage !== undefined) {
    if (input.ogImage && !validateHttpUrl(input.ogImage)) {
      throw new AppError('Invalid OG image URL', 400, 'INVALID_OG_IMAGE');
    }
    seo.ogImage = clean(input.ogImage, 1000);
  }
  if (input.focusKeyword !== undefined) seo.focusKeyword = clean(input.focusKeyword, 100);
  if (input.schemaType !== undefined) seo.schemaType = clean(input.schemaType, 80) || 'Course';
  if (input.schemaData !== undefined) seo.schemaData = input.schemaData || {};

  if (input.slug !== undefined) {
    const nextSlug = await ensureUniqueCourseSlug(input.slug, course._id);
    // Reject if another course somehow took it mid-flight (unique index also guards)
    const clash = await Course.findOne({ slug: nextSlug, _id: { $ne: course._id } }).select('_id');
    if (clash) throw new AppError('Slug already in use', 409, 'DUPLICATE_SLUG');
    course.slug = nextSlug;
  }

  const path = coursePublicPath(course.slug);
  if (input.canonicalUrl) {
    if (!validateHttpUrl(input.canonicalUrl)) {
      throw new AppError('Invalid canonical URL', 400, 'INVALID_CANONICAL');
    }
    seo.canonicalUrl = clean(input.canonicalUrl, 1000);
  } else {
    seo.canonicalUrl = absoluteUrl(settings.siteUrl, path);
  }

  course.seo = seo;
  course.updatedBy = req.user._id;
  try {
    await course.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('Slug already in use', 409, 'DUPLICATE_SLUG');
    }
    throw err;
  }

  if (oldSlug !== course.slug && course.status === COURSE_STATUS.PUBLISHED) {
    await ensureCourseSlugRedirect({
      oldSlug,
      newSlug: course.slug,
      actorId: req.user._id,
    });
  }

  await invalidateCourseCaches({ slug: course.slug, courseId: course._id.toString() });
  if (oldSlug !== course.slug) {
    await invalidateCourseCaches({ slug: oldSlug, courseId: course._id.toString() });
  }
  await invalidateSeoCaches();
  return mapCourseSeoResponse(course, settings);
}
