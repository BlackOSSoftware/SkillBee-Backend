import mongoose from 'mongoose';
import { REVIEW_STATUS } from '../config/security.js';

const moderationEventSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['submitted', 'edited', 'approved', 'rejected', 'deleted', 'status_changed'],
      required: true,
    },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, maxlength: 2000, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const courseReviewSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    /** Student who wrote the review (API: userId) */
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseEnrollment',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer',
      },
    },
    title: { type: String, trim: true, maxlength: 150, default: '' },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: Object.values(REVIEW_STATUS),
      default: REVIEW_STATUS.PENDING,
      index: true,
    },
    rejectionReason: { type: String, trim: true, maxlength: 2000, default: null },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    /** Legacy aliases kept in sync with moderatedBy/At */
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    moderationHistory: { type: [moderationEventSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

courseReviewSchema.index(
  { studentId: 1, courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  }
);
courseReviewSchema.index({ courseId: 1, status: 1, createdAt: -1 });
courseReviewSchema.index({ status: 1, createdAt: -1 });
courseReviewSchema.index({ rating: 1, status: 1 });

courseReviewSchema.methods.pushModeration = function pushModeration(event) {
  this.moderationHistory = this.moderationHistory || [];
  this.moderationHistory.push({
    action: event.action,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus ?? null,
    actorId: event.actorId ?? null,
    reason: event.reason ?? null,
    at: event.at || new Date(),
  });
  if (this.moderationHistory.length > 50) {
    this.moderationHistory = this.moderationHistory.slice(-50);
  }
};

courseReviewSchema.methods.toSafeObject = function toSafeObject({
  includeAdmin = false,
  includeStudentPrivate = false,
} = {}) {
  const base = {
    id: this._id.toString(),
    userId: this.studentId?.toString?.() || this.studentId?.toString?.() || String(this.studentId),
    courseId: this.courseId.toString(),
    enrollmentId: this.enrollmentId?.toString?.() || null,
    rating: this.rating,
    title: this.title,
    comment: this.comment,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeAdmin || includeStudentPrivate) {
    base.rejectionReason = this.rejectionReason;
    base.moderatedBy = this.moderatedBy?.toString?.() || null;
    base.moderatedAt = this.moderatedAt;
  }
  if (includeAdmin) {
    base.moderationHistory = this.moderationHistory || [];
    base.deletedAt = this.deletedAt;
  }
  return base;
};

export const CourseReview = mongoose.model('CourseReview', courseReviewSchema);
