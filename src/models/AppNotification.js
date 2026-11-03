import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = Object.freeze([
  'account_created',
  'course_enrollment',
  'payment_successful',
  'payment_failed',
  'assignment_submitted',
  'assignment_evaluated',
  'quiz_result',
  'certificate_generated',
  'course_announcement',
  'password_reset',
  'custom',
  'qa_reply',
  'instructor_application',
  'referral_submitted',
  'blog_published',
  'newsletter_subscription',
]);

export const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  PARTIAL: 'partial',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

const appNotificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientRole: { type: String, trim: true, maxlength: 40, default: 'student' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    category: { type: String, trim: true, maxlength: 80, default: 'general' },
    data: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deliveryStatus: {
      type: String,
      enum: Object.values(DELIVERY_STATUS),
      default: DELIVERY_STATUS.PENDING,
    },
    deliveryMeta: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    /** Idempotency: unique per recipient+event */
    eventKey: { type: String, trim: true, maxlength: 200, default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

appNotificationSchema.index(
  { eventKey: 1, recipientId: 1 },
  {
    unique: true,
    partialFilterExpression: { eventKey: { $type: 'string' }, deletedAt: null },
  }
);
appNotificationSchema.index({ recipientId: 1, createdAt: -1 });
appNotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

appNotificationSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    recipientId: this.recipientId.toString(),
    recipientRole: this.recipientRole,
    title: this.title,
    message: this.message,
    type: this.type,
    category: this.category,
    data: this.data || {},
    isRead: this.isRead,
    readAt: this.readAt,
    createdBy: this.createdBy?.toString?.() || null,
    deliveryStatus: this.deliveryStatus,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const AppNotification = mongoose.model('AppNotification', appNotificationSchema);
