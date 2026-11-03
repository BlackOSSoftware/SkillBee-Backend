import mongoose from 'mongoose';
import { EXPERTISE_LEVELS, INSTRUCTOR_SUBJECTS } from '../config/instructorSubjects.js';

export const INSTRUCTOR_APP_STATUS = Object.freeze({
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  SHORTLISTED: 'shortlisted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const resumeSchema = new mongoose.Schema(
  {
    originalFileName: { type: String, required: true, maxlength: 255 },
    storedFileName: { type: String, required: true, maxlength: 255 },
    storagePath: { type: String, required: true, maxlength: 500 },
    mimeType: { type: String, required: true, maxlength: 120 },
    fileSize: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const instructorApplicationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
    expertSubject: {
      type: String,
      required: true,
      enum: INSTRUCTOR_SUBJECTS,
    },
    expertiseLevel: {
      type: String,
      required: true,
      enum: EXPERTISE_LEVELS,
    },
    resume: { type: resumeSchema, required: true },
    linkedinProfileUrl: { type: String, trim: true, maxlength: 500, default: '' },
    comments: { type: String, trim: true, maxlength: 5000, default: '' },
    status: {
      type: String,
      enum: Object.values(INSTRUCTOR_APP_STATUS),
      default: INSTRUCTOR_APP_STATUS.PENDING,
      index: true,
    },
    adminNotes: { type: String, trim: true, maxlength: 5000, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    auditLog: [
      {
        action: String,
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        meta: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

instructorApplicationSchema.index({ createdAt: -1 });
instructorApplicationSchema.index({ status: 1, createdAt: -1 });
instructorApplicationSchema.index({ email: 1, createdAt: -1 });

instructorApplicationSchema.methods.toPublicReceipt = function toPublicReceipt() {
  return {
    reference: this._id.toString().slice(-8).toUpperCase(),
    status: this.status,
    submittedAt: this.createdAt,
  };
};

instructorApplicationSchema.methods.toAdminObject = function toAdminObject() {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    phone: this.phone,
    email: this.email,
    expertSubject: this.expertSubject,
    expertiseLevel: this.expertiseLevel,
    resume: {
      originalFileName: this.resume?.originalFileName,
      mimeType: this.resume?.mimeType,
      fileSize: this.resume?.fileSize,
    },
    linkedinProfileUrl: this.linkedinProfileUrl,
    comments: this.comments,
    status: this.status,
    adminNotes: this.adminNotes,
    reviewedBy: this.reviewedBy?.toString?.() || null,
    reviewedAt: this.reviewedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    auditLog: this.auditLog || [],
  };
};

export const InstructorApplication = mongoose.model(
  'InstructorApplication',
  instructorApplicationSchema
);
