import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBreadcrumbSchema,
  buildCourseSchema,
  buildOrganizationSchema,
  buildWebSiteSchema,
  toJsonLdScriptContent,
} from '../src/modules/seo/services/schema.service.js';
import { normalizePath, isSafeInternalPath } from '../src/modules/seo/utils/seoPaths.js';
import { computeStatsFromRatings } from '../src/modules/courses/services/ratingStats.service.js';

describe('Phase 13 SEO unit', () => {
  it('normalizes paths and blocks unsafe destinations', () => {
    assert.equal(normalizePath('courses/foo/'), '/courses/foo');
    assert.equal(normalizePath('https://example.com/a/b?x=1'), '/a/b');
    assert.equal(isSafeInternalPath('/courses/x'), true);
    assert.equal(isSafeInternalPath('//evil.com'), false);
  });

  it('builds valid organization/website/breadcrumb JSON-LD', () => {
    const settings = {
      siteName: 'SkillBee',
      siteUrl: 'https://skillbee.test',
      organizationName: 'SkillBee Org',
      organizationLogo: 'https://skillbee.test/logo.png',
      organizationSocialLinks: [{ platform: 'x', url: 'https://x.com/skillbee' }],
    };
    const org = buildOrganizationSchema(settings);
    assert.equal(org['@type'], 'Organization');
    assert.equal(org.url, 'https://skillbee.test');
    const site = buildWebSiteSchema(settings);
    assert.equal(site['@type'], 'WebSite');
    const crumbs = buildBreadcrumbSchema({
      settings,
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Courses', path: '/courses' },
      ],
    });
    assert.equal(crumbs['@type'], 'BreadcrumbList');
    assert.equal(crumbs.itemListElement.length, 2);
    const script = toJsonLdScriptContent([org, site]);
    assert.ok(!script.includes('</script>'));
    JSON.parse(script.replace(/\\u003c/g, '<'));
  });

  it('course schema includes ratings only when approved stats exist', () => {
    const settings = { siteName: 'SkillBee', siteUrl: 'https://skillbee.test', organizationName: 'SkillBee' };
    const course = {
      title: 'Node Mastery',
      slug: 'node-mastery',
      shortDescription: 'Learn Node',
      seo: {},
      pricing: { type: 'paid', regularPrice: 999, currency: 'INR' },
      thumbnail: { secureUrl: 'https://res.cloudinary.com/demo/image.jpg' },
    };
    const without = buildCourseSchema({ settings, course, ratingStats: null });
    assert.equal(without.aggregateRating, undefined);
    assert.equal(without['@type'], 'Course');
    assert.equal(without.offers.price, 999);

    const stats = computeStatsFromRatings([5, 4, 5]);
    const withRatings = buildCourseSchema({ settings, course, ratingStats: stats });
    assert.equal(withRatings.aggregateRating.reviewCount, 3);
    assert.ok(withRatings.aggregateRating.ratingValue >= 4);
  });
});
