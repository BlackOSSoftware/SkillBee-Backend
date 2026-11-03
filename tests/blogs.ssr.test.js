import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import {
  clearCollections,
  createTestApp,
  promoteToRole,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/setup.js';
import { ROLE_SLUGS } from '../src/config/security.js';
import { resolveSeoMetadata } from '../src/modules/seo/services/metadataResolve.service.js';
import { invalidateSeoCaches } from '../src/modules/seo/services/seoCache.service.js';

const API = '/api/v1';

/**
 * Representative Next.js generateMetadata + HTML head builder for blog pages.
 * Production frontend is not in this repo — verifies SSR contract for blogs.
 */
function renderSsrHtml(meta) {
  if (!meta || meta.redirect) return null;
  const escape = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  const og = meta.openGraph || {};
  const tw = meta.twitter || {};
  return `<!doctype html>
<html>
<head>
  <title>${escape(meta.title)}</title>
  <meta name="description" content="${escape(meta.description)}" />
  <link rel="canonical" href="${escape(meta.canonicalUrl)}" />
  <meta name="robots" content="${escape(meta.robots)}" />
  <meta property="og:title" content="${escape(og.title)}" />
  <meta property="og:description" content="${escape(og.description)}" />
  <meta property="og:image" content="${escape(og.image)}" />
  <meta property="og:url" content="${escape(og.url)}" />
  <meta name="twitter:card" content="${escape(tw.card)}" />
  <meta name="twitter:title" content="${escape(tw.title)}" />
  <meta name="twitter:description" content="${escape(tw.description)}" />
  <meta name="twitter:image" content="${escape(tw.image)}" />
  <script type="application/ld+json">${meta.jsonLdScript || '[]'}</script>
</head>
<body><h1>${escape(meta.title)}</h1></body>
</html>`;
}

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Ssr',
    lastName: 'Blog',
    email,
    password: 'Secret123',
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function login(app, email) {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email, password: 'Secret123' });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Blog SEO SSR contract', () => {
  let app;
  let adminToken;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    await invalidateSeoCaches();
    await register(app, 'admin.blogssr@skillbee.test');
    await promoteToRole('admin.blogssr@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.blogssr@skillbee.test')).accessToken;
  });

  it('renders BlogPosting + BreadcrumbList in initial HTML for published blogs only', async () => {
    const create = await request(app)
      .post(`${API}/admin/blogs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Pharma GMP Overview',
        content: '<p>Good manufacturing practice primer for industry teams.</p>',
        excerpt: 'GMP overview',
        featuredImage: {
          publicId: 'skillbee/blogs/gmp',
          secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/blogs/gmp.jpg',
          width: 1200,
          height: 630,
          format: 'jpg',
          bytes: 2000,
        },
      });
    const id = create.body.data.id;

    await request(app)
      .patch(`${API}/admin/blogs/${id}/seo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seoTitle: 'Pharma GMP Overview | SkillBee Blog',
        metaDescription: 'Learn pharmaceutical GMP fundamentals.',
        ogImage: 'https://res.cloudinary.com/demo/image/upload/skillbee/blogs/gmp.jpg',
      });

    let draftErr = null;
    try {
      await resolveSeoMetadata('/blog/pharma-gmp-overview');
    } catch (err) {
      draftErr = err;
    }
    assert.ok(draftErr);
    assert.equal(draftErr.statusCode || draftErr.status, 404);

    await request(app)
      .patch(`${API}/admin/blogs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    await invalidateSeoCaches();
    const meta = await resolveSeoMetadata('/blog/pharma-gmp-overview');
    assert.equal(meta.type, 'blog');
    assert.equal(meta.found, true);
    assert.match(meta.title, /Pharma GMP/);
    assert.ok(meta.canonicalUrl.includes('/blog/pharma-gmp-overview'));
    assert.match(meta.robots, /index/);
    assert.equal(meta.openGraph.type, 'article');

    const html = renderSsrHtml(meta);
    assert.ok(html.includes('<title>'));
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('property="og:title"'));
    assert.ok(html.includes('property="og:image"'));
    assert.ok(html.includes('application/ld+json'));

    const jsonLd = JSON.parse(meta.jsonLdScript);
    const list = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    const posting = list.find((s) => s['@type'] === 'BlogPosting');
    const crumbs = list.find((s) => s['@type'] === 'BreadcrumbList');
    assert.ok(posting);
    assert.equal(posting.headline, 'Pharma GMP Overview | SkillBee Blog');
    assert.ok(posting.datePublished);
    assert.ok(posting.author?.name);
    assert.ok(posting.publisher?.name);
    assert.ok(posting.mainEntityOfPage);
    assert.ok(crumbs);

    await request(app)
      .patch(`${API}/admin/blogs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'archived' });
    await invalidateSeoCaches();

    let archivedErr = null;
    try {
      await resolveSeoMetadata('/blog/pharma-gmp-overview');
    } catch (err) {
      archivedErr = err;
    }
    assert.ok(archivedErr);
  });
});
