import { absoluteUrl, blogPublicPath, coursePublicPath, getSiteOrigin } from '../utils/seoPaths.js';

export function buildOrganizationSchema(settings) {
  const site = getSiteOrigin(settings.siteUrl);
  const sameAs = (settings.organizationSocialLinks || [])
    .map((l) => l.url)
    .filter(Boolean);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.organizationName || settings.siteName || 'SkillBee',
    url: site,
  };
  if (settings.organizationLogo) schema.logo = settings.organizationLogo;
  if (settings.organizationDescription) schema.description = settings.organizationDescription;
  if (sameAs.length) schema.sameAs = sameAs;
  return schema;
}

export function buildWebSiteSchema(settings) {
  const site = getSiteOrigin(settings.siteUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.siteName || 'SkillBee',
    url: site,
    publisher: {
      '@type': 'Organization',
      name: settings.organizationName || settings.siteName || 'SkillBee',
    },
  };
}

export function buildWebPageSchema({ settings, title, description, canonicalUrl, breadcrumbs }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonicalUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: settings.siteName,
      url: getSiteOrigin(settings.siteUrl),
    },
  };
  if (breadcrumbs?.length) {
    schema.breadcrumb = buildBreadcrumbSchema({ settings, breadcrumbs });
  }
  return schema;
}

export function buildBreadcrumbSchema({ settings, breadcrumbs }) {
  const items = (breadcrumbs || []).map((b, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: b.name,
    item: absoluteUrl(settings.siteUrl, b.path),
  }));
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

/**
 * Course schema from real published course data.
 * Includes aggregateRating only when approved review stats exist.
 */
export function buildCourseSchema({ settings, course, ratingStats }) {
  const path = coursePublicPath(course.slug);
  const url = course.seo?.canonicalUrl || absoluteUrl(settings.siteUrl, path);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.seo?.metaTitle || course.title,
    description:
      course.seo?.metaDescription || course.shortDescription || undefined,
    url,
    provider: {
      '@type': 'Organization',
      name: settings.organizationName || settings.siteName || 'SkillBee',
      sameAs: getSiteOrigin(settings.siteUrl),
    },
  };

  if (course.thumbnail?.secureUrl) {
    schema.image = course.thumbnail.secureUrl;
  }

  const pricing = course.pricing || {};
  if (pricing.type === 'free') {
    schema.offers = {
      '@type': 'Offer',
      price: 0,
      priceCurrency: pricing.currency || 'INR',
      availability: 'https://schema.org/InStock',
      url,
    };
  } else if (pricing.type === 'paid' && (pricing.salePrice != null || pricing.regularPrice != null)) {
    const price = pricing.salePrice != null ? pricing.salePrice : pricing.regularPrice;
    schema.offers = {
      '@type': 'Offer',
      price: Number(price) || 0,
      priceCurrency: pricing.currency || 'INR',
      availability: 'https://schema.org/InStock',
      url,
    };
  }

  const count = ratingStats?.approvedReviewCount || ratingStats?.totalApprovedReviews || 0;
  const avg = ratingStats?.averageRating;
  if (count > 0 && avg != null && Number(avg) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(avg),
      reviewCount: Number(count),
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

/**
 * BlogPosting from real published blog + author display fields only.
 */
export function buildBlogPostingSchema({ settings, blog, author }) {
  const path = blogPublicPath(blog.slug);
  const url = blog.seo?.canonicalUrl || absoluteUrl(settings.siteUrl, path);
  const headline = blog.seo?.seoTitle || blog.title;
  const description = blog.seo?.metaDescription || blog.excerpt || undefined;
  const image =
    blog.seo?.ogImage ||
    blog.featuredImage?.secureUrl ||
    settings.defaultOgImage ||
    undefined;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline,
    description,
    image,
    datePublished: blog.publishedAt ? new Date(blog.publishedAt).toISOString() : undefined,
    dateModified: blog.updatedAt ? new Date(blog.updatedAt).toISOString() : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    publisher: {
      '@type': 'Organization',
      name: settings.organizationName || settings.siteName || 'SkillBee',
      url: getSiteOrigin(settings.siteUrl),
    },
  };

  if (settings.organizationLogo) {
    schema.publisher.logo = {
      '@type': 'ImageObject',
      url: settings.organizationLogo,
    };
  }

  if (author?.firstName || author?.lastName) {
    schema.author = {
      '@type': 'Person',
      name: [author.firstName, author.lastName].filter(Boolean).join(' '),
    };
  }

  return schema;
}

export function buildFaqPageSchema(faqs = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (faqs || []).map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: String(f.answer || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      },
    })),
  };
}

export function toJsonLdScriptContent(schemas) {
  const list = Array.isArray(schemas) ? schemas.filter(Boolean) : [schemas].filter(Boolean);
  // Safe for embedding: stringify escapes <
  return JSON.stringify(list.length === 1 ? list[0] : list).replace(/</g, '\\u003c');
}
