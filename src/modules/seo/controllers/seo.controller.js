import * as courseSeoService from '../services/courseSeo.service.js';
import * as pageSeoService from '../services/pageSeo.service.js';
import * as redirectService from '../services/redirect.service.js';
import * as seoSettingsService from '../services/seoSettings.service.js';
import { resolveSeoMetadata } from '../services/metadataResolve.service.js';
import { generateRobotsTxt } from '../services/robots.service.js';
import { generateSitemapIndexXml, generateSitemapXml } from '../services/sitemap.service.js';
import { getSettingsCached } from '../services/seoSettings.service.js';
import { normalizePath } from '../utils/seoPaths.js';

export async function getSettings(req, res, next) {
  try {
    const data = await seoSettingsService.getAdminSettings();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchSettings(req, res, next) {
  try {
    const data = await seoSettingsService.updateSettings(req, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPageSeo(req, res, next) {
  try {
    const data = await pageSeoService.getPageSeo(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchPageSeo(req, res, next) {
  try {
    const data = await pageSeoService.updatePageSeo(req, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listCourses(req, res, next) {
  try {
    const result = await courseSeoService.listCoursesForSeo(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getCourseSeo(req, res, next) {
  try {
    const data = await courseSeoService.getCourseSeo(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchCourseSeo(req, res, next) {
  try {
    const data = await courseSeoService.updateCourseSeo(req, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listRedirects(req, res, next) {
  try {
    const result = await redirectService.listRedirects(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function createRedirect(req, res, next) {
  try {
    const data = await redirectService.createRedirect(req, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateRedirect(req, res, next) {
  try {
    const data = await redirectService.updateRedirect(req, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteRedirect(req, res, next) {
  try {
    const data = await redirectService.deleteRedirect(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resolveMetadata(req, res, next) {
  try {
    const data = await resolveSeoMetadata(req.query.path);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Real HTTP 301/302 for website/proxy use.
 * GET /api/v1/seo/http-redirect?path=/courses/old-slug
 */
export async function httpRedirect(req, res, next) {
  try {
    const path = normalizePath(req.query.path || req.query.p || '');
    const hit = await redirectService.resolveRedirect(path, { trackHit: true });
    if (!hit) {
      res.status(404).json({
        success: false,
        error: { code: 'REDIRECT_NOT_FOUND', message: 'No redirect for path' },
      });
      return;
    }
    res.redirect(hit.status, hit.location);
  } catch (err) {
    next(err);
  }
}

export async function sitemapXml(_req, res, next) {
  try {
    const xml = await generateSitemapXml();
    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
}

export async function sitemapIndexXml(_req, res, next) {
  try {
    const xml = await generateSitemapIndexXml();
    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
}

export async function robotsTxt(_req, res, next) {
  try {
    const text = await generateRobotsTxt();
    res.status(200).type('text/plain').send(text);
  } catch (err) {
    next(err);
  }
}

/** Optional: expose settings site URL for health/debug (no secrets) */
export async function publicSiteHint(_req, res, next) {
  try {
    const settings = await getSettingsCached();
    res.json({
      success: true,
      data: { siteUrl: settings.siteUrl, siteName: settings.siteName },
    });
  } catch (err) {
    next(err);
  }
}
