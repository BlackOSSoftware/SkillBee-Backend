import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { Course } from '../../../models/Course.js';
import { Order } from '../../../models/Order.js';
import { consumeCouponUsage } from './coupon.service.js';
import { allocateInvoiceNumber } from './orderNumber.service.js';
import { generateInvoicePdf } from './invoice.service.js';
import { sendNotificationEmail } from '../../../services/notifications/email.service.js';
import { invalidateCommerceCaches } from '../../../services/cache/invalidation.service.js';
import { invalidateEnrollmentCaches } from '../../../services/cache/invalidation.service.js';
import { recalculateEnrollmentProgress } from '../../enrollment/services/progress.service.js';

/**
 * Idempotent enrollment activation for all order items.
 */
export async function activateEnrollmentsForOrder(order, { actorId = null, source = 'purchase' } = {}) {
  const results = [];
  for (const item of order.items) {
    const course = await Course.findById(item.courseId).select('pricing enrollment');
    if (course?.pricing?.automaticEnrollmentEnabled === false) {
      results.push({ courseId: item.courseId.toString(), skipped: true, reason: 'auto_enrollment_disabled' });
      continue;
    }

    let enrollment = await CourseEnrollment.findOne({
      courseId: item.courseId,
      studentId: order.studentId,
      deletedAt: null,
    });

    if (enrollment && ['active', 'completed'].includes(enrollment.status)) {
      results.push({
        courseId: item.courseId.toString(),
        enrollmentId: enrollment._id.toString(),
        created: false,
      });
      continue;
    }

    if (!enrollment) {
      enrollment = new CourseEnrollment({
        courseId: item.courseId,
        studentId: order.studentId,
        status: 'active',
        enrollmentType: source === 'free' ? 'free' : 'purchase',
        source: source === 'free' ? 'free' : 'purchase',
        enrolledAt: new Date(),
        enrolledBy: actorId,
      });
      enrollment.pushHistory({
        action: 'created',
        toStatus: 'active',
        actorId,
        reason: `Order ${order.orderNumber}`,
        meta: { orderId: order._id.toString(), orderNumber: order.orderNumber },
      });
    } else {
      const from = enrollment.status;
      enrollment.status = 'active';
      enrollment.enrollmentType = source === 'free' ? 'free' : 'purchase';
      enrollment.source = enrollment.enrollmentType;
      enrollment.enrolledAt = new Date();
      enrollment.revokedAt = null;
      enrollment.revokedBy = null;
      enrollment.revocationReason = null;
      enrollment.pushHistory({
        action: 'reactivated',
        fromStatus: from,
        toStatus: 'active',
        actorId,
        reason: `Order ${order.orderNumber}`,
        meta: { orderId: order._id.toString() },
      });
    }
    await enrollment.save();
    try {
      await recalculateEnrollmentProgress(enrollment._id, { actorId });
    } catch {
      /* progress optional */
    }
    await invalidateEnrollmentCaches({
      studentId: order.studentId.toString(),
      courseId: item.courseId.toString(),
      enrollmentId: enrollment._id.toString(),
    });
    results.push({
      courseId: item.courseId.toString(),
      enrollmentId: enrollment._id.toString(),
      created: true,
    });
  }
  return results;
}

