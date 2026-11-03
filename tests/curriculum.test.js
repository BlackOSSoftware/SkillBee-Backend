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
import { CourseLesson } from '../src/models/CourseLesson.js';
import { User } from '../src/models/User.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-thumb.jpg',
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

describe('Phase 3 Curriculum / Lessons / Media', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let instructorToken;
  let instructorId;
  let unassignedInstructorToken;
  let categoryId;
  let courseId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    await register(app, 'admin.curriculum@skillbee.test');
    await promoteToRole('admin.curriculum@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.curriculum@skillbee.test')).accessToken;

    const student = await register(app, 'student.curriculum@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    await register(app, 'instructor.curriculum@skillbee.test');
    await promoteToRole('instructor.curriculum@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.curriculum@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;

    await register(app, 'instructor.other@skillbee.test');
    await promoteToRole('instructor.other@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    unassignedInstructorToken = (await login(app, 'instructor.other@skillbee.test')).accessToken;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV / CSA', description: 'Validation training' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Computerized System Validation Fundamentals',
        description: '<p>CSV/CSA training demo course (development seed style)</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 9999, salePrice: 7999, currency: 'INR' },
      });
    assert.equal(course.status, 201);
    courseId = course.body.data.course.id;
  });

  async function createTopic(title, extras = {}) {
    const res = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title, description: `${title} overview`, ...extras });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.topic;
  }

  it('creates topics, rejects invalid/unauthorized, updates, archives, reorders', async () => {
    const missingTitle = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'no title' });
    assert.equal(missingTitle.status, 400);

    const badCourse = await request(app)
      .post(`${API}/admin/courses/000000000000000000000000/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Orphan Topic Title' });
    assert.equal(badCourse.status, 404);

    const studentCreate = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Student Topic Attempt' });
    assert.equal(studentCreate.status, 403);

    const t1 = await createTopic('Introduction to Computerized System Validation');
    const t2 = await createTopic('GAMP 5 and Risk-Based Validation');
    const t3 = await createTopic('Validation Documentation');

    const detail = await request(app)
      .get(`${API}/admin/topics/${t1.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.topic.title, t1.title);

    const updated = await request(app)
      .patch(`${API}/admin/topics/${t1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated CSV fundamentals description' });
    assert.equal(updated.status, 200);
    assert.match(updated.body.data.topic.description, /Updated/);

    const statusRes = await request(app)
      .patch(`${API}/admin/topics/${t1.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.data.topic.status, 'published');

    const reorderDup = await request(app)
      .patch(`${API}/admin/courses/${courseId}/topics/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topicIds: [t1.id, t1.id, t2.id] });
    assert.equal(reorderDup.status, 400);

    const reorderIncomplete = await request(app)
      .patch(`${API}/admin/courses/${courseId}/topics/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topicIds: [t1.id, t2.id] });
    assert.equal(reorderIncomplete.status, 400);

    const otherCourse = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Other Course For Cross Reorder',
        description: '<p>x</p>',
        thumbnail,
        categoryIds: [categoryId],
      });
    const foreignTopic = await request(app)
      .post(`${API}/admin/courses/${otherCourse.body.data.course.id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Foreign Topic Cross Course' });
    assert.equal(foreignTopic.status, 201);

    const reorderCross = await request(app)
      .patch(`${API}/admin/courses/${courseId}/topics/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topicIds: [t3.id, t2.id, foreignTopic.body.data.topic.id] });
    assert.equal(reorderCross.status, 400);

    const reorderOk = await request(app)
      .patch(`${API}/admin/courses/${courseId}/topics/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topicIds: [t3.id, t1.id, t2.id] });
    assert.equal(reorderOk.status, 200);
    assert.deepEqual(
      reorderOk.body.data.topics.map((t) => t.id),
      [t3.id, t1.id, t2.id]
    );

    const archived = await request(app)
      .delete(`${API}/admin/topics/${t2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.topic.status, 'archived');
    assert.ok(archived.body.data.topic.deletedAt);
  });

  it('supports lesson CRUD, publish rules, duplicate, move, reorder', async () => {
    const topicA = await createTopic('GAMP 5 and Risk-Based Validation');
    const topicB = await createTopic('Testing and Qualification');

    const videoLesson = await request(app)
      .post(`${API}/admin/topics/${topicA.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Understanding GAMP 5 Principles',
        type: 'video',
        description: 'Introduction to GAMP 5 and risk-based validation.',
        durationSeconds: 1800,
        video: {
          source: 'external',
          provider: 'youtube',
          externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
    assert.equal(videoLesson.status, 201);
    const videoId = videoLesson.body.data.lesson.id;

    const textLesson = await request(app)
      .post(`${API}/admin/topics/${topicA.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Documentation Fundamentals',
        type: 'text',
        textContent: {
          body: '<h2>CSV Documentation</h2><p>Introduction to validation documentation.</p>',
          format: 'html',
        },
        durationSeconds: 900,
      });
    assert.equal(textLesson.status, 201);
    const textId = textLesson.body.data.lesson.id;

    const liveLesson = await request(app)
      .post(`${API}/admin/topics/${topicA.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Live CSV Question and Answer Session',
        type: 'live',
        liveSession: {
          meetingProvider: 'Google Meet',
          meetingUrl: 'https://meet.google.com/example-placeholder',
          startsAt: '2026-11-10T10:00:00Z',
          endsAt: '2026-11-10T11:00:00Z',
          timezone: 'Asia/Kolkata',
        },
      });
    assert.equal(liveLesson.status, 201);

    const resourceLesson = await request(app)
      .post(`${API}/admin/topics/${topicA.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Document Pack',
        type: 'resource',
        resourceContent: { instructions: 'Download and review' },
      });
    assert.equal(resourceLesson.status, 201);
    const resourceLessonId = resourceLesson.body.data.lesson.id;

    const badType = await request(app)
      .post(`${API}/admin/topics/${topicA.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bad Type Lesson', type: 'podcast' });
    assert.equal(badType.status, 400);

    const missingTopic = await request(app)
      .post(`${API}/admin/topics/000000000000000000000000/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Missing Topic Lesson', type: 'text', textContent: { body: 'x' } });
    assert.equal(missingTopic.status, 404);

    const publishVideo = await request(app)
      .patch(`${API}/admin/lessons/${videoId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publishVideo.status, 200);

    const publishText = await request(app)
      .patch(`${API}/admin/lessons/${textId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publishText.status, 200);

    const publishEmptyResource = await request(app)
      .patch(`${API}/admin/lessons/${resourceLessonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publishEmptyResource.status, 422);

    const updated = await request(app)
      .patch(`${API}/admin/lessons/${textId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'CSV Documentation Fundamentals (Updated)' });
    assert.equal(updated.status, 200);

    const dup = await request(app)
      .post(`${API}/admin/lessons/${textId}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(dup.status, 201);
    assert.equal(dup.body.data.lesson.status, 'draft');
    assert.notEqual(dup.body.data.lesson.id, textId);

    const moved = await request(app)
      .post(`${API}/admin/lessons/${textId}/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetTopicId: topicB.id, targetPosition: 0 });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.lesson.topicId, topicB.id);

    const lessonsInA = await request(app)
      .get(`${API}/admin/topics/${topicA.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(lessonsInA.status, 200);
    const ids = lessonsInA.body.data.lessons.map((l) => l.id);
    const reorder = await request(app)
      .patch(`${API}/admin/topics/${topicA.id}/lessons/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lessonIds: [...ids].reverse() });
    assert.equal(reorder.status, 200);

    const archived = await request(app)
      .delete(`${API}/admin/lessons/${dup.body.data.lesson.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.lesson.status, 'archived');
    const stillThere = await CourseLesson.findById(dup.body.data.lesson.id);
    assert.ok(stillThere);
    assert.ok(stillThere.deletedAt);
  });

  it('uploads video and attachments with access controls', async () => {
    const topic = await createTopic('Data Integrity and Compliance');
    await request(app)
      .patch(`${API}/admin/topics/${topic.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const lesson = await request(app)
      .post(`${API}/admin/topics/${topic.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'ALCOA+ Data Integrity Principles',
        type: 'video',
        isPreview: true,
        durationSeconds: 1200,
      });
    const lessonId = lesson.body.data.lesson.id;

    const videoPath = path.join(os.tmpdir(), `skillbee-video-${Date.now()}.mp4`);
    fs.writeFileSync(videoPath, Buffer.from('fake-mp4-content-for-upload-test'));

    const unauthorizedUpload = await request(app)
      .post(`${API}/admin/lessons/${lessonId}/video/upload`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('video', videoPath);
    assert.equal(unauthorizedUpload.status, 403);

    const badMime = path.join(os.tmpdir(), `skillbee-bad-${Date.now()}.exe`);
    fs.writeFileSync(badMime, 'MZ');
    const unsupported = await request(app)
      .post(`${API}/admin/lessons/${lessonId}/video/upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('video', badMime);
    fs.unlinkSync(badMime);
    assert.ok([400, 415].includes(unsupported.status));

    const uploaded = await request(app)
      .post(`${API}/admin/lessons/${lessonId}/video/upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('video', videoPath);
    fs.unlinkSync(videoPath);
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.data.lesson.content.video.source, 'uploaded');
    assert.ok(uploaded.body.data.lesson.content.video.storageKey);
    assert.equal(uploaded.body.data.lesson.content.video.processingStatus, 'ready');

    const absolute = path.resolve(
      process.env.UPLOAD_ROOT || './uploads-test',
      uploaded.body.data.lesson.content.video.storageKey
    );
    assert.equal(fs.existsSync(absolute), true);

    const status = await request(app)
      .get(`${API}/admin/lessons/${lessonId}/video/status`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.processingStatus, 'ready');

    const pdfPath = path.join(os.tmpdir(), `skillbee-att-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, '%PDF-1.4 attachment');
    const attachment = await request(app)
      .post(`${API}/admin/lessons/${lessonId}/attachments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', 'ALCOA+ Checklist')
      .field('visibility', 'enrolled')
      .attach('file', pdfPath);
    fs.unlinkSync(pdfPath);
    assert.equal(attachment.status, 201, JSON.stringify(attachment.body));
    const fileId = attachment.body.data.id;

    const listed = await request(app)
      .get(`${API}/admin/lessons/${lessonId}/attachments`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.data.attachments.length >= 1);

    const publishLesson = await request(app)
      .patch(`${API}/admin/lessons/${lessonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publishLesson.status, 200);

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const previewAccess = await request(app)
      .get(`${API}/learning/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(previewAccess.status, 200);
    assert.equal(previewAccess.body.data.locked, false);

    const playback = await request(app)
      .get(`${API}/learning/lessons/${lessonId}/video/playback`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(playback.status, 200);
    assert.ok(playback.body.data.playbackToken);

    const downloadDeniedOther = await request(app)
      .get(`${API}/learning/lessons/${lessonId}/attachments/${fileId}/download`)
      .set('Authorization', `Bearer ${unassignedInstructorToken}`);
    assert.equal(downloadDeniedOther.status, 403);

    const downloadDeniedStudent = await request(app)
      .get(`${API}/learning/lessons/${lessonId}/attachments/${fileId}/download`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(downloadDeniedStudent.status, 403);

    await CourseEnrollment.create({
      courseId,
      studentId,
      status: 'active',
      source: 'manual',
    });

    const downloadOk = await request(app)
      .get(`${API}/learning/lessons/${lessonId}/attachments/${fileId}/download`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(downloadOk.status, 200);

    await request(app)
      .delete(`${API}/admin/lessons/${lessonId}/attachments/${fileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('enforces enrollment, schedule, suspended and instructor assignment rules', async () => {
    const topic = await createTopic('Validation Documentation');
    await request(app)
      .patch(`${API}/admin/topics/${topic.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const protectedLesson = await request(app)
      .post(`${API}/admin/topics/${topic.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'User Requirement Specification',
        type: 'text',
        textContent: { body: '<p>URS content for enrolled learners</p>', format: 'html' },
        isPreview: false,
      });
    const protectedId = protectedLesson.body.data.lesson.id;

    const scheduledLesson = await request(app)
      .post(`${API}/admin/topics/${topic.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Performance Qualification',
        type: 'text',
        textContent: { body: '<p>PQ scheduled later</p>', format: 'html' },
        isPreview: false,
        scheduledAt: '2099-01-01T00:00:00Z',
      });
    const scheduledId = scheduledLesson.body.data.lesson.id;

    for (const id of [protectedId, scheduledId]) {
      const pub = await request(app)
        .patch(`${API}/admin/lessons/${id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });
      assert.equal(pub.status, 200);
    }

    await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const adminAccess = await request(app)
      .get(`${API}/learning/lessons/${protectedId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(adminAccess.status, 200);

    const instructorAccess = await request(app)
      .get(`${API}/learning/lessons/${protectedId}`)
      .set('Authorization', `Bearer ${instructorToken}`);
    assert.equal(instructorAccess.status, 200);

    const unassigned = await request(app)
      .get(`${API}/learning/lessons/${protectedId}`)
      .set('Authorization', `Bearer ${unassignedInstructorToken}`);
    assert.equal(unassigned.status, 403);

    const nonEnrolled = await request(app)
      .get(`${API}/learning/lessons/${protectedId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(nonEnrolled.status, 403);

    await CourseEnrollment.create({
      courseId,
      studentId,
      status: 'active',
      source: 'manual',
    });

    const enrolled = await request(app)
      .get(`${API}/learning/lessons/${protectedId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(enrolled.status, 200);

    const scheduledBlocked = await request(app)
      .get(`${API}/learning/lessons/${scheduledId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(scheduledBlocked.status, 403);

    const curriculum = await request(app)
      .get(`${API}/learning/courses/${courseId}/curriculum`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(curriculum.status, 200);
    assert.equal(curriculum.body.data.enrolled, true);

    await User.updateOne({ _id: studentId }, { status: 'suspended' });
    const suspended = await request(app)
      .get(`${API}/learning/lessons/${protectedId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    // authenticate rejects inactive/suspended accounts with 401
    assert.ok([401, 403].includes(suspended.status));

    const draft = await request(app)
      .post(`${API}/admin/topics/${topic.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Draft Only Lesson',
        type: 'text',
        textContent: { body: '<p>private</p>', format: 'html' },
      });
    await User.updateOne({ _id: studentId }, { status: 'active' });
    const draftPrivate = await request(app)
      .get(`${API}/learning/lessons/${draft.body.data.lesson.id}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(draftPrivate.status, 404);
  });
});
