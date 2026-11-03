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
import { setRazorpayFactoryForTests } from '../src/services/payments/razorpay.service.js';
import { setPayPalHttpForTests } from '../src/services/payments/paypal.service.js';
import { CourseEnrollment } from '../src/models/CourseEnrollment.js';
import { Order } from '../src/models/Order.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-dual',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-dual.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Dual',
    lastName: 'Pay',
    email,
    password: 'Secret123',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function login(app, email) {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email, password: 'Secret123' });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Dual payment gateways — Razorpay + PayPal', () => {
  let app;
  let adminToken;
  let indiaToken;
  let indiaId;
  let intlToken;
  let intlId;
  let paidCourseId;
  let categoryId;
  let instructorId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();

    setRazorpayFactoryForTests(() => ({
      orders: {
        create: async ({ amount, currency, receipt }) => ({
          id: `order_rz_${receipt}`,
          amount,
          currency,
          status: 'created',
        }),
      },
      payments: {
        fetch: async (id) => ({
          id,
          order_id: `order_rz_SKB-ORD-2026-000001`,
          amount: 500000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        }),
        refund: async (id, { amount }) => ({
          id: `rfnd_${id}`,
          amount,
          status: 'processed',
        }),
      },
    }));

    setPayPalHttpForTests(async (path, opts) => {
      if (path === '/v1/oauth2/token') {
        return { access_token: 'paypal_test_token', expires_in: 3600 };
      }
      if (path === '/v2/checkout/orders' && opts.method === 'POST') {
        return {
          id: 'PAYPAL_ORDER_1',
          status: 'CREATED',
          links: [
            {
              rel: 'approve',
              href: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_1',
            },
          ],
        };
      }
      if (path.startsWith('/v2/checkout/orders/') && path.endsWith('/capture')) {
        return {
          id: 'PAYPAL_ORDER_1',
          status: 'COMPLETED',
          purchase_units: [
            {
              custom_id: opts.body?.custom_id,
              reference_id: 'SKB-ORD',
              payments: {
                captures: [
                  {
                    id: 'CAPTURE_1',
                    status: 'COMPLETED',
                    amount: { currency_code: 'USD', value: '60.00' },
                  },
                ],
              },
              amount: { currency_code: 'USD', value: '60.00' },
            },
          ],
        };
      }
      if (path.startsWith('/v2/checkout/orders/') && opts.method === 'GET') {
        return {
          id: 'PAYPAL_ORDER_1',
          status: 'COMPLETED',
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: 'CAPTURE_1',
                    status: 'COMPLETED',
                    amount: { currency_code: 'USD', value: '60.00' },
                  },
                ],
              },
            },
          ],
        };
      }
      if (path.includes('/refund')) {
        return { id: 'REFUND_PP_1', status: 'COMPLETED' };
      }
      if (path === '/v1/notifications/verify-webhook-signature') {
        return { verification_status: 'SUCCESS' };
      }
      return {};
    });
  });

  after(async () => {
    setRazorpayFactoryForTests(null);
    setPayPalHttpForTests(null);
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    const admin = await register(app, 'admin.dual@skillbee.test');
    await promoteToRole('admin.dual@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.dual@skillbee.test')).accessToken;

    const india = await register(app, 'india.dual@skillbee.test');
    indiaToken = india.accessToken;
    indiaId = india.user.id;

    const intl = await register(app, 'intl.dual@skillbee.test');
    intlToken = intl.accessToken;
    intlId = intl.user.id;

    const instructor = await register(app, 'instructor.dual@skillbee.test');
    await promoteToRole('instructor.dual@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructor.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dual Pay Cat', slug: `dual-pay-${Date.now()}` });
    assert.equal(category.status, 201, JSON.stringify(category.body));
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Dual Gateway Course',
        description: '<p>Paid dual gateway</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: {
          type: 'paid',
          regularPrice: 5000,
          salePrice: 5000,
          currency: 'INR',
          isPurchasable: true,
        },
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    paidCourseId = course.body.data.course.id;
    const pub = await request(app)
      .patch(`${API}/admin/courses/${paidCourseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    void admin;
  });

  it('routes India billing to Razorpay and activates enrollment', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${indiaToken}`)
      .send({
        courseIds: [paidCourseId],
        billing: { country: 'IN', fullName: 'India Student', email: 'india.dual@skillbee.test' },
      });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    const orderId = checkout.body.data.order.id;

    const available = await request(app)
      .get(`${API}/payments/available/${orderId}`)
      .set('Authorization', `Bearer ${indiaToken}`);
    assert.equal(available.status, 200);
    assert.ok(available.body.data.gateways.some((g) => g.provider === 'razorpay'));
    assert.ok(!available.body.data.gateways.some((g) => g.provider === 'paypal'));

    const create = await request(app)
      .post(`${API}/payments/razorpay/create-order`)
      .set('Authorization', `Bearer ${indiaToken}`)
      .send({ orderId });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    assert.equal(create.body.data.provider, 'razorpay');
    assert.equal(create.body.data.currency, 'INR');

    // Reject PayPal for IN
    const pp = await request(app)
      .post(`${API}/payments/paypal/create-order`)
      .set('Authorization', `Bearer ${indiaToken}`)
      .send({ orderId });
    assert.equal(pp.status, 400);
    assert.equal(pp.body.error.code, 'GATEWAY_NOT_AVAILABLE');

    const count = await CourseEnrollment.countDocuments({
      studentId: indiaId,
      courseId: paidCourseId,
    });
    assert.equal(count, 0);
  });

  it('routes international billing to PayPal with FX snapshot and captures', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({
        courseIds: [paidCourseId],
        billing: {
          country: 'US',
          fullName: 'Intl Student',
          email: 'intl.dual@skillbee.test',
        },
      });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    const orderId = checkout.body.data.order.id;

    const available = await request(app)
      .get(`${API}/payments/available/${orderId}`)
      .set('Authorization', `Bearer ${intlToken}`);
    assert.equal(available.status, 200);
    assert.ok(available.body.data.gateways.some((g) => g.provider === 'paypal'));
    assert.ok(!available.body.data.gateways.some((g) => g.provider === 'razorpay'));

    const create = await request(app)
      .post(`${API}/payments/paypal/create-order`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({ orderId });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    assert.equal(create.body.data.provider, 'paypal');
    assert.equal(create.body.data.currency, 'USD');
    // 5000 INR rupees = 500000 paise * 0.012 = 6000 cents = $60.00
    assert.equal(create.body.data.amountMinor, 6000);
    assert.ok(create.body.data.approveUrl);
    assert.equal(create.body.data.fxSnapshot?.rate, '0.012');

    const orderDoc = await Order.findById(orderId);
    assert.equal(orderDoc.paymentGateway, 'paypal');
    assert.equal(orderDoc.paymentCurrency, 'USD');
    assert.equal(orderDoc.paymentAmountMinor, 6000);

    const capture = await request(app)
      .post(`${API}/payments/paypal/capture-order`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({ orderId, paypalOrderId: create.body.data.paypalOrderId });
    assert.equal(capture.status, 200, JSON.stringify(capture.body));
    assert.equal(capture.body.data.success, true);

    const enrollments = await CourseEnrollment.countDocuments({
      studentId: intlId,
      courseId: paidCourseId,
      deletedAt: null,
      status: 'active',
    });
    assert.equal(enrollments, 1);

    // Duplicate capture is idempotent
    const again = await request(app)
      .post(`${API}/payments/paypal/capture-order`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({ orderId, paypalOrderId: create.body.data.paypalOrderId });
    assert.equal(again.status, 200);
    assert.equal(
      await CourseEnrollment.countDocuments({
        studentId: intlId,
        courseId: paidCourseId,
        deletedAt: null,
      }),
      1
    );
  });

  it('PayPal webhook capture completed is idempotent', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({
        courseIds: [paidCourseId],
        billing: { country: 'GB', email: 'intl.dual@skillbee.test' },
      });
    const orderId = checkout.body.data.order.id;
    await request(app)
      .post(`${API}/payments/paypal/create-order`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({ orderId });

    const event = {
      id: 'WH-EVT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE_WH_1',
        amount: { currency_code: 'USD', value: '60.00' },
        custom_id: orderId,
        supplementary_data: { related_ids: { order_id: 'PAYPAL_ORDER_1' } },
      },
    };

    const headers = {
      'paypal-transmission-id': 'tx-1',
      'paypal-transmission-time': new Date().toISOString(),
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'sig',
    };

    const first = await request(app)
      .post(`${API}/webhooks/paypal`)
      .set(headers)
      .send(event);
    assert.equal(first.status, 200, JSON.stringify(first.body));

    const second = await request(app)
      .post(`${API}/webhooks/paypal`)
      .set(headers)
      .send(event);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.duplicate, true);

    assert.equal(
      await CourseEnrollment.countDocuments({
        studentId: intlId,
        courseId: paidCourseId,
        deletedAt: null,
      }),
      1
    );
  });

  it('admin PayPal refund uses PayPal provider', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({
        courseIds: [paidCourseId],
        billing: { country: 'AE', email: 'intl.dual@skillbee.test' },
      });
    const orderId = checkout.body.data.order.id;
    await request(app)
      .post(`${API}/payments/paypal/create-order`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({ orderId });
    await request(app)
      .post(`${API}/payments/paypal/capture-order`)
      .set('Authorization', `Bearer ${intlToken}`)
      .send({ orderId });

    const refund = await request(app)
      .post(`${API}/admin/orders/${orderId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test refund' });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    assert.ok(refund.body.data.refund.providerRefundId);
  });
});
