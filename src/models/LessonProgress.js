import mongoose from 'mongoose';

export const LESSON_COMPLETION_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'completed',
]);

export const COMPLETION_SOURCES = Object.freeze([
  'student_explicit',
  'quiz_passed',
  'assignment_satisfied',
  'admin_override',
  'system',
]);

const lessonProgressSchema = new mongoose.Schema(
  {
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
      required: true,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseEnrollment',
      required: true,
      index: true,
    },
    completionStatus: {
      type: String,
      enum: LESSON_COMPLETION_STATUSES,
      default: 'not_started',
      index: true,
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastAccessedAt: { type: Date, default: null },
    /** Informational only — never authoritative for video verification */
    watchDurationSeconds: { type: Number, min: 0, default: 0 },
    completionSource: {
      type: String,
      enum: COMPLETION_SOURCES,
      default: 'student_explicit',
    },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { timestamps: true, versionKey: false }
);

lessonProgressSchema.index(
  { studentId: 1, enrollmentId: 1, lessonId: 1 },
  { unique: true }
);
lessonProgressSchema.index({ enrollmentId: 1, completionStatus: 1 });
lessonProgressSchema.index({ courseId: 1, studentId: 1, completionStatus: 1 });
lessonProgressSchema.index({ lessonId: 1, studentId: 1 });

lessonProgressSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    studentId: this.studentId.toString(),
    courseId: this.courseId.toString(),
    lessonId: this.lessonId.toString(),
    enrollmentId: this.enrollmentId.toString(),
    completionStatus: this.completionStatus,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    lastAccessedAt: this.lastAccessedAt,
    watchDurationSeconds: this.watchDurationSeconds,
    completionSource: this.completionSource,
    revokedAt: this.revokedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const LessonProgress = mongoose.model('LessonProgress', lessonProgressSchema);
