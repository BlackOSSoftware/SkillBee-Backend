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
import {
  NEWSLETTER_STATUS,
  NewsletterSubscriber,
} from '../src/models/NewsletterSubscriber.js';
import { NewsletterCampaign } from '../src/models/NewsletterCampaign.js';
import { makeUnsubscribeToken } from '../src/modules/newsletter/services/newsletter.service.js';

const API = '/api/v1';

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'News',
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

function extractTokenFromLog(log) {
  const link = log?.meta?.variables?.resetLink || log?.meta?.variables?.message || '';
  const m = String(link).match(/token=([a-f0-9]+)/i);
  return m ? m[1] : null;
}

async function waitForCampaign(id, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await NewsletterCampaign.findById(id).select('+deliveredEmails');
    if (c && ['sent', 'failed'].includes(c.status)) return c;
    await new Promise((r) => setTimeout(r, 50));
    await flushMemoryEmailQueue();
  }
  return NewsletterCampaign.findById(id).select('+deliveredEmails');
}

describe('Newsletter', () => {
  let app;
  let adminToken;

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
    await register(app, 'admin.news@skillbee.test');
    await promoteToRole('admin.news@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.news@skillbee.test')).accessToken;
    await new Promise((r) => setTimeout(r, 50));
    await flushMemoryEmailQueue();
  });

  it('subscribes with normalization, queues verify email, verifies once, rejects reuse/expiry', async () => {
    const sub = await request(app)
      .post(`${API}/public/newsletter/subscribe`)
      .send({ email: 'News.User@SkillBee.TEST' });
    assert.equal(sub.status, 201);
    assert.match(sub.body.data.message, /verification/i);

    const pending = await NewsletterSubscriber.findOne({ email: 'news.user@skillbee.test' });
    assert.equal(pending.status, NEWSLETTER_STATUS.PENDING);

    await flushMemoryEmailQueue();
    const log = await EmailLog.findOne({
      eventType: 'newsletter.verify',
      recipient: 'news.user@skillbee.test',
    });
    assert.ok(log);
    const token = extractTokenFromLog(log);
    assert.ok(token);

    const ok = await request(app).get(
      `${API}/public/newsletter/verify?email=news.user@skillbee.test&token=${token}`
    );
    assert.equal(ok.status, 200);

    const active = await NewsletterSubscriber.findOne({ email: 'news.user@skillbee.test' });
    assert.equal(active.status, NEWSLETTER_STATUS.SUBSCRIBED);

    const reuse = await request(app).get(
      `${API}/public/newsletter/verify?email=news.user@skillbee.test&token=${token}`
    );
    assert.equal(reuse.status, 400);

    const dup = await request(app)
      .post(`${API}/public/newsletter/subscribe`)
      .send({ email: 'news.user@skillbee.test' });
    assert.equal(dup.status, 201);

    // expire token path
    await NewsletterSubscriber.updateOne(
      { email: 'news.user@skillbee.test' },
      {
        $set: {
          status: NEWSLETTER_STATUS.PENDING,
          verificationTokenHash: 'abc',
          verificationExpiresAt: new Date(Date.now() - 1000),
        },
      }
    );
    const expired = await request(app).get(
      `${API}/public/newsletter/verify?email=news.user@skillbee.test&token=deadbeefdeadbeefdeadbeefdeadbeef`
    );
    assert.equal(expired.status, 400);
  });

  it('unsubscribes securely and excludes from campaigns; resubscribe requires re-verify', async () => {
    await request(app)
      .post(`${API}/public/newsletter/subscribe`)
      .send({ email: 'camp@skillbee.test' });
    await flushMemoryEmailQueue();
    const log = await EmailLog.findOne({ recipient: 'camp@skillbee.test' });
    const token = extractTokenFromLog(log);
    await request(app).get(
      `${API}/public/newsletter/verify?email=camp@skillbee.test&token=${token}`
    );

    await NewsletterSubscriber.create({
      email: 'pending-only@skillbee.test',
      status: NEWSLETTER_STATUS.PENDING,
    });
    await NewsletterSubscriber.create({
      email: 'unsubbed@skillbee.test',
      status: NEWSLETTER_STATUS.UNSUBSCRIBED,
      unsubscribedAt: new Date(),
    });

    const campaign = await request(app)
      .post(`${API}/admin/newsletter/campaigns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subject: 'Hello subscribers',
        htmlBody: '<p>Hi</p>',
        textBody: 'Hi',
      });
    assert.equal(campaign.status, 201);
    const finished = await waitForCampaign(campaign.body.data.id);
    assert.equal(finished.status, 'sent');
    assert.ok((finished.stats?.sent || 0) >= 1);
    assert.ok(finished.deliveredEmails.includes('camp@skillbee.test'));
    assert.ok(!finished.deliveredEmails.includes('pending-only@skillbee.test'));
    assert.ok(!finished.deliveredEmails.includes('unsubbed@skillbee.test'));

    const unsubToken = makeUnsubscribeToken('camp@skillbee.test');
    const unsub = await request(app)
      .post(`${API}/public/newsletter/unsubscribe`)
      .send({ email: 'camp@skillbee.test', token: unsubToken });
    assert.equal(unsub.status, 200);

    const after = await NewsletterSubscriber.findOne({ email: 'camp@skillbee.test' });
    assert.equal(after.status, NEWSLETTER_STATUS.UNSUBSCRIBED);

    const campaign2 = await request(app)
      .post(`${API}/admin/newsletter/campaigns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subject: 'Second',
        htmlBody: '<p>Hi</p>',
        textBody: 'Hi',
      });
    const finished2 = await waitForCampaign(campaign2.body.data.id);
    assert.ok(!finished2.deliveredEmails.includes('camp@skillbee.test'));

    // resubscribe flow
    const again = await request(app)
      .post(`${API}/public/newsletter/subscribe`)
      .send({ email: 'camp@skillbee.test' });
    assert.equal(again.status, 201);
    const pending = await NewsletterSubscriber.findOne({ email: 'camp@skillbee.test' });
    assert.equal(pending.status, NEWSLETTER_STATUS.PENDING);
  });

  it('admin subscriber CRUD and unauthorized access', async () => {
    await NewsletterSubscriber.create({
      email: 'listed@skillbee.test',
      status: NEWSLETTER_STATUS.SUBSCRIBED,
      subscribedAt: new Date(),
    });
    const list = await request(app)
      .get(`${API}/admin/newsletter/subscribers?search=listed`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    const id = list.body.data[0].id;

    const patch = await request(app)
      .patch(`${API}/admin/newsletter/subscribers/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'unsubscribed' });
    assert.equal(patch.status, 200);

    const del = await request(app)
      .delete(`${API}/admin/newsletter/subscribers/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);

    const unauth = await request(app).get(`${API}/admin/newsletter/subscribers`);
    assert.equal(unauth.status, 401);
  });
});
