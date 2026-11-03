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
    firstName: 'Faq',
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

describe('FAQ Management', () => {
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
    await register(app, 'admin.faq@skillbee.test');
    await promoteToRole('admin.faq@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.faq@skillbee.test')).accessToken;
    studentToken = (await register(app, 'student.faq@skillbee.test')).accessToken;
  });

  it('create/edit/publish/unpublish/delete with public visibility rules and schema', async () => {
    const create = await request(app)
      .post(`${API}/admin/faqs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        question: 'What is SkillBee?',
        answer: '<p>An LMS for life sciences training.</p><script>alert(1)</script>',
        category: 'general',
        displayOrder: 1,
      });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const id = create.body.data.id;
    assert.equal(create.body.data.status, 'draft');
    assert.ok(!String(create.body.data.answer).includes('<script>'));

    const draftPublic = await request(app).get(`${API}/public/faqs`);
    assert.equal(draftPublic.status, 200);
    assert.equal(draftPublic.body.data.length, 0);

    const draftOne = await request(app).get(`${API}/public/faqs/${id}`);
    assert.equal(draftOne.status, 404);

    const publish = await request(app)
      .patch(`${API}/admin/faqs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(publish.status, 200);

    const pub = await request(app).get(`${API}/public/faqs?category=general`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.length, 1);
    assert.equal(pub.body.schema['@type'], 'FAQPage');
    assert.ok(!pub.body.data[0].createdBy);
    assert.ok(!pub.body.data[0].updatedBy);

    const edit = await request(app)
      .patch(`${API}/admin/faqs/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'What is SkillBee LMS?' });
    assert.equal(edit.status, 200);

    const unpublish = await request(app)
      .patch(`${API}/admin/faqs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'draft' });
    assert.equal(unpublish.status, 200);
    const after = await request(app).get(`${API}/public/faqs`);
    assert.equal(after.body.data.length, 0);

    await request(app)
      .patch(`${API}/admin/faqs/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const del = await request(app)
      .delete(`${API}/admin/faqs/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);

    const blocked = await request(app)
      .post(`${API}/admin/faqs`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ question: 'Hack?', answer: 'no' });
    assert.equal(blocked.status, 403);
  });

  it('supports reorder, course filter, and display order', async () => {
    const a = await request(app)
      .post(`${API}/admin/faqs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'Q1?', answer: 'A1', displayOrder: 2, category: 'billing' });
    const b = await request(app)
      .post(`${API}/admin/faqs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'Q2?', answer: 'A2', displayOrder: 1, category: 'billing' });
    const idA = a.body.data.id;
    const idB = b.body.data.id;

    await request(app)
      .patch(`${API}/admin/faqs/${idA}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    await request(app)
      .patch(`${API}/admin/faqs/${idB}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const reorder = await request(app)
      .patch(`${API}/admin/faqs/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderedIds: [idA, idB] });
    assert.equal(reorder.status, 200);

    const list = await request(app).get(`${API}/public/faqs?category=billing`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].id, idA);
    assert.equal(list.body.data[1].id, idB);
  });
});
