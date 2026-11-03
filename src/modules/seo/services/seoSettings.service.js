import sanitizeHtml from 'sanitize-html';
import { env } from '../../../config/env.js';
import { SeoSettings } from '../../../models/SeoSettings.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { AppError } from '../../../utils/AppError.js';
import { validateHttpUrl } from '../utils/seoPaths.js';
import { invalidateSeoCaches, SEO_CACHE } from './seoCache.service.js';

function clean(text, max) {
  return sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

function sanitizeRobotsTxt(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => !/password|secret|api[_-]?key|token=/i.test(l));
  return lines.join('\n').slice(0, 10000);
}

export async function getOrCreateSettings() {
  let doc = await SeoSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await SeoSettings.create({
      key: 'default',
      siteUrl: env.PUBLIC_SITE_URL || env.FRONTEND_BASE_URL,
      siteName: 'SkillBee',
      defaultSeoTitle: 'SkillBee LMS',
      defaultMetaDescription: 'Learn in-demand skills with SkillBee online courses.',
    });
  }
  return doc;
}

export async function getSettingsCached() {
  return getOrSetCache(SEO_CACHE.settings, 300, async () => {
    const doc = await getOrCreateSettings();
    return doc.toSafeObject();
  });
}

export async function getAdminSettings() {
  const doc = await getOrCreateSettings();
  return doc.toSafeObject();
}

export async function updateSettings(req, input) {
  const doc = await getOrCreateSettings();

  if (input.siteUrl !== undefined) {
    if (!validateHttpUrl(input.siteUrl, { allowEmpty: false })) {
      throw new AppError('Invalid site URL', 400, 'INVALID_SITE_URL');
    }
    doc.siteUrl = clean(input.siteUrl, 500).replace(/\/$/, '');
  }
  if (input.siteName !== undefined) doc.siteName = clean(input.siteName, 120);
  if (input.defaultSeoTitle !== undefined) doc.defaultSeoTitle = clean(input.defaultSeoTitle, 120);
  if (input.defaultMetaDescription !== undefined) {
    doc.defaultMetaDescription = clean(input.defaultMetaDescription, 320);
  }
  if (input.defaultOgImage !== undefined) {
    if (input.defaultOgImage && !validateHttpUrl(input.defaultOgImage)) {
      throw new AppError('Invalid default OG image URL', 400, 'INVALID_OG_IMAGE');
    }
    doc.defaultOgImage = clean(input.defaultOgImage, 1000);
  }
  if (input.defaultRobotsIndex !== undefined) doc.defaultRobotsIndex = Boolean(input.defaultRobotsIndex);
  if (input.defaultRobotsFollow !== undefined) {
    doc.defaultRobotsFollow = Boolean(input.defaultRobotsFollow);
  }
  if (input.organizationName !== undefined) {
    doc.organizationName = clean(input.organizationName, 200);
  }
  if (input.organizationLogo !== undefined) {
    if (input.organizationLogo && !validateHttpUrl(input.organizationLogo)) {
      throw new AppError('Invalid organization logo URL', 400, 'INVALID_LOGO');
    }
    doc.organizationLogo = clean(input.organizationLogo, 1000);
  }
  if (input.organizationDescription !== undefined) {
    doc.organizationDescription = clean(input.organizationDescription, 500);
  }
  if (input.organizationSocialLinks !== undefined) {
    doc.organizationSocialLinks = (input.organizationSocialLinks || [])
      .slice(0, 20)
      .map((l) => ({
        platform: clean(l.platform, 50),
        url: validateHttpUrl(l.url, { allowEmpty: false }) ? clean(l.url, 500) : '',
      }))
      .filter((l) => l.url);
  }
  if (input.defaultSchemaSettings !== undefined) {
    doc.defaultSchemaSettings = input.defaultSchemaSettings || {};
  }
  if (input.sitemapSettings !== undefined) {
    doc.sitemapSettings = {
      ...(doc.sitemapSettings?.toObject?.() || doc.sitemapSettings || {}),
      ...input.sitemapSettings,
    };
  }
  if (input.robotsTxtContent !== undefined) {
    doc.robotsTxtContent = sanitizeRobotsTxt(input.robotsTxtContent);
  }

  doc.auditLog = doc.auditLog || [];
  doc.auditLog.push({
    action: 'settings_updated',
    actorId: req.user._id,
    at: new Date(),
    meta: { fields: Object.keys(input) },
  });
  if (doc.auditLog.length > 50) doc.auditLog = doc.auditLog.slice(-50);

  await doc.save();
  await invalidateSeoCaches();
  return doc.toSafeObject();
}
