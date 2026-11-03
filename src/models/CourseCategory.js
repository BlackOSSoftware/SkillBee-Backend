import mongoose from 'mongoose';
import { cloudinaryMediaSchema } from './schemas/cloudinaryMedia.js';

const seoSchema = new mongoose.Schema(
  {
    metaTitle: { type: String, trim: true, maxlength: 120, default: '' },
    metaDescription: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false }
);

const courseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    image: { type: cloudinaryMediaSchema, default: null },
    parentCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseCategory',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    sortOrder: { type: Number, default: 0 },
    seo: { type: seoSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null, index: true },
    legacy: {
      wordpressCategoryId: Number,
      wordpressSlug: String,
      sourcePlatform: { type: String, enum: ['wordpress', 'native'], default: 'native' },
      migratedAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

courseCategorySchema.index({ status: 1, deletedAt: 1, sortOrder: 1 });

courseCategorySchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    description: this.description,
    image: this.image,
    parentCategoryId: this.parentCategoryId ? this.parentCategoryId.toString() : null,
    status: this.status,
    sortOrder: this.sortOrder,
    seo: this.seo,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: this.deletedAt,
  };
};

export const CourseCategory = mongoose.model('CourseCategory', courseCategorySchema);
