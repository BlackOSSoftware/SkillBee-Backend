import { env } from '../../../config/env.js';

/** Normalize a public path: leading slash, no trailing slash (except root), no query/hash */
export function normalizePath(input) {
  let path = String(input || '').trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      path = u.pathname;
    }
  } catch {
    // keep as-is
  }
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

export function getSiteOrigin(settingsSiteUrl) {
  const raw = (settingsSiteUrl || env.PUBLIC_SITE_URL || env.FRONTEND_BASE_URL || '').replace(
    /\/$/,
    ''
  );
  return raw || 'http://localhost:3000';
}

export function coursePublicPath(slug) {
  const prefix = (env.COURSE_PUBLIC_PATH_PREFIX || '/courses').replace(/\/$/, '') || '/courses';
  return normalizePath(`${prefix}/${slug}`);
}

export function blogPublicPath(slug) {
  return normalizePath(`/blog/${slug}`);
}

export function blogCategoryPublicPath(slug) {
  return normalizePath(`/blog/category/${slug}`);
}

export function absoluteUrl(siteOrigin, path) {
  return `${getSiteOrigin(siteOrigin)}${normalizePath(path)}`;
}

export function isSafeInternalPath(path) {
  const raw = String(path || '').trim();
  // Reject protocol-relative and scheme URLs before normalization collapses them
  if (raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  const p = normalizePath(raw);
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return true;
}

export function isAllowedExternalDestination(url, siteOrigin) {
  try {
    const dest = new URL(url);
    const site = new URL(getSiteOrigin(siteOrigin));
    return dest.origin === site.origin;
  } catch {
    return false;
  }
}

export function validateHttpUrl(value, { allowEmpty = true } = {}) {
  if (!value) return allowEmpty;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
