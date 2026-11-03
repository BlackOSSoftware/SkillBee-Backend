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
import { CourseEnrollment } from '../src/models/CourseEnrollment.js';
import { CourseQuestion } from '../src/models/CourseQuestion.js';
import { QuestionReply } from '../src/models/QuestionReply.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/qa',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/qa.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Qa',
    lastName: 'Student',
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

describe('Phase 13 Q&A', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherToken;
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
    await register(app, 'admin.qa@skillbee.test');
    await promoteToRole('admin.qa@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.qa@skillbee.test')).accessToken;

    const student = await register(app, 'student.qa@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'other.qa@skillbee.test');
    otherToken = other.accessToken;

    const instructor = await register(app, 'instructor.qa@skillbee.test');
    await promoteToRole('instructor.qa@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructor.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'QA Cat', slug: `qa-cat-${Date.now()}` });

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'QA Course',
        description: '<p>Q and A</p>',
        thumbnail,
        categoryIds: [category.body.data.category.id],
        instructorIds: [instructorId],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      });
    courseId = course.body.data.course.id;
    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    await CourseEnrollment.create({
      courseId,
      studentId,
      status: 'active',
      enrollmentType: 'manual',
      source: 'manual',
    });
  });

  it('creates question; blocks unauth and non-enrolled', async () => {
    const unauth = await request(app)
      .post(`${API}/student/courses/${courseId}/questions`)
      .send({ title: 'How?', description: 'Please explain modules' });
    assert.equal(unauth.status, 401);

    const blocked = await request(app)
      .post(`${API}/student/courses/${courseId}/questions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'How?', description: 'Please explain modules' });
    assert.equal(blocked.status, 403);

    const created = await request(app)
      .post(`${API}/student/courses/${courseId}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'How does enrollment work?', description: 'Need details on access windows' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.status, 'open');
    assert.equal(created.body.data.replyCount, 0);
  });

  it('enforces ownership on view and reply', async () => {
    const created = await request(app)
      .post(`${API}/student/courses/${courseId}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Ownership test', description: 'Can others see this?' });
    const qid = created.body.data.id;

    const otherView = await request(app)
      .get(`${API}/student/questions/${qid}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(otherView.status, 403);

    const otherReply = await request(app)
      .post(`${API}/student/questions/${qid}/replies`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ message: 'Hijack' });
    assert.equal(otherReply.status, 403);

    const own = await request(app)
      .get(`${API}/student/questions/${qid}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.data.replies.length, 0);
  });

  it('admin reply, resolve/reopen, answered filters, student cannot reply when resolved', async () => {
    const created = await request(app)
      .post(`${API}/student/courses/${courseId}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Need help', description: 'Stuck on lesson 1' });
    const qid = created.body.data.id;

    const unanswered = await request(app)
      .get(`${API}/admin/questions-answers`)
      .query({ answered: 'unanswered' })
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(unanswered.status, 200);
    assert.ok(unanswered.body.data.some((q) => q.id === qid));

    const adminReply = await request(app)
      .post(`${API}/admin/questions-answers/${qid}/replies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Check the resources tab', idempotencyKey: 'admin-reply-1' });
    assert.equal(adminReply.status, 201, JSON.stringify(adminReply.body));

    const dup = await request(app)
      .post(`${API}/admin/questions-answers/${qid}/replies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Check the resources tab', idempotencyKey: 'admin-reply-1' });
    assert.equal(dup.status, 201);
    assert.equal(dup.body.data.id, adminReply.body.data.id);

    const answered = await request(app)
      .get(`${API}/admin/questions-answers`)
      .query({ answered: 'answered' })
      .set('Authorization', `Bearer ${adminToken}`);
    assert.ok(answered.body.data.some((q) => q.id === qid && q.replyCount >= 1));

    const resolve = await request(app)
      .patch(`${API}/admin/questions-answers/${qid}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.body.data.status, 'resolved');
    assert.ok(resolve.body.data.resolvedAt);

    const studentReplyBlocked = await request(app)
      .post(`${API}/student/questions/${qid}/replies`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ message: 'Thanks' });
    assert.equal(studentReplyBlocked.status, 409);

    const reopen = await request(app)
      .patch(`${API}/admin/questions-answers/${qid}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'open' });
    assert.equal(reopen.status, 200);
    assert.equal(reopen.body.data.status, 'open');

    const studentReply = await request(app)
      .post(`${API}/student/questions/${qid}/replies`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ message: 'Thanks, that helped' });
    assert.equal(studentReply.status, 201);
  });

  it('student cannot delete; admin soft-deletes with reply consistency', async () => {
    const created = await request(app)
      .post(`${API}/student/courses/${courseId}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Delete me', description: 'Please remove' });
    const qid = created.body.data.id;

    await request(app)
      .post(`${API}/admin/questions-answers/${qid}/replies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Noted' });

    const studentDelete = await request(app)
      .delete(`${API}/admin/questions-answers/${qid}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentDelete.status, 403);

    const del = await request(app)
      .delete(`${API}/admin/questions-answers/${qid}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);

    const q = await CourseQuestion.findById(qid);
    assert.ok(q.deletedAt);
    const openReplies = await QuestionReply.countDocuments({ questionId: qid, deletedAt: null });
    assert.equal(openReplies, 0);
  });

  it('pagination/sorting and concurrent replies stay consistent', async () => {
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post(`${API}/student/courses/${courseId}/questions`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: `Q${i} title enough`, description: `Description number ${i} long enough` });
    }

    const list = await request(app)
      .get(`${API}/student/questions`)
      .query({ page: 1, limit: 2, sort: 'newest' })
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 2);
    assert.equal(list.body.pagination.total, 3);

    const first = list.body.data[0];
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        request(app)
          .post(`${API}/student/questions/${first.id}/replies`)
          .set('Authorization', `Bearer ${studentToken}`)
          .send({ message: `Concurrent ${n}`, idempotencyKey: `conc-${first.id}-${n}` })
      )
    );
    assert.ok(results.every((r) => r.status === 201));
    const detail = await request(app)
      .get(`${API}/student/questions/${first.id}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(detail.body.data.replies.length, 3);
    assert.equal(detail.body.data.replyCount, 3);
  });
});
