import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { createRazorpayOrder, getRazorpayCredentials } from './razorpay.service.js';
import { createPayPalOrder } from './paypal.service.js';
import { assertGatewayAllowed, listAvailableGateways } from './gateway-selection.service.js';
import { resolveChargeForGateway } from './currency.service.js';
import { verifyRazorpayCallback, verifyAndCapturePayPal } from './payment-verification.service.js';
import { completePaidOrder } from './payment-fulfillment.service.js';
import { invalidateCommerceCaches } from '../cache/invalidation.service.js';
import { releaseCouponUsage } from '../../modules/commerce/services/coupon.service.js';

async function loadPayableOrder(req, orderId) {
  const order = await Order.findOne({
    _id: orderId,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.totalPaise <= 0) {
    throw new AppError('Order does not require payment', 400, 'NO_PAYMENT_REQUIRED');
  }
  if (['captured', 'refunded'].includes(order.paymentStatus) && order.orderStatus === 'completed') {
    throw new AppError('Order already paid', 409, 'ALREADY_PAID');
  }
  if (!['pending', 'failed'].includes(order.paymentStatus)) {
    throw new AppError('Order is not payable in current state', 400, 'ORDER_NOT_PAYABLE');
  }
  return order;
}

export async function getAvailableGatewaysForOrder(req, orderId) {
  const order = await Order.findOne({
    _id: orderId,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  return listAvailableGateways({
    billingCountry: order.billing?.country,
  });
}

export async function createRazorpayPaymentOrder(req, { orderId }) {
  const order = await loadPayableOrder(req, orderId);
  await assertGatewayAllowed({
    gateway: 'razorpay',
    billingCountry: order.billing?.country,
  });

  const charge = resolveChargeForGateway(order, 'razorpay');
  const idempotencyKey = `pay:razorpay:${order._id}:${charge.amountMinor}`;
  let payment = await Payment.findOne({ idempotencyKey });
  const creds = await getRazorpayCredentials();

  if (payment?.providerOrderId && payment.paymentStatus === 'created') {
    return {
      provider: 'razorpay',
      keyId: creds.keyId,
      razorpayOrderId: payment.providerOrderId,
      amountPaise: payment.amountPaise,
      amountMinor: payment.amountPaise,
      currency: payment.currency,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      name: order.billing?.fullName || '',
      email: order.billing?.email || '',
      contact: order.billing?.phone || '',
    };
  }

  const rzOrder = await createRazorpayOrder({
    amountPaise: charge.amountMinor,
    currency: charge.currency,
    receipt: order.orderNumber.slice(0, 40),
    notes: {
      skillbeeOrderId: order._id.toString(),
      orderNumber: order.orderNumber,
      studentId: order.studentId.toString(),
    },
  });

  payment = await Payment.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        orderId: order._id,
        studentId: order.studentId,
        provider: 'razorpay',
        amountPaise: charge.amountMinor,
        currency: charge.currency,
        paymentStatus: 'created',
        idempotencyKey,
      },
      $set: { providerOrderId: rzOrder.id },
    },
    { upsert: true, new: true }
  );

  order.gatewayOrderId = rzOrder.id;
  order.paymentGateway = 'razorpay';
  order.paymentCurrency = charge.currency;
  order.paymentAmountMinor = charge.amountMinor;
  order.fxSnapshot = charge.fxSnapshot;
  order.orderStatus = 'processing';
  order.pushHistory({
    action: 'razorpay_order_created',
    toStatus: 'processing',
    actorId: req.user._id,
    source: 'student',
    meta: { razorpayOrderId: rzOrder.id },
  });
  await order.save();
  await invalidateCommerceCaches({ studentId: order.studentId.toString() });

  return {
    provider: 'razorpay',
    keyId: creds.keyId,
    razorpayOrderId: rzOrder.id,
    amountPaise: charge.amountMinor,
    amountMinor: charge.amountMinor,
    currency: charge.currency,
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    name: order.billing?.fullName || '',
    email: order.billing?.email || '',
    contact: order.billing?.phone || '',
    callbackUrl: `${env.FRONTEND_BASE_URL}/checkout/callback`,
  };
}

