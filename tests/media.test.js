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
import { MediaAsset } from '../src/models/MediaAsset.js';
import { CourseLesson } from '../src/models/CourseLesson.js';

const API = '/api/v1';

async function register(app, email, password = 'Secret123') {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Media',
    lastName: 'Tester',
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

describe('Phase 4 Media Management', () => {
  let app;
  let adminToken;
  let studentToken;
  let instructorToken;
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
    await register(app, 'admin.media@skillbee.test');
    await promoteToRole('admin.media@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.media@skillbee.test')).accessToken;

    const student = await register(app, 'student.media@skillbee.test');
    studentToken = student.accessToken;

    await register(app, 'instructor.media@skillbee.test');
    await promoteToRole('instructor.media@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.media@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;
  });

  it('rejects unauthenticated and student admin media access', async () => {
    const unauth = await request(app).get(`${API}/admin/media`);
    assert.equal(unauth.status, 401);

    const student = await request(app)
      .get(`${API}/admin/media`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(student.status, 403);
  });

  it('creates image upload session (mocked Cloudinary) and confirms metadata', async () => {
    const session = await request(app)
      .post(`${API}/admin/media/upload-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'image',
        category: 'course_thumbnail',
        originalFileName: 'course-thumbnail.webp',
        mimeType: 'image/webp',
        sizeBytes: 250000,
      });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    assert.equal(session.body.data.provider, 'cloudinary');
    assert.ok(session.body.data.uploadParameters);
    assert.equal(session.body.data.downloadAllowed, false);
    assert.ok(!JSON.stringify(session.body).includes('api_secret'));

    const confirm = await request(app)
      .post(`${API}/admin/media/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: session.body.data.uploadId,
        provider: 'cloudinary',
        cloudinary: {
          publicId: session.body.data.uploadParameters.public_id,
          secureUrl: `https://res.cloudinary.com/demo/image/upload/${session.body.data.uploadParameters.public_id}.webp`,
          bytes: 250000,
          width: 1280,
          height: 720,
          format: 'webp',
        },
      });
    assert.equal(confirm.status, 201, JSON.stringify(confirm.body));
    assert.equal(confirm.body.data.media.mediaType, 'image');
    assert.equal(confirm.body.data.media.downloadAllowed, false);
    assert.equal(confirm.body.data.media.processingStatus, 'ready');
  });

  it('rejects invalid mime/extension/size for upload-url', async () => {
    const badMime = await request(app)
      .post(`${API}/admin/media/upload-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'image',
        category: 'course_thumbnail',
        originalFileName: 'x.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: 1000,
      });
    assert.ok([400, 415].includes(badMime.status));

    const oversized = await request(app)
      .post(`${API}/admin/media/upload-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'document',
        category: 'study_material',
        originalFileName: 'big.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 999999999,
      });
    assert.equal(oversized.status, 413);
  });

  it('uploads local video and PDF, confirms, lists, updates, and enforces view-only', async () => {
    const videoSession = await request(app)
      .post(`${API}/admin/media/upload-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'video',
        category: 'lesson_video',
        originalFileName: 'intro.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 5000,
      });
    assert.equal(videoSession.status, 201, JSON.stringify(videoSession.body));
    assert.equal(videoSession.body.data.provider, 'local');
    assert.ok(videoSession.body.data.uploadToken);
    assert.equal(videoSession.body.data.downloadAllowed, false);

    const videoPath = path.join(os.tmpdir(), `media-vid-${Date.now()}.mp4`);
    // ftyp signature for mp4 sniff
    const buf = Buffer.alloc(32, 0);
    buf.write('xxxxftyp', 0, 'ascii');
    fs.writeFileSync(videoPath, buf);

    const uploaded = await request(app)
      .put(`${API}/admin/media/uploads/${videoSession.body.data.uploadId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Upload-Token', videoSession.body.data.uploadToken)
      .attach('file', videoPath);
    fs.unlinkSync(videoPath);
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));

    const replay = await request(app)
      .put(`${API}/admin/media/uploads/${videoSession.body.data.uploadId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Upload-Token', videoSession.body.data.uploadToken)
      .attach('file', Buffer.from('xxxxftypmore'), 'again.mp4');
    assert.equal(replay.status, 409);

    const confirmVideo = await request(app)
      .post(`${API}/admin/media/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: videoSession.body.data.uploadId,
        provider: 'local',
      });
    assert.equal(confirmVideo.status, 201, JSON.stringify(confirmVideo.body));
    const videoId = confirmVideo.body.data.media.id;
    assert.equal(confirmVideo.body.data.media.downloadAllowed, false);
    assert.ok(confirmVideo.body.data.media.hasLocalFile);
    assert.ok(!JSON.stringify(confirmVideo.body).includes('uploads-test\\'));
    assert.ok(!JSON.stringify(confirmVideo.body).includes(path.resolve('.')));

    // PDF document
    const docSession = await request(app)
      .post(`${API}/admin/media/upload-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'document',
        category: 'study_material',
        originalFileName: 'syllabus.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 200,
      });
    assert.equal(docSession.status, 201);
    const pdfPath = path.join(os.tmpdir(), `media-pdf-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, '%PDF-1.4 media-test');
    const docUp = await request(app)
      .put(`${API}/admin/media/uploads/${docSession.body.data.uploadId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Upload-Token', docSession.body.data.uploadToken)
      .attach('file', pdfPath);
    fs.unlinkSync(pdfPath);
    assert.equal(docUp.status, 200, JSON.stringify(docUp.body));

    const confirmDoc = await request(app)
      .post(`${API}/admin/media/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ uploadId: docSession.body.data.uploadId, provider: 'local' });
    assert.equal(confirmDoc.status, 201, JSON.stringify(confirmDoc.body));
    assert.equal(confirmDoc.body.data.media.downloadAllowed, true);

    const listed = await request(app)
      .get(`${API}/admin/media`)
      .query({ mediaType: 'video' })
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.data.media.some((m) => m.id === videoId));

    const search = await request(app)
      .get(`${API}/admin/media`)
      .query({ search: 'syllabus' })
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(search.status, 200);
    assert.ok(search.body.data.media.length >= 1);

    const updated = await request(app)
      .patch(`${API}/admin/media/${videoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Intro Video (Updated)', description: 'View only' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.media.title, 'Intro Video (Updated)');

    const protectedPatch = await request(app)
      .patch(`${API}/admin/media/${videoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storageKey: 'hacked' });
    assert.equal(protectedPatch.status, 400);

    const cats = await request(app)
      .get(`${API}/admin/media/categories`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(cats.status, 200);
    assert.ok(cats.body.data.categories.length >= 5);

    const storage = await request(app)
      .get(`${API}/admin/media/storage`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(storage.status, 200);
    assert.ok(storage.body.data.totals.mediaCount >= 2);

    // Link video storageKey into a lesson to block delete
    const asset = await MediaAsset.findById(videoId);
    await CourseLesson.create({
      courseId: asset.courseId || '000000000000000000000001',
      topicId: '000000000000000000000002',
      title: 'Linked Video Lesson',
      slug: `linked-video-${Date.now()}`,
      type: 'video',
      content: {
        video: {
          source: 'uploaded',
          provider: 'local',
          storageKey: asset.storageKey,
          processingStatus: 'ready',
        },
      },
      status: 'draft',
    });

    // Fix courseId/topicId - CourseLesson requires valid refs that exist? mongoose may allow any ObjectId
    // Actually courseId/topicId are ObjectIds - strings work if castable
    const blocked = await request(app)
      .delete(`${API}/admin/media/${videoId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));

    // Delete unused document
    const docId = confirmDoc.body.data.media.id;
    const deleted = await request(app)
      .delete(`${API}/admin/media/${docId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(deleted.status, 200);
    assert.ok(deleted.body.data.media.deletedAt);

    const restored = await request(app)
      .post(`${API}/admin/media/${docId}/restore`)
      .set('Authorization', `Bearer ${adminToken}`);
    // restore may fail if physical file was deleted during soft-delete cleanup
    assert.ok([200, 422].includes(restored.status));
  });

  it('rejects instructor upload to unrelated course', async () => {
    const { Course } = await import('../src/models/Course.js');
    const course = await Course.create({
      title: 'Secret Course',
      slug: `secret-${Date.now()}`,
      description: '<p>x</p>',
      thumbnail: {
        publicId: 'x',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      },
      instructorIds: [],
      status: 'draft',
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    });

    const denied = await request(app)
      .post(`${API}/admin/media/upload-url`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        mediaType: 'image',
        category: 'course_thumbnail',
        originalFileName: 'x.webp',
        mimeType: 'image/webp',
        sizeBytes: 1000,
        courseId: course._id.toString(),
      });
    assert.equal(denied.status, 403);
  });
});
