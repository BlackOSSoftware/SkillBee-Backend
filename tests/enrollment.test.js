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
import { LessonProgress } from '../src/models/LessonProgress.js';
import { CourseLesson } from '../src/models/CourseLesson.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-enroll-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-enroll-thumb.jpg',
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
  assert.equal(res.status, 201, res.body?.error?.message || JSON.stringify(res.body));
  return res.body.data;
}

async function login(app, email, password = 'Secret123') {
  const res = await request(app).post(`${API}/auth/login`).send({ email, password });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Phase 7 Enrollment & Progress', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherStudentToken;
  let otherStudentId;
  let instructorToken;
  let instructorId;
  let categoryId;
  let courseId;
  let topicId;
  let requiredLessonIds = [];
  let optionalLessonId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    requiredLessonIds = [];
    optionalLessonId = null;

    await register(app, 'admin.enr@skillbee.test');
    await promoteToRole('admin.enr@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.enr@skillbee.test')).accessToken;

    const student = await register(app, 'student.enr@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'student.other.enr@skillbee.test');
    otherStudentToken = other.accessToken;
    otherStudentId = other.user.id;

    await register(app, 'instructor.enr@skillbee.test');
    await promoteToRole('instructor.enr@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.enr@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV Enroll', description: 'Enrollment tests' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Enrollment Progress Course',
        description: '<p>10 required lessons progress course</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 5000, currency: 'INR' },
      });
    assert.equal(course.status, 201);
    courseId = course.body.data.course.id;

    const topic = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Topic Progress', description: 't' });
    assert.equal(topic.status, 201);
    topicId = topic.body.data.topic.id;

    for (let i = 1; i <= 10; i += 1) {
      const lesson = await request(app)
        .post(`${API}/admin/topics/${topicId}/lessons`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Required Lesson ${i}`,
          type: 'text',
          textContent: { body: `<p>Lesson ${i}</p>`, format: 'html' },
          isRequired: true,
        });
      assert.equal(lesson.status, 201, JSON.stringify(lesson.body));
      const lid = lesson.body.data.lesson.id;
      requiredLessonIds.push(lid);
      await request(app)
        .patch(`${API}/admin/lessons/${lid}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });
    }

    const optional = await request(app)
      .post(`${API}/admin/topics/${topicId}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Optional Bonus',
        type: 'text',
        textContent: { body: '<p>optional</p>', format: 'html' },
        isRequired: false,
      });
    assert.equal(optional.status, 201);
    optionalLessonId = optional.body.data.lesson.id;
    await request(app)
      .patch(`${API}/admin/lessons/${optionalLessonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
  });

  async function enrollStudent(sid = studentId) {
    const res = await request(app)
      .post(`${API}/admin/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentId: sid,
        courseId,
        enrollmentType: 'admin_granted',
        reason: 'Test enrollment',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.enrollment;
  }

  describe('Admin enrollment APIs', () => {
    it('creates manual enrollment', async () => {
      const enrollment = await enrollStudent();
      assert.equal(enrollment.studentId, studentId);
      assert.equal(enrollment.courseId, courseId);
      assert.equal(enrollment.enrollmentStatus, 'active');
      assert.equal(enrollment.totalRequiredLessons, 10);
      assert.equal(enrollment.progressPercentage, 0);
    });

    it('rejects invalid student', async () => {
      const res = await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          courseId,
        });
      assert.equal(res.status, 404);
    });

    it('rejects invalid course', async () => {
      const res = await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId,
          courseId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        });
      assert.equal(res.status, 404);
    });

    it('prevents duplicate active enrollment', async () => {
      await enrollStudent();
      const res = await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'DUPLICATE_ACTIVE_ENROLLMENT');
    });

    it('student cannot use admin enrollment API', async () => {
      const res = await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ studentId, courseId });
      assert.equal(res.status, 403);
    });

    it('updates and revokes enrollment', async () => {
      const enrollment = await enrollStudent();
      const patch = await request(app)
        .patch(`${API}/admin/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enrollmentExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          reason: 'extend',
        });
      assert.equal(patch.status, 200);
      assert.ok(patch.body.data.enrollment.enrollmentExpiresAt);

      const revoked = await request(app)
        .delete(`${API}/admin/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.data.enrollment.status, 'revoked');

      const hist = await request(app)
        .get(`${API}/admin/enrollments/${enrollment.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(hist.status, 200);
      assert.ok(hist.body.data.history.length >= 2);
    });

    it('lists course and student enrollments', async () => {
      await enrollStudent();
      const byCourse = await request(app)
        .get(`${API}/admin/courses/${courseId}/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(byCourse.status, 200);
      assert.equal(byCourse.body.data.enrollments.length, 1);

      const byStudent = await request(app)
        .get(`${API}/admin/students/${studentId}/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(byStudent.status, 200);
      assert.equal(byStudent.body.data.enrollments.length, 1);
    });
  });

  describe('Lesson completion & progress', () => {
    it('completes eligible lessons and reaches 70%', async () => {
      await enrollStudent();

      for (let i = 0; i < 7; i += 1) {
        const res = await request(app)
          .post(`${API}/student/lessons/${requiredLessonIds[i]}/complete`)
          .set('Authorization', `Bearer ${studentToken}`)
          .send({});
        assert.equal(res.status, 200, JSON.stringify(res.body));
      }

      const progress = await request(app)
        .get(`${API}/student/courses/${courseId}/progress`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(progress.status, 200);
      assert.equal(progress.body.data.progress.totalRequiredLessons, 10);
      assert.equal(progress.body.data.progress.completedLessonsCount, 7);
      assert.equal(progress.body.data.progress.progressPercentage, 70);
      assert.equal(progress.body.data.progress.courseCompletionStatus, 'in_progress');
    });

    it('optional lesson does not increase required progress', async () => {
      await enrollStudent();
      await request(app)
        .post(`${API}/student/lessons/${optionalLessonId}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      const progress = await request(app)
        .get(`${API}/student/courses/${courseId}/progress`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(progress.body.data.progress.completedLessonsCount, 0);
      assert.equal(progress.body.data.progress.progressPercentage, 0);
    });

    it('idempotent duplicate completion', async () => {
      await enrollStudent();
      const first = await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(first.status, 200);
      const second = await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(second.status, 200);
      assert.equal(second.body.data.alreadyCompleted, true);
      assert.equal(second.body.data.progress.completedLessonsCount, 1);

      const count = await LessonProgress.countDocuments({
        studentId,
        lessonId: requiredLessonIds[0],
      });
      assert.equal(count, 1);
    });

    it('rejects completion without enrollment', async () => {
      const res = await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'NOT_ENROLLED');
    });

    it('rejects completion of another course lesson', async () => {
      await enrollStudent();
      const course2 = await request(app)
        .post(`${API}/admin/courses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Other Enrollment Course',
          description: '<p>Foreign course content for isolation test</p>',
          thumbnail: { ...thumbnail, publicId: 'skillbee/courses/other-enroll' },
          categoryIds: [categoryId],
          instructorIds: [instructorId],
          pricing: { type: 'paid', regularPrice: 1000, currency: 'INR' },
        });
      assert.equal(course2.status, 201, JSON.stringify(course2.body));
      const course2Id = course2.body.data.course.id;
      const topic2 = await request(app)
        .post(`${API}/admin/courses/${course2Id}/topics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Other Topic', description: 'foreign' });
      assert.equal(topic2.status, 201, JSON.stringify(topic2.body));
      const lesson2 = await request(app)
        .post(`${API}/admin/topics/${topic2.body.data.topic.id}/lessons`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Foreign Lesson',
          type: 'text',
          textContent: { body: '<p>x</p>', format: 'html' },
        });
      assert.equal(lesson2.status, 201, JSON.stringify(lesson2.body));
      await request(app)
        .patch(`${API}/admin/lessons/${lesson2.body.data.lesson.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });
      await request(app)
        .patch(`${API}/admin/courses/${course2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });

      const res = await request(app)
        .post(`${API}/student/lessons/${lesson2.body.data.lesson.id}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(res.status, 403);
    });

    it('rejects unpublished lesson completion', async () => {
      await enrollStudent();
      const draft = await request(app)
        .post(`${API}/admin/topics/${topicId}/lessons`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Draft Lesson',
          type: 'text',
          textContent: { body: '<p>d</p>', format: 'html' },
        });
      const res = await request(app)
        .post(`${API}/student/lessons/${draft.body.data.lesson.id}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(res.status, 404);
    });

    it('rejects forged progress fields from client', async () => {
      await enrollStudent();
      const res = await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ progressPercentage: 100, isCourseCompleted: true });
      assert.equal(res.status, 400);
    });

    it('rejects live lesson completion before session ends', async () => {
      await enrollStudent();
      const live = await request(app)
        .post(`${API}/admin/topics/${topicId}/lessons`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Live Session',
          type: 'live',
          liveSession: {
            meetingUrl: 'https://meet.example.com/x',
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 3600000).toISOString(),
          },
        });
      assert.equal(live.status, 201, JSON.stringify(live.body));
      const lid = live.body.data.lesson.id;
      await request(app)
        .patch(`${API}/admin/lessons/${lid}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });

      const res = await request(app)
        .post(`${API}/student/lessons/${lid}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'LIVE_SESSION_ACTIVE');
    });

    it('marks course completed at 100% required lessons', async () => {
      await enrollStudent();
      for (const lid of requiredLessonIds) {
        const res = await request(app)
          .post(`${API}/student/lessons/${lid}/complete`)
          .set('Authorization', `Bearer ${studentToken}`)
          .send({});
        assert.equal(res.status, 200, JSON.stringify(res.body));
      }
      const progress = await request(app)
        .get(`${API}/student/courses/${courseId}/progress`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(progress.body.data.progress.progressPercentage, 100);
      assert.equal(progress.body.data.progress.courseCompletionStatus, 'completed');
      assert.equal(progress.body.data.progress.enrollmentStatus, 'completed');
    });

    it('zero required lessons does not auto-complete', async () => {
      // Soft-mark all required as optional
      await CourseLesson.updateMany(
        { courseId, isRequired: true },
        { $set: { isRequired: false } }
      );
      await enrollStudent();
      const progress = await request(app)
        .get(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(progress.status, 200);
      const enr = progress.body.data.enrollments[0];
      assert.equal(enr.totalRequiredLessons, 0);
      assert.equal(enr.progressPercentage, 0);
      assert.notEqual(enr.courseCompletionStatus, 'completed');
    });
  });

  describe('Access control', () => {
    it('denies revoked enrollment learning access', async () => {
      const enrollment = await enrollStudent();
      await request(app)
        .delete(`${API}/admin/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(res.status, 403);
    });

    it('denies expired enrollment even if status still active', async () => {
      const enrollment = await enrollStudent();
      await CourseEnrollment.updateOne(
        { _id: enrollment.id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } }
      );

      const res = await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(res.status, 403);
    });

    it('blocks cross-student progress access', async () => {
      await enrollStudent();
      await request(app)
        .post(`${API}/student/lessons/${requiredLessonIds[0]}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      const res = await request(app)
        .get(`${API}/student/courses/${courseId}/progress`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      assert.equal(res.status, 403);
    });

    it('unauthenticated requests fail', async () => {
      const res = await request(app).get(`${API}/student/dashboard`);
      assert.equal(res.status, 401);
    });

    it('instructor cannot call admin enroll without admin role', async () => {
      const res = await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ studentId, courseId });
      assert.equal(res.status, 403);
    });
  });

  describe('Student dashboard & my-courses', () => {
    it('returns student-specific dashboard stats', async () => {
      await enrollStudent();
      for (let i = 0; i < 7; i += 1) {
        await request(app)
          .post(`${API}/student/lessons/${requiredLessonIds[i]}/complete`)
          .set('Authorization', `Bearer ${studentToken}`)
          .send({});
      }

      const dash = await request(app)
        .get(`${API}/student/dashboard`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(dash.status, 200);
      assert.equal(dash.body.data.dashboard.totals.enrolledCourses, 1);
      assert.equal(dash.body.data.dashboard.totals.inProgressCourses, 1);
      assert.ok(dash.body.data.dashboard.totals.completedRequiredLessons >= 7);

      const otherDash = await request(app)
        .get(`${API}/student/dashboard`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      assert.equal(otherDash.body.data.dashboard.totals.enrolledCourses, 0);

      const mine = await request(app)
        .get(`${API}/student/my-courses?filter=in_progress`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(mine.status, 200);
      assert.equal(mine.body.data.courses.length, 1);
      assert.equal(mine.body.data.courses[0].progressPercentage, 70);
    });

    it('supports completed student seed scenario', async () => {
      await enrollStudent(otherStudentId);
      for (const lid of requiredLessonIds) {
        await request(app)
          .post(`${API}/student/lessons/${lid}/complete`)
          .set('Authorization', `Bearer ${otherStudentToken}`)
          .send({});
      }
      const mine = await request(app)
        .get(`${API}/student/my-courses?filter=completed`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      assert.equal(mine.status, 200);
      assert.equal(mine.body.data.courses.length, 1);
      assert.equal(mine.body.data.courses[0].progressPercentage, 100);
    });
  });

  describe('Re-enrollment preserves history', () => {
    it('reactivates revoked enrollment with history', async () => {
      const enrollment = await enrollStudent();
      await request(app)
        .delete(`${API}/admin/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const again = await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId, enrollmentType: 'admin_granted' });
      assert.equal(again.status, 201);
      assert.equal(again.body.data.enrollment.status, 'active');

      const hist = await request(app)
        .get(`${API}/admin/enrollments/${enrollment.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      const actions = hist.body.data.history.map((h) => h.action);
      assert.ok(actions.includes('revoked'));
      assert.ok(actions.includes('reactivated'));
    });
  });
});
