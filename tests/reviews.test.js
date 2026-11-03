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
import { CourseReview } from '../src/models/CourseReview.js';
import { Course } from '../src/models/Course.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-review',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-review.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Rev',
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

describe('Phase 12 Reviews & Ratings', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherToken;
  let otherId;
  let courseId;
  let categoryId;
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
    await register(app, 'admin.review@skillbee.test');
    await promoteToRole('admin.review@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.review@skillbee.test')).accessToken;

    const student = await register(app, 'student.review@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'other.review@skillbee.test');
    otherToken = other.accessToken;
    otherId = other.user.id;

    const instructor = await register(app, 'instructor.review@skillbee.test');
    await promoteToRole('instructor.review@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructor.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Review Cat', slug: `review-cat-${Date.now()}` });
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Reviewable Course',
        description: '<p>Reviews</p>',
        thumbnail,
        categoryIds: [categoryId],
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

  it('student creates review; unauth/non-enrolled blocked; duplicate blocked', async () => {
    const unauth = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .send({ rating: 5, comment: 'Great' });
    assert.equal(unauth.status, 401);

    const notEnrolled = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 4, comment: 'Nope' });
    assert.equal(notEnrolled.status, 403);

    const created = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 5, title: 'Awesome', comment: 'Loved it' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.review.status, 'pending');
    assert.equal(created.body.data.review.rating, 5);

    const dup = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 3, comment: 'Again' });
    assert.equal(dup.status, 409);

    const publicBefore = await request(app).get(`${API}/courses/${courseId}/reviews`);
    assert.equal(publicBefore.status, 200);
    assert.equal(publicBefore.body.data.reviews.length, 0);
    assert.equal(publicBefore.body.data.totalApprovedReviews, 0);
  });

  it('rejects expired and revoked enrollments', async () => {
    await CourseEnrollment.updateOne(
      { studentId, courseId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    const expired = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 4, comment: 'Late' });
    assert.equal(expired.status, 403);

    await CourseEnrollment.deleteMany({});
    await CourseEnrollment.create({
      courseId,
      studentId,
      status: 'revoked',
      enrollmentType: 'manual',
      source: 'manual',
      revokedAt: new Date(),
    });
    const revoked = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 4, comment: 'Revoked' });
    assert.equal(revoked.status, 403);
  });

  it('student edits own review to pending; cannot edit others or protected fields', async () => {
    const created = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 4, comment: 'OK' });
    const reviewId = created.body.data.review.id;

    await request(app)
      .patch(`${API}/admin/reviews/${reviewId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    // Protected field mass-assignment must be rejected
    const massAssign = await request(app)
      .patch(`${API}/student/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 5, status: 'approved' });
    assert.equal(massAssign.status, 400);

    const edited = await request(app)
      .patch(`${API}/student/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 5, comment: 'Even better' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.data.review.status, 'pending');
    assert.equal(edited.body.data.review.rating, 5);

    const otherEdit = await request(app)
      .patch(`${API}/student/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 1 });
    assert.equal(otherEdit.status, 403);
  });

  it('admin moderation, public approved-only, stats accuracy', async () => {
    await CourseEnrollment.create({
      courseId,
      studentId: otherId,
      status: 'active',
      enrollmentType: 'manual',
      source: 'manual',
    });

    const r1 = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 5, comment: 'Five' });
    const r2 = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 3, comment: 'Three' });

    const thirdStudent = await register(app, 'third.review@skillbee.test');
    await CourseEnrollment.create({
      courseId,
      studentId: thirdStudent.user.id,
      status: 'active',
      enrollmentType: 'manual',
      source: 'manual',
    });
    const r3 = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${thirdStudent.accessToken}`)
      .send({ rating: 1, comment: 'One' });

    const list = await request(app)
      .get(`${API}/admin/reviews?status=pending`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.reviews.length, 3);

    await request(app)
      .patch(`${API}/admin/reviews/${r1.body.data.review.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });
    await request(app)
      .patch(`${API}/admin/reviews/${r2.body.data.review.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });
    await request(app)
      .patch(`${API}/admin/reviews/${r3.body.data.review.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'spam' });

    const pub = await request(app).get(`${API}/courses/${courseId}/reviews`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.reviews.length, 2);
    assert.equal(pub.body.data.totalApprovedReviews, 2);
    assert.equal(pub.body.data.averageRating, 4);
    assert.equal(pub.body.data.ratingDistribution[5], 1);
    assert.equal(pub.body.data.ratingDistribution[3], 1);
    assert.ok(!JSON.stringify(pub.body).includes('@skillbee.test'));
    assert.ok(!JSON.stringify(pub.body).includes('rejectionReason'));

    // Reject previously approved → stats update
    await request(app)
      .patch(`${API}/admin/reviews/${r2.body.data.review.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'changed mind' });
    const pub2 = await request(app).get(`${API}/courses/${courseId}/reviews`);
    assert.equal(pub2.body.data.totalApprovedReviews, 1);
    assert.equal(pub2.body.data.averageRating, 5);

    const del = await request(app)
      .delete(`${API}/admin/reviews/${r1.body.data.review.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);
    const pub3 = await request(app).get(`${API}/courses/${courseId}/reviews`);
    assert.equal(pub3.body.data.totalApprovedReviews, 0);

    const course = await Course.findById(courseId);
    assert.equal(course.ratingStats.approvedReviewCount, 0);

    const studentMod = await request(app)
      .patch(`${API}/admin/reviews/${r3.body.data.review.id}/status`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'approved' });
    assert.ok([401, 403].includes(studentMod.status));
  });

  it('concurrency: only one review per student/course', async () => {
    const [a, b] = await Promise.all([
      request(app)
        .post(`${API}/student/courses/${courseId}/reviews`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ rating: 5, comment: 'A' }),
      request(app)
        .post(`${API}/student/courses/${courseId}/reviews`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ rating: 4, comment: 'B' }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    assert.equal(
      await CourseReview.countDocuments({ studentId, courseId, deletedAt: null }),
      1
    );
  });

  it('rejects invalid ratings', async () => {
    const bad = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 6, comment: 'bad' });
    assert.equal(bad.status, 400);

    const zero = await request(app)
      .post(`${API}/student/courses/${courseId}/reviews`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ rating: 0, comment: 'bad' });
    assert.equal(zero.status, 400);
  });
});
