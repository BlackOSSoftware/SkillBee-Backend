import assert from 'node:assert/strict';
import crypto from 'crypto';
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
import { Certificate } from '../src/models/Certificate.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-cert-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-cert-thumb.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 120000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Cert',
    lastName: 'Student',
    email,
    password: 'Secret123',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function login(app, email) {
  const res = await request(app).post(`${API}/auth/login`).send({
    email,
    password: 'Secret123',
  });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Phase 8 Certificate Management', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherToken;
  let instructorToken;
  let instructorId;
  let categoryId;
  let courseId;
  let templateId;
  let lessonIds = [];

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    lessonIds = [];

    await register(app, 'admin.cert@skillbee.test');
    await promoteToRole('admin.cert@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.cert@skillbee.test')).accessToken;

    const student = await register(app, 'student.cert@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'student.other.cert@skillbee.test');
    otherToken = other.accessToken;

    await register(app, 'instructor.cert@skillbee.test');
    await promoteToRole('instructor.cert@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.cert@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV Cert', description: 'Certificates' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Certificate Course',
        description: '<p>Certificate test course</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 1000, currency: 'INR' },
        certificate: {
          enabled: true,
          minimumCompletionPercentage: 100,
          autoIssue: false,
        },
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    courseId = course.body.data.course.id;

    const topic = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Cert Topic', description: 't' });
    assert.equal(topic.status, 201);

    for (let i = 1; i <= 3; i += 1) {
      const lesson = await request(app)
        .post(`${API}/admin/topics/${topic.body.data.topic.id}/lessons`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Cert Lesson ${i}`,
          type: 'text',
          textContent: { body: `<p>L${i}</p>`, format: 'html' },
          isRequired: true,
        });
      assert.equal(lesson.status, 201);
      const lid = lesson.body.data.lesson.id;
      lessonIds.push(lid);
      await request(app)
        .patch(`${API}/admin/lessons/${lid}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });
    }

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const template = await request(app)
      .post(`${API}/admin/certificate-templates`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'SkillBee Default',
        templateCode: 'skillbee-default',
        organizationName: 'SkillBee LMS',
        authorizedSignatoryName: 'Director',
        authorizedSignatoryDesignation: 'Head of Learning',
        status: 'active',
        isDefault: true,
      });
    assert.equal(template.status, 201, JSON.stringify(template.body));
    templateId = template.body.data.template.id;
  });

  async function enrollAndComplete() {
    const enr = await request(app)
      .post(`${API}/admin/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId, courseId, enrollmentType: 'admin_granted' });
    assert.equal(enr.status, 201, JSON.stringify(enr.body));

    for (const lid of lessonIds) {
      const done = await request(app)
        .post(`${API}/student/lessons/${lid}/complete`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      assert.equal(done.status, 200, JSON.stringify(done.body));
    }
    return enr.body.data.enrollment;
  }

  describe('Templates', () => {
    it('creates, updates, lists, sets default, duplicates', async () => {
      const listed = await request(app)
        .get(`${API}/admin/certificate-templates`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(listed.status, 200);
      assert.ok(listed.body.data.templates.length >= 1);

      const patched = await request(app)
        .patch(`${API}/admin/certificate-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ certificateTitle: 'Certificate of Excellence' });
      assert.equal(patched.status, 200);
      assert.equal(patched.body.data.template.certificateTitle, 'Certificate of Excellence');

      const dup = await request(app)
        .post(`${API}/admin/certificate-templates/${templateId}/duplicate`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(dup.status, 201);
      assert.equal(dup.body.data.template.status, 'draft');

      await request(app)
        .patch(`${API}/admin/certificate-templates/${dup.body.data.template.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });

      const def = await request(app)
        .patch(`${API}/admin/certificate-templates/${dup.body.data.template.id}/default`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(def.status, 200);
      assert.equal(def.body.data.template.isDefault, true);
    });

    it('prevents deleting a template referenced by issued certificates', async () => {
      await enrollAndComplete();
      const issued = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId, templateId });
      assert.equal(issued.status, 201, JSON.stringify(issued.body));

      const del = await request(app)
        .delete(`${API}/admin/certificate-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(del.status, 409);
      assert.equal(del.body.error.code, 'TEMPLATE_IN_USE');
    });
  });

  describe('Eligibility', () => {
    it('marks incomplete lessons as ineligible', async () => {
      await request(app)
        .post(`${API}/admin/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });

      const elig = await request(app)
        .get(`${API}/admin/students/${studentId}/certificate-eligibility/${courseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(elig.status, 200);
      assert.equal(elig.body.data.eligibility.eligible, false);
    });

    it('marks fully completed student eligible', async () => {
      await enrollAndComplete();
      const elig = await request(app)
        .get(`${API}/admin/students/${studentId}/certificate-eligibility/${courseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(elig.status, 200);
      assert.equal(elig.body.data.eligibility.eligible, true);
      assert.equal(elig.body.data.eligibility.progressPercentage, 100);
    });

    it('rejects when course certificates disabled', async () => {
      await enrollAndComplete();
      await Course.updateOne(
        { _id: courseId },
        { $set: { 'certificate.enabled': false } }
      );
      const elig = await request(app)
        .get(`${API}/admin/students/${studentId}/certificate-eligibility/${courseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(elig.body.data.eligibility.eligible, false);
    });
  });

  describe('Issuance & PDF', () => {
    it('admin issues certificate with unique number, PDF and checksum', async () => {
      await enrollAndComplete();
      const issued = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId, templateId });
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      const cert = issued.body.data.certificate;
      assert.match(cert.certificateNumber, /^SKB-\d{4}-\d{6}$/);
      assert.equal(cert.studentName, 'Cert Student');
      assert.equal(cert.courseName, 'CSV Certificate Course');
      assert.equal(cert.certificateStatus, 'issued');
      assert.ok(cert.pdfChecksum);
      assert.equal(cert.pdfChecksum.length, 64);

      const download = await request(app)
        .get(`${API}/admin/certificates/${cert.id}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      assert.equal(download.status, 200);
      assert.match(download.headers['content-type'], /pdf/);
      const buf = download.body;
      assert.ok(Buffer.isBuffer(buf));
      assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), cert.pdfChecksum);
      assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    });

    it('student cannot issue certificates', async () => {
      await enrollAndComplete();
      const res = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ studentId, courseId });
      assert.equal(res.status, 403);
    });

    it('prevents duplicate active issuance', async () => {
      await enrollAndComplete();
      const first = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });
      assert.equal(first.status, 201);
      const second = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });
      assert.ok([400, 409].includes(second.status));
    });

    it('rejects client-supplied studentName on issue', async () => {
      await enrollAndComplete();
      const res = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId, studentName: 'Hacker' });
      assert.equal(res.status, 400);
    });
  });

  describe('Revocation & verification', () => {
    it('revokes certificate and public verify returns revoked', async () => {
      await enrollAndComplete();
      const issued = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });
      const cert = issued.body.data.certificate;
      const db = await Certificate.findById(cert.id);

      const verifyOk = await request(app).get(
        `${API}/certificates/verify/${db.verificationCode}`
      );
      assert.equal(verifyOk.status, 200);
      assert.equal(verifyOk.body.data.verification.verificationStatus, 'valid');
      assert.equal(verifyOk.body.data.verification.studentName, 'Cert Student');
      assert.equal(verifyOk.body.data.verification.email, undefined);

      const revoked = await request(app)
        .post(`${API}/admin/certificates/${cert.id}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Policy violation' });
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.data.certificate.certificateStatus, 'revoked');

      const verifyRev = await request(app).get(
        `${API}/certificates/verify/${db.verificationCode}`
      );
      assert.equal(verifyRev.status, 200);
      assert.equal(verifyRev.body.data.verification.verificationStatus, 'revoked');
      assert.equal(verifyRev.headers['cache-control'], 'no-store');

      const bad = await request(app).get(
        `${API}/certificates/verify/${'a'.repeat(32)}`
      );
      assert.equal(bad.status, 404);

      const hist = await request(app)
        .get(`${API}/admin/certificates/${cert.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.ok(hist.body.data.history.some((h) => h.action === 'revoked'));
    });

    it('unauthorized user cannot revoke', async () => {
      await enrollAndComplete();
      const issued = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });
      const res = await request(app)
        .post(`${API}/admin/certificates/${issued.body.data.certificate.id}/revoke`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ reason: 'nope' });
      assert.equal(res.status, 403);
    });
  });

  describe('Student access', () => {
    it('student views and downloads own certificate only', async () => {
      await enrollAndComplete();
      const issued = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId });
      const certId = issued.body.data.certificate.id;

      const list = await request(app)
        .get(`${API}/student/certificates`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(list.status, 200);
      assert.equal(list.body.data.certificates.length, 1);

      const otherList = await request(app)
        .get(`${API}/student/certificates`)
        .set('Authorization', `Bearer ${otherToken}`);
      assert.equal(otherList.body.data.certificates.length, 0);

      const otherGet = await request(app)
        .get(`${API}/student/certificates/${certId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      assert.equal(otherGet.status, 404);

      const dl = await request(app)
        .get(`${API}/student/certificates/${certId}/download`)
        .set('Authorization', `Bearer ${studentToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      assert.equal(dl.status, 200);
      assert.match(dl.headers['content-type'], /pdf/);
      assert.equal(dl.body.subarray(0, 4).toString(), '%PDF');
    });
  });

  describe('Regenerate & template snapshot immutability', () => {
    it('regenerate keeps number; template edit does not change snapshot', async () => {
      await enrollAndComplete();
      const issued = await request(app)
        .post(`${API}/admin/certificates/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId, courseId, templateId });
      const cert = issued.body.data.certificate;
      const number = cert.certificateNumber;

      await request(app)
        .patch(`${API}/admin/certificate-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ certificateTitle: 'CHANGED TITLE AFTER ISSUE' });

      const regen = await request(app)
        .post(`${API}/admin/certificates/${cert.id}/regenerate`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(regen.status, 200);
      assert.equal(regen.body.data.certificate.certificateNumber, number);

      const detail = await request(app)
        .get(`${API}/admin/certificates/${cert.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.notEqual(
        detail.body.data.certificate.templateSnapshot.certificateTitle,
        'CHANGED TITLE AFTER ISSUE'
      );
    });
  });
});
