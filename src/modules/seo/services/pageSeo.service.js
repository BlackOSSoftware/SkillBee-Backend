import sanitizeHtml from 'sanitize-html';
import { SEO_PAGE_IDENTIFIERS } from '../../../config/security.js';
import { PageSeo } from '../../../models/PageSeo.js';
import { AppError } from '../../../utils/AppError.js';
import { absoluteUrl, normalizePath, validateHttpUrl } from '../utils/seoPaths.js';
import { invalidateSeoCaches } from './seoCache.service.js';
import { getSettingsCached } from './seoSettings.service.js';

const DEFAULT_PAGES = [
  { pageIdentifier: 'home', pagePath: '/', seoTitle: 'Home' },
  { pageIdentifier: 'courses', pagePath: '/courses', seoTitle: 'Courses' },
  { pageIdentifier: 'about', pagePath: '/about', seoTitle: 'About' },
  { pageIdentifier: 'contact', pagePath: '/contact', seoTitle: 'Contact' },
  { pageIdentifier: 'pricing', pagePath: '/pricing', seoTitle: 'Pricing' },
  { pageIdentifier: 'blog', pagePath: '/blog', seoTitle: 'Blog' },
  { pageIdentifier: 'login', pagePath: '/login', seoTitle: 'Login', robotsIndex: false },
  { pageIdentifier: 'register', pagePath: '/register', seoTitle: 'Register', robotsIndex: false },
];

function clean(text, max) {
  return sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

export async function ensureDefaultPages() {
  for (const p of DEFAULT_PAGES) {
    const exists = await PageSeo.findOne({ pageIdentifier: p.pageIdentifier });
    if (!exists) {
      await PageSeo.create({
        pageIdentifier: p.pageIdentifier,
        pagePath: normalizePath(p.pagePath),
        seoTitle: p.seoTitle,
        robotsIndex: p.robotsIndex !== false,
        robotsFollow: true,
        schemaType: 'WebPage',
      });
    }
  }
}

export async function getPageSeoByIdOrIdentifier(id) {
  await ensureDefaultPages();
  let doc = null;
  if (/^[a-f\d]{24}$/i.test(id)) {
    doc = await PageSeo.findOne({ _id: id, deletedAt: null });
  }
  if (!doc) {
    doc = await PageSeo.findOne({ pageIdentifier: String(id).toLowerCase(), deletedAt: null });
  }
  if (!doc) throw new AppError('Page SEO not found', 404, 'PAGE_SEO_NOT_FOUND');
  return doc;
}

export async function getPageSeo(id) {
  const doc = await getPageSeoByIdOrIdentifier(id);
  return doc.toSafeObject();
}

export async function updatePageSeo(req, id, input) {
  const doc = await getPageSeoByIdOrIdentifier(id);
  const settings = await getSettingsCached();

  if (input.pagePath !== undefined) {
    const path = normalizePath(input.pagePath);
    if (!SEO_PAGE_IDENTIFIERS.includes(doc.pageIdentifier) && !path.startsWith('/')) {
      throw new AppError('Invalid page path', 400, 'INVALID_PAGE_PATH');
    }
    doc.pagePath = path;
  }
  if (input.seoTitle !== undefined) doc.seoTitle = clean(input.seoTitle, 120);
  if (input.metaDescription !== undefined) doc.metaDescription = clean(input.metaDescription, 320);
  if (input.slug !== undefined) doc.slug = clean(input.slug, 200).toLowerCase();
  if (input.robotsIndex !== undefined) doc.robotsIndex = Boolean(input.robotsIndex);
  if (input.robotsFollow !== undefined) doc.robotsFollow = Boolean(input.robotsFollow);
  if (input.ogTitle !== undefined) doc.ogTitle = clean(input.ogTitle, 120);
  if (input.ogDescription !== undefined) doc.ogDescription = clean(input.ogDescription, 320);
  if (input.ogImage !== undefined) {
    if (input.ogImage && !validateHttpUrl(input.ogImage)) {
      throw new AppError('Invalid OG image URL', 400, 'INVALID_OG_IMAGE');
    }
    doc.ogImage = clean(input.ogImage, 1000);
  }
  if (input.schemaType !== undefined) doc.schemaType = clean(input.schemaType, 80) || 'WebPage';
  if (input.schemaData !== undefined) doc.schemaData = input.schemaData || {};
  if (input.breadcrumbs !== undefined) {
    doc.breadcrumbs = (input.breadcrumbs || []).slice(0, 10).map((b) => ({
      name: clean(b.name, 120),
      path: normalizePath(b.path),
    }));
  }

  if (input.canonicalUrl !== undefined && input.canonicalUrl) {
    if (!validateHttpUrl(input.canonicalUrl)) {
      throw new AppError('Invalid canonical URL', 400, 'INVALID_CANONICAL');
    }
    doc.canonicalUrl = clean(input.canonicalUrl, 1000);
  } else {
    doc.canonicalUrl = absoluteUrl(settings.siteUrl, doc.pagePath);
  }

  await doc.save();
  await invalidateSeoCaches();
  return doc.toSafeObject();
}

export async function findPageByPath(path) {
  await ensureDefaultPages();
  const p = normalizePath(path);
  return PageSeo.findOne({ pagePath: p, deletedAt: null });
}