export async function completePaidOrder(orderId, { paymentId = null, actorId = null } = {}) {
  const order = await Order.findById(orderId);
  if (!order) return null;

  // Never downgrade captured/completed
  if (order.orderStatus === 'completed' && order.fulfillmentStatus === 'fulfilled') {
    return order;
  }

  const fromStatus = order.orderStatus;
  const fromPay = order.paymentStatus;
  order.paymentStatus = 'captured';
  order.orderStatus = 'completed';
  order.completedAt = order.completedAt || new Date();
  if (paymentId) order.gatewayPaymentId = paymentId;

  try {
    await activateEnrollmentsForOrder(order, { actorId, source: 'purchase' });
    order.fulfillmentStatus = 'fulfilled';
  } catch (err) {
    order.fulfillmentStatus = 'failed';
    order.pushHistory({
      action: 'fulfillment_failed',
      actorId,
      source: 'system',
      reason: err.message,
    });
  }

  if (!order.invoiceNumber) {
    try {
      order.invoiceNumber = await allocateInvoiceNumber();
      const inv = await generateInvoicePdf(order);
      order.invoiceStorageKey = inv.storageKey;
      order.invoiceFileName = inv.fileName;
    } catch (err) {
      order.pushHistory({
        action: 'invoice_failed',
        reason: err.message,
        source: 'system',
      });
    }
  }

  await consumeCouponUsage(order._id);

  order.pushHistory({
    action: 'payment_captured_order_completed',
    fromStatus,
    toStatus: order.orderStatus,
    fromPaymentStatus: fromPay,
    toPaymentStatus: order.paymentStatus,
    actorId,
    source: 'system',
  });
  await order.save();
  await invalidateCommerceCaches({ studentId: order.studentId.toString() });

  setImmediate(async () => {
    try {
      const { emitAppEvent } = await import('../../../services/events/eventBus.service.js');
      const { User } = await import('../../../models/User.js');
      const student = await User.findById(order.studentId).select('email firstName lastName');
      await emitAppEvent('payment.successful', {
        userId: order.studentId,
        email: order.billing?.email || student?.email,
        firstName: student?.firstName,
        lastName: student?.lastName,
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: order.totalPaise != null ? (order.totalPaise / 100).toFixed(2) : '',
        currency: order.currency || 'INR',
      });
      const firstItem = order.items?.[0];
      await emitAppEvent('enrollment.activated', {
        userId: order.studentId,
        email: order.billing?.email || student?.email,
        firstName: student?.firstName,
        lastName: student?.lastName,
        courseId: firstItem?.courseId,
        courseName: firstItem?.title || firstItem?.courseTitle || '',
        enrollmentId: `order:${order._id}`,
      });
    } catch {
      sendNotificationEmail({
        to: order.billing?.email,
        subject: `Payment confirmed — ${order.orderNumber}`,
        template: 'payment_success',
        idempotencyKey: `payment_success:${order._id}`,
        meta: { orderNumber: order.orderNumber },
      }).catch(() => {});
    }
  });

  return order;
}

export async function fulfillFreeOrder(order, user) {
  order.orderStatus = 'completed';
  order.paymentStatus = 'captured';
  order.completedAt = new Date();
  try {
    await activateEnrollmentsForOrder(order, {
      actorId: user?._id,
      source: 'free',
    });
    order.fulfillmentStatus = 'fulfilled';
  } catch {
    order.fulfillmentStatus = 'failed';
  }
  if (!order.invoiceNumber && order.totalPaise === 0) {
    try {
      order.invoiceNumber = await allocateInvoiceNumber();
      const inv = await generateInvoicePdf(order);
      order.invoiceStorageKey = inv.storageKey;
      order.invoiceFileName = inv.fileName;
    } catch {
      /* optional for free */
    }
  }
  order.pushHistory({
    action: 'free_order_completed',
    toStatus: 'completed',
    toPaymentStatus: 'captured',
    actorId: user?._id,
    source: 'student',
  });
  await order.save();
  await invalidateCommerceCaches({ studentId: order.studentId.toString() });
  setImmediate(async () => {
    try {
      const { emitAppEvent } = await import('../../../services/events/eventBus.service.js');
      const firstItem = order.items?.[0];
      await emitAppEvent('enrollment.activated', {
        userId: order.studentId,
        email: order.billing?.email || user?.email,
        firstName: user?.firstName,
        lastName: user?.lastName,
        courseId: firstItem?.courseId,
        courseName: firstItem?.title || firstItem?.courseTitle || '',
        enrollmentId: `free:${order._id}`,
      });
    } catch {
      sendNotificationEmail({
        to: order.billing?.email || user?.email,
        subject: `Enrollment confirmed — ${order.orderNumber}`,
        template: 'free_enrollment',
        idempotencyKey: `free_enrollment:${order._id}`,
      }).catch(() => {});
    }
  });
  return order;
}
