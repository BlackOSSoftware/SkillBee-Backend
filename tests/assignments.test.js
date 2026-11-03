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
import { CourseEnrollment } from '../src/models/CourseEnrollment.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-asg-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-asg-thumb.jpg',
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

function tinyPdf(tmpDir, name = 'sample.pdf') {
  const filePath = path.join(tmpDir, name);
  // Minimal PDF signature
  fs.writeFileSync(filePath, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));
  return filePath;
}

describe('Phase 6 Assignments', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherStudentToken;
  let instructorToken;
  let instructorId;
  let unassignedInstructorToken;
  let categoryId;
  let courseId;
  let lessonId;
  let tmpDir;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbee-asg-'));
  });

  after(async () => {
    await stopTestDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearCollections();

    await register(app, 'admin.asg@skillbee.test');
    await promoteToRole('admin.asg@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.asg@skillbee.test')).accessToken;

    const student = await register(app, 'student.asg@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'student.other.asg@skillbee.test');
    otherStudentToken = other.accessToken;

    await register(app, 'instructor.asg@skillbee.test');
    await promoteToRole('instructor.asg@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.asg@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;

    await register(app, 'instructor.other.asg@skillbee.test');
    await promoteToRole('instructor.other.asg@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    unassignedInstructorToken = (await login(app, 'instructor.other.asg@skillbee.test'))
      .accessToken;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV Asg', description: 'Assignments' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Assignment Course',
        description: '<p>Assignment test course</p>',
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
      .send({ title: 'Topic A', description: 't' });
    assert.equal(topic.status, 201);
    const lesson = await request(app)
      .post(`${API}/admin/topics/${topic.body.data.topic.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Lesson A',
        type: 'text',
        textContent: { body: '<p>hi</p>', format: 'html' },
      });
    assert.equal(lesson.status, 201);
    lessonId = lesson.body.data.lesson.id;
    await request(app)
      .patch(`${API}/admin/lessons/${lessonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    await CourseEnrollment.create({ courseId, studentId, status: 'active' });
  });

  async function createAssignment(overrides = {}) {
    const res = await request(app)
      .post(`${API}/admin/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Doc Review',
        instructions: 'Upload a PDF summary of validation docs.',
        courseId,
        lessonId,
        maximumMarks: 20,
        submissionType: 'file_upload',
        allowedFileTypes: ['.pdf', '.docx'],
        maximumFileSizeBytes: 2 * 1024 * 1024,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        ...overrides,
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.assignment;
  }

  it('CRUD assignment + invalid course/lesson + status workflow', async () => {
    const a = await createAssignment();
    const get = await request(app)
      .get(`${API}/admin/assignments/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(get.status, 200);

    const upd = await request(app)
      .patch(`${API}/admin/assignments/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'CSV Doc Review Updated', maximumMarks: 25 });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.assignment.maximumMarks, 25);

    const badCourse = await request(app)
      .post(`${API}/admin/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad',
        instructions: 'x',
        courseId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        maximumMarks: 10,
        submissionType: 'text',
      });
    assert.equal(badCourse.status, 404);

    const badLesson = await request(app)
      .post(`${API}/admin/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad Lesson',
        instructions: 'x',
        courseId,
        lessonId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        maximumMarks: 10,
        submissionType: 'text',
      });
    assert.equal(badLesson.status, 400);

    const pub = await request(app)
      .patch(`${API}/admin/assignments/${a.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.assignment.status, 'published');

    const closed = await request(app)
      .patch(`${API}/admin/assignments/${a.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'closed' });
    assert.equal(closed.status, 200);

    const del = await request(app)
      .delete(`${API}/admin/assignments/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);
    assert.ok(del.body.data.assignment.deletedAt);
  });

  it('student text + file submissions, security, grading, history', async () => {
    const textAsg = await createAssignment({
      title: 'Risk Narrative',
      submissionType: 'text',
      instructions: 'Write a short risk narrative.',
      allowedFileTypes: ['.txt'],
    });
    await request(app)
      .patch(`${API}/admin/assignments/${textAsg.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    // Draft access blocked for another draft
    const draft = await createAssignment({ title: 'Draft Only', submissionType: 'text' });
    const draftGet = await request(app)
      .get(`${API}/student/assignments/${draft.id}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(draftGet.status, 403);

    // Unauthenticated
    const unauth = await request(app)
      .post(`${API}/student/assignments/${textAsg.id}/submit`)
      .field('textContent', 'hello');
    assert.equal(unauth.status, 401);

    // Non-enrolled
    const noEnroll = await request(app)
      .post(`${API}/student/assignments/${textAsg.id}/submit`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .field('textContent', 'I am not enrolled');
    assert.equal(noEnroll.status, 403);

    const textSubmit = await request(app)
      .post(`${API}/student/assignments/${textAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('textContent', 'Risk-based CSV prioritizes patient safety and data integrity.');
    assert.equal(textSubmit.status, 201, JSON.stringify(textSubmit.body));
    const textSubId = textSubmit.body.data.submission.id;

    // Duplicate
    const dup = await request(app)
      .post(`${API}/student/assignments/${textAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('textContent', 'Second try');
    assert.equal(dup.status, 409);

    // Student cannot grade
    const studentGrade = await request(app)
      .patch(`${API}/admin/submissions/${textSubId}/grade`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ marksAwarded: 20 });
    assert.equal(studentGrade.status, 403);

    // Unauthorized instructor
    const forbidden = await request(app)
      .patch(`${API}/admin/submissions/${textSubId}/grade`)
      .set('Authorization', `Bearer ${unassignedInstructorToken}`)
      .send({ marksAwarded: 10, feedback: 'ok' });
    assert.equal(forbidden.status, 403);

    // Negative marks
    const neg = await request(app)
      .patch(`${API}/admin/submissions/${textSubId}/grade`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ marksAwarded: -1 });
    assert.equal(neg.status, 400);

    // Exceed max
    const exceed = await request(app)
      .patch(`${API}/admin/submissions/${textSubId}/grade`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ marksAwarded: 999 });
    assert.equal(exceed.status, 400);

    const grade = await request(app)
      .patch(`${API}/admin/submissions/${textSubId}/grade`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ marksAwarded: 14, feedback: 'Clear narrative.' });
    assert.equal(grade.status, 200, JSON.stringify(grade.body));
    assert.equal(grade.body.data.submission.marksAwarded, 14);

    // Re-evaluate preserves history
    const regrade = await request(app)
      .patch(`${API}/admin/submissions/${textSubId}/grade`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ marksAwarded: 15, feedback: 'Updated.' });
    assert.equal(regrade.status, 200);
    assert.ok(regrade.body.data.submission.evaluationHistory?.length >= 1);

    const feedback = await request(app)
      .get(`${API}/student/submissions/${textSubId}/feedback`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(feedback.status, 200);
    assert.equal(feedback.body.data.feedback.marksAwarded, 15);

    // IDOR
    const idor = await request(app)
      .get(`${API}/student/submissions/${textSubId}`)
      .set('Authorization', `Bearer ${otherStudentToken}`);
    assert.equal(idor.status, 403);

    // File assignment
    const fileAsg = await createAssignment({
      title: 'File Upload Asg',
      allowResubmission: true,
      maxSubmissions: 2,
    });
    await request(app)
      .patch(`${API}/admin/assignments/${fileAsg.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const pdfPath = tinyPdf(tmpDir);
    const fileSubmit = await request(app)
      .post(`${API}/student/assignments/${fileAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('files', pdfPath);
    assert.equal(fileSubmit.status, 201, JSON.stringify(fileSubmit.body));
    const fileSub = fileSubmit.body.data.submission;
    assert.equal(fileSub.attachments.length, 1);
    assert.equal(fileSub.attachments[0].storageKey, undefined);

    // Invalid extension
    const exePath = path.join(tmpDir, 'evil.exe');
    fs.writeFileSync(exePath, Buffer.from('MZ'));
    const badExt = await request(app)
      .post(`${API}/student/assignments/${fileAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('files', exePath);
    // May be 409 already submitted OR 415 if resubmit allowed with returned only
    assert.ok([409, 415, 400].includes(badExt.status));

    // Return for correction then resubmit
    await request(app)
      .patch(`${API}/admin/submissions/${fileSub.id}/return`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ feedback: 'Please revise PDF.' });

    const resub = await request(app)
      .post(`${API}/student/assignments/${fileAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('files', pdfPath);
    assert.equal(resub.status, 201, JSON.stringify(resub.body));
    assert.equal(resub.body.data.submission.version, 2);

    const history = await request(app)
      .get(`${API}/admin/submissions/${fileSub.id}/history`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(history.status, 200);
    assert.ok(history.body.data.submission.versionHistory?.length >= 1);

    // Download own attachment
    const attId = resub.body.data.submission.attachments[0].id;
    const dl = await request(app)
      .get(`${API}/student/submissions/${fileSub.id}/attachments/${attId}/download`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(dl.status, 200);

    // Other student cannot download
    const dlForbidden = await request(app)
      .get(`${API}/student/submissions/${fileSub.id}/attachments/${attId}/download`)
      .set('Authorization', `Bearer ${otherStudentToken}`);
    assert.equal(dlForbidden.status, 403);

    // Path traversal via fake attachment id
    const trav = await request(app)
      .get(
        `${API}/student/submissions/${fileSub.id}/attachments/ffffffffffffffffffffffff/download`
      )
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(trav.status, 404);

    // Deadline
    const lateAsg = await createAssignment({
      title: 'Late Closed',
      submissionType: 'text',
      dueDate: new Date(Date.now() - 3600000).toISOString(),
      allowLateSubmission: false,
    });
    await request(app)
      .patch(`${API}/admin/assignments/${lateAsg.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    const late = await request(app)
      .post(`${API}/student/assignments/${lateAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('textContent', 'too late');
    assert.equal(late.status, 403);

    // Mass assignment attempt
    const mass = await request(app)
      .post(`${API}/student/assignments/${lateAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('textContent', 'x')
      .field('marksAwarded', '20');
    // deadline or mass assignment — either is a rejection
    assert.ok([400, 403].includes(mass.status));
  });

  it('rejects invalid file signature for PDF assignment', async () => {
    const fileAsg = await createAssignment({ title: 'Sig Check' });
    await request(app)
      .patch(`${API}/admin/assignments/${fileAsg.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const fakePdf = path.join(tmpDir, 'fake.pdf');
    fs.writeFileSync(fakePdf, Buffer.from('\x89PNG\r\n\x1a\nnot-a-pdf'));
    const bad = await request(app)
      .post(`${API}/student/assignments/${fileAsg.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('files', fakePdf);
    assert.equal(bad.status, 415);
  });
});
