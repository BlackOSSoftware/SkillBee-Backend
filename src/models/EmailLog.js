import mongoose from 'mongoose';

export const EMAIL_LOG_STATUS = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
});

const emailLogSchema = new mongoose.Schema(
  {
    recipient: { type: String, required: true, trim: true, lowercase: true, index: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
    templateSlug: { type: String, trim: true, maxlength: 80, default: '' },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    eventType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    status: {
      type: String,
      enum: Object.values(EMAIL_LOG_STATUS),
      default: EMAIL_LOG_STATUS.QUEUED,
      index: true,
    },
    providerMessageId: { type: String, trim: true, maxlength: 200, default: null },
    attempts: { type: Number, min: 0, default: 0 },
    lastError: { type: String, trim: true, maxlength: 1000, default: null },
    sentAt: { type: Date, default: null },
    /** Idempotency key for business event */
    eventKey: { type: String, trim: true, maxlength: 200, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, versionKey: false }
);

emailLogSchema.index(
  { eventKey: 1 },
  { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } }
);
emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });

emailLogSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    recipient: this.recipient,
    templateId: this.templateId?.toString?.() || null,
    templateSlug: this.templateSlug,
    subject: this.subject,
    eventType: this.eventType,
    status: this.status,
    providerMessageId: this.providerMessageId,
    attempts: this.attempts,
    lastError: this.lastError,
    sentAt: this.sentAt,
    eventKey: this.eventKey,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const EmailLog = mongoose.model('EmailLog', emailLogSchema);
