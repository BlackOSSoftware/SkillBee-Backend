import mongoose from 'mongoose';

const socialLinkSchema = new mongoose.Schema(
  {
    platform: { type: String, trim: true, maxlength: 50, default: '' },
    url: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

const seoSettingsSchema = new mongoose.Schema(
  {
    /** Singleton key — only one active settings document */
    key: { type: String, default: 'default', unique: true },
    siteName: { type: String, trim: true, maxlength: 120, default: 'SkillBee' },
    siteUrl: { type: String, trim: true, maxlength: 500, default: 'http://localhost:3000' },
    defaultSeoTitle: { type: String, trim: true, maxlength: 120, default: 'SkillBee LMS' },
    defaultMetaDescription: {
      type: String,
      trim: true,
      maxlength: 320,
      default: 'Learn in-demand skills with SkillBee online courses.',
    },
    defaultOgImage: { type: String, trim: true, maxlength: 1000, default: '' },
    defaultRobotsIndex: { type: Boolean, default: true },
    defaultRobotsFollow: { type: Boolean, default: true },
    organizationName: { type: String, trim: true, maxlength: 200, default: 'SkillBee' },
    organizationLogo: { type: String, trim: true, maxlength: 1000, default: '' },
    organizationDescription: { type: String, trim: true, maxlength: 500, default: '' },
    organizationSocialLinks: { type: [socialLinkSchema], default: [] },
    defaultSchemaSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    sitemapSettings: {
      enabled: { type: Boolean, default: true },
      includeCourses: { type: Boolean, default: true },
      includePages: { type: Boolean, default: true },
      changefreqCourses: { type: String, default: 'weekly' },
      changefreqPages: { type: String, default: 'monthly' },
      maxUrlsPerSitemap: { type: Number, min: 10, max: 50000, default: 5000 },
    },
    robotsTxtContent: {
      type: String,
      maxlength: 10000,
      default:
        'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /student/\n',
    },
    auditLog: [
      {
        action: { type: String, required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

seoSettingsSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    siteName: this.siteName,
    siteUrl: this.siteUrl,
    defaultSeoTitle: this.defaultSeoTitle,
    defaultMetaDescription: this.defaultMetaDescription,
    defaultOgImage: this.defaultOgImage,
    defaultRobotsIndex: this.defaultRobotsIndex,
    defaultRobotsFollow: this.defaultRobotsFollow,
    organizationName: this.organizationName,
    organizationLogo: this.organizationLogo,
    organizationDescription: this.organizationDescription,
    organizationSocialLinks: this.organizationSocialLinks || [],
    defaultSchemaSettings: this.defaultSchemaSettings || {},
    sitemapSettings: this.sitemapSettings,
    robotsTxtContent: this.robotsTxtContent,
    updatedAt: this.updatedAt,
    createdAt: this.createdAt,
  };
};

export const SeoSettings = mongoose.model('SeoSettings', seoSettingsSchema);
