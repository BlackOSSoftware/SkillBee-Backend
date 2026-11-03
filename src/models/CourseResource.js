import mongoose from 'mongoose';
import path from 'path';

const RESOURCE_TYPES = [
  'pdf',
  'document',
  'spreadsheet',
  'presentation',
  'archive',
  'text',
  'external_link',
];

const courseResourceSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseTopic',
      default: null,
      index: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseLesson',
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    resourceType: { type: String, enum: RESOURCE_TYPES, required: true },
    storageProvider: { type: String, enum: ['local', 'external'], default: 'local' },
    storageKey: { type: String, trim: true, default: null },
    originalFileName: { type: String, trim: true, default: null },
    mimeType: { type: String, trim: true, default: null },
    extension: { type: String, trim: true, lowercase: true, default: null },
    sizeBytes: { type: Number, min: 0, default: 0 },
    checksum: { type: String, trim: true, default: null },
    externalUrl: { type: String, trim: true, default: null },
    visibility: {
      type: String,
      enum: ['enrolled', 'preview', 'instructor_only'],
      default: 'enrolled',
    },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived', 'inactive'], default: 'active' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    legacy: {
      wordpressResourceId: Number,
      sourcePlatform: { type: String, enum: ['wordpress', 'native'], default: 'native' },
      migratedAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

courseResourceSchema.pre('validate', function setExtension(next) {
  if (this.originalFileName && !this.extension) {
    this.extension = path.extname(this.originalFileName).toLowerCase().replace('.', '') || null;
  }
  if (!this.uploadedBy && this.createdBy) {
    this.uploadedBy = this.createdBy;
  }
  next();
});

courseResourceSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    courseId: this.courseId.toString(),
    topicId: this.topicId ? this.topicId.toString() : null,
    lessonId: this.lessonId ? this.lessonId.toString() : null,
    title: this.title,
    description: this.description,
    resourceType: this.resourceType,
    storageProvider: this.storageProvider,
    originalFileName: this.originalFileName,
    mimeType: this.mimeType,
    extension: this.extension,
    sizeBytes: this.sizeBytes,
    checksum: this.checksum,
    visibility: this.visibility,
    externalUrl: this.storageProvider === 'external' ? this.externalUrl : undefined,
    hasFile: Boolean(this.storageKey),
    sortOrder: this.sortOrder,
    status: this.status === 'inactive' ? 'archived' : this.status,
    uploadedBy: this.uploadedBy?.toString?.() || this.createdBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: this.deletedAt,
  };
};

export const CourseResource = mongoose.model('CourseResource', courseResourceSchema);
export { RESOURCE_TYPES };
