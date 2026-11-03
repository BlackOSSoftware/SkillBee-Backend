import mongoose from 'mongoose';
import path from 'path';

export const MEDIA_TYPES = Object.freeze(['image', 'video', 'document']);
export const MEDIA_CATEGORIES = Object.freeze([
  'course_thumbnail',
  'course_gallery',
  'instructor_image',
  'lesson_video',
  'study_material',
  'assignment_submission',
  'other',
]);
export const MEDIA_PROCESSING_STATUS = Object.freeze([
  'pending',
  'uploading',
  'processing',
  'ready',
  'failed',
]);
export const MEDIA_VISIBILITY = Object.freeze(['public', 'protected', 'private']);

const mediaAssetSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 200, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    altText: { type: String, trim: true, maxlength: 300, default: '' },
    originalFileName: { type: String, required: true, trim: true },
    storedFileName: { type: String, trim: true, default: null },
    mediaType: { type: String, enum: MEDIA_TYPES, required: true, index: true },
    category: { type: String, enum: MEDIA_CATEGORIES, required: true, index: true },
    storageProvider: {
      type: String,
      enum: ['cloudinary', 'local'],
      required: true,
      index: true,
    },
    storageKey: { type: String, trim: true, default: null },
    publicId: { type: String, trim: true, default: null },
    secureUrl: { type: String, trim: true, default: null },
    mimeType: { type: String, trim: true, required: true },
    extension: { type: String, trim: true, lowercase: true, default: null },
    sizeBytes: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: null },
    height: { type: Number, min: 0, default: null },
    durationSeconds: { type: Number, min: 0, default: null },
    checksum: { type: String, trim: true, default: null },
    processingStatus: {
      type: String,
      enum: MEDIA_PROCESSING_STATUS,
      default: 'pending',
      index: true,
    },
    visibility: {
      type: String,
      enum: MEDIA_VISIBILITY,
      default: 'protected',
    },
    // Images and videos are view/playback only — never offered as downloads
    downloadAllowed: { type: Boolean, default: false },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseLesson', default: null, index: true },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseResource',
      default: null,
      index: true,
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    lastAccessedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletionError: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

mediaAssetSchema.index({ mediaType: 1, deletedAt: 1, createdAt: -1 });
mediaAssetSchema.index({ courseId: 1, mediaType: 1, deletedAt: 1 });
mediaAssetSchema.index({ title: 'text', originalFileName: 'text' });

mediaAssetSchema.pre('validate', function setDefaults(next) {
  if (this.originalFileName && !this.extension) {
    this.extension = path.extname(this.originalFileName).toLowerCase().replace('.', '') || null;
  }
  if (!this.title) this.title = this.originalFileName;
  if (this.mediaType === 'image' || this.mediaType === 'video') {
    this.downloadAllowed = false;
  }
  if (this.mediaType === 'document' && this.downloadAllowed == null) {
    this.downloadAllowed = true;
  }
  next();
});

mediaAssetSchema.methods.toSafeObject = function toSafeObject({ includeSecureUrl = true } = {}) {
  return {
    id: this._id.toString(),
    title: this.title,
    description: this.description,
    altText: this.altText,
    originalFileName: this.originalFileName,
    storedFileName: this.storedFileName,
    mediaType: this.mediaType,
    category: this.category,
    storageProvider: this.storageProvider,
    publicId: this.storageProvider === 'cloudinary' ? this.publicId : undefined,
    secureUrl:
      includeSecureUrl && this.storageProvider === 'cloudinary' ? this.secureUrl : undefined,
    hasLocalFile: this.storageProvider === 'local' ? Boolean(this.storageKey) : undefined,
    mimeType: this.mimeType,
    extension: this.extension,
    sizeBytes: this.sizeBytes,
    width: this.width,
    height: this.height,
    durationSeconds: this.durationSeconds,
    checksum: this.checksum,
    processingStatus: this.processingStatus,
    visibility: this.visibility,
    downloadAllowed: Boolean(this.downloadAllowed) && this.mediaType === 'document',
    ownerId: this.ownerId?.toString?.() || null,
    courseId: this.courseId?.toString?.() || null,
    lessonId: this.lessonId?.toString?.() || null,
    resourceId: this.resourceId?.toString?.() || null,
    uploadedBy: this.uploadedBy?.toString?.() || null,
    lastAccessedAt: this.lastAccessedAt,
    deletedAt: this.deletedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);
