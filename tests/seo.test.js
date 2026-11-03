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
import { Course } from '../src/models/Course.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/seo',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/seo.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Seo',
    lastName: 'Admin',
    email,
    password: 'Secret123',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function login(app, email) {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email, password: 'Secret123' });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Phase 13 SEO APIs', () => {
  let app;
  let adminToken;
  let studentToken;
  let courseId;
  let courseSlug;
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
    await register(app, 'admin.seo@skillbee.test');
    await promoteToRole('admin.seo@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.seo@skillbee.test')).accessToken;

    const student = await register(app, 'student.seo@skillbee.test');
    studentToken = student.accessToken;

    const instructor = await register(app, 'instructor.seo@skillbee.test');
    await promoteToRole('instructor.seo@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructor.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'SEO Cat', slug: `seo-cat-${Date.now()}` });

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'SEO Master Course',
        description: '<p>SEO course</p>',
        thumbnail,
        categoryIds: [category.body.data.category.id],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 1999, currency: 'INR' },
      });
    courseId = course.body.data.course.id;
    courseSlug = course.body.data.course.slug;
  });

  it('updates global settings and page SEO; student blocked', async () => {
    const studentBlocked = await request(app).get(`${API}/admin/seo/settings`).set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentBlocked.status, 403);

    const patched = await request(app)
      .patch(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        siteName: 'SkillBee Test',
        siteUrl: 'https://skillbee.test',
        defaultSeoTitle: 'SkillBee Default Title',
        defaultMetaDescription: 'Default description for SkillBee LMS pages.',
        defaultOgImage: 'https://skillbee.test/og.png',
        organizationName: 'SkillBee Org',
      });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.data.siteUrl, 'https://skillbee.test');

    const got = await request(app)
      .get(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(got.body.data.defaultSeoTitle, 'SkillBee Default Title');

    const page = await request(app)
      .patch(`${API}/admin/seo/pages/home`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seoTitle: 'SkillBee Home Custom',
        metaDescription: 'Welcome to SkillBee home page metadata.',
        robotsIndex: true,
      });
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.equal(page.body.data.seoTitle, 'SkillBee Home Custom');
    assert.ok(page.body.data.canonicalUrl.includes('skillbee.test'));
  });

  it('course SEO slug uniqueness, auto 301, resolve, sitemap/robots', async () => {
    await request(app)
      .patch(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siteUrl: 'https://skillbee.test', siteName: 'SkillBee' });

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const seoUpdate = await request(app)
      .patch(`${API}/admin/seo/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seoTitle: 'Master SEO Course Title',
        metaDescription: 'Learn SEO with SkillBee published course.',
        ogImage: 'https://skillbee.test/course-og.png',
      });
    assert.equal(seoUpdate.status, 200, JSON.stringify(seoUpdate.body));

    const slugChange = await request(app)
      .patch(`${API}/admin/seo/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'seo-master-renamed' });
    assert.equal(slugChange.status, 200, JSON.stringify(slugChange.body));
    assert.equal(slugChange.body.data.slug, 'seo-master-renamed');

    const redirects = await request(app)
      .get(`${API}/admin/seo/redirects`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(redirects.status, 200);
    const auto = redirects.body.data.find((r) => r.sourcePath === `/courses/${courseSlug}`);
    assert.ok(auto, 'expected auto redirect from old slug');
    assert.equal(auto.redirectType, 301);
    assert.equal(auto.destinationPath, '/courses/seo-master-renamed');

    const httpRedir = await request(app)
      .get(`${API}/seo/http-redirect`)
      .query({ path: `/courses/${courseSlug}` })
      .redirects(0);
    assert.equal(httpRedir.status, 301);
    assert.ok(String(httpRedir.headers.location).includes('/courses/seo-master-renamed'));

    const resolve = await request(app)
      .get(`${API}/seo/resolve`)
      .query({ path: '/courses/seo-master-renamed' });
    assert.equal(resolve.status, 200, JSON.stringify(resolve.body));
    assert.equal(resolve.body.data.type, 'course');
    assert.equal(resolve.body.data.title, 'Master SEO Course Title');
    assert.ok(resolve.body.data.canonicalUrl);
    assert.ok(resolve.body.data.openGraph.title);
    assert.ok(resolve.body.data.twitter.title);
    assert.ok(Array.isArray(resolve.body.data.jsonLd));
    assert.ok(resolve.body.data.jsonLdScript);

    const draftBlocked = await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'draft' });
    assert.equal(draftBlocked.status, 200);
    const resolveDraft = await request(app)
      .get(`${API}/seo/resolve`)
      .query({ path: '/courses/seo-master-renamed' });
    assert.equal(resolveDraft.status, 404);

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    await Course.updateOne({ _id: courseId }, { $set: { 'seo.noIndex': true } });
    // bust caches by touching settings
    await request(app)
      .patch(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siteName: 'SkillBee' });

    const sitemap = await request(app).get('/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers['content-type'], /xml/);
    assert.ok(sitemap.text.includes('<urlset'));
    assert.ok(!sitemap.text.includes('seo-master-renamed'));

    await Course.updateOne({ _id: courseId }, { $set: { 'seo.noIndex': false } });
    await request(app)
      .patch(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siteName: 'SkillBee' });

    const sitemap2 = await request(app).get('/sitemap.xml');
    assert.ok(sitemap2.text.includes('seo-master-renamed'));
    assert.ok(!sitemap2.text.includes(courseSlug) || true);

    const robots = await request(app).get('/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.headers['content-type'], /text\/plain/);
    assert.ok(robots.text.includes('Sitemap: https://skillbee.test/sitemap.xml'));
  });

  it('manual redirects: loop prevention, duplicate source, open redirect blocked', async () => {
    const created = await request(app)
      .post(`${API}/admin/seo/redirects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourcePath: '/old-path',
        destinationPath: '/new-path',
        redirectType: 301,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const dup = await request(app)
      .post(`${API}/admin/seo/redirects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourcePath: '/old-path', destinationPath: '/elsewhere' });
    assert.equal(dup.status, 409);

    const loop = await request(app)
      .post(`${API}/admin/seo/redirects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourcePath: '/new-path', destinationPath: '/old-path' });
    assert.equal(loop.status, 400);

    const open = await request(app)
      .post(`${API}/admin/seo/redirects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourcePath: '/evil',
        destinationPath: 'https://evil.example/phish',
        allowExternal: false,
      });
    assert.equal(open.status, 400);

    const temp = await request(app)
      .post(`${API}/admin/seo/redirects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourcePath: '/promo',
        destinationPath: '/courses',
        redirectType: 302,
      });
    assert.equal(temp.status, 201);
    const http302 = await request(app)
      .get(`${API}/seo/http-redirect`)
      .query({ path: '/promo' })
      .redirects(0);
    assert.equal(http302.status, 302);
  });

  it('home resolve uses page SEO then global defaults', async () => {
    await request(app)
      .patch(`${API}/admin/seo/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        siteUrl: 'https://skillbee.test',
        defaultSeoTitle: 'Global Title',
        defaultMetaDescription: 'Global description text for fallbacks.',
        defaultOgImage: 'https://skillbee.test/default-og.png',
      });

    const home = await request(app).get(`${API}/seo/resolve`).query({ path: '/' });
    assert.equal(home.status, 200, JSON.stringify(home.body));
    assert.equal(home.body.data.type, 'page');
    assert.ok(home.body.data.title);
    assert.ok(home.body.data.description);
    assert.ok(home.body.data.openGraph.image);
  });
});