/** Backward-compatible alias */
export async function createPaymentOrder(req, body) {
  return createRazorpayPaymentOrder(req, body);
}

export async function createPayPalPaymentOrder(req, { orderId }) {
  const order = await loadPayableOrder(req, orderId);
  await assertGatewayAllowed({
    gateway: 'paypal',
    billingCountry: order.billing?.country,
  });

  const charge = resolveChargeForGateway(order, 'paypal');
  const idempotencyKey = `pay:paypal:${order._id}:${charge.amountMinor}`;
  let payment = await Payment.findOne({ idempotencyKey });

  if (payment?.providerOrderId && payment.paymentStatus === 'created' && payment.checkoutUrl) {
    return {
      provider: 'paypal',
      paypalOrderId: payment.providerOrderId,
      approveUrl: payment.checkoutUrl,
      amountMinor: payment.amountPaise,
      currency: payment.currency,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
    };
  }

  const ppOrder = await createPayPalOrder({
    amountMinor: charge.amountMinor,
    currency: charge.currency,
    receipt: order.orderNumber,
    customId: order._id.toString(),
    description: `SkillBee order ${order.orderNumber}`,
    returnUrl: `${env.FRONTEND_BASE_URL}/checkout/paypal/return`,
    cancelUrl: `${env.FRONTEND_BASE_URL}/checkout/paypal/cancel`,
  });

  payment = await Payment.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        orderId: order._id,
        studentId: order.studentId,
        provider: 'paypal',
        amountPaise: charge.amountMinor,
        currency: charge.currency,
        paymentStatus: 'created',
        idempotencyKey,
      },
      $set: {
        providerOrderId: ppOrder.id,
        checkoutUrl: ppOrder.approveUrl,
        approveLinks: (ppOrder.links || []).map((l) => l.href).filter(Boolean),
      },
    },
    { upsert: true, new: true }
  );

  order.gatewayOrderId = ppOrder.id;
  order.paymentGateway = 'paypal';
  order.paymentCurrency = charge.currency;
  order.paymentAmountMinor = charge.amountMinor;
  order.fxSnapshot = charge.fxSnapshot;
  order.orderStatus = 'processing';
  order.pushHistory({
    action: 'paypal_order_created',
    toStatus: 'processing',
    actorId: req.user._id,
    source: 'student',
    meta: { paypalOrderId: ppOrder.id },
  });
  await order.save();
  await invalidateCommerceCaches({ studentId: order.studentId.toString() });

  return {
    provider: 'paypal',
    paypalOrderId: ppOrder.id,
    approveUrl: ppOrder.approveUrl,
    amountMinor: charge.amountMinor,
    currency: charge.currency,
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    fxSnapshot: charge.fxSnapshot
      ? {
          fromCurrency: charge.fxSnapshot.fromCurrency,
          toCurrency: charge.fxSnapshot.toCurrency,
          rate: charge.fxSnapshot.rate,
        }
      : null,
  };
}

export async function verifyRazorpayPayment(req, body) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new AppError('Missing Razorpay verification fields', 400, 'INVALID_VERIFY_PAYLOAD');
  }

  const order = await Order.findOne({
    _id: orderId,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.gatewayOrderId && order.gatewayOrderId !== razorpay_order_id) {
    throw new AppError('Razorpay order mismatch', 400, 'ORDER_MISMATCH');
  }

  const expectedMinor = order.paymentAmountMinor ?? order.totalPaise;
  const expectedCurrency = order.paymentCurrency || order.currency || 'INR';

  const gatewayPayment = await verifyRazorpayCallback({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    expectedAmountMinor: expectedMinor,
    expectedCurrency,
  });

  const payment = await Payment.findOneAndUpdate(
    { orderId: order._id, providerOrderId: razorpay_order_id },
    {
      $set: {
        providerPaymentId: razorpay_payment_id,
        signatureVerified: true,
        paymentStatus:
          gatewayPayment.status === 'captured'
            ? 'captured'
            : gatewayPayment.status === 'failed'
              ? 'failed'
              : 'authorized',
        paymentMethod: gatewayPayment.method || null,
        capturedAt: gatewayPayment.status === 'captured' ? new Date() : undefined,
      },
    },
    { new: true }
  );

  if (gatewayPayment.status === 'failed') {
    order.paymentStatus = 'failed';
    order.orderStatus = 'failed';
    await order.save();
    await releaseCouponUsage(order._id, { status: 'failed' });
    try {
      const { emitAppEventAsync } = await import('../events/eventBus.service.js');
      emitAppEventAsync('payment.failed', {
        userId: order.studentId,
        email: order.billing?.email || req.user?.email,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        orderId: order._id,
        orderNumber: order.orderNumber,
      });
    } catch {
      /* ignore */
    }
    return { verified: true, success: false, order: order.toSafeObject() };
  }

  if (gatewayPayment.status === 'captured' || !gatewayPayment.status) {
    await completePaidOrder(order._id, {
      paymentId: razorpay_payment_id,
      actorId: req.user._id,
    });
  }

  const refreshed = await Order.findById(order._id);
  return {
    verified: true,
    success: refreshed.paymentStatus === 'captured',
    order: refreshed.toSafeObject(),
    payment: payment?.toSafeObject?.() || null,
  };
}

