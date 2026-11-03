import { env } from '../../config/env.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { CourseEnrollment } from '../../models/CourseEnrollment.js';
import { AppError } from '../../utils/AppError.js';
import { createRazorpayRefund } from './razorpay.service.js';
import { createPayPalRefund } from './paypal.service.js';
import { revokeEnrollment } from '../../modules/enrollment/services/enrollment.service.js';
import { invalidateCommerceCaches } from '../cache/invalidation.service.js';

export async function createRefund(req, orderId, input) {
  const order = await Order.findOne({ _id: orderId, deletedAt: null });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.paymentStatus !== 'captured' && order.paymentStatus !== 'partially_refunded') {
    throw new AppError('Order payment is not refundable', 400, 'NOT_REFUNDABLE');
  }

  const payment = await Payment.findOne({
    orderId: order._id,
    paymentStatus: { $in: ['captured', 'partially_refunded'] },
  }).sort({ createdAt: -1 });
  if (!payment?.providerPaymentId) {
    throw new AppError('No captured payment found', 400, 'NO_PAYMENT');
  }

  const refundable = payment.amountPaise - (payment.refundedPaise || 0);
  const amountPaise =
    input.amountPaise != null ? Number(input.amountPaise) : refundable;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > refundable) {
    throw new AppError('Invalid refund amount', 400, 'INVALID_REFUND_AMOUNT');
  }

  const idempotencyKey =
    input.idempotencyKey ||
    `refund:${payment.provider}:${order._id}:${amountPaise}:${payment.refundedPaise || 0}`;

  const existing = await Refund.findOne({ idempotencyKey });
  if (existing) return existing.toSafeObject();

  const revokeEnrollmentFlag =
    input.revokeEnrollment != null
      ? Boolean(input.revokeEnrollment)
      : env.REFUND_REVOKE_ENROLLMENT_DEFAULT;

  let providerRefund;
  try {
    if (payment.provider === 'paypal') {
      providerRefund = await createPayPalRefund({
        captureId: payment.providerPaymentId,
        amountMinor: amountPaise,
        currency: payment.currency || order.paymentCurrency || 'USD',
        note: input.reason || '',
      });
      providerRefund = {
        id: providerRefund.id,
        status:
          String(providerRefund.status || '').toUpperCase() === 'COMPLETED'
            ? 'processed'
            : 'pending',
      };
    } else if (payment.provider === 'razorpay') {
      providerRefund = await createRazorpayRefund({
        paymentId: payment.providerPaymentId,
        amountPaise,
        notes: { orderNumber: order.orderNumber, reason: input.reason || '' },
      });
    } else {
      throw new AppError('Unknown payment provider for refund', 400, 'UNKNOWN_PROVIDER');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || 'Refund failed', 502, 'REFUND_GATEWAY_FAILED');
  }

  const refund = await Refund.create({
    orderId: order._id,
    paymentId: payment._id,
    studentId: order.studentId,
    amountPaise,
    currency: payment.currency || order.currency,
    status: providerRefund.status === 'processed' ? 'processed' : 'initiated',
    providerRefundId: providerRefund.id,
    reason: input.reason || '',
    revokeEnrollment: revokeEnrollmentFlag,
    initiatedBy: req.user._id,
    idempotencyKey,
    processedAt: providerRefund.status === 'processed' ? new Date() : null,
  });

  if (refund.status === 'processed') {
    await finalizeRefundEffects(refund, order, payment);
  }

  return refund.toSafeObject();
}

export async function applyRefundProcessed(refundEntity, eventType) {
  const refund = await Refund.findOne({ providerRefundId: refundEntity.id });
  if (!refund) return;
  if (eventType === 'refund.failed' || eventType === 'PAYMENT.CAPTURE.DENIED') {
    refund.status = 'failed';
    refund.failureDescription = refundEntity.notes?.reason || 'failed';
    await refund.save();
    return;
  }
  if (refund.status === 'processed') return;
  refund.status = 'processed';
  refund.processedAt = new Date();
  await refund.save();
  const order = await Order.findById(refund.orderId);
  const payment = await Payment.findById(refund.paymentId);
  if (order && payment) await finalizeRefundEffects(refund, order, payment);
}

/** PayPal webhook refund / reversal */
export async function applyPayPalCaptureRefunded(captureId, refundId, amountMinor) {
  const payment = await Payment.findOne({ providerPaymentId: captureId });
  if (!payment) return;
  const order = await Order.findById(payment.orderId);
  if (!order) return;

  let refund = refundId ? await Refund.findOne({ providerRefundId: refundId }) : null;
  if (!refund) {
    const amt = amountMinor || payment.amountPaise - (payment.refundedPaise || 0);
    const idempotencyKey = `refund:paypal:wh:${captureId}:${refundId || amt}`;
    refund = await Refund.findOne({ idempotencyKey });
    if (!refund) {
      refund = await Refund.create({
        orderId: order._id,
        paymentId: payment._id,
        studentId: order.studentId,
        amountPaise: amt,
        currency: payment.currency,
        status: 'processed',
        providerRefundId: refundId || `paypal_wh_${captureId}`,
        reason: 'paypal_webhook',
        revokeEnrollment: env.REFUND_REVOKE_ENROLLMENT_DEFAULT,
        idempotencyKey,
        processedAt: new Date(),
      });
    }
  }
  if (refund.status !== 'processed') {
    refund.status = 'processed';
    refund.processedAt = new Date();
    await refund.save();
  }
  await finalizeRefundEffects(refund, order, payment);
}

async function finalizeRefundEffects(refund, order, payment) {
  payment.refundedPaise = (payment.refundedPaise || 0) + refund.amountPaise;
  if (payment.refundedPaise >= payment.amountPaise) {
    payment.paymentStatus = 'refunded';
    order.paymentStatus = 'refunded';
    order.orderStatus = 'refunded';
  } else {
    payment.paymentStatus = 'partially_refunded';
    order.paymentStatus = 'partially_refunded';
    order.orderStatus = 'partially_refunded';
  }
  await payment.save();

  if (refund.revokeEnrollment && !refund.enrollmentRevoked) {
    for (const item of order.items) {
      const enrollment = await CourseEnrollment.findOne({
        courseId: item.courseId,
        studentId: order.studentId,
        deletedAt: null,
        status: { $in: ['active', 'completed'] },
      });
      if (enrollment) {
        await revokeEnrollment(
          { user: { _id: refund.initiatedBy } },
          enrollment._id.toString(),
          `Refund ${refund.providerRefundId || refund._id}`
        );
      }
    }
    refund.enrollmentRevoked = true;
    await refund.save();
  }

  order.pushHistory({
    action: 'refund_processed',
    toStatus: order.orderStatus,
    toPaymentStatus: order.paymentStatus,
    source: 'system',
    meta: {
      refundId: refund._id.toString(),
      amountPaise: refund.amountPaise,
      provider: payment.provider,
    },
  });
  await order.save();
  await invalidateCommerceCaches({ studentId: order.studentId.toString() });
}

export async function listRefunds(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = {};
  if (query.orderId) filter.orderId = query.orderId;
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    Refund.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Refund.countDocuments(filter),
  ]);
  return {
    refunds: rows.map((r) => r.toSafeObject()),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getRefund(id) {
  const refund = await Refund.findById(id);
  if (!refund) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
  return refund.toSafeObject();
}
