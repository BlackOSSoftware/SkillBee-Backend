import mongoose from 'mongoose';
import { QUESTION_STATUS } from '../config/security.js';

const courseQuestionSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseLesson',
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
      type: String,
      enum: Object.values(QUESTION_STATUS),
      default: QUESTION_STATUS.OPEN,
      index: true,
    },
    replyCount: { type: Number, min: 0, default: 0, index: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
    auditLog: [
      {
        action: { type: String, required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

courseQuestionSchema.index({ studentId: 1, createdAt: -1 });
courseQuestionSchema.index({ courseId: 1, status: 1, lastActivityAt: -1 });
courseQuestionSchema.index({ status: 1, replyCount: 1, lastActivityAt: -1 });

courseQuestionSchema.methods.pushAudit = function pushAudit(action, actorId, meta = {}) {
  this.auditLog = this.auditLog || [];
  this.auditLog.push({ action, actorId: actorId || null, at: new Date(), meta });
  if (this.auditLog.length > 50) this.auditLog = this.auditLog.slice(-50);
};

courseQuestionSchema.methods.toSafeObject = function toSafeObject({ includeAdmin = false } = {}) {
  const base = {
    id: this._id.toString(),
    courseId: this.courseId?.toString?.() || String(this.courseId),
    studentId: this.studentId?.toString?.() || String(this.studentId),
    lessonId: this.lessonId ? this.lessonId.toString() : null,
    title: this.title,
    description: this.description,
    status: this.status,
    replyCount: this.replyCount || 0,
    lastActivityAt: this.lastActivityAt,
    resolvedAt: this.resolvedAt,
    resolvedBy: this.resolvedBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeAdmin) {
    base.auditLog = this.auditLog || [];
    base.deletedAt = this.deletedAt;
  }
  return base;
};

export const CourseQuestion = mongoose.model('CourseQuestion', courseQuestionSchema);
