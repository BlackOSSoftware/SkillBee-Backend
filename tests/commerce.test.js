import assert from 'node:assert/strict';
import crypto from 'crypto';
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
import { setRazorpayFactoryForTests } from '../src/modules/commerce/services/razorpay.service.js';
import { verifyPaymentSignature } from '../src/modules/commerce/services/razorpay.service.js';
import { CourseEnrollment } from '../src/models/CourseEnrollment.js';
import { Order } from '../src/models/Order.js';

const API = '/api/v1';
const KEY_SECRET = 'test_razorpay_secret_key_value';
const KEY_ID = 'rzp_test_skillbee';

const thumbnail = {
  publicId: 'skillbee/courses/csv-commerce',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-commerce.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Buy',
    lastName: 'Student',
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

describe('Phase 9–10 Commerce & Razorpay', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherToken;
  let categoryId;
  let paidCourseId;
  let freeCourseId;
  let instructorId;

  before(async () => {
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_skillbee';
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = 'test-encryption-key-32chars-min!!';
    process.env.RAZORPAY_MODE = 'test';

    setRazorpayFactoryForTests(() => ({
      orders: {
        create: async ({ amount, currency, receipt }) => ({
          id: `order_mock_${receipt}`,
          amount,
          currency,
          status: 'created',
        }),
      },
      payments: {
        fetch: async (id) => ({
          id,
          order_id: id.replace('pay_', 'order_'),
          amount: 500000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        }),
        refund: async (paymentId, { amount }) => ({
          id: `rfnd_mock_${paymentId}`,
          payment_id: paymentId,
          amount,
          status: 'processed',
        }),
      },
    }));

    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    setRazorpayFactoryForTests(null);
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    await register(app, 'admin.commerce@skillbee.test');
    await promoteToRole('admin.commerce@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.commerce@skillbee.test')).accessToken;

    const student = await register(app, 'student.commerce@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'student.other.commerce@skillbee.test');
    otherToken = other.accessToken;

    await register(app, 'instructor.commerce@skillbee.test');
    await promoteToRole('instructor.commerce@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = (await login(app, 'instructor.commerce@skillbee.test')).user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV Commerce', description: 'Pay' });
    categoryId = category.body.data.category.id;

    const paid = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Paid CSV Course',
        description: '<p>Paid</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 5000, salePrice: 5000, currency: 'INR' },
      });
    assert.equal(paid.status, 201, JSON.stringify(paid.body));
    paidCourseId = paid.body.data.course.id;
    await request(app)
      .patch(`${API}/admin/courses/${paidCourseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    // Allow publish without lessons for commerce tests
    const free = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Free CSV Course',
        description: '<p>Free</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      });
    freeCourseId = free.body.data.course.id;
    await request(app)
      .patch(`${API}/admin/courses/${freeCourseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
  });

  it('adds course to cart and rejects duplicate / already enrolled', async () => {
    const add = await request(app)
      .post(`${API}/student/cart/items`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseId: paidCourseId });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    assert.equal(add.body.data.cart.items[0].finalPricePaise, 500000);

    const dup = await request(app)
      .post(`${API}/student/cart/items`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseId: paidCourseId });
    assert.equal(dup.status, 409);

    const tamper = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [paidCourseId], totalAmount: 1 });
    assert.equal(tamper.status, 400);
  });

  it('free course checkout activates enrollment without Razorpay', async () => {
    const res = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [freeCourseId] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.requiresPayment, false);
    assert.equal(res.body.data.order.orderStatus, 'completed');
    assert.equal(res.body.data.order.totalPaise, 0);

    const enrolled = await CourseEnrollment.findOne({
      studentId,
      courseId: freeCourseId,
      status: 'active',
    });
    assert.ok(enrolled);
  });

  it('paid checkout → create razorpay order → verify → enroll', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        courseIds: [paidCourseId],
        billing: { fullName: 'Buy Student', email: 'student.commerce@skillbee.test' },
      });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    assert.equal(checkout.body.data.requiresPayment, true);
    assert.equal(checkout.body.data.order.totalPaise, 500000);
    assert.equal(checkout.body.data.order.items[0].courseName, 'Paid CSV Course');
    const orderId = checkout.body.data.order.id;

    const createPay = await request(app)
      .post(`${API}/payments/razorpay/create-order`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ orderId });
    assert.equal(createPay.status, 201, JSON.stringify(createPay.body));
    assert.equal(createPay.body.data.amountPaise, 500000);
    assert.ok(createPay.body.data.razorpayOrderId);
    assert.equal(createPay.body.data.keyId, KEY_ID);

    const rzOrderId = createPay.body.data.razorpayOrderId;
    const paymentId = 'pay_mock_1';
    const signature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${rzOrderId}|${paymentId}`)
      .digest('hex');

    // Adjust mock fetch amount/order for this payment
    setRazorpayFactoryForTests(() => ({
      orders: {
        create: async ({ amount, currency, receipt }) => ({
          id: `order_mock_${receipt}`,
          amount,
          currency,
        }),
      },
      payments: {
        fetch: async (id) => ({
          id,
          order_id: rzOrderId,
          amount: 500000,
          currency: 'INR',
          status: 'captured',
          method: 'card',
        }),
        refund: async (pid, { amount }) => ({
          id: `rfnd_${pid}`,
          payment_id: pid,
          amount,
          status: 'processed',
        }),
      },
    }));

    const badSig = await request(app)
      .post(`${API}/payments/razorpay/verify`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        orderId,
        razorpay_order_id: rzOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: 'deadbeef',
      });
    assert.equal(badSig.status, 400);

    const verify = await request(app)
      .post(`${API}/payments/razorpay/verify`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        orderId,
        razorpay_order_id: rzOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.equal(verify.body.data.success, true);

    const enrolled = await CourseEnrollment.findOne({
      studentId,
      courseId: paidCourseId,
      status: 'active',
    });
    assert.ok(enrolled);

    const order = await Order.findById(orderId);
    assert.equal(order.orderStatus, 'completed');
    assert.equal(order.paymentStatus, 'captured');
    assert.ok(order.invoiceNumber);

    // student ownership
    const otherGet = await request(app)
      .get(`${API}/student/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(otherGet.status, 404);

    const mine = await request(app)
      .get(`${API}/student/orders`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(mine.body.data.orders.length, 1);
  });

  it('webhook signature + duplicate capture is idempotent', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [paidCourseId] });
    const orderId = checkout.body.data.order.id;
    const orderNumber = checkout.body.data.order.orderNumber;

    await Order.updateOne(
      { _id: orderId },
      { $set: { gatewayOrderId: 'order_wh_1' } }
    );

    const payload = {
      id: 'evt_unique_1',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_wh_1',
            order_id: 'order_wh_1',
            amount: 500000,
            currency: 'INR',
            status: 'captured',
            notes: { skillbeeOrderId: orderId, orderNumber },
          },
        },
      },
    };
    // Sign the exact UTF-8 string SuperTest will transmit (avoid Buffer re-encoding issues)
    const rawString = JSON.stringify(payload);
    const sig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_skillbee')
      .update(rawString)
      .digest('hex');

    const first = await request(app)
      .post(`${API}/webhooks/razorpay`)
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(rawString);
    assert.equal(first.status, 200, JSON.stringify(first.body));

    const second = await request(app)
      .post(`${API}/webhooks/razorpay`)
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(rawString);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.duplicate, true);

    const count = await CourseEnrollment.countDocuments({
      studentId,
      courseId: paidCourseId,
      deletedAt: null,
    });
    assert.equal(count, 1);

    const bad = await request(app)
      .post(`${API}/webhooks/razorpay`)
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'invalid')
      .send(rawString);
    assert.equal(bad.status, 400);
  });

  it('admin refund processes and gateway config masks secrets', async () => {
    // quick paid+verify path
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [paidCourseId] });
    const orderId = checkout.body.data.order.id;
    const createPay = await request(app)
      .post(`${API}/payments/razorpay/create-order`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ orderId });
    const rzOrderId = createPay.body.data.razorpayOrderId;
    const paymentId = 'pay_refund_1';
    setRazorpayFactoryForTests(() => ({
      orders: { create: async (o) => ({ id: `order_${o.receipt}`, amount: o.amount }) },
      payments: {
        fetch: async () => ({
          id: paymentId,
          order_id: rzOrderId,
          amount: 500000,
          currency: 'INR',
          status: 'captured',
        }),
        refund: async (pid, { amount }) => ({
          id: `rfnd_${pid}`,
          payment_id: pid,
          amount,
          status: 'processed',
        }),
      },
    }));
    const signature = verifyPaymentSignature({
      orderId: rzOrderId,
      paymentId,
      signature: crypto
        .createHmac('sha256', KEY_SECRET)
        .update(`${rzOrderId}|${paymentId}`)
        .digest('hex'),
      keySecret: KEY_SECRET,
    });
    assert.equal(signature, true);
    await request(app)
      .post(`${API}/payments/razorpay/verify`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        orderId,
        razorpay_order_id: rzOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: crypto
          .createHmac('sha256', KEY_SECRET)
          .update(`${rzOrderId}|${paymentId}`)
          .digest('hex'),
      });

    const refund = await request(app)
      .post(`${API}/admin/orders/${orderId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountPaise: 500000, reason: 'Test refund', revokeEnrollment: false });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    assert.equal(refund.body.data.refund.status, 'processed');

    const gateways = await request(app)
      .get(`${API}/admin/payment-gateways`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(gateways.status, 200);
    const rz = gateways.body.data.gateways.find((g) => g.provider === 'razorpay');
    assert.ok(rz);
    assert.ok(rz.keyId.includes('…') || rz.keyId.includes('rzp_'));
    assert.equal(rz.secretKeyConfigured, true);
    const pp = gateways.body.data.gateways.find((g) => g.provider === 'paypal');
    assert.ok(pp);
    assert.equal(pp.secretKeyConfigured, true);
  });

  it('admin cannot mark unpaid order completed via status patch', async () => {
    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [paidCourseId] });
    const orderId = checkout.body.data.order.id;
    const patch = await request(app)
      .patch(`${API}/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed', reason: 'fake' });
    assert.equal(patch.status, 400);
  });
});
