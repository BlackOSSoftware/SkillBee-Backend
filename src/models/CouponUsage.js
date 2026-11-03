import mongoose from 'mongoose';

export const COUPON_USAGE_STATUSES = Object.freeze([
  'reserved',
  'consumed',
  'released',
  'failed',
]);

const couponUsageSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    couponCode: { type: String, required: true, uppercase: true },
    discountAmountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: COUPON_USAGE_STATUSES,
      default: 'reserved',
      index: true,
    },
    appliedAt: { type: Date, default: Date.now },
    consumedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

/** One usage row per order (idempotent reserve) */
couponUsageSchema.index({ orderId: 1 }, { unique: true });
couponUsageSchema.index({ couponId: 1, userId: 1, status: 1 });
couponUsageSchema.index({ couponId: 1, status: 1, createdAt: -1 });

couponUsageSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    couponId: this.couponId.toString(),
    userId: this.userId.toString(),
    orderId: this.orderId.toString(),
    couponCode: this.couponCode,
    discountAmountPaise: this.discountAmountPaise,
    discountAmount: Number((this.discountAmountPaise / 100).toFixed(2)),
    currency: this.currency,
    status: this.status,
    appliedAt: this.appliedAt,
    consumedAt: this.consumedAt,
    releasedAt: this.releasedAt,
    createdAt: this.createdAt,
  };
};

export const CouponUsage = mongoose.model('CouponUsage', couponUsageSchema);
