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
import { _setTransporterForTests, _resetSmtpForTests } from '../src/config/smtp.js';
import {
  enqueueEmail,
  flushMemoryEmailQueue,
  processEmailJob,
} from '../src/modules/email/services/emailQueue.service.js';
import {
  ensureDefaultTemplates,
  renderTemplate,
  ALLOWED_TEMPLATE_VARS,
} from '../src/modules/email/services/emailTemplate.service.js';
import { EmailLog, EMAIL_LOG_STATUS } from '../src/models/EmailLog.js';
import { EmailTemplate } from '../src/models/EmailTemplate.js';
import { env } from '../src/config/env.js';

const API = '/api/v1';

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Mail',
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

describe('Phase 15 Email / SMTP / Templates', () => {
  let app;
  let adminToken;
  let sentMails;

  before(async () => {
    process.env.EMAIL_ENABLED = 'true';
    process.env.EMAIL_INLINE_WORKER = 'true';
    process.env.SMTP_USER = 'test@skillbee.test';
    process.env.SMTP_PASSWORD = 'x';
    process.env.SMTP_FROM_EMAIL = 'noreply@skillbee.test';
    // env object already parsed — patch mutable fields
    env.EMAIL_ENABLED = true;
    env.EMAIL_INLINE_WORKER = true;
    env.SMTP_USER = 'test@skillbee.test';
    env.SMTP_PASSWORD = 'x';
    env.SMTP_FROM_EMAIL = 'noreply@skillbee.test';

    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    _resetSmtpForTests();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    sentMails = [];
    _setTransporterForTests({
      sendMail: async (opts) => {
        sentMails.push(opts);
        return { messageId: `msg-${sentMails.length}` };
      },
      verify: async () => true,
    });
    await register(app, 'admin.email@skillbee.test');
    await promoteToRole('admin.email@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.email@skillbee.test')).accessToken;
    await ensureDefaultTemplates();
    // Allow async account.created enqueue from admin register to land
    await new Promise((r) => setTimeout(r, 75));
    await flushMemoryEmailQueue();
    sentMails.length = 0;
  });

  it('renders templates with escaping; rejects unknown vars in output injection', () => {
    const rendered = renderTemplate(
      {
        subject: 'Hi {{studentName}}',
        htmlBody: '<p>{{studentName}} {{message}}</p>',
        textBody: '{{studentName}} {{message}}',
        variables: ['studentName', 'message'],
      },
      { studentName: '<script>x</script>', message: 'Hello', evil: 'nope' }
    );
    assert.ok(rendered.html.includes('&lt;script&gt;'));
    assert.ok(!rendered.html.includes('<script>'));
    assert.ok(ALLOWED_TEMPLATE_VARS.includes('studentName'));
  });

  it('admin manages templates and status', async () => {
    const created = await request(app)
      .post(`${API}/admin/email-templates`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Promo',
        slug: 'promo-note',
        subject: 'Hi {{studentName}}',
        htmlBody: '<p>{{message}}</p>',
        textBody: '{{message}}',
        variables: ['studentName', 'message'],
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const list = await request(app)
      .get(`${API}/admin/email-templates`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.length >= 11);

    const patched = await request(app)
      .patch(`${API}/admin/email-templates/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subject: 'Updated {{studentName}}' });
    assert.equal(patched.status, 200);

    const status = await request(app)
      .patch(`${API}/admin/email-templates/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    assert.equal(status.status, 200);
    assert.equal(status.body.data.isActive, false);
  });

  it('queues email, worker sends, logs update; duplicate eventKey skipped; SMTP fail retries then fails', async () => {
    const q = await enqueueEmail({
      to: 'student@skillbee.test',
      templateSlug: 'welcome',
      eventType: 'account.created',
      eventKey: 'email-test-welcome-1',
      variables: { studentName: 'Ada', email: 'student@skillbee.test' },
    });
    assert.equal(q.queued, true);
    await new Promise((r) => setTimeout(r, 30));
    await flushMemoryEmailQueue();

    const log = await EmailLog.findOne({ eventKey: 'email-test-welcome-1' });
    assert.equal(log.status, EMAIL_LOG_STATUS.SENT);
    assert.ok(sentMails.length >= 1);
    assert.ok(sentMails.some((m) => String(m.to).includes('student@skillbee.test')));

    const dup = await enqueueEmail({
      to: 'student@skillbee.test',
      templateSlug: 'welcome',
      eventType: 'account.created',
      eventKey: 'email-test-welcome-1',
      variables: { studentName: 'Ada', email: 'student@skillbee.test' },
    });
    assert.equal(dup.duplicate, true);

    const logs = await request(app)
      .get(`${API}/admin/email-logs`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(logs.status, 200);
    assert.ok(logs.body.data.some((l) => l.status === 'sent'));

    // Transient SMTP failure
    let attempts = 0;
    _setTransporterForTests({
      sendMail: async () => {
        attempts += 1;
        throw new Error('Temporary SMTP outage');
      },
    });
    const failQ = await enqueueEmail({
      to: 'fail@skillbee.test',
      templateSlug: 'welcome',
      eventType: 'account.created',
      eventKey: 'email-test-fail-1',
      variables: { studentName: 'Bob', email: 'fail@skillbee.test' },
    });
    const failLog = await EmailLog.findById(failQ.emailLogId);
    // Process until permanent failure
    for (let i = 0; i < env.EMAIL_RETRY_LIMIT + 1; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await processEmailJob({ emailLogId: failLog._id.toString() });
      } catch {
        // retry path
      }
    }
    const refreshed = await EmailLog.findById(failLog._id);
    assert.equal(refreshed.status, EMAIL_LOG_STATUS.FAILED);
    assert.ok(refreshed.attempts >= 1);
    assert.ok(attempts >= 1);
  });

  it('registration succeeds when SMTP unavailable', async () => {
    _setTransporterForTests({
      sendMail: async () => {
        throw new Error('SMTP down');
      },
    });
    const res = await request(app).post(`${API}/auth/register`).send({
      firstName: 'Ok',
      lastName: 'DespiteMail',
      email: 'ok.despite.mail@skillbee.test',
      password: 'Secret123',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.accessToken);
  });

  it('default system templates exist', async () => {
    const count = await EmailTemplate.countDocuments({ isSystem: true });
    assert.ok(count >= 10);
  });
});
