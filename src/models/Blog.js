import mongoose from 'mongoose';
import { cloudinaryMediaSchema } from './schemas/cloudinaryMedia.js';

export const BLOG_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const blogSeoSchema = new mongoose.Schema(
  {
    seoTitle: { type: String, trim: true, maxlength: 120, default: '' },
    metaDescription: { type: String, trim: true, maxlength: 320, default: '' },
    canonicalUrl: { type: String, trim: true, maxlength: 1000, default: '' },
    robotsIndex: { type: Boolean, default: true },
    robotsFollow: { type: Boolean, default: true },
    ogTitle: { type: String, trim: true, maxlength: 120, default: '' },
    ogDescription: { type: String, trim: true, maxlength: 320, default: '' },
    ogImage: { type: String, trim: true, maxlength: 1000, default: '' },
    schemaType: { type: String, trim: true, maxlength: 80, default: 'BlogPosting' },
    schemaData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, trim: true, maxlength: 500, default: '' },
    content: { type: String, required: true, maxlength: 200000 },
    featuredImage: { type: cloudinaryMediaSchema, default: null },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory', index: true }],
    tags: { type: [String], default: [], index: true },
    status: {
      type: String,
      enum: Object.values(BLOG_STATUS),
      default: BLOG_STATUS.DRAFT,
      index: true,
    },
    publishedAt: { type: Date, default: null, index: true },
    scheduledAt: { type: Date, default: null },
    readingTime: { type: Number, min: 0, default: 1 },
    viewsCount: { type: Number, min: 0, default: 0 },
    isFeatured: { type: Boolean, default: false, index: true },
    seo: { type: blogSeoSchema, default: () => ({}) },
    previewTokenHash: { type: String, default: null, select: false },
    previewExpiresAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ status: 1, isFeatured: 1, publishedAt: -1 });
blogSchema.index({ title: 'text', excerpt: 'text', tags: 'text' });

blogSchema.methods.toAdminObject = function toAdminObject(extras = {}) {
  return {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    excerpt: this.excerpt,
    content: this.content,
    featuredImage: this.featuredImage,
    authorId: this.authorId?.toString?.() || String(this.authorId),
    categoryIds: (this.categoryIds || []).map((id) =>
      typeof id === 'object' && id?._id ? id._id.toString() : id.toString()
    ),
    tags: this.tags || [],
    status: this.status,
    publishedAt: this.publishedAt,
    scheduledAt: this.scheduledAt,
    readingTime: this.readingTime,
    viewsCount: this.viewsCount,
    isFeatured: this.isFeatured,
    seo: this.seo || {},
    createdBy: this.createdBy?.toString?.() || null,
    updatedBy: this.updatedBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    ...extras,
  };
};

blogSchema.methods.toPublicObject = function toPublicObject(extras = {}) {
  return {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    excerpt: this.excerpt,
    content: this.content,
    featuredImage: this.featuredImage,
    tags: this.tags || [],
    publishedAt: this.publishedAt,
    readingTime: this.readingTime,
    viewsCount: this.viewsCount,
    isFeatured: this.isFeatured,
    seo: {
      seoTitle: this.seo?.seoTitle || '',
      metaDescription: this.seo?.metaDescription || '',
      canonicalUrl: this.seo?.canonicalUrl || '',
      robotsIndex: this.seo?.robotsIndex !== false,
      robotsFollow: this.seo?.robotsFollow !== false,
      ogTitle: this.seo?.ogTitle || '',
      ogDescription: this.seo?.ogDescription || '',
      ogImage: this.seo?.ogImage || '',
    },
    ...extras,
  };
};

export const Blog = mongoose.model('Blog', blogSchema);
