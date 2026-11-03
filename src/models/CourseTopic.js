import mongoose from 'mongoose';

const courseTopicSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    sortOrder: { type: Number, default: 0, min: 0 },
    availabilityType: {
      type: String,
      enum: ['immediate', 'immediately', 'scheduled'],
      default: 'immediate',
    },
    availableAt: { type: Date, default: null },
    status: {
      type: String,
      // include legacy active/inactive for existing Phase 2 docs
      enum: ['draft', 'published', 'archived', 'active', 'inactive'],
      default: 'draft',
      index: true,
    },
    isRequired: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    legacy: {
      wordpressTopicId: Number,
      sourcePlatform: { type: String, enum: ['wordpress', 'native'], default: 'native' },
      migratedAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

courseTopicSchema.index({ courseId: 1, sortOrder: 1 });
courseTopicSchema.index({ courseId: 1, status: 1 });
courseTopicSchema.index({ courseId: 1, deletedAt: 1 });

function normalizeAvailability(value) {
  if (value === 'immediately') return 'immediate';
  return value || 'immediate';
}

function normalizeStatus(value) {
  if (value === 'active') return 'published';
  if (value === 'inactive') return 'archived';
  return value || 'draft';
}

courseTopicSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    courseId: this.courseId.toString(),
    title: this.title,
    description: this.description,
    sortOrder: this.sortOrder,
    availabilityType: normalizeAvailability(this.availabilityType),
    availableAt: this.availableAt,
    status: normalizeStatus(this.status),
    isRequired: this.isRequired !== false,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: this.deletedAt,
  };
};

export const CourseTopic = mongoose.model('CourseTopic', courseTopicSchema);
export { normalizeAvailability, normalizeStatus };
