import mongoose from 'mongoose';
import {
  LIVE_APPLICATION_STATUSES,
  LIVE_COURSE_INTERESTS,
  LIVE_COURSE_REFERRAL_SOURCES,
} from '../config/security.js';

const liveCourseApplicationSchema = new mongoose.Schema(
  {
    applicationReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    whatsappNumber: { type: String, required: true, trim: true, maxlength: 20 },
    currentCompany: { type: String, required: true, trim: true, maxlength: 200 },
    currentCity: { type: String, required: true, trim: true, maxlength: 120 },
    courseInterested: {
      type: String,
      required: true,
      enum: LIVE_COURSE_INTERESTS,
    },
    liveCourse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    referralSource: {
      type: String,
      required: true,
      enum: LIVE_COURSE_REFERRAL_SOURCES,
    },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: LIVE_APPLICATION_STATUSES,
      default: 'PENDING',
      index: true,
    },
    adminRemarks: { type: String, trim: true, maxlength: 4000, default: '' },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    convertedEnrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseEnrollment',
      default: null,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

/**
 * Duplicate protection: one non-deleted application per
 * (email + liveCourse). Different courses may have separate applications.
 */
liveCourseApplicationSchema.index(
  { email: 1, liveCourse: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
liveCourseApplicationSchema.index({ status: 1, createdAt: -1 });
liveCourseApplicationSchema.index({ liveCourse: 1, status: 1, createdAt: -1 });
liveCourseApplicationSchema.index({ student: 1, createdAt: -1 });

liveCourseApplicationSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    applicationReference: this.applicationReference,
    student: this.student?.toString?.() || this.student || null,
    name: this.name,
    email: this.email,
    whatsappNumber: this.whatsappNumber,
    currentCompany: this.currentCompany,
    currentCity: this.currentCity,
    courseInterested: this.courseInterested,
    liveCourse: this.liveCourse?.toString?.() || this.liveCourse,
    referralSource: this.referralSource,
    comment: this.comment,
    status: this.status,
    adminRemarks: this.adminRemarks,
    reviewedBy: this.reviewedBy?.toString?.() || this.reviewedBy || null,
    reviewedAt: this.reviewedAt,
    convertedEnrollment: this.convertedEnrollment?.toString?.() || this.convertedEnrollment || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const LiveCourseApplication = mongoose.model(
  'LiveCourseApplication',
  liveCourseApplicationSchema
);
