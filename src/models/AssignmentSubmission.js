import mongoose from 'mongoose';
import { SUBMISSION_STATUS } from '../config/security.js';

const attachmentSchema = new mongoose.Schema(
  {
    mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    originalFileName: { type: String, required: true },
    storedFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    extension: { type: String, default: null },
    sizeBytes: { type: Number, min: 0, required: true },
    checksum: { type: String, default: null },
    storageKey: { type: String, required: true },
    // Never expose absolute paths — storageKey is relative under UPLOAD_ROOT
  },
  { _id: true }
);

const evaluationHistorySchema = new mongoose.Schema(
  {
    marksAwarded: { type: Number, min: 0 },
    feedback: { type: String, default: '' },
    status: { type: String, enum: SUBMISSION_STATUS },
    evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    evaluatedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: true }
);

const versionSnapshotSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    textContent: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, default: false },
    submissionStatus: { type: String, enum: SUBMISSION_STATUS },
    marksAwarded: { type: Number, default: null },
    feedback: { type: String, default: '' },
    evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    evaluatedAt: { type: Date, default: null },
  },
  { _id: true }
);

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseLesson',
      default: null,
    },
    version: { type: Number, min: 1, default: 1 },
    textContent: { type: String, default: '', maxlength: 50000 },
    attachments: { type: [attachmentSchema], default: [] },
    submittedAt: { type: Date, required: true },
    submissionStatus: {
      type: String,
      enum: SUBMISSION_STATUS,
      default: 'submitted',
      index: true,
    },
    isLate: { type: Boolean, default: false, index: true },
    marksAwarded: { type: Number, min: 0, default: null },
    feedback: { type: String, default: '', maxlength: 10000 },
    evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    evaluatedAt: { type: Date, default: null },
    evaluationHistory: { type: [evaluationHistorySchema], default: [] },
    versionHistory: { type: [versionSnapshotSchema], default: [] },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

assignmentSubmissionSchema.index(
  { assignmentId: 1, studentId: 1 },
  { unique: true }
);
assignmentSubmissionSchema.index({ courseId: 1, submissionStatus: 1, submittedAt: -1 });
assignmentSubmissionSchema.index({ studentId: 1, submittedAt: -1 });

function serializeAttachment(a) {
  return {
    id: a._id?.toString?.() || a.id,
    mediaAssetId: a.mediaAssetId?.toString?.() || null,
    originalFileName: a.originalFileName,
    mimeType: a.mimeType,
    extension: a.extension,
    sizeBytes: a.sizeBytes,
    // storageKey never returned to clients
    downloadAvailable: true,
  };
}

assignmentSubmissionSchema.methods.toSafeObject = function toSafeObject({
  includeFeedback = true,
  includeHistory = false,
} = {}) {
  const obj = {
    id: this._id.toString(),
    assignmentId: this.assignmentId.toString(),
    studentId: this.studentId.toString(),
    courseId: this.courseId.toString(),
    lessonId: this.lessonId?.toString?.() || null,
    version: this.version,
    textContent: this.textContent,
    attachments: (this.attachments || []).map(serializeAttachment),
    submittedAt: this.submittedAt,
    submissionStatus: this.submissionStatus,
    isLate: this.isLate,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeFeedback) {
    obj.marksAwarded = this.marksAwarded;
    obj.feedback = this.feedback;
    obj.evaluatedBy = this.evaluatedBy?.toString?.() || null;
    obj.evaluatedAt = this.evaluatedAt;
  }
  if (includeHistory) {
    obj.evaluationHistory = this.evaluationHistory;
    obj.versionHistory = (this.versionHistory || []).map((v) => ({
      id: v._id?.toString?.(),
      version: v.version,
      textContent: v.textContent,
      attachments: (v.attachments || []).map(serializeAttachment),
      submittedAt: v.submittedAt,
      isLate: v.isLate,
      submissionStatus: v.submissionStatus,
      marksAwarded: v.marksAwarded,
      feedback: v.feedback,
      evaluatedBy: v.evaluatedBy?.toString?.() || null,
      evaluatedAt: v.evaluatedAt,
    }));
  }
  return obj;
};

export const AssignmentSubmission = mongoose.model(
  'AssignmentSubmission',
  assignmentSubmissionSchema
);
