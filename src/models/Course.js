import mongoose from 'mongoose';
import {
  COURSE_LEVELS,
  COURSE_STATUS,
  DURATION_UNITS,
  SUPPORTED_CURRENCIES,
} from '../config/security.js';
import { cloudinaryMediaSchema } from './schemas/cloudinaryMedia.js';

const learningObjectiveSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const seoSchema = new mongoose.Schema(
  {
    /** Alias-compatible: APIs expose seoTitle; persisted as metaTitle for backward compat */
    metaTitle: { type: String, trim: true, maxlength: 120, default: '' },
    metaDescription: { type: String, trim: true, maxlength: 320, default: '' },
    canonicalUrl: { type: String, trim: true, default: '' },
    noIndex: { type: Boolean, default: false },
    robotsFollow: { type: Boolean, default: true },
    ogTitle: { type: String, trim: true, maxlength: 120, default: '' },
    ogDescription: { type: String, trim: true, maxlength: 320, default: '' },
    ogImage: { type: String, trim: true, default: '' },
    focusKeyword: { type: String, trim: true, maxlength: 100, default: '' },
    schemaType: { type: String, trim: true, maxlength: 80, default: 'Course' },
    schemaData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['free', 'paid'], default: 'free' },
    /** Major currency units (e.g. INR rupees). Backend converts to paise for Razorpay. */
    regularPrice: { type: Number, min: 0, default: 0 },
    salePrice: { type: Number, min: 0, default: null },
    currency: { type: String, enum: SUPPORTED_CURRENCIES, default: 'INR' },
    saleStartAt: { type: Date, default: null },
    saleEndAt: { type: Date, default: null },
    isPurchasable: { type: Boolean, default: true },
    automaticEnrollmentEnabled: { type: Boolean, default: true },
    taxConfiguration: {
      taxEnabled: { type: Boolean, default: false },
      taxPercent: { type: Number, min: 0, max: 100, default: 0 },
      taxClass: { type: String, trim: true, default: '' },
      taxInclusive: { type: Boolean, default: true },
    },
    purchaseAvailability: {
      enabled: { type: Boolean, default: true },
      startAt: { type: Date, default: null },
      endAt: { type: Date, default: null },
    },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    shortDescription: { type: String, trim: true, maxlength: 500, default: '' },
    description: { type: String, default: '' },
    thumbnail: { type: cloudinaryMediaSchema, default: null },
    gallery: { type: [cloudinaryMediaSchema], default: [] },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourseCategory', index: true }],
    instructorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    level: { type: String, enum: COURSE_LEVELS, default: 'all_levels' },
    language: { type: String, trim: true, lowercase: true, default: 'en' },
    durationValue: { type: Number, min: 0, default: 0 },
    durationUnit: { type: String, enum: DURATION_UNITS, default: 'hours' },
    status: {
      type: String,
      enum: Object.values(COURSE_STATUS),
      default: COURSE_STATUS.DRAFT,
      index: true,
    },
    isFeatured: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },

    learningObjectives: { type: [learningObjectiveSchema], default: [] },
    requirements: { type: [String], default: [] },
    targetAudience: { type: [String], default: [] },
    faqs: { type: [faqSchema], default: [] },
    tags: { type: [String], default: [] },
    certificate: {
      enabled: { type: Boolean, default: false },
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },
      minimumCompletionPercentage: { type: Number, min: 0, max: 100, default: 80 },
      /** When true, Phase 7 completion triggers async auto-issuance once */
      autoIssue: { type: Boolean, default: false },
    },
    enrollment: {
      limitEnabled: { type: Boolean, default: false },
      maximumStudents: { type: Number, min: 0, default: 0 },
      currentStudents: { type: Number, min: 0, default: 0 },
    },
    expiry: {
      enabled: { type: Boolean, default: false },
      durationValue: { type: Number, min: 0, default: 0 },
      durationUnit: { type: String, enum: DURATION_UNITS, default: 'days' },
    },
    seo: { type: seoSchema, default: () => ({}) },
    pricing: { type: pricingSchema, default: () => ({}) },

    /** Aggregated from approved reviews only — recalculated on moderation changes */
    ratingStats: {
      averageRating: { type: Number, min: 0, max: 5, default: 0 },
      approvedReviewCount: { type: Number, min: 0, default: 0 },
      distribution: {
        star1: { type: Number, min: 0, default: 0 },
        star2: { type: Number, min: 0, default: 0 },
        star3: { type: Number, min: 0, default: 0 },
        star4: { type: Number, min: 0, default: 0 },
        star5: { type: Number, min: 0, default: 0 },
      },
      recalculatedAt: { type: Date, default: null },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date, default: null, index: true },
    archivedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    legacy: {
      wordpressCourseId: Number,
      wordpressSlug: String,
      sourcePlatform: { type: String, enum: ['wordpress', 'native'], default: 'native' },
      migratedAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

courseSchema.index({ status: 1, deletedAt: 1, publishedAt: -1 });
courseSchema.index({ status: 1, deletedAt: 1, isFeatured: 1, sortOrder: 1 });
courseSchema.index({ status: 1, deletedAt: 1, categoryIds: 1, publishedAt: -1 });
courseSchema.index({ createdAt: -1 });
courseSchema.index({ title: 'text', shortDescription: 'text', tags: 'text' });

courseSchema.methods.toAdminObject = function toAdminObject(extras = {}) {
  return {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    shortDescription: this.shortDescription,
    description: this.description,
    thumbnail: this.thumbnail,
    gallery: this.gallery,
    categoryIds: (this.categoryIds || []).map((id) =>
      typeof id === 'object' && id?._id ? id._id.toString() : id.toString()
    ),
    categories: Array.isArray(this.categoryIds) && this.categoryIds[0]?.name
      ? this.categoryIds.map((c) => c.toSafeObject?.() || c)
      : undefined,
    instructorIds: (this.instructorIds || []).map((id) =>
      typeof id === 'object' && id?._id ? id._id.toString() : id.toString()
    ),
    instructors: Array.isArray(this.instructorIds) && this.instructorIds[0]?.email
      ? this.instructorIds.map((u) => ({
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          profileImage: u.profileImage,
        }))
      : undefined,
    level: this.level,
    language: this.language,
    durationValue: this.durationValue,
    durationUnit: this.durationUnit,
    status: this.status,
    isFeatured: this.isFeatured,
    sortOrder: this.sortOrder,
    learningObjectives: this.learningObjectives,
    requirements: this.requirements,
    targetAudience: this.targetAudience,
    faqs: this.faqs,
    tags: this.tags,
    certificate: this.certificate,
    enrollment: this.enrollment,
    expiry: this.expiry,
    seo: this.seo,
    pricing: this.pricing,
    ratingStats: this.ratingStats || {
      averageRating: 0,
      approvedReviewCount: 0,
      distribution: { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 },
      recalculatedAt: null,
    },
    createdBy: this.createdBy?.toString?.() || this.createdBy,
    updatedBy: this.updatedBy?.toString?.() || this.updatedBy,
    publishedAt: this.publishedAt,
    archivedAt: this.archivedAt,
    deletedAt: this.deletedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    ...extras,
  };
};

export const Course = mongoose.model('Course', courseSchema);
