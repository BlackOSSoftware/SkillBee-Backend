import mongoose from 'mongoose';

/**
 * Lead captured when a visitor registers interest in a FREE course
 * before (or instead of) having a student account. Used for follow-up
 * contact and to avoid duplicate registrations per email + course.
 */
const courseLeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    whatsappNumber: { type: String, required: true, trim: true, maxlength: 20 },
    currentCompany: { type: String, required: true, trim: true, maxlength: 200 },
    currentCity: { type: String, required: true, trim: true, maxlength: 120 },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    /** Linked student account once the visitor registers/logs in. */
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    source: {
      type: String,
      enum: ['free_course_registration'],
      default: 'free_course_registration',
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'converted', 'closed'],
      default: 'new',
      index: true,
    },
    adminNotes: { type: String, trim: true, maxlength: 4000, default: '' },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

/** One non-deleted lead per (email + course). */
courseLeadSchema.index(
  { email: 1, course: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
courseLeadSchema.index({ course: 1, status: 1, createdAt: -1 });

courseLeadSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    whatsappNumber: this.whatsappNumber,
    currentCompany: this.currentCompany,
    currentCity: this.currentCity,
    course: this.course?.toString?.() || this.course,
    student: this.student?.toString?.() || this.student || null,
    source: this.source,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const CourseLead = mongoose.model('CourseLead', courseLeadSchema);
