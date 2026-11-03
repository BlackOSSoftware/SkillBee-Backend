import { Router } from 'express';
import express from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/commerce.controller.js';
import * as couponCtrl from '../controllers/coupon.controller.js';
import {
  capturePayPalBody,
  cartItemBody,
  checkoutBody,
  courseIdParams,
  createPaymentBody,
  gatewayUpdateBody,
  idParams,
  orderIdParams,
  orderListQuery,
  orderStatusBody,
  paypalGatewayUpdateBody,
  refundBody,
  studentIdParams,
  verifyPaymentBody,
} from '../validators/commerce.validator.js';
import {
  couponIdParams,
  couponListQuery,
  couponUsageQuery,
  createCouponBody,
  updateCouponBody,
  validateCouponBody,
} from '../validators/coupon.validator.js';

export function mountCommerceRoutes(app, apiPrefix) {
  const adminCoupons = Router();
  adminCoupons.use(authenticate, requireAdminAccess());
  adminCoupons.get('/', validateRequest({ query: couponListQuery }), couponCtrl.listCoupons);
  adminCoupons.post('/', validateRequest({ body: createCouponBody }), couponCtrl.createCoupon);
  adminCoupons.get('/:id', validateRequest({ params: couponIdParams }), couponCtrl.getCoupon);
  adminCoupons.patch(
    '/:id',
    validateRequest({ params: couponIdParams, body: updateCouponBody }),
    couponCtrl.updateCoupon
  );
  adminCoupons.delete(
    '/:id',
    validateRequest({ params: couponIdParams }),
    couponCtrl.deleteCoupon
  );
  adminCoupons.get(
    '/:id/usage',
    validateRequest({ params: couponIdParams, query: couponUsageQuery }),
    couponCtrl.couponUsage
  );
  app.use(`${apiPrefix}/admin/coupons`, adminCoupons);

  const studentCoupons = Router();
  studentCoupons.use(authenticate);
  studentCoupons.post(
    '/validate',
    validateRequest({ body: validateCouponBody }),
    couponCtrl.validateCoupon
  );
  app.use(`${apiPrefix}/coupons`, studentCoupons);

  // Webhook MUST use raw body — mounted by createApp before json parser via mountWebhookRoute
  const studentCart = Router();
  studentCart.use(authenticate);
  studentCart.get('/', ctrl.getCart);
  studentCart.post('/items', validateRequest({ body: cartItemBody }), ctrl.addCartItem);
  studentCart.delete(
    '/items/:courseId',
    validateRequest({ params: courseIdParams }),
    ctrl.removeCartItem
  );
  studentCart.delete('/', ctrl.clearCart);
  app.use(`${apiPrefix}/student/cart`, studentCart);

  const studentCheckout = Router();
  studentCheckout.use(authenticate);
  studentCheckout.post('/', validateRequest({ body: checkoutBody }), ctrl.checkout);
  app.use(`${apiPrefix}/student/checkout`, studentCheckout);

  const studentOrders = Router();
  studentOrders.use(authenticate);
  studentOrders.get('/', ctrl.listMyOrders);
  studentOrders.get('/:id', validateRequest({ params: idParams }), ctrl.getMyOrder);
  studentOrders.get(
    '/:id/invoice',
    validateRequest({ params: idParams }),
    ctrl.downloadMyInvoice
  );
  app.use(`${apiPrefix}/student/orders`, studentOrders);

  const payments = Router();
  payments.use(authenticate);
  payments.get(
    '/available/:orderId',
    validateRequest({ params: orderIdParams }),
    ctrl.listAvailableGateways
  );
  payments.post(
    '/razorpay/create-order',
    validateRequest({ body: createPaymentBody }),
    ctrl.createRazorpayOrder
  );
  payments.post(
    '/razorpay/verify',
    validateRequest({ body: verifyPaymentBody }),
    ctrl.verifyRazorpayPayment
  );
  payments.post(
    '/paypal/create-order',
    validateRequest({ body: createPaymentBody }),
    ctrl.createPayPalOrder
  );
  payments.post(
    '/paypal/capture-order',
    validateRequest({ body: capturePayPalBody }),
    ctrl.capturePayPalOrder
  );
  app.use(`${apiPrefix}/payments`, payments);

  const adminOrders = Router();
  adminOrders.use(authenticate, requireAdminAccess());
  adminOrders.get('/', validateRequest({ query: orderListQuery }), ctrl.listAdminOrders);
  adminOrders.get('/:id', validateRequest({ params: idParams }), ctrl.getAdminOrder);
  adminOrders.patch(
    '/:id/status',
    validateRequest({ params: idParams, body: orderStatusBody }),
    ctrl.patchOrderStatus
  );
  adminOrders.get(
    '/:id/history',
    validateRequest({ params: idParams }),
    ctrl.orderHistory
  );
  adminOrders.get(
    '/:id/invoice',
    validateRequest({ params: idParams }),
    ctrl.downloadAdminInvoice
  );
  adminOrders.post(
    '/:id/refunds',
    validateRequest({ params: idParams, body: refundBody }),
    ctrl.createRefund
  );
  app.use(`${apiPrefix}/admin/orders`, adminOrders);

  const adminCourseOrders = Router({ mergeParams: true });
  adminCourseOrders.use(authenticate, requireAdminAccess());
  adminCourseOrders.get(
    '/',
    validateRequest({ params: courseIdParams, query: orderListQuery }),
    ctrl.listCourseOrders
  );
  app.use(`${apiPrefix}/admin/courses/:courseId/orders`, adminCourseOrders);

  const adminStudentOrders = Router({ mergeParams: true });
  adminStudentOrders.use(authenticate, requireAdminAccess());
  adminStudentOrders.get(
    '/',
    validateRequest({ params: studentIdParams, query: orderListQuery }),
    ctrl.listStudentOrdersAdmin
  );
  app.use(`${apiPrefix}/admin/students/:studentId/orders`, adminStudentOrders);

  const adminPayments = Router();
  adminPayments.use(authenticate, requireAdminAccess());
  adminPayments.get('/', ctrl.listPayments);
  adminPayments.get('/:id', validateRequest({ params: idParams }), ctrl.getPayment);
  app.use(`${apiPrefix}/admin/payments`, adminPayments);

  const adminRefunds = Router();
  adminRefunds.use(authenticate, requireAdminAccess());
  adminRefunds.get('/', ctrl.listRefunds);
  adminRefunds.get('/:id', validateRequest({ params: idParams }), ctrl.getRefund);
  app.use(`${apiPrefix}/admin/refunds`, adminRefunds);

  const adminGateways = Router();
  adminGateways.use(authenticate, requireAdminAccess());
  adminGateways.get('/', ctrl.listGateways);
  adminGateways.patch(
    '/razorpay',
    validateRequest({ body: gatewayUpdateBody }),
    ctrl.updateRazorpayGateway
  );
  adminGateways.patch(
    '/paypal',
    validateRequest({ body: paypalGatewayUpdateBody }),
    ctrl.updatePayPalGateway
  );
  adminGateways.post('/razorpay/test', ctrl.testRazorpayGateway);
  adminGateways.post('/paypal/test', ctrl.testPayPalGateway);
  adminGateways.get('/razorpay/status', ctrl.razorpayGatewayStatus);
  adminGateways.get('/paypal/status', ctrl.paypalGatewayStatus);
  app.use(`${apiPrefix}/admin/payment-gateways`, adminGateways);
}

/** Call before express.json() */
export function mountRazorpayWebhookRoute(app, apiPrefix) {
  app.post(
    `${apiPrefix}/webhooks/razorpay`,
    express.raw({ type: '*/*' }),
    (req, _res, next) => {
      req.rawBody = req.body;
      next();
    },
    ctrl.razorpayWebhook
  );
}

/** PayPal webhook uses JSON body + signature headers verified via PayPal API */
export function mountPayPalWebhookRoute(app, apiPrefix) {
  app.post(`${apiPrefix}/webhooks/paypal`, express.json({ limit: '2mb' }), ctrl.paypalWebhook);
}
