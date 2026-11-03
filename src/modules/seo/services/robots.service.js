import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { getSiteOrigin } from '../utils/seoPaths.js';
import { SEO_CACHE } from './seoCache.service.js';
import { getSettingsCached } from './seoSettings.service.js';

const SAFE_DEFAULT = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /student/
Disallow: /checkout/
`;

export async function generateRobotsTxt() {
  return getOrSetCache(SEO_CACHE.robots, 300, async () => {
    const settings = await getSettingsCached();
    const origin = getSiteOrigin(settings.siteUrl);
    let content = (settings.robotsTxtContent || SAFE_DEFAULT).trim();
    // Strip any existing Sitemap lines then append the correct one
    content = content
      .split(/\r?\n/)
      .filter((line) => !/^sitemap:\s*/i.test(line.trim()))
      .join('\n')
      .trim();
    content = `${content}\n\nSitemap: ${origin}/sitemap.xml\n`;
    return content;
  });
}
