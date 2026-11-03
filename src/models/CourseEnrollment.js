import mongoose from 'mongoose';

export const ENROLLMENT_STATUSES = Object.freeze([
  'active',
  'pending',
  'completed',
  'expired',
  'revoked',
  'suspended',
  'cancelled', // legacy alias — treated as revoked for access
]);

export const ENROLLMENT_TYPES = Object.freeze([
  'purchase',
  'manual',
  'free',
  'admin_granted',
  'migration', // legacy
]);

export const COURSE_COMPLETION_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'requirements_pending',
  'completed',
]);

const historyEventSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        'created',
        'updated',
        'status_changed',
        'revoked',
        'reactivated',
        'expired',
        'progress_recalculated',
        'completed',
        'suspended',
      ],
      required: true,
    },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    reason: { type: String, trim: true, maxlength: 2000, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const courseEnrollmentSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ENROLLMENT_STATUSES,
      default: 'active',
      index: true,
    },
    /** Alias field for Phase 7 API naming — mirrors `source` / enrollment type */
    enrollmentType: {
      type: String,
      enum: ENROLLMENT_TYPES,
      default: 'manual',
    },
    /** @deprecated Prefer enrollmentType — kept for Phase 2–6 compatibility */
    source: {
      type: String,
      enum: ENROLLMENT_TYPES,
      default: 'manual',
    },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    completedLessonsCount: { type: Number, min: 0, default: 0 },
    totalRequiredLessons: { type: Number, min: 0, default: 0 },
    courseCompletionStatus: {
      type: String,
      enum: COURSE_COMPLETION_STATUSES,
      default: 'not_started',
    },
    completionEvaluationAt: { type: Date, default: null },
    enrolledAt: { type: Date, default: Date.now },
    /** Alias: enrollmentExpiresAt in APIs */
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastAccessedAt: { type: Date, default: null },
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revocationReason: { type: String, trim: true, maxlength: 2000, default: null },
    history: { type: [historyEventSchema], default: [] },
    deletedAt: { type: Date, default: null },
    legacy: {
      wordpressEnrollmentId: Number,
      sourcePlatform: { type: String, enum: ['wordpress', 'native'], default: 'native' },
      migratedAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

/** One non-deleted enrollment per student+course (history kept via embedded events + re-activation) */
courseEnrollmentSchema.index(
  { courseId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
courseEnrollmentSchema.index({ studentId: 1, status: 1, deletedAt: 1, enrolledAt: -1 });
courseEnrollmentSchema.index({ courseId: 1, status: 1, deletedAt: 1, enrolledAt: -1 });
courseEnrollmentSchema.index({ status: 1, expiresAt: 1, deletedAt: 1 });
courseEnrollmentSchema.index({ enrolledAt: -1 });
courseEnrollmentSchema.index({ progressPercentage: 1, status: 1 });

courseEnrollmentSchema.pre('validate', function syncTypeFields(next) {
  if (this.isModified('enrollmentType') && !this.isModified('source')) {
    this.source = this.enrollmentType;
  } else if (this.isModified('source') && !this.isModified('enrollmentType')) {
    this.enrollmentType = this.source;
  } else if (!this.enrollmentType && this.source) {
    this.enrollmentType = this.source;
  } else if (!this.source && this.enrollmentType) {
    this.source = this.enrollmentType;
  }
  next();
});

courseEnrollmentSchema.methods.pushHistory = function pushHistory(event) {
  this.history.push({
    action: event.action,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus ?? null,
    reason: event.reason ?? null,
    actorId: event.actorId ?? null,
    meta: event.meta ?? null,
    at: event.at || new Date(),
  });
  // Cap history length to avoid unbounded growth
  if (this.history.length > 100) {
    this.history = this.history.slice(-100);
  }
};

courseEnrollmentSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    courseId: this.courseId?.toString?.() || String(this.courseId),
    studentId: this.studentId?.toString?.() || String(this.studentId),
    enrollmentStatus: this.status,
    status: this.status,
    enrollmentType: this.enrollmentType || this.source,
    source: this.source,
    progressPercentage: this.progressPercentage,
    completedLessonsCount: this.completedLessonsCount,
    totalRequiredLessons: this.totalRequiredLessons,
    courseCompletionStatus: this.courseCompletionStatus,
    completionEvaluationAt: this.completionEvaluationAt,
    enrolledAt: this.enrolledAt,
    enrollmentExpiresAt: this.expiresAt,
    expiresAt: this.expiresAt,
    completedAt: this.completedAt,
    lastAccessedAt: this.lastAccessedAt,
    enrolledBy: this.enrolledBy?.toString?.() || null,
    revokedAt: this.revokedAt,
    revokedBy: this.revokedBy?.toString?.() || null,
    revocationReason: this.revocationReason,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const CourseEnrollment = mongoose.model('CourseEnrollment', courseEnrollmentSchema);
