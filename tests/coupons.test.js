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
import { setRazorpayFactoryForTests } from '../src/services/payments/razorpay.service.js';
import { verifyPaymentSignature } from '../src/services/payments/razorpay.service.js';
import { Coupon } from '../src/models/Coupon.js';
import { CouponUsage } from '../src/models/CouponUsage.js';
import { CourseEnrollment } from '../src/models/CourseEnrollment.js';

const API = '/api/v1';
const KEY_SECRET = 'test_razorpay_secret_key_value';

const thumbnail = {
  publicId: 'skillbee/courses/csv-coupon',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-coupon.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 1000,
};

async function register(app, email) {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Coup',
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

describe('Phase 11 Coupons & Discounts', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherToken;
  let categoryId;
  let instructorId;
  let paidCourseId;
  let otherCourseId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
    setRazorpayFactoryForTests(() => ({
      orders: {
        create: async ({ amount, currency, receipt }) => ({
          id: `order_${receipt}`,
          amount,
          currency,
          status: 'created',
        }),
      },
      payments: {
        fetch: async (id, ...rest) => {
          void rest;
          return {
            id,
            order_id: id.replace('pay_', 'order_'),
            amount: 400000,
            currency: 'INR',
            status: 'captured',
            method: 'card',
          };
        },
        refund: async () => ({ id: 'rfnd_1', status: 'processed', amount: 1 }),
      },
    }));
  });

  after(async () => {
    setRazorpayFactoryForTests(null);
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    const admin = await register(app, 'admin.coupon@skillbee.test');
    await promoteToRole('admin.coupon@skillbee.test', ROLE_SLUGS.SUPER_ADMIN);
    adminToken = (await login(app, 'admin.coupon@skillbee.test')).accessToken;

    const student = await register(app, 'student.coupon@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'other.coupon@skillbee.test');
    otherToken = other.accessToken;

    const instructor = await register(app, 'instructor.coupon@skillbee.test');
    await promoteToRole('instructor.coupon@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    instructorId = instructor.user.id;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Coupon Cat', slug: `coupon-cat-${Date.now()}` });
    categoryId = category.body.data.category.id;

    const paid = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Coupon Paid Course',
        description: '<p>Paid</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 5000, salePrice: 5000, currency: 'INR' },
      });
    paidCourseId = paid.body.data.course.id;
    await request(app)
      .patch(`${API}/admin/courses/${paidCourseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const otherCourse = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Other Paid Course',
        description: '<p>Other</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 2000, salePrice: 2000, currency: 'INR' },
      });
    otherCourseId = otherCourse.body.data.course.id;
    await request(app)
      .patch(`${API}/admin/courses/${otherCourseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    void admin;
    void otherToken;
  });

  it('admin coupon CRUD + student blocked from admin', async () => {
    const create = await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'SAVE10',
        description: '10% off',
        discountType: 'percentage',
        discountValue: 10,
        minimumOrderAmount: 100,
        maximumDiscountAmount: 1000,
        usageLimit: 100,
        perUserLimit: 2,
        applicability: 'all_courses',
      });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const id = create.body.data.coupon.id;

    const list = await request(app)
      .get(`${API}/admin/coupons?search=SAVE`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.coupons.length, 1);

    const get = await request(app)
      .get(`${API}/admin/coupons/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.data.coupon.discountType, 'percentage');

    const patch = await request(app)
      .patch(`${API}/admin/coupons/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated' });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.data.coupon.description, 'Updated');

    const studentAdmin = await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        code: 'HACK',
        discountType: 'fixed',
        discountValue: 10,
      });
    assert.equal(studentAdmin.status, 403);

    const unauth = await request(app).get(`${API}/admin/coupons`);
    assert.equal(unauth.status, 401);

    const del = await request(app)
      .delete(`${API}/admin/coupons/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);
  });

  it('validates coupon and rejects invalid / expired / min / course / inactive', async () => {
    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'VALID20',
        discountType: 'percentage',
        discountValue: 20,
        minimumOrderAmount: 1000,
        applicability: 'all_courses',
      });

    const ok = await request(app)
      .post(`${API}/coupons/validate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ couponCode: 'valid20', courseIds: [paidCourseId] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.originalSubtotalPaise, 500000);
    assert.equal(ok.body.data.discountAmountPaise, 100000);
    assert.equal(ok.body.data.finalPayableAmountPaise, 400000);

    const trust = await request(app)
      .post(`${API}/coupons/validate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        couponCode: 'VALID20',
        courseIds: [paidCourseId],
        discountAmount: 1,
      });
    assert.equal(trust.status, 400);

    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'EXPIRED',
        discountType: 'fixed',
        discountValue: 100,
        startDate: new Date(Date.now() - 86400000 * 10).toISOString(),
        expiryDate: new Date(Date.now() - 86400000).toISOString(),
      });
    const expired = await request(app)
      .post(`${API}/coupons/validate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ couponCode: 'EXPIRED', courseIds: [paidCourseId] });
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error.code, 'COUPON_EXPIRED');

    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'UPCOMING',
        discountType: 'fixed',
        discountValue: 100,
        startDate: new Date(Date.now() + 86400000).toISOString(),
      });
    const upcoming = await request(app)
      .post(`${API}/coupons/validate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ couponCode: 'UPCOMING', courseIds: [paidCourseId] });
    assert.equal(upcoming.body.error.code, 'COUPON_NOT_STARTED');

    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'MINONLY',
        discountType: 'fixed',
        discountValue: 100,
        minimumOrderAmount: 10000,
      });
    const minFail = await request(app)
      .post(`${API}/coupons/validate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ couponCode: 'MINONLY', courseIds: [otherCourseId] });
    assert.equal(minFail.body.error.code, 'COUPON_MINIMUM');

    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'COURSEONLY',
        discountType: 'fixed',
        discountValue: 100,
        applicability: 'selected_courses',
        applicableCourses: [paidCourseId],
      });
    const courseFail = await request(app)
      .post(`${API}/coupons/validate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ couponCode: 'COURSEONLY', courseIds: [otherCourseId] });
    assert.equal(courseFail.body.error.code, 'COUPON_COURSE');
  });

  it('checkout applies discount, payment amount matches, usage consumed once', async () => {
    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'OFF20',
        discountType: 'percentage',
        discountValue: 20,
        usageLimit: 5,
        perUserLimit: 2,
      });

    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        courseIds: [paidCourseId],
        couponCode: 'OFF20',
        billing: { country: 'IN', email: 'student.coupon@skillbee.test' },
      });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    assert.equal(checkout.body.data.order.discountPaise, 100000);
    assert.equal(checkout.body.data.order.totalPaise, 400000);
    assert.equal(checkout.body.data.order.couponSnapshot.code, 'OFF20');
    const orderId = checkout.body.data.order.id;

    const reserved = await CouponUsage.findOne({ orderId });
    assert.equal(reserved.status, 'reserved');
    const couponDoc = await Coupon.findOne({ code: 'OFF20' });
    assert.equal(couponDoc.reservedCount, 1);
    assert.equal(couponDoc.usedCount, 0);

    let lastRzOrderId = null;
    setRazorpayFactoryForTests(() => ({
      orders: {
        create: async ({ amount, currency, receipt }) => {
          lastRzOrderId = `order_rz_${receipt}`;
          return {
            id: lastRzOrderId,
            amount,
            currency,
            status: 'created',
          };
        },
      },
      payments: {
        fetch: async (id) => ({
          id,
          order_id: lastRzOrderId,
          amount: 400000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        }),
      },
    }));

    const createPay = await request(app)
      .post(`${API}/payments/razorpay/create-order`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ orderId });
    assert.equal(createPay.status, 201, JSON.stringify(createPay.body));
    assert.equal(createPay.body.data.amountPaise, 400000);

    const rzOrderId = createPay.body.data.razorpayOrderId;
    const paymentId = 'pay_coupon_1';
    const signature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${rzOrderId}|${paymentId}`)
      .digest('hex');
    assert.equal(
      verifyPaymentSignature({
        orderId: rzOrderId,
        paymentId,
        signature,
        keySecret: KEY_SECRET,
      }),
      true
    );

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

    const usage = await CouponUsage.findOne({ orderId });
    assert.equal(usage.status, 'consumed');
    const refreshedCoupon = await Coupon.findOne({ code: 'OFF20' });
    assert.equal(refreshedCoupon.usedCount, 1);
    assert.equal(refreshedCoupon.reservedCount, 0);

    assert.equal(
      await CourseEnrollment.countDocuments({
        studentId,
        courseId: paidCourseId,
        deletedAt: null,
      }),
      1
    );

    // Duplicate verify does not double-consume
    await request(app)
      .post(`${API}/payments/razorpay/verify`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        orderId,
        razorpay_order_id: rzOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });
    assert.equal((await Coupon.findOne({ code: 'OFF20' })).usedCount, 1);

    const usageHistory = await request(app)
      .get(`${API}/admin/coupons/${refreshedCoupon._id}/usage`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(usageHistory.status, 200);
    assert.equal(usageHistory.body.data.usages.length, 1);
    assert.equal(usageHistory.body.data.usages[0].status, 'consumed');
  });

  it('failed payment releases reservation; 100% discount free-flow consumes once', async () => {
    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'HOLD1',
        discountType: 'fixed',
        discountValue: 100,
        usageLimit: 1,
        perUserLimit: 1,
      });

    const checkout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [paidCourseId], couponCode: 'HOLD1' });
    const orderId = checkout.body.data.order.id;
    assert.equal((await Coupon.findOne({ code: 'HOLD1' })).reservedCount, 1);

    const cancel = await request(app)
      .patch(`${API}/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled', reason: 'abandoned' });
    assert.equal(cancel.status, 200);
    assert.equal((await CouponUsage.findOne({ orderId })).status, 'released');
    assert.equal((await Coupon.findOne({ code: 'HOLD1' })).reservedCount, 0);

    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'FREE100',
        discountType: 'percentage',
        discountValue: 100,
        usageLimit: 10,
      });

    const freeCheckout = await request(app)
      .post(`${API}/student/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseIds: [paidCourseId], couponCode: 'FREE100' });
    assert.equal(freeCheckout.status, 201, JSON.stringify(freeCheckout.body));
    assert.equal(freeCheckout.body.data.requiresPayment, false);
    assert.equal(freeCheckout.body.data.order.totalPaise, 0);
    assert.equal(
      (await CouponUsage.findOne({ orderId: freeCheckout.body.data.order.id })).status,
      'consumed'
    );
    assert.equal((await Coupon.findOne({ code: 'FREE100' })).usedCount, 1);
  });

  it('enforces usageLimit under concurrent reservations', async () => {
    await request(app)
      .post(`${API}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'ONCE',
        discountType: 'fixed',
        discountValue: 50,
        usageLimit: 1,
        perUserLimit: 1,
      });

    const otherStudent = await register(app, 'race.coupon@skillbee.test');

    const [a, b] = await Promise.all([
      request(app)
        .post(`${API}/student/checkout`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ courseIds: [paidCourseId], couponCode: 'ONCE' }),
      request(app)
        .post(`${API}/student/checkout`)
        .set('Authorization', `Bearer ${otherStudent.accessToken}`)
        .send({ courseIds: [otherCourseId], couponCode: 'ONCE' }),
    ]);

    const statuses = [a.status, b.status].sort();
    assert.ok(statuses.includes(201));
    assert.ok(statuses.includes(400) || statuses.filter((s) => s === 201).length === 1);
    const coupon = await Coupon.findOne({ code: 'ONCE' });
    assert.ok(coupon.reservedCount + coupon.usedCount <= 1);
  });
});
