import { COURSE_STATUS } from '../../../config/security.js';
import { Blog, BLOG_STATUS } from '../../../models/Blog.js';
import { Course } from '../../../models/Course.js';
import { User } from '../../../models/User.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { AppError } from '../../../utils/AppError.js';
import { env } from '../../../config/env.js';
import {
  absoluteUrl,
  blogPublicPath,
  coursePublicPath,
  getSiteOrigin,
  normalizePath,
} from '../utils/seoPaths.js';
import { findPageByPath } from './pageSeo.service.js';
import { resolveRedirect } from './redirect.service.js';
import {
  buildBlogPostingSchema,
  buildBreadcrumbSchema,
  buildCourseSchema,
  buildOrganizationSchema,
  buildWebPageSchema,
  buildWebSiteSchema,
  toJsonLdScriptContent,
} from './schema.service.js';
import { SEO_CACHE } from './seoCache.service.js';
import { getSettingsCached } from './seoSettings.service.js';

function robotsDirective(index, follow) {
  return `${index ? 'index' : 'noindex'}, ${follow ? 'follow' : 'nofollow'}`;
}

function pick(...values) {
  for (const v of values) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}

function courseSlugFromPath(path) {
  const prefix = (env.COURSE_PUBLIC_PATH_PREFIX || '/courses').replace(/\/$/, '') || '/courses';
  if (path === prefix) return null;
  if (!path.startsWith(`${prefix}/`)) return null;
  const slug = path.slice(prefix.length + 1).split('/')[0];
  return slug || null;
}

function blogSlugFromPath(path) {
  if (!path.startsWith('/blog/')) return null;
  const rest = path.slice('/blog/'.length);
  if (!rest || rest.startsWith('category/') || rest.startsWith('preview/') || rest.startsWith('tag/')) {
    return null;
  }
  const slug = rest.split('/')[0];
  return slug || null;
}

async function buildBlogMetadata(blog, settings, author) {
  const seo = blog.seo || {};
  const path = blogPublicPath(blog.slug);
  const canonical = pick(seo.canonicalUrl, absoluteUrl(settings.siteUrl, path));
  const title = pick(seo.seoTitle, blog.title, settings.defaultSeoTitle);
  const description = pick(
    seo.metaDescription,
    blog.excerpt,
    settings.defaultMetaDescription
  );
  const ogImage = pick(
    seo.ogImage,
    blog.featuredImage?.secureUrl,
    settings.defaultOgImage
  );
  const index = seo.robotsIndex !== false && settings.defaultRobotsIndex !== false;
  const follow = seo.robotsFollow !== false && settings.defaultRobotsFollow !== false;

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: blog.title, path },
  ];

  const schemas = [
    buildOrganizationSchema(settings),
    buildWebSiteSchema(settings),
    buildBlogPostingSchema({ settings, blog, author }),
    buildBreadcrumbSchema({ settings, breadcrumbs }),
  ];

  return {
    type: 'blog',
    path,
    found: true,
    redirect: null,
    title,
    description,
    canonicalUrl: canonical,
    robots: robotsDirective(index, follow),
    robotsIndex: index,
    robotsFollow: follow,
    openGraph: {
      title: pick(seo.ogTitle, title),
      description: pick(seo.ogDescription, description),
      image: ogImage,
      url: canonical,
      type: 'article',
      siteName: settings.siteName,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: pick(seo.ogTitle, title),
      description: pick(seo.ogDescription, description),
      image: ogImage,
    },
    jsonLd: schemas,
    jsonLdScript: toJsonLdScriptContent(schemas),
    blog: {
      id: blog._id.toString(),
      slug: blog.slug,
      status: blog.status,
      publishedAt: blog.publishedAt,
    },
  };
}

async function buildCourseMetadata(course, settings) {
  const seo = course.seo || {};
  const path = coursePublicPath(course.slug);
  const canonical = pick(seo.canonicalUrl, absoluteUrl(settings.siteUrl, path));
  const title = pick(seo.metaTitle, course.title, settings.defaultSeoTitle);
  const description = pick(
    seo.metaDescription,
    course.shortDescription,
    settings.defaultMetaDescription
  );
  const ogImage = pick(
    seo.ogImage,
    course.thumbnail?.secureUrl,
    settings.defaultOgImage
  );
  const index = !seo.noIndex && settings.defaultRobotsIndex !== false;
  const follow = seo.robotsFollow !== false && settings.defaultRobotsFollow !== false;

  let ratingStats = course.ratingStats || null;
  if (!ratingStats?.recalculatedAt) {
    try {
      const { getApprovedRatingSummary } = await import(
        '../../courses/services/ratingStats.service.js'
      );
      ratingStats = await getApprovedRatingSummary(course._id);
    } catch {
      ratingStats = null;
    }
  }

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Courses', path: '/courses' },
    { name: course.title, path },
  ];

  const schemas = [
    buildOrganizationSchema(settings),
    buildWebSiteSchema(settings),
    buildCourseSchema({ settings, course, ratingStats }),
    buildBreadcrumbSchema({ settings, breadcrumbs }),
  ];

  return {
    type: 'course',
    path,
    found: true,
    redirect: null,
    title,
    description,
    canonicalUrl: canonical,
    robots: robotsDirective(index, follow),
    robotsIndex: index,
    robotsFollow: follow,
    openGraph: {
      title: pick(seo.ogTitle, title),
      description: pick(seo.ogDescription, description),
      image: ogImage,
      url: canonical,
      type: 'website',
      siteName: settings.siteName,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: pick(seo.ogTitle, title),
      description: pick(seo.ogDescription, description),
      image: ogImage,
    },
    jsonLd: schemas,
    jsonLdScript: toJsonLdScriptContent(schemas),
    course: {
      id: course._id.toString(),
      slug: course.slug,
      status: course.status,
    },
  };
}

