import { deleteCache, clearCacheByPrefix } from '../../../services/cache/cache.service.js';

export const SEO_CACHE = {
  settings: 'seo:settings:default',
  resolvePrefix: 'seo:resolve:',
  redirectPrefix: 'seo:redirect:',
  sitemap: 'seo:sitemap:xml',
  sitemapIndex: 'seo:sitemap:index',
  robots: 'seo:robots:txt',
};

export async function invalidateSeoCaches() {
  await deleteCache(SEO_CACHE.settings);
  await deleteCache(SEO_CACHE.sitemap);
  await deleteCache(SEO_CACHE.sitemapIndex);
  await deleteCache(SEO_CACHE.robots);
  await clearCacheByPrefix(SEO_CACHE.resolvePrefix);
  await clearCacheByPrefix(SEO_CACHE.redirectPrefix);
}

export async function invalidateResolvePath(path) {
  const { normalizePath } = await import('../utils/seoPaths.js');
  const p = normalizePath(path);
  await deleteCache(`${SEO_CACHE.resolvePrefix}${p}`);
  await deleteCache(`${SEO_CACHE.redirectPrefix}${p}`);
  await deleteCache(SEO_CACHE.sitemap);
  await deleteCache(SEO_CACHE.sitemapIndex);
}
