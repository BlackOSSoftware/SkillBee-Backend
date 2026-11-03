import mongoose from 'mongoose';
import {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SUBMISSION_TYPES,
} from '../config/security.js';

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    instructions: { type: String, required: true, trim: true, maxlength: 20000 },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', default: null },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseLesson',
      default: null,
      index: true,
    },
    dueDate: { type: Date, default: null, index: true },
    maximumMarks: { type: Number, required: true, min: 0 },
    allowedFileTypes: {
      type: [String],
      default: () => ['.pdf', '.doc', '.docx', '.txt', '.zip'],
    },
    maximumFileSizeBytes: {
      type: Number,
      min: 1,
      default: 10 * 1024 * 1024,
    },
    submissionType: {
      type: String,
      enum: ASSIGNMENT_SUBMISSION_TYPES,
      required: true,
      default: 'file_upload',
    },
    allowLateSubmission: { type: Boolean, default: false },
    allowResubmission: { type: Boolean, default: false },
    maxSubmissions: { type: Number, min: 1, default: 1 },
    status: {
      type: String,
      enum: Object.values(ASSIGNMENT_STATUS),
      default: ASSIGNMENT_STATUS.DRAFT,
      index: true,
    },
    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null, index: true },
    isDemoSeed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

assignmentSchema.index({ courseId: 1, slug: 1 }, { unique: true });
assignmentSchema.index({ status: 1, dueDate: 1, deletedAt: 1 });
assignmentSchema.index({ courseId: 1, status: 1, deletedAt: 1, dueDate: 1 });
assignmentSchema.index({ title: 'text' });

assignmentSchema.methods.toSafeObject = function toSafeObject({ forStudent = false } = {}) {
  return {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    instructions: this.instructions,
    courseId: this.courseId.toString(),
    topicId: this.topicId?.toString?.() || null,
    lessonId: this.lessonId?.toString?.() || null,
    dueDate: this.dueDate,
    maximumMarks: this.maximumMarks,
    allowedFileTypes: this.allowedFileTypes,
    maximumFileSizeBytes: this.maximumFileSizeBytes,
    submissionType: this.submissionType,
    allowLateSubmission: this.allowLateSubmission,
    allowResubmission: this.allowResubmission,
    maxSubmissions: this.maxSubmissions,
    status: this.status,
    publishedAt: this.publishedAt,
    closedAt: this.closedAt,
    createdBy: forStudent ? undefined : this.createdBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: forStudent ? undefined : this.deletedAt,
    isDemoSeed: this.isDemoSeed,
  };
};

export const Assignment = mongoose.model('Assignment', assignmentSchema);
