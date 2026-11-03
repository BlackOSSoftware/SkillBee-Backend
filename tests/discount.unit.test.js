import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateDiscount,
  eligibleSubtotalPaise,
} from '../src/modules/commerce/services/discount.engine.js';

describe('Discount engine unit tests', () => {
  it('calculates percentage discount', () => {
    const r = calculateDiscount({
      discountType: 'percentage',
      discountValue: 10,
      eligibleSubtotalPaise: 100000,
      currency: 'INR',
    });
    assert.equal(r.discountPaise, 10000);
    assert.equal(r.finalPaise, 90000);
  });

  it('caps percentage with maximumDiscountAmount', () => {
    const r = calculateDiscount({
      discountType: 'percentage',
      discountValue: 50,
      eligibleSubtotalPaise: 100000,
      maximumDiscountAmountMajor: 100,
      currency: 'INR',
    });
    assert.equal(r.discountPaise, 10000);
  });

  it('calculates fixed discount and never exceeds subtotal', () => {
    const r = calculateDiscount({
      discountType: 'fixed',
      discountValue: 6000,
      eligibleSubtotalPaise: 500000,
      currency: 'INR',
    });
    // 6000 INR = 600000 paise, capped to subtotal 500000
    assert.equal(r.discountPaise, 500000);
    assert.equal(r.finalPaise, 0);
  });

  it('supports 100% discount', () => {
    const r = calculateDiscount({
      discountType: 'percent',
      discountValue: 100,
      eligibleSubtotalPaise: 25000,
      currency: 'INR',
    });
    assert.equal(r.discountPaise, 25000);
    assert.equal(r.finalPaise, 0);
  });

  it('rejects negative discount values', () => {
    assert.throws(
      () =>
        calculateDiscount({
          discountType: 'fixed',
          discountValue: -1,
          eligibleSubtotalPaise: 1000,
        }),
      /negative/i
    );
  });

  it('rejects percentage over 100', () => {
    assert.throws(
      () =>
        calculateDiscount({
          discountType: 'percentage',
          discountValue: 101,
          eligibleSubtotalPaise: 1000,
        }),
      /100/
    );
  });

  it('eligible subtotal respects selected courses', () => {
    const items = [
      { courseId: 'a', finalPricePaise: 10000 },
      { courseId: 'b', finalPricePaise: 20000 },
    ];
    assert.equal(
      eligibleSubtotalPaise(items, {
        applicability: 'selected_courses',
        applicableCourseIds: ['b'],
      }),
      20000
    );
    assert.equal(
      eligibleSubtotalPaise(items, { applicability: 'all_courses', applicableCourseIds: [] }),
      30000
    );
  });
});
