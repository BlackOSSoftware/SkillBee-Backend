import mongoose from 'mongoose';
import { LESSON_TYPES, VIDEO_PROCESSING_STATUS } from '../config/security.js';

const videoSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['uploaded', 'external'], default: 'uploaded' },
    provider: {
      type: String,
      enum: ['local', 'youtube', 'vimeo', 'other'],
      default: 'local',
    },
    externalUrl: { type: String, trim: true, default: null },
    storageProvider: { type: String, enum: ['local'], default: 'local' },
    storageKey: { type: String, trim: true, default: null },
    originalFileName: { type: String, trim: true, default: null },
    mimeType: { type: String, trim: true, default: null },
    sizeBytes: { type: Number, min: 0, default: 0 },
    durationSeconds: { type: Number, min: 0, default: 0 },
    processingStatus: {
      type: String,
      enum: Object.values(VIDEO_PROCESSING_STATUS),
      default: VIDEO_PROCESSING_STATUS.PENDING,
    },
    hlsMasterPath: { type: String, trim: true, default: null },
    thumbnailPath: { type: String, trim: true, default: null },
    availableQualities: { type: [String], default: [] },
    uploadedAt: { type: Date, default: null },
  },
  { _id: false }
);

const textContentSchema = new mongoose.Schema(
  {
    body: { type: String, default: '' },
    format: { type: String, enum: ['html', 'markdown'], default: 'html' },
  },
  { _id: false }
);

const liveSessionSchema = new mongoose.Schema(
  {
    meetingProvider: { type: String, trim: true, default: '' },
    meetingUrl: { type: String, trim: true, default: '' },
    startsAt: { type: Date },
    endsAt: { type: Date },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
    instructions: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const resourceContentSchema = new mongoose.Schema(
  {
    resourceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourseResource' }],
    instructions: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const courseLessonSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 20000, default: '' },
    type: { type: String, enum: LESSON_TYPES, required: true },
    content: {
      textContent: { type: textContentSchema, default: () => ({ body: '', format: 'html' }) },
      video: { type: videoSchema, default: null },
      liveSession: { type: liveSessionSchema, default: null },
      resourceContent: { type: resourceContentSchema, default: null },
    },
    durationSeconds: { type: Number, min: 0, default: 0 },
    isPreview: { type: Boolean, default: false },
    isRequired: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0, min: 0 },
    scheduledAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    legacy: {
      wordpressLessonId: Number,
      sourcePlatform: { type: String, enum: ['wordpress', 'native'], default: 'native' },
      migratedAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

courseLessonSchema.index({ courseId: 1, topicId: 1, sortOrder: 1 });
courseLessonSchema.index({ courseId: 1, slug: 1 }, { unique: true });
courseLessonSchema.index({ topicId: 1, deletedAt: 1, status: 1 });

function normalizeTextContent(raw) {
  if (!raw) return { body: '', format: 'html' };
  if (typeof raw === 'string') return { body: raw, format: 'html' };
  if (raw.body != null) return { body: raw.body || '', format: raw.format || 'html' };
  // legacy Phase 2 shape stored string in content.textContent
  return { body: String(raw), format: 'html' };
}

courseLessonSchema.methods.toAdminObject = function toAdminObject({ includeStorageKey = true } = {}) {
  const text = normalizeTextContent(this.content?.textContent);
  const video = this.content?.video
    ? {
        source: this.content.video.source || 'uploaded',
        provider: this.content.video.provider || 'local',
        externalUrl: this.content.video.externalUrl || null,
        storageProvider: this.content.video.storageProvider,
        storageKey: includeStorageKey ? this.content.video.storageKey : undefined,
        originalFileName: this.content.video.originalFileName,
        mimeType: this.content.video.mimeType,
        sizeBytes: this.content.video.sizeBytes,
        durationSeconds: this.content.video.durationSeconds,
        processingStatus: this.content.video.processingStatus,
        availableQualities: this.content.video.availableQualities || [],
        hasHls: Boolean(this.content.video.hlsMasterPath),
        hasThumbnail: Boolean(this.content.video.thumbnailPath),
        uploadedAt: this.content.video.uploadedAt,
      }
    : null;

  return {
    id: this._id.toString(),
    courseId: this.courseId.toString(),
    topicId: this.topicId.toString(),
    title: this.title,
    slug: this.slug,
    description: this.description,
    type: this.type,
    content: {
      textContent: text,
      video,
      liveSession: this.content?.liveSession || null,
      resourceContent: this.content?.resourceContent
        ? {
            resourceIds: (this.content.resourceContent.resourceIds || []).map((id) =>
              id.toString()
            ),
            instructions: this.content.resourceContent.instructions || '',
          }
        : null,
    },
    durationSeconds: this.durationSeconds,
    isPreview: this.isPreview,
    isRequired: this.isRequired,
    sortOrder: this.sortOrder,
    scheduledAt: this.scheduledAt,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: this.deletedAt,
  };
};

courseLessonSchema.methods.toLearnerObject = function toLearnerObject({
  enrolled = false,
  isStaff = false,
} = {}) {
  const now = new Date();
  const scheduledBlocked =
    this.scheduledAt && this.scheduledAt > now && !isStaff && !enrolled;
  const canSeeContent =
    isStaff || enrolled || (this.isPreview && this.status === 'published' && !scheduledBlocked);

  const base = {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    type: this.type,
    durationSeconds: this.durationSeconds,
    isPreview: this.isPreview,
    isRequired: this.isRequired,
    sortOrder: this.sortOrder,
    status: this.status,
    scheduledAt: this.scheduledAt,
  };

  if (!canSeeContent) {
    return { ...base, locked: true };
  }

  const text = normalizeTextContent(this.content?.textContent);
  return {
    ...base,
    locked: false,
    description: this.description,
    content: {
      textContent: this.type === 'text' ? text : undefined,
      liveSession:
        this.type === 'live' && (enrolled || isStaff)
          ? this.content?.liveSession || null
          : this.type === 'live'
            ? { startsAt: this.content?.liveSession?.startsAt, timezone: this.content?.liveSession?.timezone }
            : undefined,
      video:
        this.type === 'video'
          ? {
              source: this.content?.video?.source,
              provider: this.content?.video?.provider,
              processingStatus: this.content?.video?.processingStatus,
              durationSeconds: this.content?.video?.durationSeconds,
              availableQualities: this.content?.video?.availableQualities || [],
              externalUrl:
                this.content?.video?.source === 'external' && (enrolled || isStaff || this.isPreview)
                  ? this.content.video.externalUrl
                  : undefined,
            }
          : undefined,
      resourceContent: this.type === 'resource' ? this.content?.resourceContent : undefined,
    },
  };
};

// Back-compat alias used by Phase 2 public APIs
courseLessonSchema.methods.toPublicObject = function toPublicObject(opts = {}) {
  return this.toLearnerObject({
    enrolled: Boolean(opts.enrolled),
    isStaff: false,
  });
};

export const CourseLesson = mongoose.model('CourseLesson', courseLessonSchema);
