import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'razorpay' },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true, index: true },
    payloadDigest: { type: String, default: null },
    processingStatus: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'failed'],
      default: 'received',
      index: true,
    },
    errorMessage: { type: String, default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
