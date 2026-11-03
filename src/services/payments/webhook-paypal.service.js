import crypto from 'crypto';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { AppError } from '../../utils/AppError.js';
import { verifyPayPalWebhook, payPalValueToMinor } from './paypal.service.js';
import { completePaidOrder } from './payment-fulfillment.service.js';
import { applyPayPalCaptureRefunded } from './refund.service.js';
import { releaseCouponUsage } from '../../modules/commerce/services/coupon.service.js';

export async function processPayPalWebhook(headers, eventBody) {
  const valid = await verifyPayPalWebhook({
    headers,
    webhookEvent: eventBody,
  });
  if (!valid) {
    throw new AppError('Invalid PayPal webhook signature', 400, 'INVALID_WEBHOOK_SIGNATURE');
  }

  const eventType = eventBody.event_type || 'unknown';
  const eventId =
    eventBody.id ||
    crypto.createHash('sha256').update(JSON.stringify(eventBody)).digest('hex');

  const existing = await WebhookEvent.findOne({ provider: 'paypal', eventId });
  if (existing?.processingStatus === 'processed') {
    return { duplicate: true, eventId, status: 'ignored' };
  }

  const eventDoc =
    existing ||
    (await WebhookEvent.create({
      provider: 'paypal',
      eventId,
      eventType,
      payloadDigest: crypto
        .createHash('sha256')
        .update(JSON.stringify(eventBody))
        .digest('hex'),
      processingStatus: 'received',
    }));

  try {
    await handlePayPalEvent(eventType, eventBody, eventDoc);
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

async function handlePayPalEvent(eventType, body, eventDoc) {
  const resource = body.resource || {};

  if (eventType === 'CHECKOUT.ORDER.APPROVED') {
    // Wait for capture — record only
    const order = await findOrder(resource);
    if (order) {
      eventDoc.orderId = order._id;
      if (order.paymentStatus !== 'captured') {
        order.paymentStatus = 'authorized';
        await order.save();
      }
    }
    return;
  }

  if (eventType === 'PAYMENT.CAPTURE.PENDING') {
    const order = await findOrder(resource);
    if (!order) return;
    if (order.paymentStatus === 'captured') return;
    order.paymentStatus = 'authorized';
    await order.save();
    eventDoc.orderId = order._id;
    return;
  }

  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const order = await findOrder(resource);
    if (!order) return;
    eventDoc.orderId = order._id;
    if (order.paymentStatus === 'captured' && order.orderStatus === 'completed') return;

    const expectedMinor = order.paymentAmountMinor ?? order.totalPaise;
    const amountMinor = payPalValueToMinor(resource.amount?.value);
    if (amountMinor != null && Number(amountMinor) !== Number(expectedMinor)) {
      throw new AppError('Webhook amount mismatch', 400, 'AMOUNT_MISMATCH');
    }
    if (
      resource.amount?.currency_code &&
      String(resource.amount.currency_code).toUpperCase() !==
        String(order.paymentCurrency || order.currency || 'USD').toUpperCase()
    ) {
      throw new AppError('Webhook currency mismatch', 400, 'CURRENCY_MISMATCH');
    }

    const captureId = resource.id;
    await Payment.updateOne(
      { orderId: order._id, provider: 'paypal' },
      {
        $set: {
          paymentStatus: 'captured',
          providerPaymentId: captureId,
          webhookVerified: true,
          capturedAt: new Date(),
        },
      }
    );
    await completePaidOrder(order._id, { paymentId: captureId });
    return;
  }

  if (eventType === 'PAYMENT.CAPTURE.DENIED') {
    const order = await findOrder(resource);
    if (!order) return;
    if (order.paymentStatus === 'captured') return;
    order.paymentStatus = 'failed';
    order.orderStatus = 'failed';
    await order.save();
    await releaseCouponUsage(order._id, { status: 'failed' });
    await Payment.updateOne(
      { orderId: order._id, provider: 'paypal' },
      {
        $set: {
          paymentStatus: 'failed',
          failureDescription: 'capture_denied',
          failedAt: new Date(),
          webhookVerified: true,
        },
      }
    );
    eventDoc.orderId = order._id;
    return;
  }

  if (
    eventType === 'PAYMENT.CAPTURE.REFUNDED' ||
    eventType === 'PAYMENT.CAPTURE.REVERSED'
  ) {
    const captureId =
      resource.id ||
      resource.supplementary_data?.related_ids?.capture_id ||
      resource.links?.find?.(() => false);
    // For refunded event, resource is often the refund; capture id in supplementary_data
    const relatedCapture =
      resource.supplementary_data?.related_ids?.capture_id ||
      resource.capture_id ||
      null;
    const amountMinor = payPalValueToMinor(resource.amount?.value);
    await applyPayPalCaptureRefunded(
      relatedCapture || captureId,
      resource.id,
      amountMinor
    );
    return;
  }

  eventDoc.processingStatus = 'ignored';
}

async function findOrder(resource) {
  const customId =
    resource.custom_id ||
    resource.purchase_units?.[0]?.custom_id ||
    resource.supplementary_data?.related_ids?.order_id;
  if (customId && /^[a-fA-F0-9]{24}$/.test(String(customId))) {
    const byId = await Order.findById(customId);
    if (byId) return byId;
  }
  const gatewayOrderId =
    resource.supplementary_data?.related_ids?.order_id ||
    resource.id;
  if (gatewayOrderId) {
    const byGateway = await Order.findOne({
      gatewayOrderId: String(gatewayOrderId),
      paymentGateway: 'paypal',
    });
    if (byGateway) return byGateway;
  }
  // Capture completed: look up payment by capture then order
  if (resource.id) {
    const payment = await Payment.findOne({
      $or: [{ providerPaymentId: resource.id }, { providerOrderId: resource.id }],
      provider: 'paypal',
    });
    if (payment) return Order.findById(payment.orderId);
  }
  return null;
}
