import { COURSE_STATUS } from '../../../config/security.js';
import { Blog, BLOG_STATUS } from '../../../models/Blog.js';
import { BlogCategory } from '../../../models/BlogCategory.js';
import { Course } from '../../../models/Course.js';
import { PageSeo } from '../../../models/PageSeo.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import {
  absoluteUrl,
  blogCategoryPublicPath,
  blogPublicPath,
  coursePublicPath,
  getSiteOrigin,
  normalizePath,
} from '../utils/seoPaths.js';
import { ensureDefaultPages } from './pageSeo.service.js';
import { SEO_CACHE } from './seoCache.service.js';
import { getSettingsCached } from './seoSettings.service.js';

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const parts = [`  <url>`, `    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${xmlEscape(changefreq)}</changefreq>`);
  if (priority != null) parts.push(`    <priority>${priority}</priority>`);
  parts.push(`  </url>`);
  return parts.join('\n');
}

export async function collectSitemapUrls() {
  const settings = await getSettingsCached();
  await ensureDefaultPages();
  const site = getSiteOrigin(settings.siteUrl);
  const urls = [];
  const seen = new Set();

  const push = (entry) => {
    const loc = entry.loc;
    if (!loc || seen.has(loc)) return;
    seen.add(loc);
    urls.push(entry);
  };

  if (settings.sitemapSettings?.includePages !== false) {
    const pages = await PageSeo.find({
      deletedAt: null,
      robotsIndex: true,
    })
      .select('pagePath canonicalUrl updatedAt')
      .lean();
    for (const p of pages) {
      const path = normalizePath(p.pagePath);
      const loc = p.canonicalUrl || absoluteUrl(settings.siteUrl, path);
      push({
        loc,
        lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
        changefreq: settings.sitemapSettings?.changefreqPages || 'monthly',
        priority: path === '/' ? '1.0' : '0.7',
      });
    }
  }

  if (settings.sitemapSettings?.includeCourses !== false) {
    const courses = await Course.find({
      deletedAt: null,
      status: COURSE_STATUS.PUBLISHED,
      'seo.noIndex': { $ne: true },
    })
      .select('slug seo.canonicalUrl seo.noIndex updatedAt publishedAt')
      .lean();

    for (const c of courses) {
      if (c.seo?.noIndex) continue;
      const path = coursePublicPath(c.slug);
      const loc = c.seo?.canonicalUrl || absoluteUrl(settings.siteUrl, path);
      push({
        loc,
        lastmod: (c.updatedAt || c.publishedAt)
          ? new Date(c.updatedAt || c.publishedAt).toISOString()
          : undefined,
        changefreq: settings.sitemapSettings?.changefreqCourses || 'weekly',
        priority: '0.8',
      });
    }
  }

  const blogs = await Blog.find({
    deletedAt: null,
    status: BLOG_STATUS.PUBLISHED,
    'seo.robotsIndex': { $ne: false },
  })
    .select('slug seo.canonicalUrl seo.robotsIndex updatedAt publishedAt')
    .lean();

  for (const b of blogs) {
    if (b.seo?.robotsIndex === false) continue;
    const path = blogPublicPath(b.slug);
    const loc = b.seo?.canonicalUrl || absoluteUrl(settings.siteUrl, path);
    push({
      loc,
      lastmod: (b.updatedAt || b.publishedAt)
        ? new Date(b.updatedAt || b.publishedAt).toISOString()
        : undefined,
      changefreq: 'weekly',
      priority: '0.7',
    });
  }

  const categories = await BlogCategory.find({
    deletedAt: null,
    status: 'published',
  })
    .select('slug updatedAt')
    .lean();

  for (const cat of categories) {
    const path = blogCategoryPublicPath(cat.slug);
    push({
      loc: absoluteUrl(settings.siteUrl, path),
      lastmod: cat.updatedAt ? new Date(cat.updatedAt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: '0.5',
    });
  }

  void site;
  return { settings, urls };
}

export async function generateSitemapXml() {
  return getOrSetCache(SEO_CACHE.sitemap, 300, async () => {
    const { settings, urls } = await collectSitemapUrls();
    if (settings.sitemapSettings?.enabled === false) {
      return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;
    }
    const max = settings.sitemapSettings?.maxUrlsPerSitemap || 5000;
    const slice = urls.slice(0, max);
    const body = slice.map((u) => urlEntry(u)).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  });
}

export async function generateSitemapIndexXml() {
  return getOrSetCache(SEO_CACHE.sitemapIndex, 300, async () => {
    const settings = await getSettingsCached();
    const origin = getSiteOrigin(settings.siteUrl);
    // Single sitemap is enough for current scale; index points at it for future split.
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${xmlEscape(`${origin}/sitemap.xml`)}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </sitemap>\n</sitemapindex>\n`;
  });
}
