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
import { _setFirebaseMessagingForTests, _resetFirebaseForTests } from '../src/config/firebase.js';
import { AppNotification } from '../src/models/AppNotification.js';
import { DeviceToken } from '../src/models/DeviceToken.js';
import { notifyUser } from '../src/modules/notifications/services/notification.service.js';
import { emitAppEvent } from '../src/services/events/eventBus.service.js';
import { flushMemoryEmailQueue } from '../src/modules/email/services/emailQueue.service.js';

const API = '/api/v1';

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Notify',
    lastName: 'User',
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

describe('Phase 15 Notifications & Devices', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherToken;

  before(async () => {
    process.env.FIREBASE_ENABLED = 'true';
    const { env } = await import('../src/config/env.js');
    env.FIREBASE_ENABLED = true;
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    _resetFirebaseForTests();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    _resetFirebaseForTests();
    _setFirebaseMessagingForTests({
      sendEachForMulticast: async ({ tokens }) => ({
        successCount: tokens.length,
        failureCount: 0,
        responses: tokens.map(() => ({ success: true })),
      }),
    });

    await register(app, 'admin.notify@skillbee.test');
    await promoteToRole('admin.notify@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.notify@skillbee.test')).accessToken;

    const student = await register(app, 'student.notify@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;
    otherToken = (await register(app, 'other.notify@skillbee.test')).accessToken;
    await flushMemoryEmailQueue();
  });

  it('registers devices, lists, prevents cross-user delete, refreshes token', async () => {
    const tokenA = `fcm-token-aaaaaaaaaaaaaaaaaaaa`;
    const reg = await request(app)
      .post(`${API}/student/devices/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ token: tokenA, platform: 'android', deviceName: 'Pixel' });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));

    const reg2 = await request(app)
      .post(`${API}/student/devices/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ token: `fcm-token-bbbbbbbbbbbbbbbbbbbb`, platform: 'web' });
    assert.equal(reg2.status, 201);

    const list = await request(app)
      .get(`${API}/student/devices`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 2);

    // Token refresh to other user reassigns
    const steal = await request(app)
      .post(`${API}/student/devices/register`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ token: tokenA, platform: 'android' });
    assert.equal(steal.status, 201);

    const deviceId = reg2.body.data.id;
    const cross = await request(app)
      .delete(`${API}/student/devices/${deviceId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(cross.status, 404);

    const del = await request(app)
      .delete(`${API}/student/devices/${deviceId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(del.status, 200);
  });

  it('account.created persists notification; duplicate eventKey blocked; push failure keeps in-app', async () => {
    await emitAppEvent('account.created', {
      userId: studentId,
      email: 'student.notify@skillbee.test',
      firstName: 'Notify',
      lastName: 'User',
    });
    await flushMemoryEmailQueue();

    const list = await request(app)
      .get(`${API}/student/notifications`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.some((n) => n.type === 'account_created'));

    await emitAppEvent('account.created', {
      userId: studentId,
      email: 'student.notify@skillbee.test',
      firstName: 'Notify',
      lastName: 'User',
    });
    const count = await AppNotification.countDocuments({
      recipientId: studentId,
      type: 'account_created',
      deletedAt: null,
    });
    assert.equal(count, 1);

    _setFirebaseMessagingForTests({
      sendEachForMulticast: async () => {
        throw new Error('FCM down');
      },
    });
    await DeviceToken.create({
      userId: studentId,
      token: 'fcm-token-cccccccccccccccccccc',
      platform: 'web',
      isActive: true,
    });
    const r = await notifyUser({
      recipientId: studentId,
      title: 'Push fail test',
      message: 'Still stored in-app',
      type: 'custom',
      eventKey: `push-fail:${studentId}`,
    });
    assert.ok(r.notification);
    assert.equal(r.notification.deliveryStatus, 'failed');
  });

  it('admin custom notification, read, read-all, delete; invalid token cleanup', async () => {
    _setFirebaseMessagingForTests({
      sendEachForMulticast: async ({ tokens }) => ({
        successCount: 0,
        failureCount: tokens.length,
        responses: tokens.map(() => ({
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        })),
      }),
    });
    await DeviceToken.create({
      userId: studentId,
      token: 'fcm-token-invaliddddddddddddddd',
      platform: 'ios',
      isActive: true,
    });

    const send = await request(app)
      .post(`${API}/admin/notifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Hello students',
        message: 'Custom announcement body',
        recipientType: 'selected_users',
        recipientIds: [studentId],
        deliveryChannel: 'both',
      });
    assert.equal(send.status, 201, JSON.stringify(send.body));
    assert.equal(send.body.data.created, 1);

    const invalid = await DeviceToken.findOne({ token: 'fcm-token-invaliddddddddddddddd' });
    assert.equal(invalid.isActive, false);

    const list = await request(app)
      .get(`${API}/student/notifications`)
      .set('Authorization', `Bearer ${studentToken}`);
    const note = list.body.data.find((n) => n.title === 'Hello students');
    assert.ok(note);

    const read = await request(app)
      .patch(`${API}/notifications/${note.id}/read`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.data.isRead, true);

    await notifyUser({
      recipientId: studentId,
      title: 'Another',
      message: 'Unread',
      type: 'custom',
      eventKey: `another:${studentId}`,
      channels: { inApp: true, push: false },
    });

    const readAll = await request(app)
      .patch(`${API}/notifications/read-all`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(readAll.status, 200);

    const del = await request(app)
      .delete(`${API}/notifications/${note.id}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(del.status, 200);
  });

  it('payment success/fail and enrollment events are idempotent', async () => {
    const payload = {
      userId: studentId,
      email: 'student.notify@skillbee.test',
      firstName: 'Notify',
      lastName: 'User',
      orderId: '507f1f77bcf86cd799439011',
      orderNumber: 'SKB-ORD-1',
      amount: '10.00',
      currency: 'INR',
    };
    await emitAppEvent('payment.successful', payload);
    await emitAppEvent('payment.successful', payload);
    await emitAppEvent('payment.failed', { ...payload, orderId: '507f1f77bcf86cd799439012' });
    await emitAppEvent('enrollment.activated', {
      userId: studentId,
      email: 'student.notify@skillbee.test',
      firstName: 'Notify',
      courseId: '507f1f77bcf86cd799439013',
      courseName: 'Demo',
      enrollmentId: 'enr-1',
    });
    await flushMemoryEmailQueue();

    const payOk = await AppNotification.countDocuments({
      type: 'payment_successful',
      recipientId: studentId,
    });
    assert.equal(payOk, 1);
    const payFail = await AppNotification.countDocuments({
      type: 'payment_failed',
      recipientId: studentId,
    });
    assert.equal(payFail, 1);
  });
});
