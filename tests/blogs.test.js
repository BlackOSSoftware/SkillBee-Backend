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
import { SeoRedirect } from '../src/models/SeoRedirect.js';
import { invalidateSeoCaches } from '../src/modules/seo/services/seoCache.service.js';

const API = '/api/v1';

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Blog',
    lastName: 'Admin',
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

describe('Blog Management', () => {
  let app;
  let adminToken;
  let studentToken;

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
    await register(app, 'admin.blog@skillbee.test');
    await promoteToRole('admin.blog@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.blog@skillbee.test')).accessToken;
    studentToken = (await register(app, 'student.blog@skillbee.test')).accessToken;
  });

  it('draft → SEO → publish → public APIs → slug redirect → unpublish sitemap rules', async () => {
    const cat = await request(app)
      .post(`${API}/admin/blogs/categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV Insights', status: 'published' });
    assert.equal(cat.status, 201);
    const categoryId = cat.body.data.id;

    const create = await request(app)
      .post(`${API}/admin/blogs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Best Practices',
        content: '<p>' + 'word '.repeat(400) + '</p>',
        excerpt: 'Guide to CSV',
        categoryIds: [categoryId],
        tags: ['CSV', 'Validation'],
        isFeatured: true,
      });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const id = create.body.data.id;
    assert.equal(create.body.data.status, 'draft');
    assert.ok(create.body.data.readingTime >= 2);
    assert.ok(create.body.data.authorId);

    const draftPublic = await request(app).get(`${API}/public/blogs/csv-best-practices`);
    assert.equal(draftPublic.status, 404);

    const seo = await request(app)
      .patch(`${API}/admin/blogs/${id}/seo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seoTitle: 'CSV Best Practices | SkillBee',
        metaDescription: 'Learn computerized system validation practices.',
        ogTitle: 'CSV OG',
        ogDescription: 'CSV OG desc',
        robotsIndex: true,
        robotsFollow: true,
      });
    assert.equal(seo.status, 200);
    assert.ok(seo.body.data.seo.canonicalUrl.includes('/blog/'));

    const publish = await request(app)
      .patch(`${API}/admin/blogs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publish.status, 200);

    const list = await request(app).get(`${API}/public/blogs?search=CSV`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);

    const featured = await request(app).get(`${API}/public/blogs/featured`);
    assert.equal(featured.status, 200);
    assert.equal(featured.body.data.length, 1);

    const detail = await request(app).get(`${API}/public/blogs/csv-best-practices`);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.data.seo.seoTitle);
    assert.ok(detail.body.data.author);
    assert.ok(!detail.body.data.createdBy);

    const byCat = await request(app).get(
      `${API}/public/blog-categories/csv-insights/blogs`
    );
    assert.equal(byCat.status, 200);
    assert.equal(byCat.body.data.length, 1);

    const byTag = await request(app).get(`${API}/public/blog-tags/csv/blogs`);
    assert.equal(byTag.status, 200);
    assert.equal(byTag.body.data.length, 1);

    const sm1 = await request(app).get(`${API}/sitemap.xml`);
    assert.equal(sm1.status, 200);
    assert.match(sm1.text, /csv-best-practices/);

    const rename = await request(app)
      .patch(`${API}/admin/blogs/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'csv-practices-2026' });
    assert.equal(rename.status, 200);

    const redirect = await SeoRedirect.findOne({
      sourcePath: '/blog/csv-best-practices',
      deletedAt: null,
    });
    assert.ok(redirect);
    assert.equal(redirect.destinationPath, '/blog/csv-practices-2026');
    assert.equal(redirect.redirectType, 301);

    const resolve = await request(app).get(
      `${API}/seo/resolve?path=/blog/csv-best-practices`
    );
    assert.equal(resolve.status, 200);
    assert.equal(resolve.body.data.type, 'redirect');
    assert.equal(resolve.body.data.redirect.status, 301);

    const preview = await request(app)
      .post(`${API}/admin/blogs/${id}/preview`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(preview.status, 201);
    assert.ok(preview.body.data.previewToken);
    assert.match(preview.body.data.path, /preview/);

    const unpublish = await request(app)
      .patch(`${API}/admin/blogs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'draft' });
    assert.equal(unpublish.status, 200);

    const gone = await request(app).get(`${API}/public/blogs/csv-practices-2026`);
    assert.equal(gone.status, 404);

    await invalidateSeoCaches();
    const sm2 = await request(app).get(`${API}/sitemap.xml`);
    assert.ok(!sm2.text.includes('csv-practices-2026'));

    const blocked = await request(app)
      .post(`${API}/admin/blogs`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Hack', content: '<p>x</p>' });
    assert.equal(blocked.status, 403);
  });

  it('rejects duplicate slug publishing without content and archives', async () => {
    const a = await request(app)
      .post(`${API}/admin/blogs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Same Title', content: '<p>one</p>' });
    const b = await request(app)
      .post(`${API}/admin/blogs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Same Title', content: '<p>two</p>' });
    assert.notEqual(a.body.data.slug, b.body.data.slug);

    const empty = await request(app)
      .post(`${API}/admin/blogs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Empty', content: '   ' });
    assert.ok([400, 422].includes(empty.status));

    const arch = await request(app)
      .delete(`${API}/admin/blogs/${a.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(arch.status, 200);
    assert.equal(arch.body.data.status, 'archived');
  });
});
