import { Coupon } from '../../../models/Coupon.js';
import { CouponUsage } from '../../../models/CouponUsage.js';
import { Order } from '../../../models/Order.js';
import { User } from '../../../models/User.js';
import { Course } from '../../../models/Course.js';
import { AppError } from '../../../utils/AppError.js';
import { toMinorUnits, fromMinorUnits, sumMinor } from '../../../utils/money.js';
import { calculateDiscount, eligibleSubtotalPaise } from './discount.engine.js';
import {
  assertNotAlreadyEnrolled,
  buildOrderItemSnapshot,
  loadPurchasableCourses,
} from './pricing.service.js';
import { deleteCache } from '../../../services/cache/cache.service.js';

const COUPON_META_PREFIX = 'coupon:meta:';

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase();
}

function assertCouponShape(input, { isUpdate = false } = {}) {
  const type = input.discountType === 'percent' ? 'percentage' : input.discountType;
  if (!isUpdate || input.discountType !== undefined) {
    if (!['percentage', 'fixed'].includes(type)) {
      throw new AppError('discountType must be percentage or fixed', 400, 'VALIDATION_ERROR');
    }
  }
  if (input.discountValue !== undefined) {
    if (Number(input.discountValue) < 0) {
      throw new AppError('discountValue cannot be negative', 400, 'VALIDATION_ERROR');
    }
    if (type === 'percentage' && Number(input.discountValue) > 100) {
      throw new AppError('percentage discount cannot exceed 100', 400, 'VALIDATION_ERROR');
    }
  }
  if (input.minimumOrderAmount !== undefined && Number(input.minimumOrderAmount) < 0) {
    throw new AppError('minimumOrderAmount cannot be negative', 400, 'VALIDATION_ERROR');
  }
  if (
    input.maximumDiscountAmount != null &&
    input.maximumDiscountAmount !== undefined &&
    Number(input.maximumDiscountAmount) < 0
  ) {
    throw new AppError('maximumDiscountAmount cannot be negative', 400, 'VALIDATION_ERROR');
  }
  if (input.startDate && input.expiryDate) {
    if (new Date(input.expiryDate) <= new Date(input.startDate)) {
      throw new AppError('expiryDate must be after startDate', 400, 'VALIDATION_ERROR');
    }
  }
  if (input.applicability === 'selected_courses') {
    const courses = input.applicableCourses || [];
    if (!courses.length) {
      throw new AppError(
        'applicableCourses required when applicability is selected_courses',
        400,
        'VALIDATION_ERROR'
      );
    }
  }
}

async function invalidateCouponCache(code) {
  if (code) await deleteCache(`${COUPON_META_PREFIX}${normalizeCode(code)}`);
}

export async function createCoupon(req, input) {
  assertCouponShape(input);
  const code = normalizeCode(input.code);
  if (!code || code.length < 3) {
    throw new AppError('Coupon code must be at least 3 characters', 400, 'VALIDATION_ERROR');
  }

  const existing = await Coupon.findOne({ code, deletedAt: null });
  if (existing) throw new AppError('Coupon code already exists', 409, 'COUPON_DUPLICATE');

  if (input.applicableCourses?.length) {
    const count = await Course.countDocuments({
      _id: { $in: input.applicableCourses },
      deletedAt: null,
    });
    if (count !== input.applicableCourses.length) {
      throw new AppError('One or more applicable courses are invalid', 400, 'INVALID_COURSES');
    }
  }

  const coupon = await Coupon.create({
    code,
    description: input.description || '',
    discountType: input.discountType === 'percent' ? 'percentage' : input.discountType,
    discountValue: input.discountValue,
    currency: input.currency || 'INR',
    minimumOrderAmount: input.minimumOrderAmount ?? 0,
    maximumDiscountAmount: input.maximumDiscountAmount ?? null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? 1,
    startDate: input.startDate || null,
    expiryDate: input.expiryDate || null,
    applicability: input.applicability || 'all_courses',
    applicableCourses: input.applicableCourses || [],
    isActive: input.isActive !== false,
    createdBy: req.user._id,
    updatedBy: req.user._id,
    auditLog: [{ action: 'created', actorId: req.user._id, meta: { code } }],
  });

  await invalidateCouponCache(code);
  return coupon.toSafeObject({ includeAdmin: true });
}

