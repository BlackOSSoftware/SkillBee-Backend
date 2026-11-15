import { z } from 'zod';
import { objectId } from '../../courses/validators/common.js';

const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => !v || /^https?:\/\//i.test(v), 'Must be http(s) URL');

export const seoSettingsPatchBody = z
  .object({
    siteName: z.string().trim().min(1).max(120).optional(),
    siteUrl: httpUrl.optional(),
    defaultSeoTitle: z.string().trim().max(120).optional(),
    defaultMetaDescription: z.string().trim().max(320).optional(),
    defaultOgImage: httpUrl.or(z.literal('')).optional(),
    defaultRobotsIndex: z.boolean().optional(),
    defaultRobotsFollow: z.boolean().optional(),
    organizationName: z.string().trim().max(200).optional(),
    organizationLogo: httpUrl.or(z.literal('')).optional(),
    organizationDescription: z.string().trim().max(500).optional(),
    organizationSocialLinks: z
      .array(
        z.object({
          platform: z.string().trim().max(50),
          url: httpUrl,
        })
      )
      .max(20)
      .optional(),
    defaultSchemaSettings: z.record(z.unknown()).optional(),
    sitemapSettings: z
      .object({
        enabled: z.boolean().optional(),
        includeCourses: z.boolean().optional(),
        includePages: z.boolean().optional(),
        changefreqCourses: z.string().max(20).optional(),
        changefreqPages: z.string().max(20).optional(),
        maxUrlsPerSitemap: z.number().int().min(10).max(50000).optional(),
      })
      .optional(),
    robotsTxtContent: z.string().max(10000).optional(),
  })
  .strict();

export const pageSeoPatchBody = z
  .object({
    pagePath: z.string().trim().max(500).optional(),
    seoTitle: z.string().trim().max(120).optional(),
    metaDescription: z.string().trim().max(320).optional(),
    slug: z.string().trim().max(200).optional(),
    canonicalUrl: httpUrl.or(z.literal('')).optional(),
    robotsIndex: z.boolean().optional(),
    robotsFollow: z.boolean().optional(),
    ogTitle: z.string().trim().max(120).optional(),
    ogDescription: z.string().trim().max(320).optional(),
    ogImage: httpUrl.or(z.literal('')).optional(),
    schemaType: z.string().trim().max(80).optional(),
    schemaData: z.record(z.unknown()).optional(),
    breadcrumbs: z
      .array(
        z.object({
          name: z.string().trim().max(120),
          path: z.string().trim().max(500),
        })
      )
      .max(10)
      .optional(),
  })
  .strict();

export const courseSeoPatchBody = z
  .object({
    seoTitle: z.string().trim().max(120).optional(),
    metaTitle: z.string().trim().max(120).optional(),
    metaDescription: z.string().trim().max(320).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format')
      .optional(),
    canonicalUrl: httpUrl.or(z.literal('')).optional(),
    robotsIndex: z.boolean().optional(),
    noIndex: z.boolean().optional(),
    robotsFollow: z.boolean().optional(),
    ogTitle: z.string().trim().max(120).optional(),
    ogDescription: z.string().trim().max(320).optional(),
    ogImage: httpUrl.or(z.literal('')).optional(),
    focusKeyword: z.string().trim().max(100).optional(),
    schemaType: z.string().trim().max(80).optional(),
    schemaData: z.record(z.unknown()).optional(),
  })
  .strict();

export const redirectCreateBody = z
  .object({
    sourcePath: z.string().trim().min(1).max(1000),
    destinationPath: z.string().trim().min(1).max(2000),
    redirectType: z.union([z.literal(301), z.literal(302)]).optional(),
    isActive: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  })
  .strict();

export const redirectUpdateBody = redirectCreateBody.partial().strict();

export const redirectListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  redirectType: z.coerce.number().optional(),
});

export const courseListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).optional(),
});

export const resolveQuery = z.object({
  path: z.string().trim().min(1).max(2000),
});

export const idParam = z.object({ id: z.string().trim().min(1).max(100) });
export const courseIdParam = z.object({ id: objectId });
