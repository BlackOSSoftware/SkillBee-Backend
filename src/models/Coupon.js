import mongoose from 'mongoose';

/** Spec uses percentage; percent kept for backward compatibility */
export const COUPON_DISCOUNT_TYPES = Object.freeze(['percentage', 'fixed', 'percent']);
export const COUPON_APPLICABILITY = Object.freeze(['all_courses', 'selected_courses']);

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    discountType: { type: String, enum: COUPON_DISCOUNT_TYPES, required: true },
    /** Major units for fixed; 0–100 for percentage */
    discountValue: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    /** Major units */
    minimumOrderAmount: { type: Number, min: 0, default: 0 },
    /** Cap for percentage discounts (major units); null = no cap */
    maximumDiscountAmount: { type: Number, min: 0, default: null },
    usageLimit: { type: Number, min: 0, default: null },
    perUserLimit: { type: Number, min: 0, default: 1 },
    /** Permanently consumed redemptions */
    usedCount: { type: Number, min: 0, default: 0 },
    /** Soft holds for pending/processing orders (not yet paid) */
    reservedCount: { type: Number, min: 0, default: 0 },
    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    applicability: {
      type: String,
      enum: COUPON_APPLICABILITY,
      default: 'all_courses',
    },
    applicableCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    auditLog: [
      {
        action: { type: String },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
    deletedAt: { type: Date, default: null },
    // Legacy aliases kept for older documents (read via getters in service)
    minimumPurchaseMajor: { type: Number, min: 0, default: undefined },
    perStudentLimit: { type: Number, min: 0, default: undefined },
    courseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    startsAt: { type: Date, default: undefined },
    expiresAt: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false }
);

couponSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
couponSchema.index({ isActive: 1, expiryDate: 1 });
couponSchema.index({ isActive: 1, startDate: 1 });
couponSchema.index({ deletedAt: 1, createdAt: -1 });

couponSchema.methods.normalizedDiscountType = function normalizedDiscountType() {
  return this.discountType === 'percent' ? 'percentage' : this.discountType;
};

couponSchema.methods.resolvedStartDate = function resolvedStartDate() {
  return this.startDate || this.startsAt || null;
};

couponSchema.methods.resolvedExpiryDate = function resolvedExpiryDate() {
  return this.expiryDate || this.expiresAt || null;
};

couponSchema.methods.resolvedMinimumOrderAmount = function resolvedMinimumOrderAmount() {
  if (this.minimumOrderAmount != null) return this.minimumOrderAmount;
  if (this.minimumPurchaseMajor != null) return this.minimumPurchaseMajor;
  return 0;
};

couponSchema.methods.resolvedPerUserLimit = function resolvedPerUserLimit() {
  if (this.perUserLimit != null) return this.perUserLimit;
  if (this.perStudentLimit != null) return this.perStudentLimit;
  return 1;
};

couponSchema.methods.resolvedApplicableCourses = function resolvedApplicableCourses() {
  if (this.applicableCourses?.length) return this.applicableCourses;
  if (this.courseIds?.length) return this.courseIds;
  return [];
};

couponSchema.methods.resolvedApplicability = function resolvedApplicability() {
  if (this.applicability) return this.applicability;
  return this.resolvedApplicableCourses().length ? 'selected_courses' : 'all_courses';
};

couponSchema.methods.toSafeObject = function toSafeObject({ includeAdmin = false } = {}) {
  const base = {
    id: this._id.toString(),
    code: this.code,
    description: this.description,
    discountType: this.normalizedDiscountType(),
    discountValue: this.discountValue,
    currency: this.currency,
    minimumOrderAmount: this.resolvedMinimumOrderAmount(),
    maximumDiscountAmount: this.maximumDiscountAmount,
    usageLimit: this.usageLimit,
    perUserLimit: this.resolvedPerUserLimit(),
    usedCount: this.usedCount,
    reservedCount: this.reservedCount || 0,
    startDate: this.resolvedStartDate(),
    expiryDate: this.resolvedExpiryDate(),
    applicability: this.resolvedApplicability(),
    applicableCourses: this.resolvedApplicableCourses().map((id) => id.toString()),
    isActive: this.isActive && !this.deletedAt,
  };
  if (includeAdmin) {
    base.createdBy = this.createdBy?.toString?.() || this.createdBy || null;
    base.updatedBy = this.updatedBy?.toString?.() || this.updatedBy || null;
    base.deletedAt = this.deletedAt;
    base.createdAt = this.createdAt;
    base.updatedAt = this.updatedAt;
  }
  return base;
};

export const Coupon = mongoose.model('Coupon', couponSchema);