export async function listCoupons(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { deletedAt: null };
  const now = new Date();

  if (query.isActive === 'true' || query.isActive === true) filter.isActive = true;
  if (query.isActive === 'false' || query.isActive === false) filter.isActive = false;
  if (query.discountType) {
    filter.discountType =
      query.discountType === 'percent' ? 'percentage' : query.discountType;
  }
  if (query.expired === 'true' || query.expired === true) {
    filter.expiryDate = { $lt: now };
  }
  if (query.upcoming === 'true' || query.upcoming === true) {
    filter.startDate = { $gt: now };
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ code: rx }, { description: rx }];
  }

  const [rows, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Coupon.countDocuments(filter),
  ]);

  return {
    coupons: rows.map((c) => c.toSafeObject({ includeAdmin: true })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getCoupon(id) {
  const coupon = await Coupon.findOne({ _id: id, deletedAt: null });
  if (!coupon) throw new AppError('Coupon not found', 404, 'COUPON_NOT_FOUND');
  return coupon.toSafeObject({ includeAdmin: true });
}

export async function updateCoupon(req, id, input) {
  const coupon = await Coupon.findOne({ _id: id, deletedAt: null });
  if (!coupon) throw new AppError('Coupon not found', 404, 'COUPON_NOT_FOUND');

  assertCouponShape(
    { ...coupon.toObject(), ...input, discountType: input.discountType || coupon.discountType },
    { isUpdate: true }
  );

  // Never change code if already used (preserves historical order snapshots linkage clarity)
  if (input.code && normalizeCode(input.code) !== coupon.code) {
    if (coupon.usedCount > 0 || coupon.reservedCount > 0) {
      throw new AppError(
        'Cannot change code of a coupon that has been used or reserved',
        400,
        'COUPON_IMMUTABLE_CODE'
      );
    }
    const code = normalizeCode(input.code);
    const dup = await Coupon.findOne({ code, deletedAt: null, _id: { $ne: coupon._id } });
    if (dup) throw new AppError('Coupon code already exists', 409, 'COUPON_DUPLICATE');
    await invalidateCouponCache(coupon.code);
    coupon.code = code;
  }

  // Do not rewrite historical financial meaning of discount for heavily used coupons —
  // allow admin updates but warn via allowing only safe fields when consumed
  const mutableAlways = [
    'description',
    'isActive',
    'expiryDate',
    'startDate',
    'usageLimit',
    'perUserLimit',
    'maximumDiscountAmount',
    'minimumOrderAmount',
    'applicability',
    'applicableCourses',
  ];
  const mutableIfUnused = ['discountType', 'discountValue', 'currency'];

  for (const key of mutableAlways) {
    if (input[key] !== undefined) coupon[key] = input[key];
  }
  if (coupon.usedCount === 0) {
    for (const key of mutableIfUnused) {
      if (input[key] !== undefined) {
        coupon[key] = key === 'discountType' && input[key] === 'percent' ? 'percentage' : input[key];
      }
    }
  } else if (mutableIfUnused.some((k) => input[k] !== undefined)) {
    throw new AppError(
      'Cannot change discount type/value/currency after the coupon has been used',
      400,
      'COUPON_IMMUTABLE_DISCOUNT'
    );
  }

  if (coupon.applicability === 'selected_courses' && !(coupon.applicableCourses?.length)) {
    throw new AppError(
      'applicableCourses required when applicability is selected_courses',
      400,
      'VALIDATION_ERROR'
    );
  }

  coupon.updatedBy = req.user._id;
  coupon.auditLog = coupon.auditLog || [];
  coupon.auditLog.push({
    action: 'updated',
    actorId: req.user._id,
    meta: { fields: Object.keys(input || {}) },
  });
  await coupon.save();
  await invalidateCouponCache(coupon.code);
  return coupon.toSafeObject({ includeAdmin: true });
}

export async function deactivateCoupon(req, id) {
  const coupon = await Coupon.findOne({ _id: id, deletedAt: null });
  if (!coupon) throw new AppError('Coupon not found', 404, 'COUPON_NOT_FOUND');

  // Soft-delete / deactivate — never hard-delete used coupons
  coupon.isActive = false;
  if (coupon.usedCount > 0 || coupon.reservedCount > 0) {
    coupon.deletedAt = new Date();
  } else {
    coupon.deletedAt = new Date();
  }
  coupon.updatedBy = req.user._id;
  coupon.auditLog = coupon.auditLog || [];
  coupon.auditLog.push({ action: 'deactivated', actorId: req.user._id });
  await coupon.save();
  await invalidateCouponCache(coupon.code);
  return { id: coupon._id.toString(), deactivated: true };
}

async function loadCouponByCode(code) {
  // Always load from MongoDB for validation/redemption (source of truth).
  // Metadata cache key is invalidated on admin mutations for any future readers.
  const normalized = normalizeCode(code);
  return Coupon.findOne({ code: normalized, deletedAt: null });
}

/**
 * Core validation + discount calc. Does not reserve usage.
 */
export async function evaluateCoupon({
  code,
  studentId,
  items,
  currency = 'INR',
  ignoreUsageReservation = false,
}) {
  if (!code) {
    return {
      discountPaise: 0,
      coupon: null,
      snapshot: null,
      eligibleSubtotalPaise: sumMinor(items.map((i) => i.finalPricePaise)),
    };
  }

  const coupon = await loadCouponByCode(code);
  if (!coupon || !coupon.isActive || coupon.deletedAt) {
    throw new AppError('Invalid coupon code', 400, 'COUPON_INVALID');
  }

  const now = new Date();
  const start = coupon.resolvedStartDate();
  const expiry = coupon.resolvedExpiryDate();
  if (start && start > now) {
    throw new AppError('Coupon is not active yet', 400, 'COUPON_NOT_STARTED');
  }
  if (expiry && expiry < now) {
    throw new AppError('Coupon has expired', 400, 'COUPON_EXPIRED');
  }

  // Live Mongo counts — never trust cached usedCount alone for redemption
  const fresh = await Coupon.findById(coupon._id).select('usedCount reservedCount usageLimit');
  const used = fresh?.usedCount || 0;
  const reserved = fresh?.reservedCount || 0;
  if (fresh?.usageLimit != null && used + reserved >= fresh.usageLimit) {
    throw new AppError('Coupon usage limit reached', 400, 'COUPON_LIMIT');
  }

  const applicability = coupon.resolvedApplicability();
  const applicableCourses = coupon.resolvedApplicableCourses();
  if (applicability === 'selected_courses') {
    const allowed = new Set(applicableCourses.map((id) => id.toString()));
    const ok = items.some((i) => allowed.has(String(i.courseId)));
    if (!ok) throw new AppError('Coupon not valid for selected courses', 400, 'COUPON_COURSE');
  }

  const eligible = eligibleSubtotalPaise(items, {
    applicability,
    applicableCourseIds: applicableCourses,
  });

  const minMajor = coupon.resolvedMinimumOrderAmount();
  const minPaise = toMinorUnits(minMajor || 0, currency);
  // Minimum applies to full cart subtotal (business rule) — eligible for discount calc
  const cartSubtotal = sumMinor(items.map((i) => i.finalPricePaise));
  if (cartSubtotal < minPaise) {
    throw new AppError('Order does not meet coupon minimum', 400, 'COUPON_MINIMUM');
  }

  const perUser = coupon.resolvedPerUserLimit();
  if (perUser != null && studentId) {
    const usedByStudent = await CouponUsage.countDocuments({
      couponId: coupon._id,
      userId: studentId,
      status: { $in: ignoreUsageReservation ? ['consumed'] : ['reserved', 'consumed'] },
    });
    if (usedByStudent >= perUser) {
      throw new AppError('Coupon already used by this student', 400, 'COUPON_STUDENT_LIMIT');
    }
  }

  const calc = calculateDiscount({
    discountType: coupon.normalizedDiscountType(),
    discountValue: coupon.discountValue,
    eligibleSubtotalPaise: eligible,
    currency: coupon.currency || currency,
    maximumDiscountAmountMajor: coupon.maximumDiscountAmount,
  });

  const snapshot = {
    couponId: coupon._id.toString(),
    code: coupon.code,
    discountType: coupon.normalizedDiscountType(),
    discountValue: coupon.discountValue,
    originalSubtotalPaise: cartSubtotal,
    originalSubtotal: fromMinorUnits(cartSubtotal, currency),
    eligibleSubtotalPaise: eligible,
    discountPaise: calc.discountPaise,
    discountAmount: calc.discountAmount,
    finalAmountPaise: Math.max(0, cartSubtotal - calc.discountPaise),
    finalAmount: fromMinorUnits(Math.max(0, cartSubtotal - calc.discountPaise), currency),
    currency: coupon.currency || currency,
    maximumDiscountAmount: coupon.maximumDiscountAmount,
  };

  return {
    discountPaise: calc.discountPaise,
    coupon,
    snapshot,
    eligibleSubtotalPaise: eligible,
    cartSubtotalPaise: cartSubtotal,
  };
}

/** Checkout-compatible alias */
export async function validateAndApplyCoupon({
  code,
  studentId,
  items,
  subtotalPaise,
  currency = 'INR',
}) {
  void subtotalPaise;
  return evaluateCoupon({ code, studentId, items, currency });
}

/**
 * Student-facing validate API — prices from MongoDB only.
 */
export async function validateCouponForStudent(req, { couponCode, courseIds }) {
  for (const forbidden of ['subtotal', 'discountAmount', 'finalAmount', 'prices', 'totalAmount']) {
    if (req.body?.[forbidden] !== undefined) {
      throw new AppError(`Field ${forbidden} is not accepted`, 400, 'TRUST_VIOLATION');
    }
  }
  const ids = [...new Set((courseIds || []).map(String))];
  if (!ids.length) throw new AppError('courseIds required', 400, 'VALIDATION_ERROR');
  if (!couponCode) throw new AppError('couponCode required', 400, 'VALIDATION_ERROR');

  for (const id of ids) {
    await assertNotAlreadyEnrolled(req.user._id, id);
  }
  const courses = await loadPurchasableCourses(ids);
  const items = courses.map((c) => buildOrderItemSnapshot(c));
  const currency = items[0]?.currency || 'INR';

  const result = await evaluateCoupon({
    code: couponCode,
    studentId: req.user._id,
    items,
    currency,
  });

  return {
    valid: true,
    currency,
    originalSubtotal: fromMinorUnits(result.cartSubtotalPaise, currency),
    originalSubtotalPaise: result.cartSubtotalPaise,
    discountAmount: fromMinorUnits(result.discountPaise, currency),
    discountAmountPaise: result.discountPaise,
    finalPayableAmount: fromMinorUnits(
      Math.max(0, result.cartSubtotalPaise - result.discountPaise),
      currency
    ),
    finalPayableAmountPaise: Math.max(0, result.cartSubtotalPaise - result.discountPaise),
    coupon: {
      code: result.coupon.code,
      discountType: result.coupon.normalizedDiscountType(),
      discountValue: result.coupon.discountValue,
      currency: result.coupon.currency,
    },
  };
}

/**
 * Atomically reserve coupon capacity for an order.
 */
export async function reserveCouponUsage({
  coupon,
  studentId,
  orderId,
  discountPaise,
  currency,
}) {
  if (!coupon || !orderId) return null;

  const existing = await CouponUsage.findOne({ orderId });
  if (existing) return existing;

  if (coupon.usageLimit != null) {
    const updated = await Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        deletedAt: null,
        isActive: true,
        $expr: {
          $lt: [{ $add: ['$usedCount', '$reservedCount'] }, '$usageLimit'],
        },
      },
      { $inc: { reservedCount: 1 } },
      { new: true }
    );
    if (!updated) {
      throw new AppError('Coupon usage limit reached', 400, 'COUPON_LIMIT');
    }
  } else {
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { reservedCount: 1 } });
  }

  try {
    return await CouponUsage.create({
      couponId: coupon._id,
      userId: studentId,
      orderId,
      couponCode: coupon.code,
      discountAmountPaise: discountPaise,
      currency,
      status: 'reserved',
      appliedAt: new Date(),
    });
  } catch (err) {
    // Duplicate orderId — concurrent reserve
    if (err?.code === 11000) {
      await Coupon.updateOne(
        { _id: coupon._id, reservedCount: { $gt: 0 } },
        { $inc: { reservedCount: -1 } }
      );
      return CouponUsage.findOne({ orderId });
    }
    await Coupon.updateOne(
      { _id: coupon._id, reservedCount: { $gt: 0 } },
      { $inc: { reservedCount: -1 } }
    );
    throw err;
  }
}

