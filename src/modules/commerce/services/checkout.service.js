import { env } from '../../../config/env.js';
import { Order } from '../../../models/Order.js';
import { AppError } from '../../../utils/AppError.js';
import { sumMinor } from '../../../utils/money.js';
import { invalidateCommerceCaches } from '../../../services/cache/invalidation.service.js';
import {
  assertNotAlreadyEnrolled,
  buildOrderItemSnapshot,
  loadPurchasableCourses,
} from './pricing.service.js';
import {
  validateAndApplyCoupon,
  reserveCouponUsage,
  consumeCouponUsage,
} from './coupon.service.js';
import { allocateOrderNumber } from './orderNumber.service.js';
import { clearCartForStudent, getCartCourseIds } from './cart.service.js';
import { fulfillFreeOrder } from './fulfillment.service.js';
import { eligibleSubtotalPaise } from './discount.engine.js';

/**
 * Create pending order from courseIds or cart. Prices always from MongoDB.
 */
export async function checkout(req, input) {
  for (const forbidden of [
    'totalAmount',
    'subtotal',
    'discountAmount',
    'taxAmount',
    'prices',
    'finalPrice',
  ]) {
    if (input[forbidden] !== undefined) {
      throw new AppError(`Field ${forbidden} is not accepted`, 400, 'TRUST_VIOLATION');
    }
  }

  let courseIds = (input.courseIds || []).map(String);
  if (input.useCart) {
    courseIds = await getCartCourseIds(req.user._id);
  }
  courseIds = [...new Set(courseIds)];
  if (!courseIds.length) {
    throw new AppError('No courses selected for checkout', 400, 'EMPTY_CHECKOUT');
  }

  for (const id of courseIds) {
    await assertNotAlreadyEnrolled(req.user._id, id);
  }

  const courses = await loadPurchasableCourses(courseIds);
  const items = courses.map((c) => buildOrderItemSnapshot(c));
  const subtotalPaise = sumMinor(items.map((i) => i.finalPricePaise));
  const taxPaise = sumMinor(items.map((i) => i.taxPaise));
  const currency = items[0]?.currency || env.PAYMENT_CURRENCY || 'INR';

  const couponResult = await validateAndApplyCoupon({
    code: input.couponCode,
    studentId: req.user._id,
    items,
    subtotalPaise,
    currency,
  });

  // Distribute discount only across eligible items when coupon is course-scoped
  let remainingDiscount = couponResult.discountPaise;
  if (remainingDiscount > 0 && couponResult.coupon) {
    const applicability = couponResult.coupon.resolvedApplicability();
    const applicableIds = couponResult.coupon.resolvedApplicableCourses().map(String);
    const eligible = eligibleSubtotalPaise(items, {
      applicability,
      applicableCourseIds: applicableIds,
    });
    for (let i = 0; i < items.length; i += 1) {
      const isEligible =
        applicability !== 'selected_courses' ||
        !applicableIds.length ||
        applicableIds.includes(String(items[i].courseId));
      if (!isEligible || eligible <= 0) {
        items[i].discountPaise = 0;
        items[i].itemTotalPaise = items[i].finalPricePaise + items[i].taxPaise;
        continue;
      }
      const share =
        i === items.length - 1 || remainingDiscount <= 0
          ? remainingDiscount
          : Math.floor((items[i].finalPricePaise * couponResult.discountPaise) / eligible);
      const applied = Math.min(share, remainingDiscount, items[i].finalPricePaise);
      items[i].discountPaise = applied;
      items[i].itemTotalPaise = Math.max(
        0,
        items[i].finalPricePaise - applied + items[i].taxPaise
      );
      remainingDiscount -= applied;
    }
    // Assign leftover paise to last eligible item
    if (remainingDiscount > 0) {
      for (let i = items.length - 1; i >= 0 && remainingDiscount > 0; i -= 1) {
        const room = items[i].finalPricePaise - (items[i].discountPaise || 0);
        if (room <= 0) continue;
        const add = Math.min(room, remainingDiscount);
        items[i].discountPaise += add;
        items[i].itemTotalPaise = Math.max(
          0,
          items[i].finalPricePaise - items[i].discountPaise + items[i].taxPaise
        );
        remainingDiscount -= add;
      }
    }
  }

  const discountPaise = couponResult.discountPaise;
  const totalPaise = Math.max(0, subtotalPaise - discountPaise + taxPaise);

  const orderNumber = await allocateOrderNumber();
  const billing = {
    fullName:
      input.billing?.fullName ||
      `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
    email: input.billing?.email || req.user.email,
    phone: input.billing?.phone || req.user.phone || '',
    addressLine1: input.billing?.addressLine1 || '',
    addressLine2: input.billing?.addressLine2 || '',
    city: input.billing?.city || '',
    state: input.billing?.state || '',
    postalCode: input.billing?.postalCode || '',
    country: input.billing?.country || 'IN',
    gstin: input.billing?.gstin || '',
  };

  const order = new Order({
    orderNumber,
    studentId: req.user._id,
    items,
    billing,
    subtotalPaise,
    discountPaise,
    taxPaise,
    totalPaise,
    currency,
    orderStatus: 'pending',
    paymentStatus: totalPaise === 0 ? 'captured' : 'pending',
    paymentGateway: totalPaise === 0 ? 'none' : 'none',
    couponId: couponResult.coupon?._id || null,
    couponSnapshot: couponResult.snapshot,
  });
  order.pushHistory({
    action: 'order_created',
    toStatus: 'pending',
    toPaymentStatus: order.paymentStatus,
    actorId: req.user._id,
    source: 'student',
    meta: couponResult.coupon
      ? { couponCode: couponResult.coupon.code, discountPaise }
      : null,
  });
  await order.save();

  if (couponResult.coupon) {
    await reserveCouponUsage({
      coupon: couponResult.coupon,
      studentId: req.user._id,
      orderId: order._id,
      discountPaise,
      currency,
    });
  }

  if (input.useCart || input.clearCart) {
    await clearCartForStudent(req.user._id);
  }

  await invalidateCommerceCaches({ studentId: req.user._id.toString() });

  // Free / 100% discount → fulfill immediately (no gateway)
  if (totalPaise === 0) {
    await fulfillFreeOrder(order, req.user);
    await consumeCouponUsage(order._id);
    const refreshed = await Order.findById(order._id);
    return {
      order: refreshed.toSafeObject(),
      requiresPayment: false,
      message: 'Free enrollment activated',
    };
  }

  return {
    order: order.toSafeObject(),
    requiresPayment: true,
    message: 'Pending order created — continue with payment',
  };
}
