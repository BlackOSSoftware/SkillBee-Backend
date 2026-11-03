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

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Site',
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

describe('Phase 14 Site Settings', () => {
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
    await register(app, 'admin.site@skillbee.test');
    await promoteToRole('admin.site@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.site@skillbee.test')).accessToken;
    studentToken = (await register(app, 'student.site@skillbee.test')).accessToken;
  });

  it('admin gets and updates contact, GSTIN, social; public reads; non-admin blocked', async () => {
    const got = await request(app)
      .get(`${API}/admin/site-settings`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(got.status, 200);

    const patch = await request(app)
      .patch(`${API}/admin/site-settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        contact: {
          companyName: 'SkillBee Pvt Ltd',
          email: 'hello@skillbee.test',
          phone: '+91 9876543210',
          gstin: '29AAAAA0000A1Z5',
          city: 'Bengaluru',
          country: 'India',
        },
        socialLinks: {
          facebook: 'https://facebook.com/skillbee',
          twitter: 'https://x.com/skillbee',
        },
      });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.data.contact.gstin, '29AAAAA0000A1Z5');
    assert.equal(patch.body.data.socialLinks.facebook, 'https://facebook.com/skillbee');

    const studentBlocked = await request(app)
      .patch(`${API}/admin/site-settings`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ contact: { companyName: 'Hack' } });
    assert.equal(studentBlocked.status, 403);

    const pub = await request(app).get(`${API}/site-settings`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.contact.companyName, 'SkillBee Pvt Ltd');
    assert.equal(pub.body.data.socialLinks.twitter, 'https://x.com/skillbee');
    assert.equal(pub.body.data.updatedBy, undefined);
  });

  it('rejects invalid GSTIN and social URLs', async () => {
    const badGstin = await request(app)
      .patch(`${API}/admin/site-settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contact: { gstin: 'INVALID' } });
    assert.equal(badGstin.status, 400);

    const badUrl = await request(app)
      .patch(`${API}/admin/site-settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ socialLinks: { facebook: 'javascript:alert(1)' } });
    assert.equal(badUrl.status, 400);
  });
});