/** Convert reservation → consumed after verified payment (idempotent). */
export async function consumeCouponUsage(orderId) {
  if (!orderId) return;
  const usage = await CouponUsage.findOne({ orderId });
  if (!usage) {
    // Legacy orders without CouponUsage — fall back to increment once via order flag
    return;
  }
  if (usage.status === 'consumed') return usage;
  if (usage.status === 'released' || usage.status === 'failed') return usage;

  usage.status = 'consumed';
  usage.consumedAt = new Date();
  await usage.save();

  await Coupon.updateOne(
    { _id: usage.couponId },
    {
      $inc: { usedCount: 1, reservedCount: -1 },
    }
  );
  // Clamp reservedCount >= 0
  await Coupon.updateOne(
    { _id: usage.couponId, reservedCount: { $lt: 0 } },
    { $set: { reservedCount: 0 } }
  );
  await invalidateCouponCache(usage.couponCode);
  return usage;
}

/** Release reservation on failed/cancelled payment (idempotent). */
export async function releaseCouponUsage(orderId, { status = 'released' } = {}) {
  if (!orderId) return;
  const usage = await CouponUsage.findOne({ orderId });
  if (!usage) return;
  if (usage.status !== 'reserved') return usage;

  usage.status = status === 'failed' ? 'failed' : 'released';
  usage.releasedAt = new Date();
  await usage.save();

  await Coupon.updateOne(
    { _id: usage.couponId, reservedCount: { $gt: 0 } },
    { $inc: { reservedCount: -1 } }
  );
  await invalidateCouponCache(usage.couponCode);
  return usage;
}

