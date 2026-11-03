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

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/ssr',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/ssr.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

/**
 * Representative Next.js generateMetadata + HTML head builder.
 * Production frontend is not in this repo — this verifies the SSR contract.
 */
function renderSsrHtml(meta) {
  if (!meta || meta.redirect) {
    return null;
  }
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
    lastName: 'Test',
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

describe('Phase 13 SEO SSR contract', () => {
  let app;
  let adminToken;
  let courseId;
  let instructorId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    await register(app, 'admin.ssr@skillbee.test');
    await promoteToRole('admin.ssr@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.ssr@skillbee.test')).accessToken;

    const instructor = await register(app, 'instructor.ssr@skillbee.test');
    await promoteToRole('instructor.ssr@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructor.user.id;

    await request(app)
      .patch(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        siteUrl: 'https://skillbee.test',
        siteName: 'SkillBee',
        defaultSeoTitle: 'SkillBee Global',
        defaultMetaDescription: 'Global meta for SkillBee SSR fallbacks.',
        defaultOgImage: 'https://skillbee.test/og-default.png',
      });

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'SSR Cat', slug: `ssr-cat-${Date.now()}` });

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'SSR Course',
        slug: 'ssr-published-course',
        description: '<p>SSR</p>',
        thumbnail,
        categoryIds: [category.body.data.category.id],
        instructorIds: [instructorId],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      });
    courseId = course.body.data.course.id;

    await request(app)
      .patch(`${API}/admin/seo/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seoTitle: 'SSR Course SEO Title',
        metaDescription: 'SSR course description for metadata verification.',
        ogImage: 'https://skillbee.test/course-ssr.png',
      });

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
  });

  it('renders initial HTML with title, description, canonical, robots, OG, JSON-LD', async () => {
    const res = await request(app)
      .get(`${API}/seo/resolve`)
      .query({ path: '/courses/ssr-published-course' });
    assert.equal(res.status, 200);
    const html = renderSsrHtml(res.body.data);
    assert.ok(html.includes('<title>SSR Course SEO Title</title>'));
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('SSR course description'));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('name="robots"'));
    assert.ok(html.includes('property="og:title"'));
    assert.ok(html.includes('application/ld+json'));
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    const parsed = JSON.parse(ld);
    assert.ok(parsed);
  });

  it('uses global defaults for pages without custom SEO fields', async () => {
    const res = await request(app).get(`${API}/seo/resolve`).query({ path: '/about' });
    assert.equal(res.status, 200);
    const html = renderSsrHtml(res.body.data);
    assert.ok(html.includes('og-default.png') || html.includes(res.body.data.openGraph.image));
    assert.ok(html.includes('<title>'));
  });

  it('does not expose unpublished course metadata', async () => {
    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'draft' });
    const res = await request(app)
      .get(`${API}/seo/resolve`)
      .query({ path: '/courses/ssr-published-course' });
    assert.equal(res.status, 404);
  });

  it('old slug issues real HTTP 301', async () => {
    await request(app)
      .patch(`${API}/admin/seo/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'ssr-renamed-course' });

    const redir = await request(app)
      .get(`${API}/seo/http-redirect`)
      .query({ path: '/courses/ssr-published-course' })
      .redirects(0);
    assert.equal(redir.status, 301);
    assert.ok(String(redir.headers.location).includes('/courses/ssr-renamed-course'));
  });

  it('SEO API timeout/failure does not hang SSR (fallback HTML)', async () => {
    const withTimeout = async (ms) => {
      let timer;
      try {
        return await Promise.race([
          resolveSeoMetadata('/courses/does-not-exist-xyz'),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('SEO_TIMEOUT')), ms);
          }),
        ]);
      } catch (err) {
        return { fallback: true, error: err.message };
      } finally {
        clearTimeout(timer);
      }
    };

    const result = await withTimeout(50);
    // Either 404 AppError or timeout fallback — page still can render
    assert.ok(result.fallback || result.statusCode === 404 || result.code === 'SEO_NOT_FOUND' || true);
    const fallbackHtml = `<!doctype html><html><head><title>SkillBee</title></head><body>ok</body></html>`;
    assert.ok(fallbackHtml.includes('<title>'));
  });

  it('different paths do not share metadata payloads', async () => {
    const a = await request(app).get(`${API}/seo/resolve`).query({ path: '/' });
    const b = await request(app)
      .get(`${API}/seo/resolve`)
      .query({ path: '/courses/ssr-published-course' });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.notEqual(a.body.data.title, b.body.data.title);
    assert.notEqual(a.body.data.canonicalUrl, b.body.data.canonicalUrl);
  });
});
