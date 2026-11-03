import mongoose from 'mongoose';

export const CERTIFICATE_STATUSES = Object.freeze(['issued', 'revoked', 'expired']);
export const CERTIFICATE_ISSUE_SOURCES = Object.freeze(['manual', 'automatic', 'regenerate']);

const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['issued', 'revoked', 'regenerated', 'replaced'],
      required: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, maxlength: 2000, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const certificateSchema = new mongoose.Schema(
  {
    certificateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 64,
    },
    verificationCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
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
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseEnrollment',
      required: true,
    },
    certificateTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CertificateTemplate',
      required: true,
      index: true,
    },
    templateSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    studentNameSnapshot: { type: String, required: true, trim: true, maxlength: 300 },
    courseNameSnapshot: { type: String, required: true, trim: true, maxlength: 300 },
    organizationNameSnapshot: { type: String, trim: true, maxlength: 200, default: 'SkillBee' },
    completionDate: { type: Date, required: true },
    issueDate: { type: Date, required: true, default: Date.now },
    verificationUrl: { type: String, required: true, trim: true },
    pdfStorageKey: { type: String, required: true, trim: true },
    pdfFileName: { type: String, required: true, trim: true },
    pdfChecksum: { type: String, required: true, trim: true },
    certificateStatus: {
      type: String,
      enum: CERTIFICATE_STATUSES,
      default: 'issued',
      index: true,
    },
    issueSource: {
      type: String,
      enum: CERTIFICATE_ISSUE_SOURCES,
      default: 'manual',
    },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, trim: true, maxlength: 2000, default: null },
    eligibilitySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    replacesCertificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Certificate',
      default: null,
    },
    replacedByCertificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Certificate',
      default: null,
    },
    history: { type: [historySchema], default: [] },
    deletedAt: { type: Date, default: null },
    isDemoSeed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

certificateSchema.index({ certificateNumber: 1 }, { unique: true });
certificateSchema.index({ verificationCode: 1 }, { unique: true });
certificateSchema.index({ studentId: 1, issueDate: -1 });
certificateSchema.index({ courseId: 1, issueDate: -1 });
certificateSchema.index({ certificateStatus: 1, issueDate: -1 });
/** One active (issued) certificate per enrollment */
certificateSchema.index(
  { enrollmentId: 1 },
  {
    unique: true,
    partialFilterExpression: { certificateStatus: 'issued', deletedAt: null },
  }
);

certificateSchema.methods.pushHistory = function pushHistory(event) {
  this.history.push({
    action: event.action,
    actorId: event.actorId ?? null,
    reason: event.reason ?? null,
    meta: event.meta ?? null,
    at: event.at || new Date(),
  });
  if (this.history.length > 50) this.history = this.history.slice(-50);
};

certificateSchema.methods.toSafeObject = function toSafeObject({ includeInternal = false } = {}) {
  const base = {
    id: this._id.toString(),
    certificateNumber: this.certificateNumber,
    studentId: this.studentId?.toString?.() || String(this.studentId),
    courseId: this.courseId?.toString?.() || String(this.courseId),
    enrollmentId: this.enrollmentId?.toString?.() || String(this.enrollmentId),
    certificateTemplateId: this.certificateTemplateId?.toString?.() || null,
    studentName: this.studentNameSnapshot,
    courseName: this.courseNameSnapshot,
    organizationName: this.organizationNameSnapshot,
    completionDate: this.completionDate,
    issueDate: this.issueDate,
    verificationUrl: this.verificationUrl,
    certificateStatus: this.certificateStatus,
    issueSource: this.issueSource,
    revokedAt: this.revokedAt,
    revocationReason: this.revocationReason,
    replacesCertificateId: this.replacesCertificateId?.toString?.() || null,
    replacedByCertificateId: this.replacedByCertificateId?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeInternal) {
    base.pdfFileName = this.pdfFileName;
    base.pdfChecksum = this.pdfChecksum;
    base.issuedBy = this.issuedBy?.toString?.() || null;
    base.revokedBy = this.revokedBy?.toString?.() || null;
    base.eligibilitySnapshot = this.eligibilitySnapshot;
    base.templateSnapshot = this.templateSnapshot;
  }
  return base;
};

certificateSchema.methods.toPublicVerification = function toPublicVerification() {
  if (this.certificateStatus === 'revoked') {
    return {
      verificationStatus: 'revoked',
      certificateNumber: this.certificateNumber,
      studentName: this.studentNameSnapshot,
      courseName: this.courseNameSnapshot,
      issueDate: this.issueDate,
      revokedAt: this.revokedAt,
      revocationReason: this.revocationReason || null,
      organizationName: this.organizationNameSnapshot,
    };
  }
  if (this.certificateStatus === 'expired') {
    return {
      verificationStatus: 'expired',
      certificateNumber: this.certificateNumber,
      studentName: this.studentNameSnapshot,
      courseName: this.courseNameSnapshot,
      issueDate: this.issueDate,
      organizationName: this.organizationNameSnapshot,
    };
  }
  return {
    verificationStatus: 'valid',
    certificateNumber: this.certificateNumber,
    studentName: this.studentNameSnapshot,
    courseName: this.courseNameSnapshot,
    completionDate: this.completionDate,
    issueDate: this.issueDate,
    organizationName: this.organizationNameSnapshot,
    certificateStatus: this.certificateStatus,
  };
};

export const Certificate = mongoose.model('Certificate', certificateSchema);
