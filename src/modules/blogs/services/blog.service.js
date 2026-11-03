import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { BLOG_STATUS, Blog } from '../../../models/Blog.js';
import { BlogCategory } from '../../../models/BlogCategory.js';
import { clearCacheByPrefix, getOrSetCache } from '../../../services/cache/cache.service.js';
import { invalidateSeoCaches } from '../../seo/services/seoCache.service.js';
import { getSettingsCached } from '../../seo/services/seoSettings.service.js';
import { absoluteUrl, normalizePath } from '../../seo/utils/seoPaths.js';
import { sanitizeRichText } from '../../../utils/sanitizeHtml.js';
import { slugify } from '../../../utils/slugify.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';

const PUBLIC_PREFIX = 'blog:public:';

function toKebab(value) {
  return slugify(value).replace(/_/g, '-');
}

function readingTimeFromContent(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function normalizeTags(tags = []) {
  return [...new Set((tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(
    0,
    30
  );
}

async function ensureUniqueBlogSlug(base, excludeId = null) {
  let slug = toKebab(base);
  if (!slug) throw new AppError('Invalid slug', 400, 'INVALID_SLUG');
  let candidate = slug;
  let i = 2;
  while (true) {
    const existing = await Blog.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${slug}-${i}`;
    i += 1;
  }
}

async function invalidateBlogCaches() {
  await clearCacheByPrefix(PUBLIC_PREFIX);
  await invalidateSeoCaches();
}

function blogPublicPath(slug) {
  return normalizePath(`/blog/${slug}`);
}

export async function createBlog(req, input) {
  const slug = await ensureUniqueBlogSlug(input.slug || input.title);
  const content = sanitizeRichText(input.content || '');
  if (!content.trim()) throw new AppError('Content is required', 400, 'CONTENT_REQUIRED');

  const doc = await Blog.create({
    title: String(input.title).trim().slice(0, 200),
    slug,
    excerpt: sanitizeHtml(String(input.excerpt || ''), { allowedTags: [], allowedAttributes: {} }).slice(
      0,
      500
    ),
    content,
    featuredImage: input.featuredImage || null,
    authorId: req.user._id,
    categoryIds: input.categoryIds || [],
    tags: normalizeTags(input.tags),
    status: BLOG_STATUS.DRAFT,
    isFeatured: Boolean(input.isFeatured),
    readingTime: readingTimeFromContent(content),
    createdBy: req.user._id,
    updatedBy: req.user._id,
    seo: input.seo || {},
  });
  await invalidateBlogCaches();
  return doc.toAdminObject();
}

export async function updateBlog(req, id, input) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  const oldSlug = doc.slug;

  if (input.title !== undefined) doc.title = String(input.title).trim().slice(0, 200);
  if (input.slug !== undefined) {
    doc.slug = await ensureUniqueBlogSlug(input.slug, doc._id);
  }
  if (input.excerpt !== undefined) {
    doc.excerpt = sanitizeHtml(String(input.excerpt), { allowedTags: [], allowedAttributes: {} }).slice(
      0,
      500
    );
  }
  if (input.content !== undefined) {
    doc.content = sanitizeRichText(input.content);
    doc.readingTime = readingTimeFromContent(doc.content);
  }
  if (input.featuredImage !== undefined) doc.featuredImage = input.featuredImage;
  if (input.categoryIds !== undefined) doc.categoryIds = input.categoryIds;
  if (input.tags !== undefined) doc.tags = normalizeTags(input.tags);
  if (input.isFeatured !== undefined) doc.isFeatured = Boolean(input.isFeatured);
  doc.updatedBy = req.user._id;
  await doc.save();

  if (oldSlug !== doc.slug && doc.status === BLOG_STATUS.PUBLISHED) {
    const { SeoRedirect } = await import('../../../models/SeoRedirect.js');
    const sourcePath = blogPublicPath(oldSlug);
    const destinationPath = blogPublicPath(doc.slug);
    if (sourcePath !== destinationPath) {
      await SeoRedirect.findOneAndUpdate(
        { sourcePath, deletedAt: null },
        {
          $set: {
            destinationPath,
            redirectType: 301,
            isActive: true,
            updatedBy: req.user._id,
          },
          $setOnInsert: { createdBy: req.user._id, sourcePath },
        },
        { upsert: true }
      );
    }
  }

  await invalidateBlogCaches();
  return doc.toAdminObject();
}

export async function setBlogStatus(req, id, status) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  const wasPublished = doc.status === BLOG_STATUS.PUBLISHED;
  if (status === BLOG_STATUS.PUBLISHED) {
    if (!doc.title?.trim() || !doc.content?.trim()) {
      throw new AppError('Title and content required to publish', 422, 'PUBLISH_VALIDATION');
    }
    doc.status = BLOG_STATUS.PUBLISHED;
    doc.publishedAt = doc.publishedAt || new Date();
    const settings = await getSettingsCached();
    if (!doc.seo?.canonicalUrl) {
      doc.seo = {
        ...(doc.seo?.toObject?.() || doc.seo || {}),
        canonicalUrl: absoluteUrl(settings.siteUrl, blogPublicPath(doc.slug)),
      };
    }
  } else if (status === BLOG_STATUS.DRAFT) {
    doc.status = BLOG_STATUS.DRAFT;
  } else if (status === BLOG_STATUS.ARCHIVED) {
    doc.status = BLOG_STATUS.ARCHIVED;
  }
  doc.updatedBy = req.user._id;
  await doc.save();
  await invalidateBlogCaches();
  if (status === BLOG_STATUS.PUBLISHED && !wasPublished) {
    const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
    emitAppEventAsync('blog.published', {
      blogId: doc._id,
      title: doc.title,
      slug: doc.slug,
    });
  }
  return doc.toAdminObject();
}

export async function deleteBlog(req, id) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  doc.deletedAt = new Date();
  doc.status = BLOG_STATUS.ARCHIVED;
  doc.updatedBy = req.user._id;
  await doc.save();
  await invalidateBlogCaches();
  return doc.toAdminObject();
}

export async function getBlogSeo(id) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  const settings = await getSettingsCached();
  return {
    blogId: doc._id.toString(),
    slug: doc.slug,
    status: doc.status,
    publicPath: blogPublicPath(doc.slug),
    seo: {
      ...(doc.seo?.toObject?.() || doc.seo || {}),
      canonicalUrl:
        doc.seo?.canonicalUrl || absoluteUrl(settings.siteUrl, blogPublicPath(doc.slug)),
    },
  };
}

export async function updateBlogSeo(req, id, input) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  const oldSlug = doc.slug;
  const settings = await getSettingsCached();
  const seo = { ...(doc.seo?.toObject?.() || doc.seo || {}) };

  for (const key of [
    'seoTitle',
    'metaDescription',
    'canonicalUrl',
    'ogTitle',
    'ogDescription',
    'ogImage',
    'schemaType',
  ]) {
    if (input[key] !== undefined) seo[key] = String(input[key] || '').slice(0, 1000);
  }
  if (input.robotsIndex !== undefined) seo.robotsIndex = Boolean(input.robotsIndex);
  if (input.robotsFollow !== undefined) seo.robotsFollow = Boolean(input.robotsFollow);
  if (input.schemaData !== undefined) seo.schemaData = input.schemaData || {};
  if (input.slug !== undefined) {
    doc.slug = await ensureUniqueBlogSlug(input.slug, doc._id);
  }
  if (!seo.canonicalUrl) {
    seo.canonicalUrl = absoluteUrl(settings.siteUrl, blogPublicPath(doc.slug));
  }
  doc.seo = seo;
  doc.updatedBy = req.user._id;
  await doc.save();

  if (oldSlug !== doc.slug && doc.status === BLOG_STATUS.PUBLISHED) {
    const { SeoRedirect } = await import('../../../models/SeoRedirect.js');
    const sourcePath = blogPublicPath(oldSlug);
    const destinationPath = blogPublicPath(doc.slug);
    await SeoRedirect.findOneAndUpdate(
      { sourcePath, deletedAt: null },
      {
        $set: {
          destinationPath,
          redirectType: 301,
          isActive: true,
          updatedBy: req.user._id,
        },
        $setOnInsert: { createdBy: req.user._id, sourcePath },
      },
      { upsert: true }
    );
  }

  await invalidateBlogCaches();
  return getBlogSeo(doc._id);
}

export async function createPreview(req, id) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  const raw = crypto.randomBytes(24).toString('hex');
  doc.previewTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  doc.previewExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await doc.save();
  return {
    previewToken: raw,
    expiresAt: doc.previewExpiresAt,
    path: `/blog/preview/${doc.slug}?token=${raw}`,
  };
}

export async function listAdminBlogs(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured;
  if (query.authorId) filter.authorId = query.authorId;
  if (query.categoryId) filter.categoryIds = query.categoryId;
  if (query.tag) filter.tags = String(query.tag).toLowerCase();
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { excerpt: rx }, { tags: rx }];
  }
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    Blog.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    Blog.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => Blog.hydrate(r).toAdminObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getAdminBlog(id) {
  const doc = await Blog.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
  return doc.toAdminObject();
}

async function populateAuthor(doc) {
  const { User } = await import('../../../models/User.js');
  const author = await User.findById(doc.authorId).select('firstName lastName');
  return author
    ? { id: author._id.toString(), firstName: author.firstName, lastName: author.lastName }
    : null;
}

export async function listPublicBlogs(query) {
  const key = `${PUBLIC_PREFIX}list:${query.page}:${query.limit}:${query.categorySlug || '-'}:${query.tag || '-'}:${query.search || '-'}:${query.sort || 'newest'}`;
  return getOrSetCache(key, 120, async () => {
    const filter = { deletedAt: null, status: BLOG_STATUS.PUBLISHED };
    if (query.tag) filter.tags = String(query.tag).toLowerCase();
    if (query.categorySlug) {
      const cat = await BlogCategory.findOne({
        slug: query.categorySlug,
        status: 'published',
        deletedAt: null,
      });
      if (!cat) {
        return {
          data: [],
          pagination: buildPagination({ page: query.page, limit: query.limit, total: 0 }),
        };
      }
      filter.categoryIds = cat._id;
    }
    if (query.search) {
      const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }, { tags: rx }];
    }
    const sort = query.sort === 'oldest' ? { publishedAt: 1 } : { publishedAt: -1 };
    const skip = getSkip(query);
    const [rows, total] = await Promise.all([
      Blog.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
      Blog.countDocuments(filter),
    ]);
    const data = [];
    for (const r of rows) {
      const blog = Blog.hydrate(r);
      // eslint-disable-next-line no-await-in-loop
      const author = await populateAuthor(blog);
      data.push(blog.toPublicObject({ author }));
    }
    return {
      data,
      pagination: buildPagination({ page: query.page, limit: query.limit, total }),
    };
  });
}

export async function getPublicBlogBySlug(slug) {
  const key = `${PUBLIC_PREFIX}detail:${slug}`;
  return getOrSetCache(key, 120, async () => {
    const doc = await Blog.findOne({
      slug,
      deletedAt: null,
      status: BLOG_STATUS.PUBLISHED,
    });
    if (!doc) throw new AppError('Blog not found', 404, 'BLOG_NOT_FOUND');
    // Fire-and-forget view increment
    Blog.updateOne({ _id: doc._id }, { $inc: { viewsCount: 1 } }).catch(() => undefined);
    const author = await populateAuthor(doc);
    return doc.toPublicObject({ author });
  });
}

export async function listFeaturedBlogs(query) {
  return listPublicBlogs({ ...query, /* featured filter via re-query */ page: query.page, limit: query.limit });
}

export async function listFeaturedOnly(query) {
  const key = `${PUBLIC_PREFIX}featured:${query.page}:${query.limit}`;
  return getOrSetCache(key, 120, async () => {
    const filter = { deletedAt: null, status: BLOG_STATUS.PUBLISHED, isFeatured: true };
    const skip = getSkip(query);
    const [rows, total] = await Promise.all([
      Blog.find(filter).sort({ publishedAt: -1 }).skip(skip).limit(query.limit).lean(),
      Blog.countDocuments(filter),
    ]);
    const data = [];
    for (const r of rows) {
      const blog = Blog.hydrate(r);
      // eslint-disable-next-line no-await-in-loop
      const author = await populateAuthor(blog);
      data.push(blog.toPublicObject({ author }));
    }
    return {
      data,
      pagination: buildPagination({ page: query.page, limit: query.limit, total }),
    };
  });
}

export async function createCategory(input) {
  const slug = await ensureUniqueCategorySlug(input.slug || input.name);
  try {
    const doc = await BlogCategory.create({
      name: String(input.name).trim().slice(0, 120),
      slug,
      description: String(input.description || '').slice(0, 1000),
      status: input.status || 'published',
    });
    await invalidateBlogCaches();
    return doc.toSafeObject();
  } catch (err) {
    if (err?.code === 11000) throw new AppError('Category slug exists', 409, 'DUPLICATE_SLUG');
    throw err;
  }
}

async function ensureUniqueCategorySlug(base, excludeId = null) {
  let slug = toKebab(base);
  if (!slug) throw new AppError('Invalid slug', 400, 'INVALID_SLUG');
  let candidate = slug;
  let i = 2;
  while (true) {
    const existing = await BlogCategory.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${slug}-${i}`;
    i += 1;
  }
}

export async function listPublicCategories() {
  const rows = await BlogCategory.find({ status: 'published', deletedAt: null })
    .sort({ name: 1 })
    .lean();
  return rows.map((r) => BlogCategory.hydrate(r).toSafeObject());
}

export { blogPublicPath };
