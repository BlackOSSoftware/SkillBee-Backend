import { percentOfMinor, toMinorUnits, fromMinorUnits } from '../../../utils/money.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * Pure discount calculation — used by validate, checkout, and order creation.
 * All amounts in minor units (paise/cents) unless noted as major.
 */
export function calculateDiscount({
  discountType,
  discountValue,
  eligibleSubtotalPaise,
  currency = 'INR',
  maximumDiscountAmountMajor = null,
}) {
  if (!Number.isInteger(eligibleSubtotalPaise) || eligibleSubtotalPaise < 0) {
    throw new AppError('Invalid subtotal for discount', 400, 'INVALID_SUBTOTAL');
  }

  const type = discountType === 'percent' ? 'percentage' : discountType;
  let discountPaise = 0;

  if (type === 'fixed') {
    if (Number(discountValue) < 0) {
      throw new AppError('Discount value cannot be negative', 400, 'INVALID_DISCOUNT');
    }
    discountPaise = toMinorUnits(discountValue, currency);
  } else if (type === 'percentage') {
    if (Number(discountValue) < 0 || Number(discountValue) > 100) {
      throw new AppError('Percentage discount must be between 0 and 100', 400, 'INVALID_DISCOUNT');
    }
    discountPaise = percentOfMinor(eligibleSubtotalPaise, discountValue);
    if (maximumDiscountAmountMajor != null && maximumDiscountAmountMajor !== '') {
      const cap = toMinorUnits(maximumDiscountAmountMajor, currency);
      if (cap >= 0) discountPaise = Math.min(discountPaise, cap);
    }
  } else {
    throw new AppError('Unsupported discount type', 400, 'INVALID_DISCOUNT_TYPE');
  }

  discountPaise = Math.min(discountPaise, eligibleSubtotalPaise);
  discountPaise = Math.max(0, discountPaise);
  const finalPaise = Math.max(0, eligibleSubtotalPaise - discountPaise);

  return {
    discountPaise,
    finalPaise,
    discountAmount: fromMinorUnits(discountPaise, currency),
    finalAmount: fromMinorUnits(finalPaise, currency),
    originalSubtotal: fromMinorUnits(eligibleSubtotalPaise, currency),
    originalSubtotalPaise: eligibleSubtotalPaise,
    currency,
  };
}

/**
 * Eligible subtotal = sum of item finals that match coupon course rules.
 */
export function eligibleSubtotalPaise(items, { applicability, applicableCourseIds }) {
  const ids = (applicableCourseIds || []).map(String);
  if (applicability === 'selected_courses' && ids.length) {
    const allowed = new Set(ids);
    return items
      .filter((i) => allowed.has(String(i.courseId)))
      .reduce((s, i) => s + (Number(i.finalPricePaise) || 0), 0);
  }
  return items.reduce((s, i) => s + (Number(i.finalPricePaise) || 0), 0);
}
