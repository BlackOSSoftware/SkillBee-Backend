import mongoose from 'mongoose';

const breadcrumbItemSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, required: true },
    path: { type: String, trim: true, maxlength: 500, required: true },
  },
  { _id: false }
);

const pageSeoSchema = new mongoose.Schema(
  {
    pageIdentifier: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },
    pagePath: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 500,
    },
    seoTitle: { type: String, trim: true, maxlength: 120, default: '' },
    metaDescription: { type: String, trim: true, maxlength: 320, default: '' },
    slug: { type: String, trim: true, maxlength: 200, default: '' },
    canonicalUrl: { type: String, trim: true, maxlength: 1000, default: '' },
    robotsIndex: { type: Boolean, default: true },
    robotsFollow: { type: Boolean, default: true },
    ogTitle: { type: String, trim: true, maxlength: 120, default: '' },
    ogDescription: { type: String, trim: true, maxlength: 320, default: '' },
    ogImage: { type: String, trim: true, maxlength: 1000, default: '' },
    schemaType: { type: String, trim: true, maxlength: 80, default: 'WebPage' },
    schemaData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    breadcrumbs: { type: [breadcrumbItemSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

pageSeoSchema.index({ pagePath: 1, deletedAt: 1 });

pageSeoSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    pageIdentifier: this.pageIdentifier,
    pagePath: this.pagePath,
    seoTitle: this.seoTitle,
    metaDescription: this.metaDescription,
    slug: this.slug,
    canonicalUrl: this.canonicalUrl,
    robotsIndex: this.robotsIndex,
    robotsFollow: this.robotsFollow,
    ogTitle: this.ogTitle,
    ogDescription: this.ogDescription,
    ogImage: this.ogImage,
    schemaType: this.schemaType,
    schemaData: this.schemaData || {},
    breadcrumbs: this.breadcrumbs || [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const PageSeo = mongoose.model('PageSeo', pageSeoSchema);
