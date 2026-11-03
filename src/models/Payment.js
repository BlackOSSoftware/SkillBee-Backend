import mongoose from 'mongoose';

export const GATEWAY_PAYMENT_STATUSES = Object.freeze([
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
]);

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['razorpay', 'paypal', 'none'],
      default: 'razorpay',
      index: true,
    },
    providerOrderId: { type: String, default: null, index: true },
    providerPaymentId: { type: String, default: null },
    /** Minor units (paise for INR, cents for USD). Named amountPaise for compatibility. */
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    checkoutUrl: { type: String, default: null },
    approveLinks: { type: [String], default: [] },
    paymentStatus: {
      type: String,
      enum: GATEWAY_PAYMENT_STATUSES,
      default: 'created',
      index: true,
    },
    paymentMethod: { type: String, default: null },
    signatureVerified: { type: Boolean, default: false },
    webhookVerified: { type: Boolean, default: false },
    failureCode: { type: String, default: null },
    failureDescription: { type: String, default: null },
    idempotencyKey: { type: String, required: true },
    capturedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    refundedPaise: { type: Number, default: 0, min: 0 },
    rawEventReference: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index(
  { providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } }
);

paymentSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    studentId: this.studentId.toString(),
    provider: this.provider,
    providerOrderId: this.providerOrderId,
    providerPaymentId: this.providerPaymentId,
    amountPaise: this.amountPaise,
    amountMinor: this.amountPaise,
    amount: Number((this.amountPaise / 100).toFixed(2)),
    currency: this.currency,
    checkoutUrl: this.checkoutUrl || null,
    paymentStatus: this.paymentStatus,
    paymentMethod: this.paymentMethod,
    signatureVerified: this.signatureVerified,
    webhookVerified: this.webhookVerified,
    failureCode: this.failureCode,
    failureDescription: this.failureDescription,
    capturedAt: this.capturedAt,
    failedAt: this.failedAt,
    refundedPaise: this.refundedPaise,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Payment = mongoose.model('Payment', paymentSchema);
