import mongoose from 'mongoose';

export const REFUND_STATUSES = Object.freeze([
  'initiated',
  'processed',
  'failed',
]);

const refundSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: REFUND_STATUSES, default: 'initiated', index: true },
    providerRefundId: { type: String, default: null, index: true },
    reason: { type: String, trim: true, maxlength: 2000, default: '' },
    revokeEnrollment: { type: Boolean, default: false },
    enrollmentRevoked: { type: Boolean, default: false },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    failureDescription: { type: String, default: null },
    processedAt: { type: Date, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true, versionKey: false }
);

refundSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    paymentId: this.paymentId.toString(),
    studentId: this.studentId.toString(),
    amountPaise: this.amountPaise,
    amount: Number((this.amountPaise / 100).toFixed(2)),
    currency: this.currency,
    status: this.status,
    providerRefundId: this.providerRefundId,
    reason: this.reason,
    revokeEnrollment: this.revokeEnrollment,
    enrollmentRevoked: this.enrollmentRevoked,
    processedAt: this.processedAt,
    createdAt: this.createdAt,
  };
};

export const Refund = mongoose.model('Refund', refundSchema);
