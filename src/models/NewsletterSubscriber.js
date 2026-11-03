import mongoose from 'mongoose';

export const NEWSLETTER_STATUS = Object.freeze({
  PENDING: 'pending',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
});

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    status: {
      type: String,
      enum: Object.values(NEWSLETTER_STATUS),
      default: NEWSLETTER_STATUS.PENDING,
      index: true,
    },
    verificationTokenHash: { type: String, default: null, select: false },
    verificationExpiresAt: { type: Date, default: null },
    unsubscribeTokenHash: { type: String, default: null, select: false },
    subscribedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    source: { type: String, trim: true, maxlength: 80, default: 'website' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

newsletterSubscriberSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
newsletterSubscriberSchema.index({ status: 1, createdAt: -1 });

newsletterSubscriberSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    email: this.email,
    status: this.status,
    subscribedAt: this.subscribedAt,
    unsubscribedAt: this.unsubscribedAt,
    source: this.source,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const NewsletterSubscriber = mongoose.model(
  'NewsletterSubscriber',
  newsletterSubscriberSchema
);
