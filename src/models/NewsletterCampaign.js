import mongoose from 'mongoose';

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'draft',
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
});

const newsletterCampaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    htmlBody: { type: String, required: true, maxlength: 100000 },
    textBody: { type: String, required: true, maxlength: 50000 },
    status: {
      type: String,
      enum: Object.values(CAMPAIGN_STATUS),
      default: CAMPAIGN_STATUS.DRAFT,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stats: {
      queued: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skippedUnsubscribed: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    /** Prevent duplicate sends: recipient email hashes processed */
    deliveredEmails: { type: [String], default: [], select: false },
  },
  { timestamps: true, versionKey: false }
);

newsletterCampaignSchema.index({ createdAt: -1 });

newsletterCampaignSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    subject: this.subject,
    htmlBody: this.htmlBody,
    textBody: this.textBody,
    status: this.status,
    createdBy: this.createdBy?.toString?.() || null,
    stats: this.stats || {},
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const NewsletterCampaign = mongoose.model(
  'NewsletterCampaign',
  newsletterCampaignSchema
);