/** @deprecated use consumeCouponUsage — kept for fulfillment import compat */
export async function incrementCouponUsage(couponId) {
  void couponId;
  // No-op: consumption is order-scoped via consumeCouponUsage
}

export async function listCouponUsage(couponId, query = {}) {
  const coupon = await Coupon.findOne({ _id: couponId, deletedAt: null });
  if (!coupon) throw new AppError('Coupon not found', 404, 'COUPON_NOT_FOUND');

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { couponId };
  if (query.status) filter.status = query.status;

  const [rows, total] = await Promise.all([
    CouponUsage.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CouponUsage.countDocuments(filter),
  ]);

  const userIds = [...new Set(rows.map((r) => String(r.userId)))];
  const orderIds = [...new Set(rows.map((r) => String(r.orderId)))];
  const [users, orders] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select('firstName lastName email')
      .lean(),
    Order.find({ _id: { $in: orderIds } })
      .select('orderNumber orderStatus paymentStatus')
      .lean(),
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const orderMap = new Map(orders.map((o) => [String(o._id), o]));

  return {
    usages: rows.map((r) => {
      const u = userMap.get(String(r.userId));
      const o = orderMap.get(String(r.orderId));
      return {
        id: String(r._id),
        couponCode: r.couponCode,
        discountAmountPaise: r.discountAmountPaise,
        discountAmount: Number((r.discountAmountPaise / 100).toFixed(2)),
        currency: r.currency,
        status: r.status,
        appliedAt: r.appliedAt,
        student: u
          ? {
              id: String(u._id),
              firstName: u.firstName,
              lastName: u.lastName,
              email: u.email,
            }
          : null,
        order: o
          ? {
              id: String(o._id),
              orderNumber: o.orderNumber,
              orderStatus: o.orderStatus,
              paymentStatus: o.paymentStatus,
            }
          : { id: String(r.orderId) },
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}
