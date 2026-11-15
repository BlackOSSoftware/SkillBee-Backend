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

const studentPayload = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  phone: '+91 98765 43210',
  password: 'Secret123',
};

describe('Auth API', () => {
  let app;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it('registers a student with normalized phone', async () => {
    const res = await request(app).post(`${API}/auth/register`).send(studentPayload);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'test@example.com');
    assert.equal(res.body.data.user.firstName, 'Test');
    assert.equal(res.body.data.user.phone, '+919876543210');
    assert.equal(res.body.data.user.role.slug, ROLE_SLUGS.STUDENT);
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.refreshToken);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'weak@example.com', password: 'secret' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('logs in and returns /me profile', async () => {
    await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'login@example.com' });

    const login = await request(app).post(`${API}/auth/login`).send({
      email: 'login@example.com',
      password: 'Secret123',
    });

    assert.equal(login.status, 200);
    assert.ok(login.body.data.user.lastLogin);

    const me = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, 'login@example.com');
    assert.equal(me.body.data.user.role.slug, ROLE_SLUGS.STUDENT);
  });

  it('refreshes tokens', async () => {
    const registered = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'refresh@example.com' });

    const refresh = await request(app).post(`${API}/auth/refresh`).send({
      refreshToken: registered.body.data.refreshToken,
    });

    assert.equal(refresh.status, 200);
    assert.ok(refresh.body.data.accessToken);
    assert.ok(refresh.body.data.refreshToken);
    assert.notEqual(refresh.body.data.refreshToken, registered.body.data.refreshToken);
  });

  it('blocks students from admin routes', async () => {
    const registered = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'user@example.com' });

    const res = await request(app)
      .get(`${API}/admin/users`)
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`);

    assert.equal(res.status, 403);
  });

  it('allows admin to list and soft-delete users', async () => {
    await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'admin@example.com' });

    await promoteToRole('admin@example.com', ROLE_SLUGS.ADMIN);

    const login = await request(app).post(`${API}/auth/login`).send({
      email: 'admin@example.com',
      password: 'Secret123',
    });

    const student = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'victim@example.com' });

    const list = await request(app)
      .get(`${API}/admin/users`)
      .query({ search: 'victim' })
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    assert.equal(list.status, 200);
    assert.ok(list.body.data.users.length >= 1);

    const deleted = await request(app)
      .delete(`${API}/admin/users/${student.body.data.user.id}`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    assert.equal(deleted.status, 200);
    assert.ok(deleted.body.data.user.deletedAt);
  });

  it('manages roles and permissions as admin', async () => {
    await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'admin2@example.com' });
    await promoteToRole('admin2@example.com', ROLE_SLUGS.ADMIN);

    const login = await request(app).post(`${API}/auth/login`).send({
      email: 'admin2@example.com',
      password: 'Secret123',
    });
    const token = login.body.data.accessToken;

    const permissions = await request(app)
      .get(`${API}/admin/permissions`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(permissions.status, 200);
    assert.ok(permissions.body.data.permissions.length > 0);

    const created = await request(app)
      .post(`${API}/admin/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mentor',
        description: 'Course mentor',
        permissions: ['users:read'],
      });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.role.slug, 'mentor');

    const assigned = await request(app)
      .patch(`${API}/admin/roles/${created.body.data.role.id}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: ['users:read', 'users:write'] });

    assert.equal(assigned.status, 200);
    assert.deepEqual(assigned.body.data.role.permissions.sort(), [
      'users:read',
      'users:write',
    ]);
  });

  it('prevents deleting the last active super-admin', async () => {
    await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'super@example.com' });
    await promoteToRole('super@example.com', ROLE_SLUGS.SUPER_ADMIN);

    const login = await request(app).post(`${API}/auth/login`).send({
      email: 'super@example.com',
      password: 'Secret123',
    });

    const userId = login.body.data.user.id;
    const res = await request(app)
      .delete(`${API}/admin/users/${userId}`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'LAST_SUPER_ADMIN');
  });

  it('updates own profile names via PUT /auth/me', async () => {
    const registered = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'profile@example.com' });
    const token = registered.body.data.accessToken;

    const res = await request(app)
      .put(`${API}/auth/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Updated', lastName: 'Name' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.firstName, 'Updated');
    assert.equal(res.body.data.user.lastName, 'Name');
    assert.equal(res.body.data.user.email, 'profile@example.com');

    const me = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(me.body.data.user.firstName, 'Updated');
  });

  it('rejects email and phone changes via PUT /auth/me', async () => {
    const registered = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'immutable@example.com' });
    const token = registered.body.data.accessToken;

    for (const body of [
      { email: 'new@example.com' },
      { phone: '+10000000000' },
      { role: 'admin' },
      { status: 'suspended' },
      { emailVerified: true },
    ]) {
      const res = await request(app)
        .put(`${API}/auth/me`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'FIELD_NOT_EDITABLE');
    }

    const me = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(me.body.data.user.email, 'immutable@example.com');
    assert.equal(me.body.data.user.phone, '+919876543210');
    assert.equal(me.body.data.user.status, 'active');
  });

  it('validates PUT /auth/me payload and requires auth', async () => {
    const registered = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...studentPayload, email: 'validate@example.com' });
    const token = registered.body.data.accessToken;

    const bad = await request(app)
      .put(`${API}/auth/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: '' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR');

    const unauth = await request(app).put(`${API}/auth/me`).send({ firstName: 'X' });
    assert.equal(unauth.status, 401);
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'ok');
  });
});