async function buildPageMetadata(page, settings) {
  const path = normalizePath(page.pagePath);
  const canonical = pick(page.canonicalUrl, absoluteUrl(settings.siteUrl, path));
  const title = pick(page.seoTitle, settings.defaultSeoTitle);
  const description = pick(page.metaDescription, settings.defaultMetaDescription);
  const ogImage = pick(page.ogImage, settings.defaultOgImage);
  const index = page.robotsIndex !== false && settings.defaultRobotsIndex !== false;
  const follow = page.robotsFollow !== false && settings.defaultRobotsFollow !== false;
  const breadcrumbs =
    page.breadcrumbs?.length > 0
      ? page.breadcrumbs
      : [
          { name: 'Home', path: '/' },
          { name: title, path },
        ];

  const schemas = [
    buildOrganizationSchema(settings),
    buildWebSiteSchema(settings),
    buildWebPageSchema({
      settings,
      title,
      description,
      canonicalUrl: canonical,
      breadcrumbs,
    }),
    buildBreadcrumbSchema({ settings, breadcrumbs }),
  ];

  return {
    type: 'page',
    path,
    found: true,
    redirect: null,
    title,
    description,
    canonicalUrl: canonical,
    robots: robotsDirective(index, follow),
    robotsIndex: index,
    robotsFollow: follow,
    openGraph: {
      title: pick(page.ogTitle, title),
      description: pick(page.ogDescription, description),
      image: ogImage,
      url: canonical,
      type: 'website',
      siteName: settings.siteName,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: pick(page.ogTitle, title),
      description: pick(page.ogDescription, description),
      image: ogImage,
    },
    jsonLd: schemas,
    jsonLdScript: toJsonLdScriptContent(schemas),
    page: {
      id: page._id.toString(),
      pageIdentifier: page.pageIdentifier,
    },
  };
}

/**
 * Public metadata resolution for SSR.
 */
export async function resolveSeoMetadata(pathInput) {
  const path = normalizePath(pathInput);
  const cacheKey = `${SEO_CACHE.resolvePrefix}${path}`;

  return getOrSetCache(cacheKey, 120, async () => {
    const settings = await getSettingsCached();

    const redirect = await resolveRedirect(path, { trackHit: false });
    if (redirect) {
      return {
        type: 'redirect',
        path,
        found: true,
        redirect: {
          status: redirect.status,
          location: redirect.location,
        },
        title: '',
        description: '',
        canonicalUrl: redirect.location,
        robots: 'noindex, follow',
        robotsIndex: false,
        robotsFollow: true,
        openGraph: null,
        twitter: null,
        jsonLd: [],
        jsonLdScript: '[]',
        site: {
          name: settings.siteName,
          url: getSiteOrigin(settings.siteUrl),
        },
      };
    }

    const slug = courseSlugFromPath(path);
    if (slug) {
      const course = await Course.findOne({
        slug,
        deletedAt: null,
        status: COURSE_STATUS.PUBLISHED,
      })
        .select(
          'title slug status shortDescription thumbnail seo pricing ratingStats'
        )
        .lean();
      if (!course) {
        throw new AppError('Page not found', 404, 'SEO_NOT_FOUND');
      }
      // Never expose draft/archived via resolve
      const meta = await buildCourseMetadata(course, settings);
      meta.site = {
        name: settings.siteName,
        url: getSiteOrigin(settings.siteUrl),
      };
      return meta;
    }

    const blogSlug = blogSlugFromPath(path);
    if (blogSlug) {
      const blog = await Blog.findOne({
        slug: blogSlug,
        deletedAt: null,
        status: BLOG_STATUS.PUBLISHED,
      })
        .select(
          'title slug excerpt content featuredImage authorId status publishedAt updatedAt seo'
        )
        .lean();
      if (!blog) {
        throw new AppError('Page not found', 404, 'SEO_NOT_FOUND');
      }
      if (blog.seo?.robotsIndex === false) {
        // Still resolve for SSR but robots already noindex via buildBlogMetadata
      }
      const authorDoc = blog.authorId
        ? await User.findById(blog.authorId).select('firstName lastName').lean()
        : null;
      const author = authorDoc
        ? { firstName: authorDoc.firstName, lastName: authorDoc.lastName }
        : null;
      const meta = await buildBlogMetadata(blog, settings, author);
      meta.site = {
        name: settings.siteName,
        url: getSiteOrigin(settings.siteUrl),
      };
      return meta;
    }

    const page = await findPageByPath(path);
    if (page) {
      const meta = await buildPageMetadata(page, settings);
      meta.site = {
        name: settings.siteName,
        url: getSiteOrigin(settings.siteUrl),
      };
      return meta;
    }

    throw new AppError('Page not found', 404, 'SEO_NOT_FOUND');
  });
}
