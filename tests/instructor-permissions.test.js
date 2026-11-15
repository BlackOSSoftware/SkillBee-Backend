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
import { Role } from '../src/models/Role.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/perm-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/perm-thumb.jpg',
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

/** Replace the instructor role's permission set (simulates the admin UI save). */
async function setInstructorPermissions(codes) {
  await Role.updateOne({ slug: ROLE_SLUGS.INSTRUCTOR }, { $set: { permissions: codes } });
}

async function instructorPermissions() {
  const role = await Role.findOne({ slug: ROLE_SLUGS.INSTRUCTOR });
  return role.permissions;
}

describe('Instructor permission enforcement', () => {
  let app;
  let adminToken;
  let instructorToken;
  let instructorId;
  let categoryId;
  let ownCourseId;
  let otherCourseId;
  let quizId;
  let assignmentId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    await register(app, 'admin.perm@skillbee.test');
    await promoteToRole('admin.perm@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.perm@skillbee.test')).accessToken;

    await register(app, 'instructor.perm@skillbee.test');
    await promoteToRole('instructor.perm@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.perm@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Perm Cat', description: 'Permission tests' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;

    // Publish-ready course assigned to the instructor
    const own = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Instructor Owned Course',
        description: '<p>Publish ready</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      });
    assert.equal(own.status, 201);
    ownCourseId = own.body.data.course.id;

    // Course NOT assigned to the instructor
    const other = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Unassigned Course',
        description: '<p>Not yours</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      });
    assert.equal(other.status, 201);
    otherCourseId = other.body.data.course.id;

    const quiz = await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Perm Quiz', courseId: ownCourseId });
    assert.equal(quiz.status, 201);
    quizId = quiz.body.data.quiz.id;

    // Publishing requires at least one active question
    const question = await request(app)
      .post(`${API}/admin/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Pick the correct answer',
        questionType: 'true_false',
        marks: 1,
        correctAnswer: true,
      });
    assert.equal(question.status, 201);

    const assignment = await request(app)
      .post(`${API}/admin/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Perm Assignment',
        instructions: 'Do the thing',
        courseId: ownCourseId,
        maximumMarks: 10,
        submissionType: 'text',
      });
    assert.equal(assignment.status, 201);
    assignmentId = assignment.body.data.assignment.id;
  });

  it('scopes course reads to assigned courses only', async () => {
    const list = await request(app)
      .get(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${instructorToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.pagination.total, 1);
    assert.equal(list.body.data[0].id, ownCourseId);

    const own = await request(app)
      .get(`${API}/admin/courses/${ownCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`);
    assert.equal(own.status, 200);

    const other = await request(app)
      .get(`${API}/admin/courses/${otherCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`);
    assert.equal(other.status, 403);
  });

  it('lets an assigned instructor update their course but not others', async () => {
    const own = await request(app)
      .patch(`${API}/admin/courses/${ownCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ shortDescription: 'Updated by instructor' });
    assert.equal(own.status, 200);

    const other = await request(app)
      .patch(`${API}/admin/courses/${otherCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ shortDescription: 'Should fail' });
    assert.equal(other.status, 403);
  });

  it('publish: disabled by default, enabled on grant, blocked again on revoke', async () => {
    // Scenario B — permission not granted (seed has no courses.publish)
    const denied = await request(app)
      .patch(`${API}/admin/courses/${ownCourseId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(denied.status, 403);

    // Archive is gated by the same permission
    const archiveDenied = await request(app)
      .patch(`${API}/admin/courses/${ownCourseId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'archived' });
    assert.equal(archiveDenied.status, 403);

    // Scenario A — grant courses.publish (same token; permissions are read per request)
    const perms = await instructorPermissions();
    await setInstructorPermissions([...perms, 'courses.publish']);

    const published = await request(app)
      .patch(`${API}/admin/courses/${ownCourseId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.data.course.status, 'published');

    const unpublished = await request(app)
      .patch(`${API}/admin/courses/${ownCourseId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'draft' });
    assert.equal(unpublished.status, 200);

    // Revoke — immediately blocked again without re-login
    await setInstructorPermissions(perms);
    const revoked = await request(app)
      .patch(`${API}/admin/courses/${ownCourseId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(revoked.status, 403);
  });

  it('publish permission does not bypass course assignment', async () => {
    const perms = await instructorPermissions();
    await setInstructorPermissions([...perms, 'courses.publish']);

    const res = await request(app)
      .patch(`${API}/admin/courses/${otherCourseId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(res.status, 403);
  });

  it('quiz publish: requires quizzes.publish, enforced per request', async () => {
    const denied = await request(app)
      .patch(`${API}/admin/quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(denied.status, 403);

    const perms = await instructorPermissions();
    await setInstructorPermissions([...perms, 'quizzes.publish']);

    const published = await request(app)
      .patch(`${API}/admin/quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(published.status, 200, JSON.stringify(published.body));

    await setInstructorPermissions(perms);
    const revoked = await request(app)
      .patch(`${API}/admin/quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'draft' });
    assert.equal(revoked.status, 403);
  });

  it('assignment publish: seed permission works, revoke blocks immediately', async () => {
    // assignments.publish is part of the instructor seed
    const published = await request(app)
      .patch(`${API}/admin/assignments/${assignmentId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'published' });
    assert.equal(published.status, 200, JSON.stringify(published.body));

    const perms = await instructorPermissions();
    await setInstructorPermissions(perms.filter((p) => p !== 'assignments.publish'));

    const revoked = await request(app)
      .patch(`${API}/admin/assignments/${assignmentId}/status`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ status: 'draft' });
    assert.equal(revoked.status, 403);
  });

  it('instructor cannot create or delete courses even with publish granted', async () => {
    const perms = await instructorPermissions();
    await setInstructorPermissions([...perms, 'courses.publish']);

    const create = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ title: 'Nope', description: '<p>x</p>' });
    assert.equal(create.status, 403);

    const del = await request(app)
      .delete(`${API}/admin/courses/${ownCourseId}`)
      .set('Authorization', `Bearer ${instructorToken}`);
    assert.equal(del.status, 403);
  });
});
