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

const API = '/api/v1';

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Ref',
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

const valid = {
  name: 'Alex Referrer',
  email: 'alex.referrer@skillbee.test',
  phone: '+91 9000000001',
  friendName: 'Sam Friend',
  friendPhone: '+91 9000000002',
  message: 'Please contact my friend',
};

describe('Referrals', () => {
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
    await register(app, 'admin.ref@skillbee.test');
    await promoteToRole('admin.ref@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.ref@skillbee.test')).accessToken;
    studentToken = (await register(app, 'student.ref@skillbee.test')).accessToken;
    await new Promise((r) => setTimeout(r, 50));
    await flushMemoryEmailQueue();
  });

  it('submits referral, queues admin notify + referrer email, no friend marketing', async () => {
    const res = await request(app).post(`${API}/public/referrals`).send(valid);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.reference);
    assert.equal(res.body.data.id, undefined);

    await new Promise((r) => setTimeout(r, 120));
    await flushMemoryEmailQueue();

    const email = await EmailLog.findOne({
      eventType: 'referral.submitted',
      recipient: 'alex.referrer@skillbee.test',
    });
    assert.ok(email);

    const friendEmail = await EmailLog.findOne({ recipient: /sam/i });
    assert.equal(friendEmail, null);

    const note = await AppNotification.findOne({ type: 'referral_submitted' });
    assert.ok(note);
  });

  it('rejects invalid fields and duplicates; admin list/status/notes private', async () => {
    const bad = await request(app)
      .post(`${API}/public/referrals`)
      .send({ ...valid, email: 'not-an-email', phone: 'x' });
    assert.equal(bad.status, 400);

    const first = await request(app).post(`${API}/public/referrals`).send(valid);
    assert.equal(first.status, 201);
    const dup = await request(app).post(`${API}/public/referrals`).send(valid);
    assert.equal(dup.status, 409);

    const list = await request(app)
      .get(`${API}/admin/referrals?search=Alex&status=pending`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    const id = list.body.data[0].id;

    const patch = await request(app)
      .patch(`${API}/admin/referrals/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'contacted', adminNotes: 'Called friend' });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.data.adminNotes, 'Called friend');

    const studentList = await request(app)
      .get(`${API}/admin/referrals`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentList.status, 403);

    const pubLeak = await request(app).get(`${API}/public/referrals/${id}`);
    assert.ok([404, 405].includes(pubLeak.status));
  });
});
