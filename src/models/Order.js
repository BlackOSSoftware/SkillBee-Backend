import mongoose from 'mongoose';

export const ORDER_STATUSES = Object.freeze([
  'pending',
  'processing',
  'completed',
  'cancelled',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const PAYMENT_STATUSES = Object.freeze([
  'pending',
  'authorized',
  'captured',
  'failed',
  'partially_refunded',
  'refunded',
]);

const orderItemSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    courseNameSnapshot: { type: String, required: true },
    courseSlugSnapshot: { type: String, required: true },
    courseThumbnailSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    regularPriceSnapshot: { type: Number, required: true, min: 0 },
    salePriceSnapshot: { type: Number, default: null },
    finalPriceMajor: { type: Number, required: true, min: 0 },
    finalPricePaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    discountPaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    itemTotalPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const billingSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, maxlength: 200, default: '' },
    email: { type: String, trim: true, maxlength: 200, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    addressLine1: { type: String, trim: true, maxlength: 300, default: '' },
    addressLine2: { type: String, trim: true, maxlength: 300, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    country: { type: String, trim: true, maxlength: 100, default: 'IN' },
    gstin: { type: String, trim: true, maxlength: 30, default: '' },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    fromPaymentStatus: { type: String, default: null },
    toPaymentStatus: { type: String, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, default: 'system' },
    reason: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, uppercase: true },
    invoiceNumber: { type: String, default: null, index: true },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: { type: [orderItemSchema], required: true },
    billing: { type: billingSchema, default: () => ({}) },
    subtotalPaise: { type: Number, required: true, min: 0 },
    discountPaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    paymentGateway: {
      type: String,
      enum: ['razorpay', 'paypal', 'none'],
      default: 'none',
      index: true,
    },
    /** Currency actually charged at the gateway (may differ from item currency after FX). */
    paymentCurrency: { type: String, default: null },
    /** Minor units charged at the gateway. */
    paymentAmountMinor: { type: Number, default: null, min: 0 },
    fxSnapshot: {
      type: new mongoose.Schema(
        {
          fromCurrency: { type: String },
          toCurrency: { type: String },
          rate: { type: String },
          source: { type: String, default: 'env' },
          originalAmountMinor: { type: Number },
          convertedAmountMinor: { type: Number },
          convertedAt: { type: Date },
        },
        { _id: false }
      ),
      default: null,
    },
    gatewayOrderId: { type: String, default: null, index: true },
    gatewayPaymentId: { type: String, default: null, index: true },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    couponSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    fulfillmentStatus: {
      type: String,
      enum: ['pending', 'fulfilled', 'partial', 'failed'],
      default: 'pending',
      index: true,
    },
    invoiceStorageKey: { type: String, default: null },
    invoiceFileName: { type: String, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    history: { type: [historySchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

orderSchema.index({ studentId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ 'items.courseId': 1, createdAt: -1 });

orderSchema.methods.pushHistory = function pushHistory(event) {
  this.history.push({
    action: event.action,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus ?? null,
    fromPaymentStatus: event.fromPaymentStatus ?? null,
    toPaymentStatus: event.toPaymentStatus ?? null,
    actorId: event.actorId ?? null,
    source: event.source || 'system',
    reason: event.reason ?? null,
    meta: event.meta ?? null,
    at: event.at || new Date(),
  });
  if (this.history.length > 100) this.history = this.history.slice(-100);
};

orderSchema.methods.toSafeObject = function toSafeObject({ includeAdmin = false } = {}) {
  const base = {
    id: this._id.toString(),
    orderNumber: this.orderNumber,
    invoiceNumber: this.invoiceNumber,
    studentId: this.studentId.toString(),
    items: this.items.map((i) => ({
      courseId: i.courseId.toString(),
      courseName: i.courseNameSnapshot,
      courseSlug: i.courseSlugSnapshot,
      courseThumbnail: i.courseThumbnailSnapshot,
      regularPrice: i.regularPriceSnapshot,
      salePrice: i.salePriceSnapshot,
      finalPrice: i.finalPriceMajor,
      finalPricePaise: i.finalPricePaise,
      currency: i.currency,
      discountPaise: i.discountPaise,
      taxPaise: i.taxPaise,
      itemTotalPaise: i.itemTotalPaise,
    })),
    billing: this.billing,
    subtotalPaise: this.subtotalPaise,
    discountPaise: this.discountPaise,
    taxPaise: this.taxPaise,
    totalPaise: this.totalPaise,
    totalAmount: Number((this.totalPaise / 100).toFixed(2)),
    currency: this.currency,
    orderStatus: this.orderStatus,
    paymentStatus: this.paymentStatus,
    paymentGateway: this.paymentGateway,
    paymentCurrency: this.paymentCurrency,
    paymentAmountMinor: this.paymentAmountMinor,
    fxSnapshot: this.fxSnapshot
      ? {
          fromCurrency: this.fxSnapshot.fromCurrency,
          toCurrency: this.fxSnapshot.toCurrency,
          rate: this.fxSnapshot.rate,
          source: this.fxSnapshot.source,
          originalAmountMinor: this.fxSnapshot.originalAmountMinor,
          convertedAmountMinor: this.fxSnapshot.convertedAmountMinor,
          convertedAt: this.fxSnapshot.convertedAt,
        }
      : null,
    gatewayOrderId: this.gatewayOrderId,
    gatewayPaymentId: this.gatewayPaymentId,
    couponSnapshot: this.couponSnapshot,
    fulfillmentStatus: this.fulfillmentStatus,
    completedAt: this.completedAt,
    cancelledAt: this.cancelledAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeAdmin) {
    base.invoiceStorageKey = this.invoiceStorageKey;
    base.invoiceFileName = this.invoiceFileName;
    base.notes = this.notes;
  }
  return base;
};

export const Order = mongoose.model('Order', orderSchema);
