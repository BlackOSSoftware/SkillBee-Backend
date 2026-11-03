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
import { ensureDefaultTemplates } from '../src/modules/email/services/emailTemplate.service.js';
import { flushMemoryEmailQueue } from '../src/modules/email/services/emailQueue.service.js';
import { EmailLog } from '../src/models/EmailLog.js';
import { AppNotification } from '../src/models/AppNotification.js';
import { InstructorApplication } from '../src/models/InstructorApplication.js';

const API = '/api/v1';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Inst',
    lastName: 'Admin',
    email,
    password: 'Secret123',
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function login(app, email) {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email, password: 'Secret123' });
  assert.equal(res.status, 200);
  return res.body.data;
}

function baseFields(overrides = {}) {
  return {
    fullName: 'Jane Instructor',
    phone: '+91 9876543210',
    email: 'jane.instructor@skillbee.test',
    expertSubject: 'Pharmacovigilance',
    expertiseLevel: 'Expert',
    linkedinProfileUrl: 'https://www.linkedin.com/in/jane',
    comments: 'Ready to teach',
    ...overrides,
  };
}

function withFields(req, fields) {
  let r = req;
  for (const [k, v] of Object.entries(fields)) {
    r = r.field(k, v == null ? '' : String(v));
  }
  return r;
}

describe('Instructor Applications', () => {
  let app;
  let adminToken;
  let studentToken;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    await ensureDefaultTemplates();
    await register(app, 'admin.inst@skillbee.test');
    await promoteToRole('admin.inst@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.inst@skillbee.test')).accessToken;
    studentToken = (await register(app, 'student.inst@skillbee.test')).accessToken;
    await new Promise((r) => setTimeout(r, 50));
    await flushMemoryEmailQueue();
  });

  it('submits valid application, stores resume privately, notifies admin + emails applicant', async () => {
    const res = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields()
    ).attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.reference);
    assert.equal(res.body.data.id, undefined);

    const doc = await InstructorApplication.findOne({ email: 'jane.instructor@skillbee.test' });
    assert.ok(doc);
    assert.ok(doc.resume.storagePath.startsWith('resumes/'));

    await new Promise((r) => setTimeout(r, 120));
    await flushMemoryEmailQueue();

    const email = await EmailLog.findOne({
      eventType: 'instructor.application_submitted',
      recipient: 'jane.instructor@skillbee.test',
    });
    assert.ok(email);

    const note = await AppNotification.findOne({ type: 'instructor_application' });
    assert.ok(note);

    const dl = await request(app)
      .get(`${API}/admin/instructor-applications/${doc._id}/resume`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers['content-type'], /pdf/i);

    const blocked = await request(app)
      .get(`${API}/admin/instructor-applications/${doc._id}/resume`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(blocked.status, 403);
  });

  it('rejects missing fields, bad email/phone/subject/level/linkedin, other-course without comments', async () => {
    const noResume = await request(app)
      .post(`${API}/public/instructor-applications`)
      .field('fullName', 'A')
      .field('phone', '123')
      .field('email', 'bad')
      .field('expertSubject', 'Nope')
      .field('expertiseLevel', 'God');
    assert.ok([400, 422].includes(noResume.status));

    const badLinkedin = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields({ linkedinProfileUrl: 'https://evil.com/x', email: 'badli@skillbee.test' })
    ).attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(badLinkedin.status, 400);

    const otherNoComment = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields({
        email: 'other@skillbee.test',
        expertSubject: 'Any Other Course',
        expertiseLevel: 'Beginner',
        comments: '',
      })
    ).attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(otherNoComment.status, 400);
  });

  it('rejects invalid resume type, signature, and oversized files', async () => {
    const exe = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields({ email: 'exe@skillbee.test' })
    ).attach('resume', Buffer.from('MZ\x90\x00malicious'), {
      filename: 'virus.exe',
      contentType: 'application/pdf',
    });
    assert.equal(exe.status, 400);

    const fakePdf = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields({ email: 'fakepdf@skillbee.test' })
    ).attach('resume', Buffer.from('not-a-pdf'), {
      filename: 'resume.pdf',
      contentType: 'application/pdf',
    });
    assert.equal(fakePdf.status, 400);

    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10, 0x41)]);
    const oversized = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields({ email: 'big@skillbee.test' })
    ).attach('resume', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    assert.ok([400, 413].includes(oversized.status));
  });

  it('prevents duplicate pending submissions and supports admin status/list/delete', async () => {
    const first = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields()
    ).attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(first.status, 201);

    const dup = await withFields(
      request(app).post(`${API}/public/instructor-applications`),
      baseFields()
    ).attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(dup.status, 409);

    const list = await request(app)
      .get(`${API}/admin/instructor-applications?search=Jane&status=pending`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    const id = list.body.data[0].id;

    const status = await request(app)
      .patch(`${API}/admin/instructor-applications/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shortlisted', adminNotes: 'Strong CV' });
    assert.equal(status.status, 200);
    assert.equal(status.body.data.status, 'shortlisted');
    assert.equal(status.body.data.adminNotes, 'Strong CV');

    const del = await request(app)
      .delete(`${API}/admin/instructor-applications/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);

    const unauth = await request(app).get(`${API}/admin/instructor-applications`);
    assert.equal(unauth.status, 401);
  });
});
