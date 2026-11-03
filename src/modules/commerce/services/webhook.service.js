import crypto from 'crypto';
import { WebhookEvent } from '../../../models/WebhookEvent.js';
import { Order } from '../../../models/Order.js';
import { Payment } from '../../../models/Payment.js';
import { Refund } from '../../../models/Refund.js';
import { AppError } from '../../../utils/AppError.js';
import { verifyWebhookSignature } from './razorpay.service.js';
import { getWebhookSecret } from './gatewayConfig.service.js';
import { completePaidOrder } from './fulfillment.service.js';
import { applyRefundProcessed } from './refund.service.js';
import { releaseCouponUsage } from './coupon.service.js';

export async function processRazorpayWebhook(rawBody, signatureHeader) {
  const webhookSecret = await getWebhookSecret();
  if (!webhookSecret) {
    throw new AppError(
      'Razorpay webhook secret is not configured. Set RAZORPAY_WEBHOOK_SECRET in .env.',
      503,
      'WEBHOOK_SECRET_MISSING'
    );
  }
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
  const valid = verifyWebhookSignature(raw, signatureHeader, webhookSecret);
  if (!valid) {
    throw new AppError('Invalid webhook signature', 400, 'INVALID_WEBHOOK_SIGNATURE');
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError('Invalid webhook JSON', 400, 'INVALID_WEBHOOK_BODY');
  }

  const eventType = payload.event || 'unknown';
  const eventId =
    payload.id ||
    payload.event_id ||
    crypto.createHash('sha256').update(raw).digest('hex');

  const existing = await WebhookEvent.findOne({ provider: 'razorpay', eventId });
  if (existing?.processingStatus === 'processed') {
    return { duplicate: true, eventId, status: 'ignored' };
  }

  const eventDoc =
    existing ||
    (await WebhookEvent.create({
      provider: 'razorpay',
      eventId,
      eventType,
      payloadDigest: crypto.createHash('sha256').update(raw).digest('hex'),
      processingStatus: 'received',
    }));

  try {
    await handleEvent(eventType, payload, eventDoc);
    eventDoc.processingStatus = 'processed';
    eventDoc.processedAt = new Date();
    eventDoc.errorMessage = null;
    await eventDoc.save();
    return { duplicate: false, eventId, status: 'processed' };
  } catch (err) {
    eventDoc.processingStatus = 'failed';
    eventDoc.errorMessage = err.message;
    await eventDoc.save();
    throw err;
  }
}

async function handleEvent(eventType, payload, eventDoc) {
  const entity = payload.payload || {};

  if (eventType === 'payment.failed') {
    const paymentEntity = entity.payment?.entity;
    if (!paymentEntity) return;
    const order = await findOrderForGateway(paymentEntity.order_id, paymentEntity.notes);
    if (!order) return;
    // Never downgrade captured
    if (order.paymentStatus === 'captured') return;
    order.paymentStatus = 'failed';
    order.orderStatus = 'failed';
    order.pushHistory({
      action: 'webhook_payment_failed',
      toPaymentStatus: 'failed',
      toStatus: 'failed',
      source: 'webhook',
      meta: { eventType },
    });
    await order.save();
    await releaseCouponUsage(order._id, { status: 'failed' });
    await Payment.updateOne(
      { orderId: order._id },
      {
        $set: {
          paymentStatus: 'failed',
          providerPaymentId: paymentEntity.id,
          failureCode: paymentEntity.error_code || null,
          failureDescription: paymentEntity.error_description || null,
          failedAt: new Date(),
          webhookVerified: true,
        },
      }
    );
    eventDoc.orderId = order._id;
    return;
  }

  if (
    eventType === 'payment.captured' ||
    eventType === 'payment.authorized' ||
    eventType === 'order.paid'
  ) {
    const paymentEntity = entity.payment?.entity || entity.order?.entity;
    const orderIdGateway =
      paymentEntity?.order_id ||
      entity.order?.entity?.id ||
      paymentEntity?.id;
    const notes = paymentEntity?.notes || entity.order?.entity?.notes || {};
    const order = await findOrderForGateway(
      paymentEntity?.order_id || entity.order?.entity?.id,
      notes
    );
    if (!order) return;

    // Ignore older failed after capture
    if (order.paymentStatus === 'captured' && order.orderStatus === 'completed') {
      eventDoc.orderId = order._id;
      return;
    }

    if (eventType === 'payment.authorized' && order.paymentStatus !== 'captured') {
      order.paymentStatus = 'authorized';
      await order.save();
      await Payment.updateOne(
        { orderId: order._id },
        {
          $set: {
            paymentStatus: 'authorized',
            providerPaymentId: paymentEntity?.id,
            webhookVerified: true,
          },
        }
      );
      eventDoc.orderId = order._id;
      // For automatic capture, wait for captured/order.paid
      return;
    }

    const providerPaymentId = paymentEntity?.id || order.gatewayPaymentId;
    const expectedMinor = order.paymentAmountMinor ?? order.totalPaise;
    if (paymentEntity?.amount && Number(paymentEntity.amount) !== Number(expectedMinor)) {
      throw new AppError('Webhook amount mismatch', 400, 'AMOUNT_MISMATCH');
    }

    await Payment.updateOne(
      { orderId: order._id },
      {
        $set: {
          paymentStatus: 'captured',
          providerPaymentId,
          providerOrderId: paymentEntity?.order_id || order.gatewayOrderId,
          webhookVerified: true,
          capturedAt: new Date(),
        },
      }
    );
    await completePaidOrder(order._id, { paymentId: providerPaymentId });
    eventDoc.orderId = order._id;
    void orderIdGateway;
    return;
  }

  if (
    eventType === 'refund.processed' ||
    eventType === 'refund.created' ||
    eventType === 'refund.failed'
  ) {
    const refundEntity = entity.refund?.entity;
    if (!refundEntity) return;
    await applyRefundProcessed(refundEntity, eventType);
    return;
  }

  eventDoc.processingStatus = 'ignored';
}

async function findOrderForGateway(gatewayOrderId, notes = {}) {
  if (notes?.skillbeeOrderId) {
    const byId = await Order.findById(notes.skillbeeOrderId);
    if (byId) return byId;
  }
  if (gatewayOrderId) {
    return Order.findOne({ gatewayOrderId, deletedAt: null });
  }
  return null;
}
