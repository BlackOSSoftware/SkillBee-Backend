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

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/type-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/type-thumb.jpg',
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

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Course Types & Live Applications', () => {
  let app;
  let adminToken;
  let instructorId;
  let categoryId;
  let studentToken;
  let studentEmail;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    const adminReg = await register(app, 'admin.types@skillbee.test');
    await promoteToRole('admin.types@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.types@skillbee.test')).accessToken;

    const instructorReg = await register(app, 'instructor.types@skillbee.test');
    await promoteToRole('instructor.types@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructorReg.user?.id || instructorReg.id;

    studentEmail = 'student.types@skillbee.test';
    await register(app, studentEmail);
    studentToken = (await login(app, studentEmail)).accessToken;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set(auth(adminToken))
      .send({ name: 'Pharma Training' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;
  });

  async function createCourse(payload) {
    const res = await request(app)
      .post(`${API}/admin/courses`)
      .set(auth(adminToken))
      .send({
        title: 'Type Test Course',
        description: '<p>Course type workflow test</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        ...payload,
      });
    return res;
  }

  async function publishCourse(courseId) {
    const res = await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set(auth(adminToken))
      .send({ status: 'published' });
    assert.equal(res.status, 200);
    return res.body.data.course;
  }

  it('creates courses with explicit courseType and enforces pricing rules', async () => {
    const free = await createCourse({
      title: 'Free Type Course',
      courseType: 'FREE',
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    });
    assert.equal(free.status, 201);
    assert.equal(free.body.data.course.courseType, 'FREE');

    const freePaid = await createCourse({
      title: 'Free With Paid Pricing',
      courseType: 'FREE',
      pricing: { type: 'paid', regularPrice: 100, currency: 'INR' },
    });
    assert.equal(freePaid.status, 400);

    const preRecorded = await createCourse({
      title: 'Pre Recorded Type Course',
      courseType: 'PRE_RECORDED',
      pricing: { type: 'paid', regularPrice: 4999, salePrice: 3999, currency: 'INR' },
    });
    assert.equal(preRecorded.status, 201);
    assert.equal(preRecorded.body.data.course.courseType, 'PRE_RECORDED');

    const preRecordedFree = await createCourse({
      title: 'Pre Recorded Free Pricing',
      courseType: 'PRE_RECORDED',
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    });
    assert.equal(preRecordedFree.status, 400);

    const live = await createCourse({
      title: 'Live Type Course',
      courseType: 'LIVE_SESSION',
      pricing: { type: 'paid', regularPrice: 15000, currency: 'INR' },
      liveSession: {
        batchName: 'Batch A',
        startDate: '2026-11-25',
        endDate: '2026-12-25',
        sessionMode: 'Live Online',
        sessionSchedule: 'Mon/Wed/Fri 7-9 PM IST',
      },
      enrollment: { limitEnabled: true, maximumStudents: 30 },
    });
    assert.equal(live.status, 201);
    assert.equal(live.body.data.course.courseType, 'LIVE_SESSION');
    assert.equal(live.body.data.course.liveSession.batchName, 'Batch A');

    // Backward compatibility: legacy payloads without courseType derive it from pricing.
    const legacyPaid = await createCourse({
      title: 'Legacy Paid Course',
      pricing: { type: 'paid', regularPrice: 999, currency: 'INR' },
    });
    assert.equal(legacyPaid.status, 201);
    assert.equal(legacyPaid.body.data.course.courseType, 'PRE_RECORDED');

    const legacyFree = await createCourse({
      title: 'Legacy Free Course',
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    });
    assert.equal(legacyFree.status, 201);
    assert.equal(legacyFree.body.data.course.courseType, 'FREE');
  });

  it('enrolls students in FREE courses and blocks paid/live types', async () => {
    const free = await createCourse({
      title: 'Free Enroll Course',
      courseType: 'FREE',
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    });
    const freeId = free.body.data.course.id;
    await publishCourse(freeId);

    const enrolled = await request(app)
      .post(`${API}/student/enrollments`)
      .set(auth(studentToken))
      .send({ courseId: freeId });
    assert.equal(enrolled.status, 201);
    assert.equal(enrolled.body.data.enrollment.status, 'active');
    assert.equal(enrolled.body.data.enrollment.enrollmentType, 'free');

    const dup = await request(app)
      .post(`${API}/student/enrollments`)
      .set(auth(studentToken))
      .send({ courseId: freeId });
    assert.equal(dup.status, 409);

    const paid = await createCourse({
      title: 'Paid Block Course',
      courseType: 'PRE_RECORDED',
      pricing: { type: 'paid', regularPrice: 999, currency: 'INR' },
    });
    const paidId = paid.body.data.course.id;
    await publishCourse(paidId);
    const paidEnroll = await request(app)
      .post(`${API}/student/enrollments`)
      .set(auth(studentToken))
      .send({ courseId: paidId });
    assert.equal(paidEnroll.status, 400);
    assert.equal(paidEnroll.body.error.code, 'PAYMENT_REQUIRED');

    const live = await createCourse({
      title: 'Live Block Course',
      courseType: 'LIVE_SESSION',
    });
    const liveId = live.body.data.course.id;
    await publishCourse(liveId);
    const liveEnroll = await request(app)
      .post(`${API}/student/enrollments`)
      .set(auth(studentToken))
      .send({ courseId: liveId });
    assert.equal(liveEnroll.status, 400);
    assert.equal(liveEnroll.body.error.code, 'LIVE_COURSE_APPLICATION_REQUIRED');
  });

  it('captures public free-course registration leads and enrolls logged-in students', async () => {
    const free = await createCourse({
      title: 'Public Free Course',
      courseType: 'FREE',
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    });
    const course = free.body.data.course;
    await publishCourse(course.id);

    const visitor = {
      name: 'Visitor Rao',
      email: 'visitor.free@skillbee.test',
      whatsappNumber: '+91 90000 00001',
      currentCompany: 'Acme Pharma',
      currentCity: 'Hyderabad',
    };

    // Public visitor — no auth: lead saved, account does not exist yet.
    const first = await request(app)
      .post(`${API}/courses/${course.slug}/free-registration`)
      .send(visitor);
    assert.equal(first.status, 201);
    assert.equal(first.body.data.accountExists, false);
    assert.equal(first.body.data.enrollment, null);
    assert.ok(first.body.data.lead.id);

    // Duplicate lead submission is idempotent (same lead, no error).
    const again = await request(app)
      .post(`${API}/courses/${course.slug}/free-registration`)
      .send(visitor);
    assert.equal(again.status, 201);
    assert.equal(again.body.data.lead.id, first.body.data.lead.id);

    // Visitor registers → account now exists.
    await register(app, visitor.email);
    const third = await request(app)
      .post(`${API}/courses/${course.slug}/free-registration`)
      .send(visitor);
    assert.equal(third.status, 201);
    assert.equal(third.body.data.accountExists, true);

    // Logged-in student submits → enrollment created immediately.
    const studentLogin = await login(app, visitor.email);
    const authed = await request(app)
      .post(`${API}/courses/${course.slug}/free-registration`)
      .set(auth(studentLogin.accessToken))
      .send(visitor);
    assert.equal(authed.status, 201);
    assert.equal(authed.body.data.accountExists, true);
    assert.equal(authed.body.data.enrollment.status, 'active');
    assert.equal(authed.body.data.lead.status, 'converted');

    // Non-free course rejects registration.
    const paid = await createCourse({
      title: 'Paid Registration Course',
      courseType: 'PRE_RECORDED',
      pricing: { type: 'paid', regularPrice: 100, currency: 'INR' },
    });
    await publishCourse(paid.body.data.course.id);
    const paidReg = await request(app)
      .post(`${API}/courses/${paid.body.data.course.slug}/free-registration`)
      .send(visitor);
    assert.equal(paidReg.status, 400);
    assert.equal(paidReg.body.error.code, 'NOT_A_FREE_COURSE');
  });

  it('runs the full live-session application workflow', async () => {
    const live = await createCourse({
      title: 'Live Application Course',
      courseType: 'LIVE_SESSION',
      pricing: { type: 'paid', regularPrice: 12000, currency: 'INR' },
      liveSession: {
        batchName: 'Test Batch November 2026',
        startDate: '2026-11-25',
        endDate: '2026-12-25',
        sessionMode: 'Live Online',
        sessionSchedule: 'Tue/Thu/Sat 6-8 PM IST',
      },
      enrollment: { limitEnabled: true, maximumStudents: 25 },
    });
    const course = live.body.data.course;
    await publishCourse(course.id);

    // Public detail exposes liveSession batch info for LIVE_SESSION courses.
    const publicDetail = await request(app).get(
      `${API}/courses/${course.slug}`
    );
    assert.equal(publicDetail.status, 200);
    assert.equal(publicDetail.body.data.course.courseType, 'LIVE_SESSION');
    assert.equal(
      publicDetail.body.data.course.liveSession.batchName,
      'Test Batch November 2026'
    );
    assert.equal(publicDetail.body.data.course.actionLabel, 'Apply Now');

    const applicationBody = {
      name: 'Applicant One',
      email: 'applicant.one@skillbee.test',
      whatsappNumber: '+91 90000 00002',
      currentCompany: 'Globex',
      currentCity: 'Mumbai',
      courseInterested: 'DevOps',
      liveCourse: course.id,
      referralSource: 'LinkedIn',
      comment: 'Interested in the live batch',
    };

    // Public visitor application — no auth, no enrollment.
    const submitted = await request(app)
      .post(`${API}/live-course-applications`)
      .send(applicationBody);
    assert.equal(submitted.status, 201);
    const application = submitted.body.data.application;
    assert.equal(application.status, 'PENDING');
    assert.match(application.applicationReference, /^LCA-\d{4}-\d{6}$/);
    assert.equal(application.student, null);

    // Duplicate (email + course) rejected.
    const dup = await request(app)
      .post(`${API}/live-course-applications`)
      .send(applicationBody);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'DUPLICATE_APPLICATION');

    // Logged-in student application attaches the student ref.
    const studentApp = await request(app)
      .post(`${API}/live-course-applications`)
      .set(auth(studentToken))
      .send({
        ...applicationBody,
        email: studentEmail,
        name: 'Student Applicant',
      });
    assert.equal(studentApp.status, 201);

    const mine = await request(app)
      .get(`${API}/student/live-course-applications`)
      .set(auth(studentToken));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.length, 1);
    assert.equal(mine.body.data[0].status, 'PENDING');

    // Admin review queue.
    const list = await request(app)
      .get(`${API}/admin/live-course-applications`)
      .query({ status: 'PENDING', liveCourse: course.id })
      .set(auth(adminToken));
    assert.equal(list.status, 200);
    assert.ok(list.body.pagination.total >= 2);

    const appId = application.id;
    const studentAppId = studentApp.body.data.application.id;

    // Public applicant has no linked student account → even after
    // approval, conversion is rejected.
    await request(app)
      .patch(`${API}/admin/live-course-applications/${appId}/status`)
      .set(auth(adminToken))
      .send({ status: 'APPROVED' });
    const noStudentConvert = await request(app)
      .post(`${API}/admin/live-course-applications/${appId}/convert`)
      .set(auth(adminToken));
    assert.equal(noStudentConvert.status, 400);
    assert.equal(noStudentConvert.body.error.code, 'APPLICATION_NO_STUDENT');

    // Cannot convert before approval.
    const earlyConvert = await request(app)
      .post(`${API}/admin/live-course-applications/${studentAppId}/convert`)
      .set(auth(adminToken));
    assert.equal(earlyConvert.status, 400);

    // Approve then convert → CONVERTED with pending enrollment (no auto-access).
    const approved = await request(app)
      .patch(`${API}/admin/live-course-applications/${studentAppId}/status`)
      .set(auth(adminToken))
      .send({ status: 'APPROVED' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.application.status, 'APPROVED');

    const converted = await request(app)
      .post(`${API}/admin/live-course-applications/${studentAppId}/convert`)
      .set(auth(adminToken));
    assert.equal(converted.status, 200);
    assert.equal(converted.body.data.application.status, 'CONVERTED');
    assert.ok(converted.body.data.application.convertedEnrollment);

    // Idempotent second convert.
    const again = await request(app)
      .post(`${API}/admin/live-course-applications/${studentAppId}/convert`)
      .set(auth(adminToken));
    assert.equal(again.status, 200);
    assert.equal(again.body.data.alreadyConverted, true);

    // Student cannot self-enroll in the live course even after conversion
    // (enrollment stays 'pending' until admin activates it).
    const liveEnroll = await request(app)
      .post(`${API}/student/enrollments`)
      .set(auth(studentToken))
      .send({ courseId: course.id });
    assert.equal(liveEnroll.status, 400);
  });
});