/** Alias used by existing controller */
export async function verifyPayment(req, body) {
  return verifyRazorpayPayment(req, body);
}

export async function capturePayPalPayment(req, body) {
  const { orderId, paypalOrderId } = body;
  const order = await Order.findOne({
    _id: orderId,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

  const providerOrderId = paypalOrderId || order.gatewayOrderId;
  if (!providerOrderId) {
    throw new AppError('Missing PayPal order id', 400, 'MISSING_PAYPAL_ORDER');
  }
  if (order.gatewayOrderId && order.gatewayOrderId !== providerOrderId) {
    throw new AppError('PayPal order mismatch', 400, 'ORDER_MISMATCH');
  }

  // Idempotent if already fulfilled
  if (order.paymentStatus === 'captured' && order.orderStatus === 'completed') {
    return { success: true, alreadyCompleted: true, order: order.toSafeObject() };
  }

  const expectedMinor = order.paymentAmountMinor ?? order.totalPaise;
  const expectedCurrency = order.paymentCurrency || 'USD';

  const result = await verifyAndCapturePayPal({
    paypalOrderId: providerOrderId,
    expectedAmountMinor: expectedMinor,
    expectedCurrency,
  });

  if (!result.success && !result.pending) {
    order.paymentStatus = 'failed';
    order.orderStatus = 'failed';
    await order.save();
    await releaseCouponUsage(order._id, { status: 'failed' });
    await Payment.updateOne(
      { orderId: order._id, providerOrderId },
      {
        $set: {
          paymentStatus: 'failed',
          failureDescription: result.extracted?.status || 'capture_failed',
          failedAt: new Date(),
        },
      }
    );
    return { success: false, order: order.toSafeObject() };
  }

  const captureId = result.extracted.captureId || providerOrderId;
  await Payment.findOneAndUpdate(
    { orderId: order._id, providerOrderId },
    {
      $set: {
        providerPaymentId: captureId,
        signatureVerified: true,
        paymentStatus: result.pending ? 'authorized' : 'captured',
        paymentMethod: 'paypal',
        capturedAt: result.pending ? undefined : new Date(),
      },
    },
    { new: true }
  );

  if (result.pending) {
    order.paymentStatus = 'authorized';
    await order.save();
    return { success: false, pending: true, order: order.toSafeObject() };
  }

  await completePaidOrder(order._id, {
    paymentId: captureId,
    actorId: req.user._id,
  });

  const refreshed = await Order.findById(order._id);
  return {
    success: refreshed.paymentStatus === 'captured',
    order: refreshed.toSafeObject(),
  };
}

export async function listPayments(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = {};
  if (query.studentId) filter.studentId = query.studentId;
  if (query.orderId) filter.orderId = query.orderId;
  if (query.status) filter.paymentStatus = query.status;
  if (query.provider) filter.provider = query.provider;
  const [rows, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);
  return {
    payments: rows.map((p) => p.toSafeObject()),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getPayment(id) {
  const payment = await Payment.findById(id);
  if (!payment) throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  return payment.toSafeObject();
}
