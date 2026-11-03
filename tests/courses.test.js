import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
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

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/demo-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/demo-thumb.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 120000,
};

async function register(app, email, password = 'Secret123') {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Test',
    lastName: 'User',
    email,
    password,
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function login(app, email, password = 'Secret123') {
  const res = await request(app).post(`${API}/auth/login`).send({ email, password });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Phase 2 Course Management', () => {
  let app;
  let adminToken;
  let studentToken;
  let instructor;
  let categoryId;
  let courseId;
  let topicId;
  let lessonId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    const adminReg = await register(app, 'admin.courses@skillbee.test');
    await promoteToRole('admin.courses@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.courses@skillbee.test')).accessToken;

    const student = await register(app, 'student.courses@skillbee.test');
    studentToken = student.accessToken;

    const instructorReg = await register(app, 'instructor.courses@skillbee.test');
    await promoteToRole('instructor.courses@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructor = (await login(app, 'instructor.courses@skillbee.test')).user;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Full Stack Development',
        description: 'Web engineering tracks',
      });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;
  });

  it('creates, updates, filters and soft-deletes courses', async () => {
    const created = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Node.js Backend Mastery',
        shortDescription: 'Build production APIs with Express and MongoDB',
        description: '<p>Complete backend engineering course</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructor.id],
        level: 'intermediate',
        language: 'en',
        pricing: { type: 'paid', regularPrice: 4999, salePrice: 3499, currency: 'INR' },
        learningObjectives: [{ title: 'Design REST APIs', description: 'With Express' }],
        requirements: ['Basic JavaScript'],
        tags: ['nodejs', 'express'],
      });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.course.status, 'draft');
    assert.equal(created.body.data.course.pricing.type, 'paid');
    courseId = created.body.data.course.id;

    const listed = await request(app)
      .get(`${API}/admin/courses`)
      .query({ search: 'Backend', status: 'draft' })
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.pagination.total >= 1);

    const updated = await request(app)
      .patch(`${API}/admin/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isFeatured: true, shortDescription: 'Updated short description' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.course.isFeatured, true);

    const deleted = await request(app)
      .delete(`${API}/admin/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(deleted.status, 200);
    assert.ok(deleted.body.data.course.deletedAt);
  });

  it('rejects invalid pricing and duplicate category cycles', async () => {
    const badPrice = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad Pricing Course',
        description: '<p>x</p>',
        pricing: { type: 'paid', regularPrice: 0, currency: 'INR' },
      });
    assert.equal(badPrice.status, 400);

    const parent = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Parent Cat' });
    const child = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Child Cat', parentCategoryId: parent.body.data.category.id });
    assert.equal(child.status, 201);

    const circular = await request(app)
      .patch(`${API}/admin/course-categories/${parent.body.data.category.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentCategoryId: child.body.data.category.id });
    assert.equal(circular.status, 400);
    assert.equal(circular.body.error.code, 'CIRCULAR_CATEGORY');
  });

  it('supports curriculum, publish workflow, public visibility and RBAC', async () => {
    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'React Frontend Pro',
        description: '<p>Modern React patterns for SkillBee</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructor.id],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      });
    assert.equal(course.status, 201);
    courseId = course.body.data.course.id;

    const topic = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Getting Started', description: 'Setup and fundamentals' });
    assert.equal(topic.status, 201);
    topicId = topic.body.data.topic.id;

    const topicPublish = await request(app)
      .patch(`${API}/admin/topics/${topicId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(topicPublish.status, 200);

    const lesson = await request(app)
      .post(`${API}/admin/topics/${topicId}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Welcome Lesson',
        type: 'text',
        content: { textContent: 'Welcome to the course' },
        isPreview: true,
        status: 'draft',
      });
    assert.equal(lesson.status, 201);
    lessonId = lesson.body.data.lesson.id;

    const lessonPublish = await request(app)
      .patch(`${API}/admin/lessons/${lessonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(lessonPublish.status, 200);

    const publish = await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publish.status, 200);
    assert.equal(publish.body.data.course.status, 'published');
    assert.ok(publish.body.data.course.publishedAt);

    const publicList = await request(app).get(`${API}/courses`);
    assert.equal(publicList.status, 200);
    assert.ok(publicList.body.data.some((c) => c.slug === publish.body.data.course.slug));

    const publicDetail = await request(app).get(
      `${API}/courses/${publish.body.data.course.slug}`
    );
    assert.equal(publicDetail.status, 200);
    assert.equal(publicDetail.body.data.course.title, 'React Frontend Pro');

    const curriculum = await request(app).get(
      `${API}/courses/${publish.body.data.course.slug}/curriculum`
    );
    assert.equal(curriculum.status, 200);
    assert.equal(curriculum.body.data.topics[0].lessons[0].locked, false);

    const studentBlocked = await request(app)
      .get(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentBlocked.status, 403);

    const unauth = await request(app).get(`${API}/admin/courses`);
    assert.equal(unauth.status, 401);

    const instructorLogin = await login(app, 'instructor.courses@skillbee.test');
    const instructorUpdate = await request(app)
      .patch(`${API}/admin/courses/${courseId}`)
      .set('Authorization', `Bearer ${instructorLogin.accessToken}`)
      .send({ shortDescription: 'Updated by assigned instructor' });
    assert.equal(instructorUpdate.status, 200);

    // Create another course without assigning this instructor
    const other = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Other Course Hidden',
        description: '<p>Secret</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [],
      });
    const forbidden = await request(app)
      .patch(`${API}/admin/courses/${other.body.data.course.id}`)
      .set('Authorization', `Bearer ${instructorLogin.accessToken}`)
      .send({ title: 'Hacked Title Course' });
    assert.equal(forbidden.status, 403);

    const duplicate = await request(app)
      .post(`${API}/admin/courses/${courseId}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(duplicate.status, 201);
    assert.equal(duplicate.body.data.course.status, 'draft');
    assert.match(duplicate.body.data.course.slug, /copy/);

    const analytics = await request(app)
      .get(`${API}/admin/courses/${courseId}/analytics`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(analytics.status, 200);
    assert.ok(analytics.body.data.analytics.totalLessons >= 1);

    const tmp = path.join(os.tmpdir(), `skillbee-doc-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, '%PDF-1.4 test resource');
    const resource = await request(app)
      .post(`${API}/admin/courses/${courseId}/resources`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', 'Course Syllabus')
      .field('resourceType', 'pdf')
      .attach('file', tmp);
    fs.unlinkSync(tmp);
    assert.equal(resource.status, 201);

    const downloadDenied = await request(app)
      .get(`${API}/learning/resources/${resource.body.data.resource.id}/download`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(downloadDenied.status, 403);
  });

  it('rejects oversized/invalid document mime types', async () => {
    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Upload Guard Course',
        description: '<p>x</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructor.id],
      });

    const exe = path.join(os.tmpdir(), `skillbee-exe-${Date.now()}.exe`);
    fs.writeFileSync(exe, 'MZ fake executable');
    const bad = await request(app)
      .post(`${API}/admin/courses/${course.body.data.course.id}/resources`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', 'Bad File')
      .field('resourceType', 'document')
      .attach('file', exe);
    fs.unlinkSync(exe);
    assert.ok([400, 415].includes(bad.status));
  });
});
