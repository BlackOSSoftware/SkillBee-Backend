import mongoose from 'mongoose';
import { MEDIA_CATEGORIES, MEDIA_TYPES } from './MediaAsset.js';

export const UPLOAD_SESSION_STATUS = Object.freeze([
  'initiated',
  'uploading',
  'uploaded',
  'confirmed',
  'expired',
  'failed',
]);

const mediaUploadSessionSchema = new mongoose.Schema(
  {
    uploadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    mediaType: { type: String, enum: MEDIA_TYPES, required: true },
    category: { type: String, enum: MEDIA_CATEGORIES, required: true },
    storageProvider: { type: String, enum: ['cloudinary', 'local'], required: true },
    originalFileName: { type: String, required: true, trim: true },
    expectedSizeBytes: { type: Number, min: 1, required: true },
    expectedMimeType: { type: String, required: true, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseLesson', default: null },
    temporaryStorageKey: { type: String, default: null },
    finalStorageKey: { type: String, default: null },
    uploadTokenHash: { type: String, default: null },
    uploadTokenUsedAt: { type: Date, default: null },
    cloudinaryFolder: { type: String, default: null },
    cloudinaryPublicIdHint: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: UPLOAD_SESSION_STATUS,
      default: 'initiated',
      index: true,
    },
    uploadedSizeBytes: { type: Number, min: 0, default: 0 },
    checksum: { type: String, default: null },
    mediaAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset',
      default: null,
    },
    failureReason: { type: String, default: null },
    // Cloudinary confirm payload snapshot (no secrets)
    providerMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, versionKey: false }
);

// TTL: remove expired/unconfirmed sessions only (not historical MediaAsset records)
mediaUploadSessionSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: {
      status: { $in: ['initiated', 'uploading', 'uploaded', 'expired', 'failed'] },
    },
  }
);

mediaUploadSessionSchema.methods.toSafeObject = function toSafeObject() {
  return {
    uploadId: this.uploadId,
    mediaType: this.mediaType,
    category: this.category,
    storageProvider: this.storageProvider,
    originalFileName: this.originalFileName,
    expectedSizeBytes: this.expectedSizeBytes,
    expectedMimeType: this.expectedMimeType,
    status: this.status,
    uploadedSizeBytes: this.uploadedSizeBytes,
    expiresAt: this.expiresAt,
    mediaAssetId: this.mediaAssetId?.toString?.() || null,
    courseId: this.courseId?.toString?.() || null,
    lessonId: this.lessonId?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const MediaUploadSession = mongoose.model('MediaUploadSession', mediaUploadSessionSchema);
